# Working on this app (for agents)

This file is for an agent that changes the app's code. (An agent that merely *runs inside* the app is briefed at run
time by `clientBriefing` in `shared/types.ts`; keep that text current when the behaviour it describes changes.)
The product name may change: say "the app" in code comments, prompts and docs, and never hard-code the name in logic.

## What it is

A macOS desktop app (Electron + React 19 + Vite + TypeScript), also run from source on Linux (README, "Setting up on Linux"), in which one person runs several coding agents side by
side, by voice or by text. Providers today: Claude (Claude Agent SDK, `electron/chat.ts`), Codex
(`codex app-server` over JSON-RPC, `electron/codex.ts`) and Grok (`grok agent stdio`, the Agent Client Protocol, `electron/grok.ts`).
A session belongs to one provider for life. Jev agents
(`electron/jev.ts`, `web/src/JevPad.tsx`) are typed classifiers from TypeSafe, not chats. `README.md` describes every
feature and why it works the way it does: read the relevant part before changing a feature, and update it in the same commit.

- `electron/` main process: `main.ts` (window, IPC), `backend.ts` (state, sessions), `chat.ts`, `codex.ts`, `grok.ts`, `voice.ts`
  (Whisper, `say`, the voice helper, all voice decisions), `jev.ts`, `usage.ts`, `debug.ts`.
- `web/src/` the window: `App.tsx` (sidebar, `Chat`, `Composer`, debugger), `voice.ts` (VAD and playback), `Orb.tsx`.
- `shared/types.ts` types and the texts both sides share; `shared/roster.ts` session titles, unique short ids and the
  agent a message is addressed to (pure, checked in `tests/roster.test.ts`); `shared/workflow.ts`, `shared/workflow-edit.ts` and
  `shared/board.ts` the workflow and board markdown (pure, `tests/workflow-parse.test.ts`, `tests/workflow-edit.test.ts`,
  `tests/board-parse.test.ts`); `electron/workfiles.ts` reads and writes those files in a folder; `web/src/WorkflowView.tsx` and
  `BoardView.tsx` their views; `web/src/runner.ts` runs a workflow (pure: given how to deliver a message and how to save the record;
  `tests/runner.test.ts` drives it with fakes, `tests/window/workflow-run.test.ts` through the window with no model). IPC only: preload
  -> main -> backend. No server.
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
10. **The licence and the owner are Diego's alone.** Jauvex Personal is open source under Apache-2.0 and owned by Reindent LLC, its sole
   copyright holder. No agent changes `LICENSE`, `NOTICE`, the `license` or `author` fields in `package.json`, or any copyright line
   without Diego's explicit word (Reindent's workspace conventions, CONVENTIONS.md §5, Licences). When unsure, ask before committing.

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
- **Stand-ins:** `tests/mock/claude`, `tests/mock/codex` and `tests/mock/grok` answer like Claude Code, `codex app-server` and
  `grok agent stdio` with canned replies and no account (`CVC_CLAUDE_BIN`, `CVC_CODEX_BIN`, `CVC_GROK_BIN` point the app at them).
  When `chat.ts`, `codex.ts` or `grok.ts` starts reading a new message or method, teach the stand-in too. `run.sh` gives every check
  the Grok stand-in unless the check's `// env:` says otherwise: a Grok on this Mac is never started by a check.
