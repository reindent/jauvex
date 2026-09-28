# Changelog

What changed in each release of Jauvex Personal. The install command (`curl -fsSL https://jauvex.reindent.com/install | sh`)
always builds the latest one, and from 1.1.0 on the app offers each new version itself.

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
