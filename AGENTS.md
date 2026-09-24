# Working on this app (for agents)

This file is for an agent that changes the app's code. (An agent that merely *runs inside* the app is briefed at run
time by `clientBriefing` in `shared/types.ts`; keep that text current when the behaviour it describes changes.)
The product name may change: say "the app" in code comments, prompts and docs, and never hard-code the name in logic.

## What it is

A macOS desktop app (Electron + React 19 + Vite + TypeScript) in which one person runs several coding agents side by
side, by voice or by text. Providers today: Claude (Claude Agent SDK, `electron/chat.ts`) and Codex
(`codex app-server` over JSON-RPC, `electron/codex.ts`). A session belongs to one provider for life. Jev agents
(`electron/jev.ts`, `web/src/JevPad.tsx`) are typed classifiers from TypeSafe, not chats. `README.md` describes every
feature and why it works the way it does: read the relevant part before changing a feature, and update it in the same commit.

- `electron/` main process: `main.ts` (window, IPC), `backend.ts` (state, sessions), `chat.ts`, `codex.ts`, `voice.ts`
  (Whisper, `say`, the voice helper, all voice decisions), `jev.ts`, `usage.ts`, `debug.ts`.
- `web/src/` the window: `App.tsx` (sidebar, `Chat`, `Composer`, debugger), `voice.ts` (VAD and playback), `Orb.tsx`.
- `shared/types.ts` types and the texts both sides share; `shared/roster.ts` session titles, unique short ids and the
  agent a message is addressed to (pure, checked in `tests/roster.test.ts`). IPC only: preload -> main -> backend. No server.
- State lives in the data folder, `~/.jauvex/personal` (`state.json`, the window's profile, the logs, the command files), for every
  copy, run from source or compiled (`electron/paths.ts`; `CVC_DATA_DIR` moves it: the checks). It is outside the app's folder, so an
  update keeps it. One data folder, one copy running. Below, `data/` means that
  folder. `tmp/` stays in this repository, git-ignored.

## Rules that are not negotiable

1. **Only one copy of the app may ever run** (per data folder). Two copies drive the same sessions: a resumed session
   forks, work is done twice, state is overwritten. The app holds a single-instance lock; never work around it, and
   never start a copy by hand while one is running.
2. **You are probably running inside the app you are changing.** Restarting it kills your own turn, and any other
   session's running turn. To load a build: `npm run build`, commit, check that no other turn is running (below), then
   as the LAST action of your turn run `sh scripts/restart.sh 20 <pid>`. It hands the job to launchd (a one-shot user
   agent that survives the death of your turn, of the app, and of the tool that ran it; nohup as a fallback), which
   waits, stops exactly that PID, and starts one fresh copy; `tmp/restart.log` tells what happened. The user can also
   say or type "restart the app": the app relaunches itself with the build on disk, so build before you tell them.
   Tell the user the app will restart and what to say next.
   **UI-only changes** (`web/src/*`, styles) do not need that: `npx vite build`, then `touch ~/.jauvex/personal/reload-ui` (the app
   watches its data folder): the window reloads and takes the running turns back; nothing else is touched. The user
   can also say "reload the interface". `touch ~/.jauvex/personal/restart-app` is the full relaunch, for main-process builds, and is
   the way to restart from a turn without the launchd script. A reload keeps the user's queued messages and unsent text
   (they live in localStorage per chat); it once wiped them, and the user saw his messages disappear. Every other action in the app (folders, agents, sessions,
   settings, the welcome) is `node scripts/jauvex.ts <command>`: a request file in `~/.jauvex/personal/commands/` that the running app
   answers (`list` first, for ids). The Jauvex agent, the built-in session in this folder, is briefed to use it.
3. **Never kill by name** (`pkill`, `killall`). Find the PID, confirm with `ps -p <pid> -o command=`, kill that PID only.
4. **One commit per finished feature or fix**, before starting the next. Plain messages, no AI attribution trailer.
   Commit on `master` and push to `origin` (github.com/reindent/jauvex) when the user asks.
5. **Nothing in the look may copy a vendor** (marks, orb, colours). The provider marks on session rows are the one
   exception: they identify whose session it is.
6. **The user talks; speech may only interrupt the voice, never the work.** What is said while an agent works is
   steered into the running turn. Only a clear "stop" or "not that, do X" interrupts. Typed text queues.
7. **The TypeSafe key** (`TYPESAFE_API_KEY` or `~/.typesafe/token`; the older `~/.typesafe/jev` is still read) is read only by the app at run time. Never read,
   print, log or commit it. The same goes for any account ID or credential a provider returns.
8. Stay inside this repository. Tests use `tmp/scratch` as their project folder and `tmp/testdata*` as data folders.
9. **The spoken voice stays the system's default** (`voice: ''`). Never switch it for speed or anything else unless the
   user asks: a faster-rendering voice was tried and sounded robotic.

## Who decides what (the voice channel)

Every choice among fixed options goes to Jev first when a key is on the Mac (about 250 ms, no LLM load): is the
thought finished, which acknowledgment, steer / queue / stop / replace, is this an order for the app and which one
(new agent of which kind in which folder, restart). When Jev is absent, over budget or unsure, the small voice model
decides the same thing in one line (the HEARD / BUSY / COMMAND jobs in `VOICE_PROMPT`); the rules alone are the last
resort. The voice model also writes what Jev cannot: the spoken summary of an answer. Keep that order when adding a
decision: Jev question first, voice-model line second, rule third, and log who decided (`debug.log(..., { by })`).
An order for the app (a new agent, a restart) is carried out on its own only when it is sure: the exact phrase, or Jev at
`JEV_SURE` (0.85). Anything less, the voice model's reading included, becomes a question the user answers (`orderVerdict` in
`shared/orders.ts`, the `confirm` command, `pendingOrder` in the chat): nothing is created, stopped or restarted on a guess.