- One-off experiments stay in `tmp/` (git-ignored). Speech into the app: `--use-file-for-fake-audio-capture=<file>.wav%noloop`
  with a 48 kHz mono WAV made by `say -o` (pad silence with Python's `wave`; every new capture replays the file).

## Reading what happened in the real app

`~/.jauvex/personal/voice-debug.log` holds the voice channel's flight recorder: what Whisper heard or dropped, every decision and who
made it (Jev, the voice model, a rule), what was queued or steered, and for every line meant to be spoken either
`said: "..."` or `NOT said (<why>)`. Read it before theorising about a voice problem. The same events are in the app's
debug panel.

## Things that bit us

- Grok (2026-09-24), from its source and a probe: its sessions default to the user's own permission setting (a Grok set to always
  approve never asks, until a session is made with `yoloMode: false`); the briefing is taken only when a session is made
  (`_meta.rules`; a resume keeps the old one); a message handed over after a turn's last step is not dropped but run as a prompt
  of its own (`interject-fallback-…`), whose answer arrives after the turn's own `session/prompt` has answered, so the turn waits
  for it (`settle` in `grok.ts`); Grok keeps every session it makes, the voice's and one-off prompts' included, so the app
  deletes them (`x.ai/session/delete`); its own methods go on the wire as `_x.ai/...` and some answer `{ result: ... }`. Grok
  updates itself: probe the wire again when something stops matching.
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
- One program writes to a Codex thread at a time (Codex 0.159, T-250): the program that has a thread loaded is its writer, idle or not,
  and frees it about a minute after its last subscriber leaves (`thread/unsubscribe`); any other program's `thread/resume` meanwhile fails
  with "thread <id> already has an active writer" (the Codex app, VS Code, the terminal, another copy of this app). The app lets a thread
  go when its turn ends (`release` in `codex.ts`) and waits out a held one, then explains (`resumeHeld`, `heldNote`); check
  `tests/codex-held.test.ts`.
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
- Colours (T-248): use the theme's tokens (`var(--bg)`, `var(--fg)`, `var(--line)`, `var(--accent)`...). A colour written as a literal in a
  rule is named in the block at the end of `web/src/styles.css` (`--k-<hex>`, its dark value and its light counterpart); a new literal
  that is not named there stays dark in the light theme. Name it there, or use a token.
- Class names are global: a bare `.ctx` for the context meter's button (T-74) also styled the session menu, `menu ctx`, and laid its
  items out in a row (T-131). Give a component's classes its own prefix (`ctx-meter`), and never a short bare word.
- Words held for "what comes next" must always have a way out (timer or `dropped`), or the message vanishes.
- Every provider files a session by the folder it works in (Claude Code `<config>/projects/<folder's real path, dashed>/`, Grok
  `<GROK_HOME>/sessions/<folder, URL-encoded>/`, Codex the thread's own settings): a workflow moved by hand took its files and left its
  chat's session behind, and the chat opened empty (T-217). Move sessions with the app (`electron/move.ts`, `move-workflow`,
  `move-session`), never by moving files, and teach the stand-ins any new place a provider keeps sessions (the Grok stand-in files them
  as Grok does).
- A workflow run lives in the window that started it (`runners` in `App.tsx`): a step's reply comes back with a `replyTo` of kind `run`
  (the same `pendingReplyTo` path agent messages use) and goes to the Runner, not to `returnReply`. A window reload or an app restart
  leaves a live run with nobody driving it: the window takes it over as it stands at load (`attachRun`), nothing re-sent.
- A safety net that matches by who answered, not by what was asked, catches the wrong answer (T-253, 2026-10-01): a reply with no address
  that came from the agent a run waited on, with an OUTCOME line, closed the run's step; it was meant for a turn a reloaded window took back,
  but it took every reply, and an agent's answer to messages that had waited in its queue closed the next step before the agent had read it.
  Only a taken-back turn's reply goes to a waiting run now (`takenBack` in the chat, `closesWaitingStep` in `shared/delivery.ts`), never
  while the step's message still waits in that chat's queue; a message sent again after a compaction keeps its address.
  `tests/window/workflow-queued-reply.test.ts`, `tests/delivery.test.ts`.
