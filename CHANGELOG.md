# Changelog

What changed in each release of Jauvex Personal. The install command (`curl -fsSL https://jauvex.ai/install | sh`)
always builds the latest one, and from 1.1.0 on the app offers each new version itself.

## 1.7.2: 2026-10-07

- **A lead agent waits for its team**: when an agent's plan waits for other agents to finish ("start the third when the first two are
  done"), the app wakes it with their last answers once all of them have finished, and its chat says whom it waits for.
- **Messages between agents fold away**: in your chat, an agent's back-and-forth with other agents is one line, "3 messages with Coding
  Agent", that opens with a click, so its answer to you stays in sight.
- **Codex signs in with a code**: Accounts has "Sign in with a code" for Codex, for when the browser sign-in fails. On Windows the app also
  finds a Codex installed with WinGet.
- **Web pages in Markdown open as pages**: a link to a Markdown file served over the web shows as a page beside the chat, not a blank pane.
- **A folder's files**: a folder's menu opens it in your file manager.
- **Voice**: the pause that ends your turn is 2 seconds by default and can go up to 5.
- **Compaction waits for a quiet moment**: an idle chat whose context is nearly full compacts while nobody waits on it, and nothing you
  send is lost in a compaction.
- The site is now jauvex.ai: `curl -fsSL https://jauvex.ai/install | sh`.

## 1.7.1: 2026-10-04

- **Send feedback to Reindent**: the icon beside Settings opens the Jauvex agent, which takes an idea, feedback, a bug or a question by
  voice or text, writes it up, shows it to you and sends it when you say so. It asks before attaching a screenshot of the window or the
  app's recent log (cleaned of keys, tokens, emails and your home folder), and never sends your files or chats. "Report this" on one of the
  app's error messages starts a bug report with the error filled in, and the agent also offers whenever you tell it something is broken.

## 1.7.0: 2026-10-04

- **Windows**: the app runs on Windows 10 and 11 (64-bit), from source: `start.cmd` (or `start.ps1`) installs what it needs, builds and
  launches it, as `start.sh` does on macOS and Linux. The voice works there too: Kokoro speaks, and whisper.cpp's own Windows build listens.
  It needs Node.js 22.18 or newer, Git and Microsoft's Visual C++ runtime; the README says how to get them.

## 1.6.0: 2026-10-04

- **Spanish**: the app speaks English and Spanish (neutral Latin American). It follows your system's language, or the one you pick in
  Settings, General, Language, and the window changes at once. Only the app's own words change: what your agents write stays in the
  language you write to them in. Adding another language is one file.
- **A step of yours shows what to decide on**: when a workflow waits for you, its pane shows what the step before it found (its whole
  reply, folded, with "Show all"), the files it wrote or named in the run's folder, which open beside, and a button to its agent's chat.
  The options it offers are buttons that fill in your answer; you still press continue. The notification and the dashboard carry the
  question, and the run's record keeps what the step found, not how it started.

## 1.5.0: 2026-10-01

- **A dashboard on the Jauvex agent's chat**: what needs you (a workflow step waiting for you, an agent asking for permission, new
  replies, each with Open, then what the Jauvex agent lists for you), today's runs, who is working, and the agent's pinned notes. One
  third of the view, half, or folded to a line, with the cards you choose. The Jauvex agent keeps it current: when it is due (none yet, a
  board changed, or hours old), the app asks it, never too often and only while it is idle. The ⋯ menu or Settings, General turns it off.
- **Custom colours, made with the Jauvex agent**: Settings, General, Appearance has a fourth choice. The Jauvex agent asks what you feel
  like, offers three palettes, puts on the one you pick and changes it as you say; text that would be hard to read is refused.
- **The light theme is neutral**: an off-white left pane, pure greys, near-black text, and the blue accent as its one colour.
- The Jauvex agent's chat keeps your draft and your waiting messages across a reload, and a message handed to it while it works stays in
  its conversation.

## 1.4.1: 2026-10-01

- **Sonnet 5.5** is in Claude's model list: the app's Claude SDK is updated (0.3.287), and with it the Claude Code it runs.
- The Jauvex agent's chat takes over the right pane you were looking at: open the Jauvex agent beside a file and go on with it there,
  instead of the pane closing.
