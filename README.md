# Jauvex

Your coding agents, side by side, by voice. Claude, Codex and Grok in one desktop app, with Jev (TypeSafe) for the fast
decisions. Jauvex Personal, version 1.3.3, for macOS and Linux (run from source); Apache License 2.0. Source: [github.com/reindent/jauvex](https://github.com/reindent/jauvex); site:
[jauvex.reindent.com](https://jauvex.reindent.com). Made by Reindent (one human and agents).

Jauvex is an Electron client for the Claude Code, Codex and Grok Build sessions on your Mac. Add a folder, pick up any of its
sessions or start new ones with either provider, and talk to them: a voice channel that answers in three beats (a quick
word, what it understood, a summary of the agent's answer), steers a working agent without interrupting it, names and
starts agents by voice, and lets agents talk to each other inside the app. No server: the window talks to the main
process over IPC, and your sessions stay where Claude Code and Codex keep them.

What changed in each release: [CHANGELOG.md](CHANGELOG.md).

## Installing

One command in Terminal:

```
curl -fsSL https://jauvex.reindent.com/install | sh
```

It needs Node 22.18 or newer. It downloads this source, checks its SHA-256 and builds Jauvex on your Mac: nothing
prebuilt is downloaded, so there is nothing for Apple to notarize. Jauvex lands in Applications (`~/Applications` when
`/Applications` is not writable), a real app with its own name, icon and microphone permission; the source and the build
stay in `~/.jauvex/personal/app`. Run the command again to update, with Jauvex closed, or let Jauvex do it: it asks
jauvex.reindent.com which version is the latest (`/api/personal/version`), at launch and every six hours, and when a newer one is out
the sidebar's footer says so ("1.2.0 is out") and the Jauvex agent tells you what it brings, from the changelog the site serves
(`/api/personal/changelog`: this repository's `CHANGELOG.md`, the sections since your version), and asks you, once per version, whether
to update now. On a yes
(or "update the app" at any time) it runs `node scripts/jauvex.ts update`: refused while other agents work (`--now` on your word);
otherwise the app fetches the same install command, checks that it installs the version offered, leaves it and a small runner in
`~/.jauvex/personal/update/`, hands the runner to launchd and quits. The runner waits for the app to exit, runs the install command
(it rebuilds the app on your Mac and opens it), opens the old app again if it does not finish, and removes it; its log is
`update/update.log`. When the app opens on a newer version than the one it last ran, the Jauvex agent's chat opens and it tells you it is
updated and what the versions since bring, from the app's own `CHANGELOG.md`, then checks that your folders and agents are all there (T-218).
**What's new**, at the foot of the sidebar, asks jauvex.reindent.com right then whether a newer version is out (T-245). Its notes open at
once, the newest releases from this copy's `CHANGELOG.md`, under a line that says what the check found: the latest already, a newer one
that this copy (a clone) updates with git, or the site out of reach. A newer version on the app the install command made opens the Jauvex
agent's chat instead: it says what that version brings and asks. While one is out its notice takes What's new's place and does the same.
Only the app the install command made updates itself; a clone updates with git (T-165). To remove it, quit it and delete
`Jauvex.app` and `~/.jauvex/personal/app`; its settings stay in `~/.jauvex/personal`. To work on the code, clone this
repository instead: `npm start` runs it from the clone, and `npm run app` makes the same app in `tmp/mac-app/Jauvex.app`
(`scripts/mac-app.ts`: Electron's app renamed Jauvex, with the built app, the Whisper models, Claude and Codex inside, signed
ad hoc on your Mac).

## Setting up on a fresh Mac

Jauvex needs a few things that are not in this repository; the install command and `npm start` take care of most of them. The welcome screen (on the first start, and from Jauvex
settings after) checks each of them and tells you what is missing.

1. **Node 22.18 or newer** (it runs the TypeScript scripts and checks as they are), then `npm install` in this folder (it also fetches the Electron binary; if the app ever says
   `Electron.app does not exist`, run `npx install-electron`).
2. **Claude or Codex, signed in: at least one is a must.** Both binaries come with `npm install` (the Claude Agent SDK
   brings Claude Code, `@openai/codex` brings Codex), and Jauvex uses the account each one is signed in to on this Mac.
   You sign in with their own command lines, in Terminal: `claude auth login` (Claude Code; to install it,
   `curl -fsSL https://claude.ai/install.sh | bash`) or `codex login` (Codex; `brew install codex`). Jauvex signs no one in
   itself: Anthropic does not let apps built on its Agent SDK offer the Claude.ai login. The welcome screen and the accounts
   panel (the Jauvex button below the sidebar) say who is signed in and give the command; with one signed in, the Jauvex
   agent can walk you through the other.
3. **Grok, optional**: Grok Build, xAI's coding agent, when it is on this Mac (`curl -fsSL https://x.ai/cli/install.sh | bash`,
   then `grok login`). Jauvex runs it as `grok agent stdio` with your Grok account and settings; without it, Grok is simply not
   offered.
4. **whisper.cpp for the ears**: `npm start` installs it with Homebrew if it is missing and downloads the two models into
   `models/` (git-ignored): `ggml-small-q5_1.bin` for the transcript and `ggml-base-q5_1.bin` for the live words while you
   speak. Each is checked against the size and SHA-256 Hugging Face lists for it (`scripts/models.sh`): a download goes to a
   `.part` file and becomes the model once it is whole, so one cut short is downloaded again the next time, never taken for done. Other models from huggingface.co/ggerganov/whisper.cpp can be dropped in the same folder and picked in the
   voice settings (`ggml-large-v3-turbo-q5_0.bin`, 574 MB, hears better and is still quick on Apple silicon). Without
   Whisper you can still type.
5. **A TypeSafe key for Jev**, optional: in `TYPESAFE_API_KEY` or the file `~/.typesafe/token`, the key alone (the way Hugging Face keeps its token; the older `~/.typesafe/jev` still works). Without it the small voice model
   makes the decisions Jev would make, a little more slowly.
6. **The microphone**: macOS asks the first time voice mode is switched on.
7. **The voice** is macOS's System voice, through `say`. On a fresh Mac that is the basic Samantha, which sounds robotic:
   pick a Siri voice in System Settings > Accessibility > Spoken Content > System voice. An app cannot choose a Siri
   voice by itself (`say -v` falls back to Samantha); only that setting reaches them. The welcome screen checks this and
   has a button that opens the pane.

```
npm start        # builds, then launches through macOS LaunchServices (start.sh)
npm run dev      # Vite + Electron with reload, for working on the UI
```

Put the folder somewhere plain, such as `~/Coding/jauvex`: macOS protects Documents, Desktop, Downloads and iCloud Drive,
and an app started there cannot read its own files until it has been granted access (`npm start` then starts it from the
terminal instead, which works but attributes the permission prompts to the terminal). Only one copy may run at a time
(the app holds a lock; a second launch focuses the first). It keeps its own state in its data folder, `~/.jauvex/personal`
(every copy, run from source or compiled; `data/` below means that folder; `CVC_DATA_DIR` moves it), and uses ports 4340 (Vite, dev only) and 4341 (whisper-server), plus 4342 for the live words (Pro uses 4320 to 4322, so both can run side by side). Jauvex is built on
your Mac from this source: `npm start` runs it from the Electron binary in `node_modules`, the install command as Jauvex.app.

## What it does today
- **Add folder**: native folder dialog. Each folder is a project, like in Claude Code.
- **+ on a project**: lists every Claude, Codex and Grok session recorded for that folder (title, first prompt,
  provider, branch, size, last activity), with a switch to see all, only Claude's or only Codex's (with counts) and each
  provider's mark on its rows. Tick the ones you want; they appear under the project in the sidebar.
- **Folders fold, the sidebar resizes**: a click on a folder's name (its folder icon open or closed) folds its sessions
  away, and it stays folded after a reload. The sidebar's right edge drags to any width from 220 to 560 px, kept too.
- **Only a signed-in provider can be chosen**: a provider that is not signed in on this Mac is greyed out, with the reason,
  in the provider selector, in the Jauvex agent's move selector and in the default-agent setting; a new session never
  starts on one.
- **What agents are told about the thread**: it is plain markdown, so no LaTeX (formulas and matrices as plain text or a
  code block), no Mermaid or other diagram languages (plain-text drawings in a code block), no raw HTML, local files as
  paths in backticks rather than links, images as markdown images. Terminal colour codes in tool output are stripped.
- **A provider's failure is an error, not an answer**: a turn that fails, or an answer that is the provider's own failure
  text (an organisation that disabled subscription access, an allowance run out, a network error), shows as a red card
  in the thread, and the voice says one line about it instead of summing it up.
- **One provider per session, for life**: a session imported from Claude continues with Claude, one imported from
  Codex continues with Codex, one from Grok with Grok (each session row carries its provider's own tiny mark, Claude's, OpenAI's or Grok's, and a Jev agent row TypeSafe's; the title bar has a chip. The marks are their owners' trademarks, used only to say whose session it is: the first three from `@lobehub/icons-static-svg`, MIT; TypeSafe's is its site icon, `assets/typesafe.png`). A new session
  lets you pick the provider in the composer until the first message is sent; the model and effort pickers follow the
  provider (effort: Claude's fixed levels, or the levels Codex or Grok reports for the chosen model; applies from the next message)
  (Codex models come from your account through `model/list`, Grok's from its agent's model list).
- **Open a session**: the conversation loads. User messages as bubbles, Claude's replies as text,
  tool calls and thinking folded into one-line rows you can expand (a Codex call shows the moment it starts and gets
  its result when it completes), harness plumbing (reminders,
  tool results, cross-session messages) hidden unless you toggle the eye icon. Long sessions page
  from the end ("Load earlier messages").
- **The Jauvex agent**: one session that always exists, pinned at the top of the sidebar, with the app's own folder as
  its project and a briefing about the app itself. It is the entry point for everything about the app: restart it,
  update it (`git pull`, build, relaunch, on request), install what is missing, explain how it works, create agents and
  add folders (through the app's command line, below), and develop it for contributors. Every other agent is told it
  exists and to send it what concerns running the app, and that the app's code is theirs to work on too when the user
  asks and the source is in their folder (a Codex agent made a development agent once refused to read it, told that
  anything about the app was the Jauvex agent's). It runs on the default agent, keeps one session for life
  (`ui.jauvexSession`), and can be hidden in Jauvex settings (it still exists and still answers other agents).
  **It moves between providers with its whole context** (the only session that does, for now): the app keeps its own
  transcript of it (`data/jauvex-transcript.json`, user and assistant text only), the provider selector in its composer
  stays live, and the first message after a move carries the conversation so far as a prelude to a fresh session on the
  other provider, so Claude and Codex pick up where the other left off. Moving back works the same way. The thread shows
  the app's transcript, tool calls and results included (results trimmed), with a note at every move. A move ends voice
  mode (the voice engine and its acknowledgment model belong to the provider it started with): start it again when you
  like. Two ways to move, asked on the welcome when both providers are signed in and changeable in Jauvex settings:
  **unified** (the default, experimental: the app replays the whole conversation, and more can break) or **handover**
  (the leaving assistant writes a handover note in a visible turn, saved as `data/jauvex-handover.md` too, and the
  next provider starts from that note: cheaper on long histories, and the note says what mattered).
- **The app's command line** (`node scripts/jauvex.ts <command>`, in the install folder): every action in the app, for
  agents, the Jauvex agent above all. `list` (folders, sessions, agents, ids), `add-folder`, `pick-folder` (the folder
  dialog for the user; what they choose is added), `new-agent` (provider, folder, name, purpose, first message; unnamed,
  the provider is the Jauvex agent's own; with no first message it starts with its own introduction, since an agent exists
  once it has had one: on 2026-09-24 one ordered without it was an empty chat that vanished), `open` (a session, or the Jauvex agent, on screen; a session not in its folder's sidebar goes in it too: shown only as an open chat,
  seven sessions an agent opened dropped out one by one as other chats took the eight open places, T-152, the user, 2026-09-26), `import` (a folder's existing sessions into its sidebar without opening them,
  as its search button does; with no session named, the ones not listed yet: T-150, the user, 2026-09-26, after an agent asked to
  import sessions opened them over the chat he was in), `send` (a message into a session),
  `rename`, `settings` (default agent, Jauvex row, welcome next time), `welcome`, `reload`, `restart`. It writes a
  request file in `data/commands/`, the running app does the thing and answers in a result file, the script prints the
  JSON. Nothing but files: no port, no server.
- **Default agent**: the provider new sessions and the Jauvex agent start with. Asked on the welcome screen when both
  Claude and Codex are signed in (Start waits for the answer); set automatically when only one is; changeable in
  Jauvex settings.
- **The right pane.** A file or a link an agent shows (a markdown link, a path, a URL) opens in a pane on the right of the
  chat, never in the window itself: markdown rendered, text and code as they are, images shown, PDFs and web pages framed
  in a `<webview>` of their own that starts muted and stays muted and opens no windows. The pane has an "open outside"
  button (the Mac for files, the browser for pages), a close button, and a draggable width that is remembered. A navigation
  the app did not catch (a link in a place it does not watch) is stopped in the main process and sent to the pane too.
  Later the same pane takes terminals and browsers. Relative paths resolve against the session's folder; a link inside a file the
  pane shows resolves against that file's folder, and opens in the pane too (T-183).
- **Boards** (T-171): a folder's to-do lists, plain markdown in the folder (`PROJECT.md`, `MARKETING.md`, `BOARD.md`, `ROADMAP.md`,
  `boards/*.md`): `## Section` headings (P0, P1, P2), items as `- [ ] **T-01 · Title** — body` with `[ ]` to do, `[~]` doing. A done
  task leaves the board, in the same edit, for the top of its done file beside it (`PROJECT-DONE.md`, `boards/x-DONE.md`), ending
  "— shipped YYYY-MM-DD (commit)"; a reopened one goes back to the top of the board's first section as to do; ids are unique across both
  files (T-174). A board written before brings its `[x]` tasks and its Done section there on its first write. The format has a version (T-173): a board's first line is `<!-- boards: v1 -->` (hidden when the markdown is shown); a board
  without it is v1 and gets it when the app writes it, and a board whose line names a newer version is shown as it is, never
  rewritten, with a note to update Jauvex. The file is the only truth and git its history; the agents keep them (every agent is told its folder's boards and how to
  keep them). They are listed under the folder's sessions, with how many items are done, and open as columns of cards, one per section,
  coloured by priority; a click on a card's circle moves it on (to do, doing, done: off to the done file); a click on the card shows its
  text; "Show done" adds the done file's tasks as a last column, where a circle reopens a task. Two views, switched in the board's header and remembered (T-180):
  Sections, a column per section, and Kanban, a lane per status (to do, doing, and done with Show done), each card tagged with its
  section; a circle moves a card to the next lane, in the file. A board's row, secondary click: Delete board, after
  a yes (the question names the file and its done file); both files go, and its view closes (T-179). A new board: the folder's options (New board), or
  `new-board --name "..." [--folder ...]` on the command line, which writes `boards/<name>.md` from a template and opens it. A board an
  agent writes shows up within seconds (on a refresh, when the window comes back to the front, and every 15 s); markdown with no items
  is not a board. **Its own chat** (T-199; the user, 2026-09-28: talking to boards, "it's very important"): under the board, "Talk to
  this board", by text or by voice, as under a Jev agent. A session of its own in the folder (the Jauvex agent's provider), told on
  every message what the board is now (the board itself, or, past 30 KB, to read the file) and the boards format; it adds, takes,
  moves and finishes items by editing the board's files, and the board redraws after every answer. Its session is kept in the app's
  state for that board's file (a board's folder is often a repository: nothing of ours is written there), and it is left out of the
  folder's list of agents. A folder reached through a symlink keeps its history too: Claude Code files a session by the real path,
  and the app looks there as well (`tests/window/board-chat.test.ts`).
- **Workflows** (T-210): a workflow is a markdown file in the folder, `workflows/<name>.md`, and a folder beside it, `workflows/<name>/`,
  with one file per step: its instructions. The workflow file has a title and a line, `when:`, then the steps in order, one heading each:
  `## 1. [Script](news-video/script.md) → Video Agent`, the step's name linked to the file of its instructions, and who does it; `→ you`
  makes a step a human-in-the-loop gate (never a person's name). A step's file holds only what its agent is told, in plain words. They are
  listed under the folder, between its sessions and its boards; a new one comes from the folder's options (New workflow) or
  `new-workflow --name "..."`, and starts as a Hello World that runs as it is: the Jauvex agent says hello, you approve, it writes the
  greeting down in the run's folder. The app's own agent is the one a step goes to when no agent is named, since every install has it.
  - **The view**: one line, one row per step with its agent and the state of the current run; click a row for its details in the right pane,
    the file name to edit the markdown in place (the flow follows, the file is saved), and "All runs" for the history. Everything is editable
    without the markdown: the title and the line under it in place; a step's pane opens to be read (who does it, its instructions and the
    file they are kept in, how it went in its last runs), and **Edit** opens its editor: who does it, picked from **In this folder** first,
    then **Elsewhere** (the Jauvex agent first, then the other folders' agents), or you; its instructions; an optional title (without one,
    the step is called by its instructions, cut short). A + on the line between two steps adds one there; a step can be removed. Each edit
    rewrites only its part of the file (`shared/workflow-edit.ts`), and a step's file is made, renamed and removed with it; the app reads
    and writes a step's file only in the workflow's own folder. **The sidebar's order** (T-224; the user, 2026-09-29: "when it needs a human
    supervision, it should be on top, 100% ... then by those that were last modified, not created or last run"): the workflows waiting for
    you first, then the running ones, then the rest by the last change of their file or their steps' instructions, the newest first
    (`sortWorkflows` in `shared/workflow.ts`, `tests/workflow-parse.test.ts`).
  - **Running one**: the Run button, or an agent's `run --workflow <name> --folder <name>` (a workflow written a moment ago is found: the
    folder is read again when the window's list does not have it yet), sends step 1 as one message to the agent it
    names, through the channel the agents already use, with its instructions, the previous step's words and how to end
    (`OUTCOME: <one of the step's outcomes>`); the reply's OUTCOME line picks what comes next; a reply without it is asked for once more,
    then the run stops as failed; a step whose agent is not in the app fails the run and says so. A step of yours waits: its pane offers one
    button per outcome and a note (continue goes on, changes goes back to the step before with your notes), and the step before it is told to
    end with a FOR YOU line saying plainly what to do there. A gate that is reached raises a silent notification, and the workflow's row in
    the sidebar shows the app's mark turning while it runs, with a yellow dot while it waits for you. An agent may pass a gate only on your
    explicit word (`decide --workflow … --outcome …`). A run is driven by the window that started it: after a reload or a restart it is taken
    over as it stands, nothing re-sent; "Send step again" re-sends a step whose agent never answered, and Stop stops it.
  - **Runs and versions**: each run is a markdown record, `workflows/<name>/runs/NNN.md` (started, result, took, each step's time and last
    words), and a folder for its files; the view derives the live run, the history and the averages from them. When a run starts, the
    workflow file and each step's instructions are compared with the latest version: the run takes it when nothing changed, else a new one,
    `workflows/<name>/versions/NNN.md`, whole; editing takes none. **Versions** lists them, and any other than the current one can be
    restored (what the workflow was is kept as a version of its own first, so nothing is lost).
  - **Tries**: a step may come round as many times as its tries with no decision of yours in between; past that, a loop between agents alone
    stops the run. A decision of yours starts the count again, so a loop through you has no limit. A workflow's number is its `tries:` line
    (6 when there is none); a new one is written with the number in Settings, General, Workflows; a step can say its own, `tries: 1`.
  - **Triggers**: `when:` is manual, a schedule (`every Monday 09:00`, `every weekday 8:30`, `every day at 7pm`, `every 2 hours`), a window
    (`anytime between 9 and 12 am`: once a day, at a random time in it, at its end at the latest) or an event (`after <workflow of the same
    folder>`: when that one ends done, read from the folder then, so one written a moment before counts too). Schedules are the app's own timer: every 15 s it reads the folder's workflows again (an edited `when:`
    line counts at once) and starts one whose slot is under ten minutes old, once per slot, while the app is open. A schedule missed while
    the app was closed (or the computer asleep) is the setting's, in Settings, General, Workflows: run it as soon as the app opens, have the
    Jauvex agent tell you and ask whether to run it now (the default), or do nothing; only the latest missed time of each workflow counts
    (`settings --workflow-missed run|alert|nothing`). A run records who started it (`by: its schedule (every weekday 6:32)`).
  - **Talk to a workflow**: under the flow sits a chat of its own (a hidden session in the folder, kept in `workflows/<name>/chat.json`),
    told on every message what the workflow is now, its steps' instructions included: it edits the files (the flow follows), and runs it,
    stops it or passes its gate on your word. It writes to the app's agents and hears back as any chat does: the router knows it as
    "<workflow> workflow" while its view is open and delivers to it there; a board's chat is reached the same way, as "<board> board".
  - **Moving one to another folder** (T-217; the user, 2026-09-29: "The workflows were actually moved But the sessions of the agents were
    not"): every provider files a session by the folder it works in, so a workflow moved by hand takes its files and leaves its chat's
    session under the old folder, and its chat opens empty. `move-workflow --workflow <name> --to <folder> [--folder <its folder>]` moves
    the file, its folder (steps, runs, versions, `chat.json`) and the chat's session, and puts the files back if the session cannot move:
    Claude Code's transcript to the new folder's place (`<config>/projects/<folder, dashed>/`, by the folders' real paths, with what it
    keeps beside it, every line's working folder rewritten, its time kept), Grok's session folder to the new folder's
    (`<GROK_HOME>/sessions/<folder, URL-encoded>/`), and a Codex thread resumed in the new folder, which Codex records in the thread
    (`electron/move.ts`, `moveThread` in `electron/codex.ts`, `moveSession` in `electron/grok.ts`). `move-session --session <id|title>
    --to <folder>` moves one agent the same way, with what the app keeps for it (its place in the list, provider, settings, context); it
    works in the new folder from its next turn. Neither runs while the session works or the workflow runs. A step's agent is found by name
    wherever it lives. Checks: `tests/move-session.test.ts` (a folder reached through a symlink too), `tests/window/move-workflow.test.ts`.
  - A workflow is deleted from its row's secondary click, after a yes, with its folder (instructions, runs, versions); one that runs is
    stopped first. Every agent that runs in a folder is told its workflows, and that a step of its own ends with the OUTCOME line.
- **Images an agent shows** (a markdown image with a local path, relative to its folder or absolute) load from the file
  and never overflow the thread (at most the thread's width and 60% of the window's height).
- **Images in a message**: paste a screenshot from the clipboard into the composer, drop image files on it, or pick them
  with the clip. They show as thumbnails until sent and in the thread after. Claude gets them inline; Codex gets each
  as a file under `data/uploads/`. Typed while a turn runs, they queue with their text: each queued bubble keeps the images
  pasted with it (shown as thumbnails), goes out with them when the turn ends or when its Send now hands it to the running
  turn, and the sent bubble shows them. An image never rides along with another queued message. PNG, JPEG, GIF and WebP.
- **Sessions keep working when you look elsewhere**: every chat you open stays mounted in the background (up to eight;
  idle ones make room, a working one never does). Opening another session or agent does not stop or lose the running
  turn, its row in the sidebar shows the moving mark while it works, and the answer is there when you come back. The
  microphone stays with the session it was started in (its orb waits at the bottom of the sidebar, see Voice).
- **New replies, counted per agent** (T-226): a reply of an agent that is not on screen counts on its row in the sidebar, the
  Jauvex agent's too (a small badge, up to 99, then 99+). A moment on screen clears that agent's count, and only its own; a reply
  of the agent on screen counts nothing. The counts are kept in the window's storage on this Mac, so a reload or a restart keeps them.
- **Jev agents** (when a TypeSafe key is on this Mac): pick "Jev agent" in a new session's provider menu. It is not a
  chat, it follows Jev's own shape. Left, split in two: the **state** on top (text or JSON) and the **questions** below
  (JSON: `noul` yes/no, `choice`, `score`). Right: the **output**, each answer with its probabilities as bars, the
  confidence, the model, milliseconds and tokens; "Raw JSON" shows the reply as it came. Evaluate or Cmd+Enter. Edits save
  themselves, the last 20 runs stay one click away, and the agent lives in the sidebar (filled dot) with rename and
  delete. Jev stores nothing, so agents and runs are kept in `data/state.json`. A new agent starts with a working example.
  **Trainer (optional)**: Jev cannot be talked to, so an agent can be coupled with Claude or Codex ("Trainer" next to
  Evaluate). A chat panel opens under the pad, with everything a chat has here: text, voice, models, effort,
  permissions. The trainer sees the state, the questions and the last output with every message, and changes the agent
  by answering with `jev-state`, `jev-questions` and `jev-evaluate` blocks, which the app applies and runs; it is shown
  the result (twice at most per request) so it can adjust. Its session stays out of the sidebar. The agent is a reusable
  classifier: the questions stay, the state changes.
- **Secondary click on a session** in the sidebar opens its menu: Rename, Copy session ID, Remove from sidebar (nothing is
  deleted: the session stays with its provider and comes back with +).
- **Each session remembers its own composer**: model, effort and permissions are kept per session (and per Jev agent's
  trainer) in `data/state.json` and come back with it, across restarts. A new session starts from the last choices made anywhere.
- **Rename a session**: that menu, the pencil next to its name in the title bar, or double-click the name there or in the sidebar.
  Enter saves, Escape cancels. The name is written where the provider keeps it (`renameSession` for Claude, a
  custom-title entry in the session file; `thread/name/set` for Codex), so Claude Code and Codex show the same name.
- **Chat**: type in any session and Claude continues it (same login, settings, CLAUDE.md and tools as
  Claude Code, through the Agent SDK's `query({ resume })`). Replies stream in; Stop interrupts; the pencil
  icon on a project starts a new session in that folder; the model picker applies to the next message.
  Tools that need permission show an Allow once / Always / Deny card in the thread, or pick **Auto permissions** in the
  composer: Claude's permission classifier (`permissionMode: 'auto'`) or Codex's automatic reviewer
  (`approvalsReviewer: 'auto_review'`) decides, and only what it will not decide reaches you. Applies from the next message.
  **YOLO — full access** (asked for 2026-09-26) runs tools with no permission prompt and no provider sandbox: Claude's
  `bypassPermissions` with its required opt-in, Codex's `never` approvals with `dangerFullAccess`, Grok's `yoloMode`. Agents can
  then use everything this account can reach; it grants no administrator access, and the operating system's own limits still apply.
  **Provider permissions** (Jauvex settings › Safety, or `settings --permission-provider claude --permission-mode yolo` on the
  command line) set Ask, Auto or YOLO for every session of one provider, from each session's next turn; the composer then shows that
  mode, locked; "Use session setting" (`--permission-mode session`) gives the choice back to each composer. Leaving YOLO gives Codex
  back the approvals and sandbox the thread had before it, a read-only one included, kept in the state across restarts.
  Codex sessions work the same way: replies stream, Stop interrupts the turn, and when Codex asks before running a
  command or writing files, the same card appears (Always = for the rest of the session). Approval policy and
  sandbox are whatever your Codex config says, the way the Claude side keeps Claude Code's settings, except in YOLO.
  Grok sessions work the same way too: replies stream, Stop cancels the turn, and when Grok asks before a tool its
  permission rules do not allow already, the same card appears (Always = Grok's own "don't ask again"). The rest is Grok's
  own permission rules; the app says the mode every time a session is opened (Ask, **Auto permissions**, Grok's automatic mode, or
  YOLO), so a Grok set to always approve still asks in Ask, and a new mode closes and reopens a loaded session to take it. A message handed to a working Grok is read at its next step (`x.ai/interject`); one handed over after its last step
  Grok runs as a prompt of its own, and the turn stays open until that one is answered too, so its answer is not lost.
  A picture Grok makes (its `imagine` tool) shows under the tool's row, and the answer's link to it points at the file Grok saved
  in its own session folder: Grok writes it relative to that folder (`images/1.jpg`), which read against the project's folder
  was a broken image.

## Setting up on Linux

The same app, run from this folder with `npm start` (Ubuntu 24.04 and later; there is no packaged Linux app yet, and the update
offer is for the Mac app only). What differs from the Mac, all handled by `start.sh` unless said otherwise:

1. **Node**: Ubuntu's own `nodejs` cannot run TypeScript files (it is built without type stripping). `npm install` works with it;
   the TypeScript scripts and checks then run on Electron's own Node, through `scripts/ts.sh`.
2. **Electron's sandbox**: Ubuntu refuses Electron's usual sandbox to an app without an AppArmor profile, so its helper,
   `node_modules/electron/dist/chrome-sandbox`, must belong to root with the setuid bit. `npm start` does it with sudo (it may ask
   for your password), again after each new Electron.
3. **whisper.cpp for the ears**: there is no Homebrew. Build it (github.com/ggml-org/whisper.cpp, `cmake -B build && cmake --build
   build -j`; it needs cmake and a C++ compiler) and put `build/bin/whisper-server` on your PATH (`~/.local/bin` is looked in too).
   The models are downloaded and checked as on the Mac.
4. **The voice is Kokoro** (Kokoro-82M through kokoro-js, on the CPU): there is no `say`. Its package lives in `kokoro/` with a
   lockfile of its own, installed on Linux only (the Mac install does not carry its runtime), and its model (325 MB, full precision:
   on a CPU it renders about three times faster than the 8-bit one) is downloaded into `models/kokoro/` and checked like Whisper's. It
   runs as a warm process of its own (`kokoro/server.mjs`), started when voice is switched on, and talks to the app in JSON lines,
   not over a port. The default voice is `af_heart`; the voice settings list Kokoro's others, and the speed slider works as on the Mac.
5. **The window** has the system's own frame and no menu bar (Alt is push-to-talk). Where Chromium refuses the GPU, or there is
   none (a virtual screen), the orb is drawn by its software renderer.

## Voice
Press the white round button in the message box. All local except the two Claude calls:
- **The app's name, however it is heard**: speech-to-text writes it Jovex, Javex, Jauvix, Claudex, Jobex and worse; every
  transcript says Jauvex (a saved vocabulary that still had the old name is corrected too).
- **Ears**: whisper.cpp (`brew install whisper-cpp`), kept warm as `whisper-server`. Put a model in `models/`
  (ignored by git): `curl -L -o models/ggml-small-q5_1.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin`
  (190 MB, about 0.4 s per utterance on Apple Silicon). Transcription starts the moment you go quiet, so the text is
  ready when your pause ends. When whisper-server cannot start, the app says why within a second, on the welcome screen and
  under the orb: a model it cannot load (named, with the command that downloads it again) or a port another program holds
  (named, with that program). whisper-server prints its error and then, on the Mac's GPU, a crash backtrace as it exits; the
  app reads the error, and the flight recorder keeps all it printed. The welcome calls Whisper ready only once its server answers.
- **Transcription settings** (voice settings): which Whisper model in `models/` to use (Automatic = the fastest), and
  "Names it should know". The names, plus the open folder's name, go to `whisper-server` as its initial prompt at
  start-up (the per-request prompt field is ignored by the server), so changing either restarts it. Measured on this
  Mac with test phrases: small without names heard "Clothex / Cotex / Reigned-in"; small *with* names got every name
  right in about 0.55 s; large-v3-turbo took about 2.2 s and still missed them. Whisper's ghosts are dropped: handed a knock or room noise it writes real phrases ("Thank you."), so a transcript is
  discarded when Whisper itself was unsure (very low confidence, a known ghost phrase at low confidence, or a no-speech
  probability over 0.6 on text that is short or doubtful: a real sentence Whisper was sure of is never dropped on that score alone,
  a short greeting once scored 0.74 with every word right); a clearly spoken "thank you" still goes through, the debugger shows
  every drop and why, and a dropped sentence of three words or more leaves a note under the composer instead of vanishing. The closing pause is trimmed before
  transcription, and every dictated message reaches the main model tagged `[voice transcript]` (T-76: in the turn, when steered, from the
  queue, and on a resend; the window never shows the tag), while a message typed with voice mode on goes untagged: the briefing tells
  the model a tagged message is a transcript, to repair names and odd words, and to ask in one line when a word does not fit.
- **The big model's answer stays on screen in full and is never read aloud.** A small model (Haiku by default) is the
  voice: it acknowledges and restates what you asked while the selected model thinks, and when the answer lands it
  says what happened in one to three sentences. A short plain answer is spoken as it is.
- **Mouth**: macOS `say` (the system voice by default; on Linux Kokoro, see above), rendered per utterance and played inside the app, so it can
  fade out instantly and the echo canceller knows what the speakers are playing.
- **Interrupting, two channels**: start talking and the *voice* stops (playback fades in 120 ms, pending `say` renders are
  killed) and it never talks over you. The *main thread is not touched*: it keeps working, and its answer is still summed
  up when it lands. What you *type* (Enter) while it is busy shows up as a dashed "Queued" bubble and is sent by itself
  the moment the turn ends; what you *say* is steered into the running turn (next point). The voice also weighs what you meant: a clear "stop, cancel that" interrupts the main
  thread ("I'll take care of that right away"), and "not that, do X instead" interrupts it and sends X next. In doubt
  it queues; work is never stopped on a guess. A short utterance with a stop word ("stop", "cancel that", "para") never
  waits for that judgement: it interrupts the main thread straight from the transcript, already from the speculative
  one taken 240 ms into your pause. Otherwise only the Stop button interrupts the main thread. Tapping the orb also shuts the voice up.
- **"Restart the app"** (said or typed while voice mode is on) makes the app relaunch itself with the build on disk.
- **"Reload the interface"** / "soft restart" (said or typed while voice mode is on): the window alone reloads the UI build on
  disk; the main process, Whisper, the voice helper and every running turn stay. The reloaded window asks the main
  process which turns are still running and takes them back under their ids, so an answer in flight lands where it
  should. For a change to colours, layout or any window code, `npx vite build` and this is enough; a change to
  `electron/*` or `shared/*` still needs the full restart.
- **One copy, always**: only one Jauvex may run per data folder. A second launch exits at once, before it opens a
  window or touches a session, and brings the running copy to the front. Two copies would drive the same sessions
  (a resumed session forks, work is done twice, `data/state.json` is overwritten).
- **Agents talk to agents, through the app.** No provider tool, no protocol between Claude and Codex: the app already
  sees every reply and can reach every session. An agent writes a fenced block in its reply:
  ```
  ```message-agent Notes
  What is the code word of the day?
  ```
  ```
  When its turn ends the app delivers the text to that session, tagged `(from agent "Sender" [id])`: steered into the
  running turn if that agent is working, sent as a new turn otherwise (the session is mounted in the background if it
  was not open). A message that wants its own answer is never handed to a turn under way that answers someone else, nor is a
  workflow's step: it waits in the queue with its address and goes as a turn of its own (T-228: a chat kept one address for its turn's
  answer, and an answer went to an agent that had asked a question meanwhile; `shared/delivery.ts`, `tests/delivery.test.ts`).
  Whatever the other agent replies comes back to the sender by itself, tagged the same way, so an
  explicit message is a question and no block is needed to answer it; an answer does not bounce back again, so two
  agents cannot ping-pong on their own (and the app stops relaying after 30 agent-to-agent messages in ten minutes).
  A reply that goes back to its sender leaves out the blocks it addressed to other agents (they went to them) and says who
  else was written to. A Claude agent that left a background job running (a shell command in the background, a monitor)
  used to swallow the next message: its next turn answers only the job's "stopped" notice, empty, in under a second, which
  read as "the third message between agents fails". A Claude turn that ends like that sends its message again, once, with
  its reply address; and every agent is told not to start background work from a turn.
  This block is the only channel between the app's agents, in both directions, Claude to Codex and Codex to Claude; the
  briefing says so plainly, and that the harness's own agent tools, chat skills and shared files never reach them (a Claude
  agent once set up a file-based chat protocol instead). A Claude session also gets the same channel as two tools of its
  own, `mcp__jauvex__message_agent` and `mcp__jauvex__list_agents` (an in-process MCP server from the Agent SDK, answered
  by the window's router, never asking permission), for the models that look for a tool when told "talk to X". Agents are addressed by name (title or summary) or by the short id in brackets, which never changes (6 characters,
  longer only where two ids share their start, as Codex ids often do); a fenced `list-agents` block gets the roster back
  (name, id, provider, folder, working or idle). The Jauvex agent is listed once, as "Jauvex", whatever its past sessions
  across providers, and always, its chat open or not (T-151, the user, 2026-09-26: an agent that wanted to report a bug to it found
  three "Jauvex …" agents and not it, since it was listed only while its chat was open): a message to it opens its own chat in the
  background, with its session, or starts one; with no session yet, its folder's id stands in for its id; a session with no name of its own is shown by its first message, cut at 60 characters. Every exchange shows in both
  threads, marked "From agent X", and in the voice log. The briefing tells every agent all of this.
- **Every agent is told where it is running.** A blank session knows nothing about this app, so each one, on either
  provider, new or resumed, gets a short briefing (`clientBriefing` in `shared/types.ts`; appended to Claude's system
  prompt, sent as Codex's developer instructions): several agents side by side, messages that arrive mid-turn are new
  information to fold in (not a restart), the full answer is on screen while a separate small model speaks a short
  version (so: conclusion first, short plain answers for simple questions), a turn can be stopped at any moment, and in
  voice mode the text is dictated. It names no product, so a rename does not touch it.
- **Accounts** (click the footer of the sidebar): who each provider is signed in as, and the command that signs it in or
  out in Terminal (`claude auth login|logout`, `codex login|logout`, `grok login|logout`); Refresh after using it. The app has no login of its
  own: it uses the sign-in of each provider's own tool on this Mac (Claude: `claude auth status` on the SDK's bundled binary;
  Codex: the app-server's `account/read`; Grok: its agent's `x.ai/auth/info`). Signing in, out and switching from inside the app is built (the provider's
  browser flow, run from the panel and the welcome) but hidden in this edition (`SIGN_IN_IN_APP` in `shared/types.ts`,
  since 2026-09-24): Anthropic does not let apps built on its Agent SDK offer the Claude.ai login. Sessions are files on this
  Mac and stay whichever account is signed in; a running turn keeps the old account until it ends
  (`tests/window/sign-in-by-cli.test.ts`).
- **Usage battery**: next to the composer's controls, a small battery shows how much of the session's provider plan is
  left: green above 40 %, amber to 15 %, red below. It shows the tightest window that applies (Claude: 5 hours, 7 days,
  and a model's own weekly window only when that model is the one in use; Codex: its ordinary limit, and a model's own
  extra limit only when that model is in use; Grok: its plan's credits for the week or month, or its on-demand spending once
  those are used up). A click opens the panel (T-98): one tab per provider signed in, this chat's provider selected, each tab
  with what is left of it at a glance; in a tab, every window, how much is left and used, and when it resets (counted down,
  and on the clock), with the plan, Claude's extra usage, Codex's credits, Grok's on-demand spending and bought credits; a model's own window (Claude's Fable week; a Codex model's extra limit, which
  Codex names after the model and, in its own status, counts only for that model) is greyed in a chat on another model.
  Refreshed every minute while the window is visible, after each turn, and with the panel's Refresh; a refresh keeps what
  is shown until the new answer is in. When usage is not available for the account (an
  organisation plan, no allowance), the battery is a steady outline with "n/a" and the reason in its tooltip, never a
  flicker. Claude's numbers are the data behind `/usage` (the SDK's experimental usage request, asked of a short-lived
  idle process: nothing is sent to a model); Codex's come from `account/rateLimits/read`, Grok's from its agent's `x.ai/billing`. Only percentages, reset
  times, the plan's name, extra usage and the credits balance are read, never account IDs.
- **Context meter** (T-74): next to the battery, sheets piling up in a small tray show how full the session's context is: one
  flat sheet per fifth of the model's window (an empty tray at 0 %), white, yellow from 50 %, red from 80 %, with the percentage. Claude's number is what the last request
  carried (input, cache writes and cache reads, as Anthropic's status line counts it) against the model's window, both from the SDK
  (`message.usage`, the result's `modelUsage[model].contextWindow`); Codex's is `thread/tokenUsage/updated` (the last request's total
  against the model's usable window). The numbers are kept with the session (`Project.context`), so the meter shows them when the
  chat opens. A click opens the numbers and a Compact button; the click itself compacts nothing. Compacting is a turn of its own
  (Claude Code's `/compact`, Codex's `thread/compact/start`) sent with the last turn's settings, so the provider's cached prompt still
  applies; a typed `/compact` does the same. While it runs the sheets pulse and the thread says so; when it is over, a note in the
  thread (kept with the session's notes) says it, with the tokens before and after, and so does the flight recorder, whoever started
  it (the provider compacting on its own mid-turn included). **Auto-compact** (Jauvex settings, Context; `settings --auto-compact
  <percent>|provider`) is 90 % by default: past it, the chat compacts after the answer, before the next message goes. Claude Code's
  own trigger is moved to the same share of the window (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, scaled, since Claude Code counts it against
  the window less the room it keeps for the answer; it can only lower Claude Code's threshold), so a long turn compacts in the middle
  too; Codex compacts mid-turn at its own limit (90 % of its model's window, about 95 % on the meter). A message that does not fit
  at all ("Prompt is too long", Codex's `contextWindowExceeded`) is compacted for at once and sent again, once. Why: on 2026-09-23 a
  Claude session sat at 962K of its 1M window, the next message pushed it over, and the messages after it failed with "Prompt is
  too long" until it was compacted by hand; no meter had shown how full it was, and nothing said it was compacting. Anthropic gives
  no recommended percentage (Claude Code's own default is about 967K of a 1M window); 90 % leaves room for the next message.
- **What you say is written as you say it.** The moment you start talking, a dashed "Hearing you" bubble opens on your
  side of the thread and fills with your words while you are still speaking (typed out, with only the corrected part
  retyped when a newer transcript disagrees). When the thought is finished the bubble becomes the real message: sent,
  queued, or handed over mid-turn. Nothing is repeated under the orb. The live words come from a second, tiny Whisper
  (`ggml-base`, its own server on the next port, asked about once a second and never while the real transcript is being
  made), because whisper-server answers one request at a time and the transcript that counts must not wait. Both servers
  run half a second of silence at start-up, so the first sentence does not pay for loading the model onto the GPU. Before
  starting its own, the app stops any whisper-server a previous run left on its two ports (found by port, checked by command
  line, stopped by its own pid): the app dies without them when it is killed, and each restart used to leave a pair behind.
  Only this install's are stopped (their model is in its own `models/`): on 2026-09-24 the other edition, started next to this
  one on the same ports, stopped both of this one's servers, and the wake phrase went with them. The editions use ports of
  their own; one that finds its port taken by another install's server leaves it and says so in the flight recorder.
- **The orb rides on the conversation.** In voice mode the thread runs on under the orb and fades out behind it (a mask, so
  it works on any background); the last message rests just above it. The thread stays pinned to the bottom whatever
  grows (streamed text, a voice line being typed, a table rendering, the draft bubble, the orb appearing): only scrolling
  up lets go of the bottom.
- **Voice**: with no voice picked the app uses the system's default voice. (Samantha renders a line in a third of the
  time, 0.65 s against 1.9 s, but sounds robotic next to it; not worth it.) A half-finished thought is held 2.5 s for
  its second half, not 4.5.
- **The answer lands while the understanding is being said**: if most of the line is out it finishes; otherwise the
  voice cuts at the end of the sentence it is in (estimated from the text), fades over a quarter second, and a short
  bridge ("Oh, it is done already.", rendered ahead) leads into the summary. Nothing starts and stops mid-word.
- **A sound that goes on with no words in it** (a fan, a video, typing) is not speech: when the live words find nothing in
  it three passes in a row, the segment is dropped, so the voice is not held for as long as the noise lasts (it once
  held a summary for a hundred seconds). No segment lasts more than 45 seconds either way.
- **A sound that was nothing** (a click, a cough, a ghost word) only fades what is playing; the lines queued or being
  rendered stay and are said once it is over. Only real speech, confirmed by the transcript, drops them.
- **A pause.** "One second", "wait", "hold on", "let me think", and nothing else: nothing goes to the main thread, the
  voice says it will wait ("Take your time.", "Okay, I'm here.") and the next thing said is a message as usual, whether
  the agent is idle or working (a pause is never steered into a turn). Jev tells a pause from "wait, make it blue" (a
  task) or "one second, what did you say?" (a question); without Jev only the bare phrase counts. Typed, "wait" is a
  message like any other.
- **Preparing the reply.** When the agent's answer is in and the voice is putting its summary into words and rendering
  it, the orb and its label say so ("Preparing the reply"), so the pause before the voice speaks is not taken for silence.
- **Goodbye.** "Bye", "good night", "talk to you later", "I'll be back": the voice answers in kind ("Good night, sleep
  well.", "Sure, I'll be here. Talk later.") and voice mode ends. Jev confirms it is a farewell and not the word in
  passing ("add a goodbye message to the login page" is not one), and whether there is something to do first: "set an
  alarm for eight, then bye" goes to the main thread as a normal message, and the goodbye comes once that turn is over,
  after the summary. Without Jev, a short farewell counts by its words alone, a longer one is taken as having a task in it.
- **Speaker** (voice settings): which output device the voice comes out of, with a Test line. A screen recorder or a
  virtual audio device can leave the system default somewhere you cannot hear; the audio context is also resumed
  before every line, because another app taking the audio can leave it suspended.
- **The voice helper answers one question at a time.** Speculation asks it for an acknowledgment at every pause, and the
  harness folds messages that arrive mid-answer into the running turn: two questions, one answer, and from then on every
  answer lands on the wrong question or nowhere (a voice that talks nonsense, then goes silent for good). So a question
  is only handed over when the previous answer has arrived, one still waiting is dropped when a newer one comes in, a
  helper that owes an answer for 25 s is replaced, and a reply that is not a plain spoken line is never said.
- **Debugger, Model tab**: every exchange with Jev and with the models, one line each (the question and Jev's choice
  with its confidence; the job and the voice model's reply; the main model's reading of an order), and a click opens
  the whole of it: the state and questions sent to Jev with its probabilities, or the message sent to the model and
  its raw reply. That is where to see why a decision came out the way it did.
- **What the voice did, on disk**: the debugger's events also go to `data/voice-debug.log` (rolled at 2 MB), including
  the fate of every line that was meant to be spoken (`said`, or `NOT said` and why).
- **Steering**: what you say out loud while the agent works reaches it *right away, without interrupting it*. It is
  added to the running turn as new information: the agent keeps its whole context and what it has done, reads your
  words at its next step and carries on ("use the staging database, not production", "don't touch the footer", "also
  update the readme", "what model are you using?"). The voice says "Okay, working on that now" (one assistant at work: never a word about queues, channels or another agent) and the
  message shows in the thread tagged "Sent mid-turn". Speech only waits when you ask for that in so many words
  ("queue this for later", "don't tell it yet"), and the work is only stopped or replaced when you clearly say so;
  narrowing the same task ("skip the tests for now") is steering, never an interruption. In doubt it steers. Jev
  decides, and without Jev the voice model does. *Typed* messages are different: they queue, and every queued bubble
  has a **Send now** button that steers it. Claude turns take their prompt as a stream, so the message is folded
  into the running turn; Codex gets it through `turn/steer`. When the turn ends, queued messages leave one at a time,
  each as its own turn, in the order they were typed, never merged into one; a spoken instruction that replaces the
  work goes first. The queue, its images and the text typed but not sent are kept on disk per chat: a reload of the
  window (an agent's `touch data/reload-ui`) or a restart never loses a message, and a queue restored with no turn
  running goes out at once.
- **Nothing said is lost** (T-99): what you say as a stop shows in the thread, marked "Stopped the turn"; when it says more than
  stop ("wait, list them first, stop"), those words go to the agent once the turn has stopped (`stopSaysMore` in
  `shared/orders.ts`), and a bare stop is kept with the session's notes. A message handed to a running turn that the model never
  read goes again once the turn is over, without a second bubble: after a stop or a replace, everything handed to that turn
  (Claude Code drops what it had not taken up, and twice is better than never); after a turn that ends on its own, what was
  handed over once its last answer had started (`unsent` on the turn's end, from `chat.ts`). Why: on 2026-09-23 a message said
  just before a stop, and one said as a turn was ending, were shown as sent and never answered.
- **What the voice says can also be written** (voice settings, "Show what the voice says in the thread"; off by default,
  because next to the main answer it reads as the same thing twice): each spoken line appears in the thread as a "Voice" bubble (tinted, tagged,
  on the assistant's side), typed out at the pace it is spoken and cut short if you interrupt it. It is not part of the
  session's transcript, so it is not there after a reload, and the main thread's text, reasoning and tools stay as they were.
- **Commands for the app itself.** "Create a new agent", "create a new Codex agent in the homepage project", "create a new Grok agent", "create a new
  Jev agent" are caught before anything reaches the main thread: the voice says what it is doing, the agent opens in the
  folder you named (or the open one), and voice mode carries on there. A cheap word gate runs first, so ordinary speech
  pays nothing; then Jev settles whether it was an order for the app or a coding request that merely mentions agents,
  which kind was meant (it knows Whisper writes Claude as "Cloud", Codex as "codecs", Grok as "grog", Jev as "Jeff" or "Jet") and which
  folder. Without Jev the voice model reads the same things in one line (the COMMAND job), and a kind only counts when one
  was actually said. **The app carries an order out on its own only when it is sure** (`shared/orders.ts`): the exact phrase
  ("restart the app"), or Jev at 0.85 or more. When nobody is sure (Jev leaning, unsure or absent, the voice model reading an
  order) it asks in one short line, shown and said ("Should I open a new agent in website? Say yes to open it; anything
  else goes to the agent as you said it"): a clear yes carries the order out, anything else sends the words it asked about to
  the agent, as they were said. "Give me the handoff instructions so the other agent can work on this" once opened a new
  agent that way. Typed messages get the same treatment while voice mode is on. The order
  may follow a few other words ("Okay, let's see if this works. Make a new Codex agent."): it is looked for sentence by
  sentence, and inside a longer message it is only acted on when Jev is sure it is for the app. "... named X" / "call it X"
  names the agent: a Jev agent at once, a Claude or Codex session when its first turn ends (it shows in the title bar
  from the start), written to the provider like any rename.
  "... about X" / "for X" is what the agent is for. Jev only says *that* this is an order to open an agent; the details
  are language, so the session's own model reads the sentence once and returns them as JSON (kind, name written as a
  person would title it, purpose, folder), overriding what the rules found, and it also writes the new agent's first
  message for that order (opened from the app, which folder, name and purpose in the user's intent, other agents may
  be at work, change nothing yet, look around, say what it understood and proposes, ask, then wait). The new agent is
  never left blank: a session only exists once something is sent. The agent opens at once with what Jev and the rules
  found; the model's reading arrives a few seconds later (`command:details`) and the name and first message follow it.
  If the model gives nothing within 30 s, the rules and the static `kickoffMessage` in `shared/types.ts` stand. An
  agent born from an order never keeps its first message as its title: without a name it becomes "Codex agent" or
  "Claude agent". The order itself stays in the thread it was given in, with a note of what the app
  did. The microphone does not move: there is one in the whole app, it stays with the session it was started in while
  you look at or type into others (that session's row shows a small waveform), and it only moves when you start voice
  somewhere else. While you look at another session, its orb waits at the bottom of the sidebar with the session's
  name, the phase, and mute / silence / end buttons; the name takes you back. The floating bar that appears over other
  apps while voice is on (the tiny bar) has a move handle (four arrows) that shows when the bar is hovered: drag it to
  move the bar, and nothing else drags it. It comes back where it was left. Its keyboard button slides a typing box open,
  the bar growing with it: Enter sends the text to the listening session the way its composer would (queued while a turn
  runs), without talking and without bringing the app forward; Escape closes it.
- **The voice's models come from the live lists.** For each provider the voice settings offer what the account offers
  now (Claude from the Agent SDK's model list, Codex from `model/list`), with "Automatic (the smallest)" first: a Haiku on
  Claude, the fast and affordable one on Codex. A saved id that is no longer offered, or one the API refuses, falls back
  to the smallest, and the settings say which model is really in use. Nothing about model names is hard-coded beyond the
  tier words, so a model that comes or goes never silences the voice.
- **Decisions by Jev, when it is there.** If a TypeSafe key is on this Mac (`TYPESAFE_API_KEY`, or `~/.typesafe/token`),
  the voice channel's decisions go to Jev, TypeSafe's System One model (`electron/jev.ts`): it does not write text, it
  answers typed questions with probabilities, in about 250 ms against 1 to 3 s for the voice model. It decides: whether
  your thought is finished when you pause (a clear "no" holds the words, joins them to what you say next and sends one
  message; held at most three times, 4.5 s each). A long dictation is closed at its next short pause once it passes 6 s, and at 12 s whatever the pauses, and the next words join it (not counted as a hold): every
  transcription pass costs by the length of the audio, and a paragraph re-transcribed at each pause took seconds a pass, so the words
  landed late and the thought was cut in two. The fullest text any pass of a stretch heard is remembered: a final pass that heard far fewer words (a 14 s pass once came back as "I" where earlier passes had heard two sentences) is retried once, and the fuller text wins. Whole transcripts Whisper invents from near-silence ("Thank you for your time.", "Thanks for watching") are dropped whatever their score. The audio of every pass stays in `data/voice-audio` (the newest 120 files, never sent anywhere), named in the recorder, so a lost sentence can be replayed. One speculative pass at a time: a pause while the previous pass still runs skips it, whether it was a question or a thank-you (answered at once with
  the voice answers in three stages: the quick line at once (Jev's fixed phrase, prepared during the pause), then the understanding (the voice model, told the quick line it comes after so it never repeats it, from the request and the last of the conversation: one or two sentences that say back what was said or asked, in its own words, and nothing else: never an answer, a plan or a promise, a request or a question back, a judgement or a guess, never a pronoun the user did not say; the answer is the third stage's (T-201; the user, 2026-09-28: it "should not attempt to solve the user's problem or answer the question"). Each line is checked before it is said, and every clause that does any of that is taken out (`shared/reflection.ts`). Skipped for a greeting, small talk or thanks (Jev's own question, else a rule on the words: no extra reply shape for the model), for anything under five words, or once the turn is already over), then the summary of the answer when it lands), and queue / steer / stop / replace while the main thread is busy, with the spoken line
  picked from a fixed set, in English, never the same line twice in a row. "Decisions" in the voice settings hands all of it back to the voice model. Below 0.6 confidence, in another language, over the 1.2 s budget, on any error, or with no key, the voice
  model decides as before. The key stays in the main process: never logged, never sent to the window. `CVC_JEV=off`
  switches it off. The voice settings say who is deciding.
- **The fixed lines** (English only; a line is never said twice in a row): question "Let me check" / "Good question, one
  second" / "Let me look at that" / "One moment, checking"; task "Okay, one second" / "Sure, give me a moment" / "Got it,
  one moment" / "Sure, one moment"; thanks "Happy to help" / "Anytime" / "Glad you like it"; remark "Okay, one second" /
  "Mmm, let me think" / "Sure, give me a moment" (never a single word); while
  working: steer "Okay, working on that now" / "Got it, on it" / "Sure, one moment", a question "Good question, I'll
  answer that too" / "Let me look at that as well", queue "Okay, I'll queue that up" / "Got it, I'll keep that for right
  after this", stop "Okay, I'll take care of that right away, stopping now" / "Okay, stopping now", replace "Okay,
  switching to that right away" / "Got it, dropping this and switching now"; a stop word alone "Okay, stopped".
- **Welcome screen** (opens by itself the first time the app runs, over the main window, and from Jauvex settings
  after; the checks sit in two columns so the screen fits the window, hints and all): first the orb alone, a little bigger, in the middle of the screen; after a beat it slides up and shrinks into its place, the title fades in and the welcome is spoken (the name, one phrase on what the app is, and that the computer is being
  checked), typed out on screen as it is said, and only then the checks
  a fresh Mac must pass appear, each with a spinner, landing one after another (so the Start button comes only after the
  last), on screen and out loud. With both providers signed in and no default agent yet it asks which one to start with.
  Once the checks are in it listens, and keeps listening while it talks: speak over its line and it stops mid-sentence,
  like a chat (echo cancellation keeps it from hearing itself; a heard line that is its own is dropped). It listens
  (Whisper warms up as the screen opens) for: "start", "Claude", "Codex" or both in one
  breath ("let's start with Codex"), Jev first, and "Claude" then "start" as two steps; with three options only, a word
  within one edit of "start", "Claude" or "Codex" counts ("Stark", "Clon", "Codecs"), however Whisper spelled it; a provider that is not signed in
  is not a choice: with one provider there is only start, and a name gets "not signed in here; I have Claude, say start";
  anything else gets a nudge to press or say start; with nobody signed in it
  says plainly that it cannot answer yet. The very first time Start opens the Jauvex agent, it introduces itself in a few
  spoken sentences, said out loud as well as shown: who it is, that it orchestrates the other agents, can be a personal
  agent, looks after the app and helps contribute to the project, that talking works best and typing is just as
  welcome, and that voice can be switched off or on at any time. Asked for a new agent, it asks which folder (or opens
  the folder dialog for you) and creates a new session there on its own provider; the app's own "new agent" shortcut
  stays out of its way in that chat, and never lands a new agent in the app's own folder by default. Under the orb it shows what it heard and what its ears are doing (listening,
  or why not: microphone access off, Whisper still loading). Start, said or pressed, opens the Jauvex agent with voice on,
  so the first conversation is with an agent that can answer. The checks: the `say` command, Claude signed in, Codex signed in, whisper-server with a model, a TypeSafe key (optional),
  with the command to run for whatever is missing. macOS only for now. The window is muted while voice mode is off (nothing in it may make a sound then); the welcome
  unmutes it while it is open, so it is heard without starting a voice chat, and mutes it again when closed.
- **Jauvex settings** (the wheel in the sidebar's footer): the app's own settings, in tabs across the top, in a window that keeps
  its size from tab to tab: **General** (the default agent, whether the Jauvex agent shows in the sidebar and how it moves between
  providers, the welcome screen: show it again on the next start, or open it now), **Voice** (the voice chat settings, the same
  as under a session's orb), **Context** (when to compact by itself) and **Reset** (in red, the danger zone: reset the app to its
  initial state). The accounts are in the Jauvex button.
  It deletes only the app's own data (the sidebar's folders and sessions, which stay untouched in Claude, Codex and Grok, the
  Jauvex agent's conversation, every setting, the flight recorder), after a confirmation that says it cannot be undone;
  the app then says so and exits, and the next start is a first run.
- **Debugger** (the bug icon in the title bar; docks as a panel under the conversation), two tabs. **Voice**: a live list of what the voice channel did. What Whisper heard,
  whether the thought was judged finished, each acknowledgment, each queue / stop / replace call, what was queued and
  sent, the spoken summary, and every time Jev gave no answer and the voice model took over. Each line says who
  decided (Jev, the voice model, a rule, the app) and how long it took; the header keeps the averages. In memory
  only, the last 300 events (`electron/debug.ts`); never keys or audio.
- **The orb** is Jauvex's own: the two strands of the mark as a slowly turning double helix inside a dark glass disc.
  The strands swell with the voice level (yours or the voice's) and turn faster while the main thread thinks. Two gray
  layers: the microphone muted grays the disc (the ears), the speaker off grays the strands (the voice), so each state
  reads on its own.
- **Voice can start while a turn runs**: the Stop button and the voice button sit side by side; voice joins the work in
  progress, and what you say steers the running turn.
- **Controls**: end, mic mute, orb, speaker mute, settings (voice, speed, pause length, language, voice model). When the
  app loses focus a small floating controller stays on top; its microphone counts down with the app's before the auto-mute
  (T-178).

## How it is built
- TypeScript everywhere. No server: the React UI (`web/`) calls the Electron main process over one
  IPC channel (`electron/preload.ts` → `electron/main.ts` → `electron/backend.ts`).
- **The Jauvex agent lives in `~/.jauvex`**, not in the folder the app is installed in: Claude Code files a session under its
  working folder, and renaming the install folder once left the agent pointing at a folder that no longer existed, its
  conversation gone from the window. An old entry is moved there when the state loads; its briefing names the install folder
  and the command line by its full path. When its session cannot be found where it lives, the conversation stays on screen
  (the app keeps its own transcript), a note says so, and the next message starts a new session carrying the conversation
  so far, the way a move to the other provider does. The app's state is read once and kept in memory, so two changes at the
  same moment can no longer overwrite each other (a cleared session once came back, and the agent's entry vanished).
- **The data folder is `~/.jauvex/personal`** (`electron/paths.ts`): the state, the window's profile, the logs and the command
  files, for every copy, run from source or compiled, outside the folder the app is installed in, so an update or a new copy keeps
  everything; `data/` in this README means that folder. One data folder, one copy running (the lock in `main.ts`); `CVC_DATA_DIR` moves it (the checks).
- **Orders for the app are kept, and only whole orders are taken.** When the app handles something itself (a restart, a reload,
  a new agent), the user's words and its reply stay in the thread: they are kept next to the session (`data/notes/<session>.json`,
  after the message they followed; in the transcript of an agent that moves between providers), so a restart no longer wipes
  them. And the app only takes an order when that order is the whole request: "publish and restart the app" goes to the agent,
  which does the work and then restarts the app itself (`node scripts/jauvex.ts restart`; every agent is told so).
- **Voice settings in two places.** The same form sits under a session's orb and in the main settings (Voice chat); they are
  one set for the whole app, and a change in either place reaches every open chat. Text settings save as they are typed.
- **Push to talk** (voice settings; T-157, asked for 2026-09-26): the microphone hears only while its button (the microphone in the
  voice pill) or the Option key is held. A pause while holding ends nothing; letting go ends what was said at once, a finished thought
  (no wait for more words). The wake phrase and the mute countdowns have nothing to do then.
- **A wake phrase, and mute after each message** (voice settings; the wake phrase has its own on/off box). While the microphone is muted, the ears still listen for short
  phrases of up to 4 s and check each against the wake phrase ("Hey Jauvex" by default; empty turns it off), by sound rather
  than spelling (the small model hears "Hey Jauvex" as "Hey, Jev, X."); a match turns the microphone back on. Nothing else heard
  while muted is sent or written down. "Mute after each message" starts a countdown on the microphone button after each spoken
  message (5 s by default, the numbers flash), then mutes; talking again cancels it, and a sound that turns out to be no words (a
  breath, a knock) starts it again: one once stopped it for good. "Mute when idle" (off, or up to a minute)
  mutes after that long with nobody talking, the last 5 s counting down the same way. With these, the user mutes by staying
  quiet and comes back by saying the phrase. The phrase is heard by the small live-words server; when that one is down, the
  main Whisper hears it instead, and a live server that stopped starts again when next needed (at most every 30 s). Why: on
  2026-09-24 the small server died, the app never started it again, and every check heard nothing: the user said his phrase
  again and again and the microphone stayed muted. The flight recorder says which server heard each check (`tests/wake-check.test.ts`).
- Sessions come from the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): `listSessions({ dir })`,
  `getSessionInfo`, `getSessionMessages`. Same data the `claude` CLI uses, typed, with no CLI scraping and
  no parsing of `~/.claude` by hand. The same SDK's `query({ resume })` is the path for sending messages later.
  Claude Code keeps its sessions in `~/.claude`, or wherever `CLAUDE_CONFIG_DIR` points: the app starts through macOS, not from a
  terminal, so it takes `CLAUDE_CONFIG_DIR` and `CODEX_HOME` from the login shell along with `PATH` (without that, a user who had
  moved Claude Code's folder saw his Codex sessions listed and none of his Claude Code ones). When a folder lists no Claude Code
  session, the debug panel says where the app looked.
- Codex sessions come from **`codex app-server`** (`electron/codex.ts`): the JSON-RPC interface, one JSON object per
  line over stdio, that Codex's own clients use. `thread/list` from Codex's state database (`useStateDbOnly`: the
  default scan of the rollout files leaves out the threads the desktop app's agents created, which the desktop still
  lists), kept when a thread ran in the folder or in a Codex worktree of it (`~/.codex/worktrees/<id>/<basename>`,
  recognised by the basename and the folder's git origin, never by reading Codex's folders); `thread/items/list`,
  `thread/start` / `thread/resume`, `turn/start`, `turn/interrupt`, plus the approval requests the server sends.
  Same login, config and session store as the Codex CLI, nothing in `~/.codex` parsed by hand. The binary is the
  `@openai/codex` npm dependency; `codex app-server generate-ts --out <dir>` prints the protocol types for the
  installed version. One server process starts on first use and is shared by every Codex chat.
- Grok sessions come from **`grok agent stdio`** (`electron/grok.ts`): the Agent Client Protocol (JSON-RPC 2.0, one object per
  line over stdio) that Grok Build speaks to editors, with its own `x.ai/*` extensions (Grok Build's source is public:
  github.com/xai-org/grok-build). `session/list` per folder; `session/load` replays a session's history as updates marked
  `isReplay`, and a session the app is not running is closed again after reading, so a Grok window that goes on with it never
  races a stale copy here; `session/new` / `session/resume`, `session/prompt`, `session/cancel`, `session/set_config_option`
  (model, effort), the `session/request_permission` requests, `x.ai/interject`, `x.ai/session/rename`. Grok takes the app's
  briefing once, when a session is made (`_meta.rules`, folded into its system prompt), so the note on dictation is always in
  it. One agent process with `--no-leader` (the app's own, never the leader a Grok window on the Mac may share), started on
  first use, and never when no `grok` is on the Mac. Same login, config and store as the Grok CLI (`~/.grok`), nothing there
  read by hand. Its plan's credits come from `x.ai/billing`, what Grok's own usage view reads (the share of the period's included
  credits used, the period, on-demand spending, bought credits, the plan's name). Not yet: a Grok row on the welcome screen.
- `electron/chat.ts` routes each turn by the session's provider; every provider sends the UI the same `ChatEvent`s.
- Two threads per chat. The main thread is the session itself (Claude or Codex, the model in the picker). The voice
  thread is a small model **from the same provider** (Haiku for Claude sessions; for Codex sessions the account's fast,
  affordable model, in a throwaway `ephemeral` thread with a read-only sandbox, so nothing lands in your Codex history; for Grok
  sessions Grok's fast model, in a session of its own in the system's temporary folder with the voice's prompt as its whole system
  prompt: Grok keeps every session, so the voice's is deleted when a new one is made, and its id is kept in the data folder for the
  next run to delete when the app quit before Grok answered; each can be changed in the voice settings). About 1.3 to 1.8 s per line once warm; voice mode warms it up. It only
  speaks for the main thread: every message it gets starts with a `MAIN:` line naming the
  main thread's provider and model, it has no identity of its own, and asked "what model are you?" it relays the main
  thread's answer instead of naming itself (`tmp/e2e-voice.ts` checks this for both providers).
- App state (folders + picked sessions, and which of them are Codex's) lives in `~/.jauvex/personal/state.json`.
- `npm start` goes through `open` so macOS attributes privacy permissions (the microphone, later) to
  the app instead of the terminal.

## License

Apache License 2.0: see `LICENSE`. The `NOTICE` file names the authors: whoever passes Jauvex on, changed or not, passes its
notices along with it (section 4 of the license). Versions before 0.2 were published under the MIT License and stay under it.