## Finding the app and checking for running turns

```sh
ps -axo pid,lstart,command | grep "$PWD/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" | grep -v "Helper\|grep"
ps -axo pid,ppid,command | awk -v e=<pid> '$2==e' | grep claude-agent-sdk   # children: turns and the voice helper
lsof -a -p <child> -d cwd -Fn                                                # cwd under /var/folders = the voice helper; a project folder = a turn
```
Exactly one Electron line must show. A child whose cwd is a project folder and which is not your own turn means another
session is working: do not restart.

## Building and checking

- Everything is TypeScript: the app, the scripts, the checks and the stand-ins. Node (22.18 or newer) runs the scripts and the window
  checks as they are (it strips the types, so no enums or namespaces there, and relative imports name the `.ts` file); the stand-ins
  are `tests/mock/*.ts` behind two small shell launchers. `npm run typecheck` checks the app (`tsc --noEmit`) and the scripts and
  checks (`tsconfig.tools.json`, without the implicit-any rule); `npm run build` = the app's typecheck + Vite + `scripts/bundle-electron.ts`.
  Rebuilding while the app runs is safe; the running copy keeps the bundle it loaded.
- `npm test` (= `sh tests/run.sh [part-of-a-name]`) runs the checks in `tests/`: **window checks** (`tests/window/*.test.ts`) in a
  second, hidden, silent instance on its own data folder (a copy of `tests/fixtures/state.json`, the `scratch` project
  under `tmp/`) and ports, driven over CDP through `tests/window/lib.ts`; **backend checks** (`tests/*.test.ts`) import
  `electron/*.ts` directly. Header lines: `// needs: mic` (a fake microphone), `// env: KEY=VALUE`, `// fresh` (empty
  data folder, a first run), `// llm` (a real model turn: skipped unless `CVC_TEST_LLM=1`); in an `// env:` line
  `__ROOT__` stands for this repository. Add a check with every feature and every bug fix (reproduce the bug first, then
  show the same check passing), a pure one where it can be (a decision taken out into `shared/`): a fix without a
  reproduction is a guess.
- **How long checks may take:** before every commit, `npm run check` (= `sh tests/run.sh --quick`: the backend and pure
  checks, all at once, seconds). The whole suite (`npm test`, minutes of window checks) runs before a release; while
  working on a part of the window, run that part's window check by name (`sh tests/run.sh <name>`).
- **Stand-ins:** `tests/mock/claude` and `tests/mock/codex` answer like Claude Code and `codex app-server` with canned
  replies and no account (`CVC_CLAUDE_BIN`, `CVC_CODEX_BIN` point the app at them). When `chat.ts` or `codex.ts` starts
  reading a new message or method, teach the stand-in too.