- The welcome screen can move the window by its top edge, as the title bar does.

## 1.4.0: 2026-10-01

- **Linux**: the app runs from source on Linux (Ubuntu 24.04 and later), started with `npm start` in a clone of this repository; there
  is no packaged Linux app yet, and the update offer is for the Mac app. The window has the system's own frame. The voice speaks with
  Kokoro, which `start.sh` installs with its model; it speaks English only. Voice recognition needs whisper.cpp built by hand (the
  README says how). On the Mac nothing changes.
- **The debugger's Model tab shows your agents**: every turn of a Claude, Codex or Grok agent, what was sent, each step and how it
  ended, each line naming the agent. The same lines go to `voice-debug.log`.
- **System events** have their own button, a lines icon between the glasses and the bug, shown in developer mode only.
- **Reload**: the arrow at the top right reloads the window as Cmd+R does; running turns, queued messages and drafts carry on.
- The Jauvex agent's chat shows its latest 150 messages, and "Load earlier messages" goes back through the rest and on into the agent's
  own session.
- The Jauvex agent's chat and the chats' notes are no longer lost when several replies are saved at once.
- An agent's answer that mentions a rate limit, authentication, or a number from 500 to 599 is no longer shown as the provider's
  failure.
- A window whose page crashes loads again by itself, and the log says why.
- After an update, the Jauvex agent's message shows in its chat on screen, without a warning that the session was active elsewhere.

## 1.3.4: 2026-10-01

- **Folders move**: drag a folder by its name, in the left panel, above or below another; the order is kept.
- **A light theme, and the app follows your Mac.** By default it is light, dark or auto as your Mac's Appearance is set, and changes
  with it. Settings, General, Appearance can make it Light or Dark for the app alone. The light theme: a white chat beside a light grey
  left pane.
- **Developer mode**, the glasses at the top right, off by default. Off, an agent's tool calls and thoughts show as one "Working" row
  that opens with a click; on, every tool call shows as before.
- A Codex session that another program has open (the Codex app, VS Code, the terminal) is waited for, then explained, instead of
  failing with "already has an active writer"; the app lets a Codex session go when its turn ends.
- A folder's workflows list only workflows: a rules or notes file kept beside them is left out and never runs.
- A workflow's later step reaches its agent even when the app closed that agent's chat during the run (it keeps eight open): it failed
  with "could not be reached".
- A workflow step ends only on its own agent's reply to it: an answer to other messages that had waited in that agent's queue no longer
  closes a step the agent had not started.
- An agent or board made for a folder named Jauvex goes to that folder, not to the app's own folder of the same name.
- An agent ordered of a provider that is not signed in is refused, saying so, instead of quietly being made with another provider.

## 1.3.3: 2026-09-30

- **What's new**, at the foot of the sidebar. A click asks jauvex.reindent.com whether a newer version is out. If one is, the Jauvex agent
  tells you what it brings and asks whether to update; if not, the notes of the latest releases open, with a line on top saying what the
  check found. While a newer version is out, its notice in the same place does the same.

## 1.3.2: 2026-09-30

- **New replies, counted per agent.** A reply of an agent that is not on screen puts a badge with the count on its row in the sidebar,
  the Jauvex agent's too (up to 99, then 99+). Opening the agent clears its count; a reply of the agent on screen counts nothing. A
  reload or a restart keeps the counts.

## 1.3.1: 2026-09-30

- **What a new version brings, told in the app.** Before an update, the Jauvex agent tells you what the new version brings, from its
  changelog, then asks. After an update, its chat opens and it tells you what changed since the version you had, then checks that your
  folders and agents are all there. Every release is in `CHANGELOG.md`, and at jauvex.reindent.com/changelog.
- Agents no longer take Claude Code's note about a resized picture for a screenshot from you.

## 1.3.0: 2026-09-29