- Window checks keep their workflows and boards in `tmp/work`, a folder of this edition's own (`useWork()` in `tests/window/lib.ts` adds it at a
  check's start), and `run.sh` removes its `workflows/` and `boards/` before every window check (a live run left there is taken over by the
  next window at load). `tmp/scratch`, where the agents' sessions are, is a link to the other edition's folder: never clear anything in it
  (on 2026-10-01 this edition's run.sh cleared its `workflows/` and wiped the other edition's check mid-run). They run on ports of their own (9451 for the window, 4451 and 4452 for Whisper), apart from
  any other copy's checks on this Mac: two checks on one port drive each other's window. **Every fixed port in this edition's checks is in
  the 4400s or the 9400s** (the window 9451, Whisper 4451 and 4452, the voice checks 4471 and 4472, whisper-cannot-start 4473: the quick checks run all at once, and it once met wake-check's
  Whisper on 4471); the other edition's checks keep to
  4331 to 4373 and 9333 to 9382, and run on the same Mac: on 2026-09-30 both used 4351 and 4352 and broke each other's runs. A new check
  takes its ports in this range. The fixture's sessions are found by the scratch
  folder's real path: a new, empty scratch folder in its place failed eight checks that open one. A run record's own result is the
  `result:` line of its header; `/^result: done/m` also matches a step's line.
- The app's own agent lives in `~/.jauvex` (`JAUVEX_HOME`, `CVC_JAUVEX_HOME` in the checks: `run.sh` gives each check its own
  home, never the user's). Never make an agent's home depend on where
  the app is installed: Claude Code files sessions by working folder, and a renamed install folder lost the Jauvex agent.
- The state is read once and kept in memory (`loadState` in `backend.ts`); every change edits that copy and every save writes
  it. Read-modify-write of the file lost changes when two ran at once. Code that builds a modified copy for output must
  not mutate the state it loaded. `forgetState` stops all writes after a reset.
- A model that gets a prompt with several reply shapes will mix them up: validate every line before it is spoken. Forbidding what a line
  may say pushes a small model into another job's shape: once HEARD forbade plans, Haiku answered it with NONE or STEER (T-201, 3 of 14
  against 0 of 14); saying what the reply always is ("a spoken sentence, whatever the message asks for") brought it back to none.
- Context (T-74, 2026-09-23): a Claude session at 962K of its 1M window took one more message, and the messages after it failed with
  "Prompt is too long" until it was compacted by hand (most likely Claude Code's own refusal: those errors had no request id, and
  the API took a bigger request minutes later). The meter reads Claude's
  `message.usage` (input + cache writes + cache reads, not output) and the result's `modelUsage[model].contextWindow`, Codex's
  `thread/tokenUsage/updated`. A compact turn goes with the last turn's settings: another system prompt makes the provider write its
  whole cache again (about a million tokens). The SDK's `options.env` replaces the whole environment (spread `process.env`);
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can only lower Claude Code's threshold and counts against the window less the room for the answer.
- Linux (2026-09-30): Ubuntu's `nodejs` runs no `.ts` file (no type stripping), so every script, stand-in and window check that Node
  runs as TypeScript goes through `scripts/ts.sh` (Electron's Node when the system's cannot); the briefing names it off macOS. The
  spoken voice there is Kokoro (`kokoro/`, its own package and lockfile, Linux only; `KOKORO` in `voice.ts`, `tests/kokoro-speech.test.ts`;
  `CVC_TTS=kokoro` picks it on a Mac). Find the app there by `node_modules/electron/dist/electron`, not `Electron.app`; `scripts/restart.sh`
  uses setsid instead of launchd.
- Languages (i18n, 2026-10-03): every string a person reads in the window goes through `t('key')` (`shared/i18n/`), never a literal: add the
  key to `en.ts` and `es.ts` (the typecheck refuses a missing one; `tests/i18n-keys.test.ts` also catches empty values, changed
  `{placeholders}` and keys the code names that do not exist). Whole sentences with placeholders, never translated pieces glued together; a
  string computed at module load freezes the language, so call `t()` where it is drawn. Never translate what reaches a model or an agent
  (prompts, briefings, `(from the app)` messages, names agents address each other by), logs, or text the code compares against; never test
  a translated string to decide something (compare a flag). Spanish words: `shared/i18n/GLOSSARY.md`, shared with Jauvex Pro. Window checks
  run in English (`--lang=en-US` in `run.sh`); `tests/window/language.test.ts` switches to Spanish and back.
- Third-party commands, packages and APIs: verify against the live source (registry, `--help`, generated protocol types
  via `codex app-server generate-ts --out tmp/codex-proto`) before relying on them.