- One-off experiments stay in `tmp/` (git-ignored). Speech into the app: `--use-file-for-fake-audio-capture=<file>.wav%noloop`
  with a 48 kHz mono WAV made by `say -o` (pad silence with Python's `wave`; every new capture replays the file).

## Reading what happened in the real app

`~/.jauvex/personal/voice-debug.log` holds the voice channel's flight recorder: what Whisper heard or dropped, every decision and who
made it (Jev, the voice model, a rule), what was queued or steered, and for every line meant to be spoken either
`said: "..."` or `NOT said (<why>)`. Read it before theorising about a voice problem. The same events are in the app's
debug panel.

## Things that bit us

- The Claude SDK folds user messages that arrive mid-turn into the running turn. That is how steering works
  (`chat.ts`), and it is why the voice helper must be asked one question at a time (`ask` in `voice.ts`): two questions
  in flight get one answer and the helper goes silent for good.
- A `result` message with `queued_turn_count > 0` is not the end of a chat turn.
- Links: `catchLinks` on `<main>` (capture) opens every `a[href]` in the right pane (`Pane.tsx`; `openLink` resolves
  relative paths against the chat host's `data-base`); `will-navigate` in main sends any other navigation to the pane
  (`pane:open`). Files come through `file:read` (main), framed pages through `<webview>` (`webviewTag: true`), muted at
  `did-attach-webview`. `md()` lives in `web/src/md.ts`.
- In the `done` handler `v.current.running` goes false before `onReply` routes the reply: what the routing triggers (an
  app answer, a message to another agent) must start its own turn, not steer the one that just ended.
- Claude sessions get `mcp__jauvex__message_agent` / `list_agents` (`jauvexTools` in `chat.ts`, an SDK in-process MCP
  server; `canUseTool` allows `mcp__jauvex__*` without asking). The tool calls travel main -> window (`agent:request`) and
  are answered by `answerAgentRequest` in `App.tsx`, the same `sendAgentMessage` the fenced block uses.
- App commands that name a session (`open`, `send`, `rename`) look in every folder when no `--folder` is given: with the
  selected folder only, `send --session <id>` said "no session" for a session of another folder.
- `AGENT_MESSAGING` (in `clientBriefing`, both providers) must stay explicit that the message-agent block is the only
  channel between agents, in both directions: a Claude session also has the harness's `ListAgents`/`SendMessage` tools
  and any installed chat skill, and "talk to X" made it reach for those. `tests/window/agent-messaging.test.ts` checks both ways.
- The voice engine (`web/src/voice.ts`) closes an utterance longer than `LONG_MS` (9 s) at its next short pause and
  tells the window (`end(wav, id, cut)`): the window holds it for the next words without counting a hold. `maybeEnd`
  never starts a speculative pass while one runs (`sttBusy`), and the end of a segment never clears `hearing` once the
  next segment has begun (`starts` counter). Whisper's cost grows with the audio length: keep segments short.
- Codex `thread/list` without `useStateDbOnly: true` scans the rollout files and drops the threads an agent created
  (`threadSource: agent_created_thread`, the desktop app's agents), and its `cwd` filter is exact: the desktop's agents
  run in worktrees under `~/.codex/worktrees/<id>/<basename>`. `listSessions` in `codex.ts` lists from the database and
  keeps worktree threads by basename plus git origin (`threadBelongs`, checked in `tests/codex-worktrees.test.ts`).
- whisper-server only honours a vocabulary given at start-up (`--prompt`); noise comes back as "Thank you." / "Okay."
  and is filtered by confidence (`ghost()` in `voice.ts`); a real sentence is never dropped on the no-speech score alone.
- The window's mute is counted by listener (`ears` in `main.ts`: each chat by its key, the welcome): when voice moves from one
  chat to another, the old chat's "off" lands after the new chat's "on"; one flag muted the new one. Leftover whisper-servers
  on the app's ports are stopped by pid at start (`stopLeftovers`), only this install's (its model is in its own
  `models/`): the other edition, started next to this one on the same ports, once stopped both of this one's servers (2026-09-24).
- whisper-server that cannot start (a model it cannot load, a port that is taken) prints its error, returns, and then fails a ggml
  Metal assertion on the way out, printing a backtrace: the end of its output is only that backtrace. Read the lines before
  `GGML_ASSERT` (`whisperFailure` in `voice.ts`), and stop waiting when its process ends (`waitForServer`): on 2026-09-24, on a new
  Mac, the app showed "exited (null). 9 dyld ... start + 6124" after waiting out a whole minute, for a small model an interrupted
  download had left incomplete (start.sh took any file of that name for done; `scripts/models.sh` checks sizes and SHA-256 now).
- Words held for "what comes next" must always have a way out (timer or `dropped`), or the message vanishes.
- The app's own agent lives in `~/.jauvex` (`JAUVEX_HOME`, `CVC_JAUVEX_HOME` in the checks: `run.sh` gives each check its own
  home, never the user's). Never make an agent's home depend on where
  the app is installed: Claude Code files sessions by working folder, and a renamed install folder lost the Jauvex agent.
- The state is read once and kept in memory (`loadState` in `backend.ts`); every change edits that copy and every save writes
  it. Read-modify-write of the file lost changes when two ran at once. Code that builds a modified copy for output must
  not mutate the state it loaded. `forgetState` stops all writes after a reset.
- A model that gets a prompt with several reply shapes will mix them up: validate every line before it is spoken.
- Context (T-74, 2026-09-23): a Claude session at 962K of its 1M window took one more message, and the messages after it failed with
  "Prompt is too long" until it was compacted by hand (most likely Claude Code's own refusal: those errors had no request id, and
  the API took a bigger request minutes later). The meter reads Claude's
  `message.usage` (input + cache writes + cache reads, not output) and the result's `modelUsage[model].contextWindow`, Codex's
  `thread/tokenUsage/updated`. A compact turn goes with the last turn's settings: another system prompt makes the provider write its
  whole cache again (about a million tokens). The SDK's `options.env` replaces the whole environment (spread `process.env`);
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can only lower Claude Code's threshold and counts against the window less the room for the answer.
- Third-party commands, packages and APIs: verify against the live source (registry, `--help`, generated protocol types
  via `codex app-server generate-ts --out tmp/codex-proto`) before relying on them.