- **Workflows.** A folder's workflows: a markdown file per workflow, `workflows/<name>.md`, its steps in order and who does each, and a
  folder beside it with one file per step, its instructions. They are listed under the folder, between its sessions and its boards: the
  ones waiting for you first, then the running ones, then the rest by their last change.
  - Run one from its view, or ask an agent to (`run --workflow`): each step goes to the agent it names as one message, and the OUTCOME line
    of its answer says what comes next. A step addressed to `→ you` waits for you: pick an outcome, add a note if you like.
  - Everything is editable in place: the steps, who does each, their instructions, the trigger. Or edit the markdown: the view follows.
  - Every run keeps a record in the workflow's folder, and every change that a run meets becomes a version you can go back to.
  - Triggers: by hand, on a schedule (`every weekday 9:00`), once in a time window (`anytime between 9 and 12 am`), or after another
    workflow ends. A schedule missed while the app was closed: run it when the app opens, have the Jauvex agent ask you (the default), or
    nothing, as you choose in Settings.
  - Each workflow has a chat of its own, which writes it, runs it and explains a run with you.
  - A new workflow starts as a Hello World that runs as it is.
  - Move a workflow to another folder with its chat's conversation (`move-workflow`), and an agent with its conversation (`move-session`).
- A board's chat, and a workflow's, can write to your other agents and hear back.
- A message that wants its own answer (a workflow's step, another agent's question) waits for a turn of its own instead of joining a
  turn that answers someone else.
- The voice's second line, what it understood, only says back what you said or asked: never an answer, a plan, a promise or a guess.
  A greeting or thanks gets none.

## 1.2.1: 2026-09-28

- **Talk to a board.** Under each board, "Talk to this board": a chat with an agent of its own, by text or by voice. Ask it to add a
  task, take one, move one on, finish or reopen one, or plan from the board: it edits the board's files and the board redraws after
  each answer. It sees the board as it is on every message. Its conversation is kept for that board, in the app's own data, never
  in your folder.
- A Jev trainer's chat keeps its history after a window reload when its folder is reached through a symbolic link.

## 1.2.0 — 2026-09-28

- **Boards.** A folder's to-do lists, plain markdown files in the folder (`PROJECT.md`, `MARKETING.md`, `BOARD.md`, `ROADMAP.md`,
  `boards/*.md`), listed under the folder's sessions with how many tasks are done.
  - Two views: a column per section (P0, P1, P2…), or a Kanban with a lane per status (to do, doing, done), each card tagged with its
    section. The view you pick is remembered.
  - A click on a task's circle moves it on: to do, doing, done. A done task leaves the board for a done file beside it
    (`PROJECT-DONE.md`, `boards/x-DONE.md`), newest first, with the day it shipped. "Show done" shows them; a click reopens one.
  - A new board from the folder's options, or by an agent with `new-board`. Delete a board from its row's secondary click, after a yes.
  - Every agent is told its folder's boards and how to keep them.
  - Boards carry a format version on their first line (`<!-- boards: v1 -->`): an older copy of the app never rewrites a board written
    in a newer format.
- The floating voice bar counts down before the auto-mute, as the window does.
- A Jev trainer's chat keeps its history after a window reload.
- A link inside a file shown in the right pane opens the file beside it.

## 1.1.0 — 2026-09-27

- **Grok**, as a third provider next to Claude and Codex: new agents, streamed replies, permission cards, stop, steering, resume, models
  and efforts, the context meter, its usage in the battery, and the pictures it makes shown in the thread.
- **Updates from the app.** It asks jauvex.reindent.com for the latest version at launch and every six hours; when a newer one is out,
  the Jauvex agent asks you, and on a yes the app rebuilds itself on your Mac and opens again.
- **Push to talk**, a voice setting: the microphone hears only while you hold its button or the Option key.
- **Permissions per provider**, in Settings › Safety: Ask, Auto, or YOLO — full access, for every session of a provider.
- Settings and the usage panel in tabs.
- Agents can bring a folder's existing sessions into the sidebar (`import`); a session an agent opens stays in the sidebar; the Jauvex
  agent can be reached from every agent, its chat open or not.
- "Claude" is heard as Claude when speech-to-text writes "cloud".
- New work that comes in while an agent is busy comes first.
- Fixes: the session menu's layout, a stray scrollbar in an empty message box.

## 1.0.0 — 2026-09-24

The first release: Claude and Codex agents side by side, by folder, in one Mac app built on your Mac with one command. Talk or type;
a voice that answers in three beats, never talks over you, and steers a working agent without stopping it; a wake phrase and
auto-mute; agents that message each other; the Jauvex agent, for setting up and creating agents; a right pane for files and pages;
Jev agents with a TypeSafe key; a context meter and a usage panel.
