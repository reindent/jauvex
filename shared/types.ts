// Shared between the Electron main process and the React UI.
// Every session belongs to one provider for life: a Claude session continues with Claude, a Codex one with Codex.
import type { ContextUsage } from './context';
export type Provider = 'claude' | 'codex';
export const PROVIDERS: Provider[] = ['claude', 'codex'];
export const PROVIDER_LABEL: Record<Provider, string> = { claude: 'Claude', codex: 'Codex' };
// providers: sessionId -> provider, for the picked sessions that are not Claude's (absent = claude, so older state files stay valid).
export type Project = { id: string; path: string; name: string; builtin?: 'jauvex'; sessions: string[]; providers?: Record<string, Provider>; jev?: JevAgent[]; prefs?: Record<string, SessionPrefs>; context?: Record<string, ContextUsage> /* sessionId -> how full its context was after its last turn (shared/context.ts), kept by the main process */ };
// What was picked in a session's composer stays with that session: model, effort, permissions. ('' = the provider's default.)
export type SessionPrefs = { model: string; effort: string; permissions: 'ask' | 'auto' };
// A Jev agent is not a chat. Jev (TypeSafe's System One model) takes a state and a map of typed questions and returns typed
// answers with probabilities. The agent is that pair, kept by Jauvex (Jev itself stores nothing), plus its recent runs.
export type JevRun = { at: number; ms: number; state: string; questions: string; ok: boolean; model?: string; answers?: Record<string, JevAnswer>; usage?: { input_tokens?: number; output_tokens?: number }; error?: string };
export type JevAnswer = { type: 'noul' | 'choice' | 'score'; noul?: number; choice?: string; score?: number; legend?: Record<string, string>; probabilities?: Record<string, number>; confidence?: number };
// llm + sessionId: the optional trainer, a Claude or Codex session coupled to the agent. It is talked to (by text or voice) in a panel
// under the pad, sees the pad on every turn, and edits it by answering with jev-state / jev-questions / jev-evaluate blocks.
export type JevAgent = { id: string; name: string; state: string; questions: string; runs: JevRun[]; updatedAt: number; llm?: Provider | null; sessionId?: string | null };
export const JEV_TEMPLATE = { state: `Customer: I was charged twice for my subscription this month and nobody has answered my two emails. I need this fixed today or I am cancelling.`,
  questions: JSON.stringify({ is_urgent: { type: 'noul', instructions: 'Does this convey urgency?', criteria: { true: 'Explicitly time-sensitive', false: 'No urgency expressed' } },
    department: { type: 'choice', instructions: 'Which team should handle this?', criteria: { billing: 'Payments, invoicing, refunds', technical: 'Bugs, outages, integrations', sales: 'Pricing, upgrades, new accounts' } },
    frustration: { type: 'score', instructions: 'How frustrated is the customer?', criteria: ['Calm', 'Frustrated', 'Very angry'] } }, null, 2) };
export const providerOf = (p: Project, sessionId: string | null | undefined): Provider => (sessionId && p.providers?.[sessionId]) || 'claude';
// ackModel speaks for Claude sessions, codexAckModel for Codex sessions ('' = the account's fast, affordable model): the voice stays with the session's provider.
// sttModel: the Whisper model file in models/ ('' = the fastest one there). vocabulary: names Whisper should know, given to it when its server starts.
export type VoiceSettings = { voice: string; rate: number; pauseMs: number; ack: boolean; ackModel: string; codexAckModel: string; language: string; sttModel: string; vocabulary: string; showVoiceLines: boolean; decisions: 'jev' | 'model'; output?: string; wakePhrase?: string; wakeOn?: boolean; autoMute?: boolean; autoMuteSec?: number; idleMuteSec?: number }; // idleMuteSec: mute after that long with nobody talking (0 = off) // wakePhrase: said while muted, it unmutes ('' = off); autoMute: mute again autoMuteSec after each spoken message // output: the speaker device id ('' = the system default); a screen recorder or a virtual device can leave the default pointing somewhere the user cannot hear
// voice '' = the macOS system voice, exactly what a bare `say` uses (the compact Samantha sounds robotic: never switched to it for speed).
export const VOICE_DEFAULTS: VoiceSettings = { voice: '', rate: 185, pauseMs: 800, ack: true, ackModel: '', codexAckModel: '', /* '' = automatic: the smallest model the provider offers, and the fallback when a chosen one is gone */ language: 'auto', sttModel: '', vocabulary: 'Jauvex, Jev, Codex, Claude, Anthropic, ChatGPT, Haiku', showVoiceLines: false, decisions: 'jev' , wakePhrase: 'Hey Jauvex', wakeOn: true, autoMute: false, autoMuteSec: 5, idleMuteSec: 0 }; // decisions: Jev when its key is on this machine ('jev'), or always the voice model // voice bubbles are off by default: next to the main answer they read as the same thing twice
export type UiState = { sel?: { projectId: string; sessionId: string } | null; sidebar?: boolean; showMeta?: boolean; voice?: Partial<VoiceSettings>; welcomed?: boolean; defaultProvider?: Provider; jauvexSession?: string | null; jauvexProvider?: Provider; jauvexMove?: 'unified' | 'handoff'; showJauvex?: boolean; autoCompact?: number /* compact an agent's conversation when its context is this full, in percent; 0: the provider decides (shared/context.ts) */ };
// jauvexMove: how the Jauvex agent changes provider. unified: the app replays its whole transcript to the new session; handoff: the leaving assistant writes a handover note (a visible turn) and the new session starts from that.
/** One entry of the Jauvex agent's own transcript (the app keeps it, so the session can move between providers with its whole context). */
export type JauvexEntry = { message: ChatMessage; provider: Provider; at: number };
// defaultProvider: the agent new sessions and the Jauvex agent start with (asked on the first run when both are signed in).
// jauvexSession: the Jauvex agent's own session, reopened every time. showJauvex: false hides its row (it still exists). // welcomed: the welcome screen was seen once (first run), it does not open by itself again
export type AppState = { projects: Project[]; ui?: UiState };

export type SessionInfo = {
  provider: Provider; sessionId: string; summary: string; lastModified: number; createdAt?: number;
  fileSize?: number; customTitle?: string; firstPrompt?: string; gitBranch?: string; cwd?: string;
};

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; text: string; isError: boolean }
  | { type: 'image'; src?: string; name?: string } // src: a data URL, only for an image attached in this window (the transcript keeps no bytes)
  | { type: 'other'; kind: string };

/** An image attached to a message: pasted, dropped or picked. data is base64. Claude gets it inline; Codex gets it as a file in data/uploads. */
export type Attachment = { name: string; mediaType: string; data: string };

// voice: a line the speaking voice said (not part of the session's own transcript). ms = how long it takes to say, for the typing effect.
export type ChatMessage = { uuid: string; role: 'user' | 'assistant' | 'system'; blocks: Block[]; meta: boolean; voice?: { ms: number; cut?: boolean }; steered?: boolean; stopped?: boolean; error?: boolean }; // stopped: what the user said as they stopped the turn // error: a failure of the provider (refused, out of allowance, network), shown as a red card, never read as an answer
export type MessagesPage = { total: number; start: number; messages: ChatMessage[] };

// ---- chat (renderer -> main: start / stop / answer; main -> renderer: ChatEvent stream)
// provider only matters for a new session (sessionId null); an existing one keeps the provider it was created with.
// effort: how hard the main model thinks ('' or absent = the provider's default). vocabulary rides along with voice turns so the main model can repair misheard names.
// ask: every tool that needs permission shows a card. auto: the provider's own reviewer decides (Claude's permission classifier,
// Codex's auto_review); only what it will not decide still reaches the user.
export type Permissions = 'ask' | 'auto';
// hidden: the session belongs to something else in the app (a Jev agent's trainer) and stays out of the sidebar's session list.
export type ChatStart = { hidden?: boolean; permissions?: Permissions; steward?: boolean; // steward: the Jauvex agent, briefed about the app itself
  chatId: string; projectId: string; sessionId: string | null; provider?: Provider; text: string; images?: Attachment[]; model?: string; effort?: string; voice?: boolean; vocabulary?: string;
  compact?: boolean }; // compact: this turn only compacts the session's conversation (Claude: its /compact, with any focus given after it in text; Codex: thread/compact/start)
export type ModelOption = { id: string; label: string; efforts?: string[]; isDefault?: boolean };
/** Names the app itself needs heard right, whatever the user's own vocabulary says: Whisper is biased toward the words it is given, so
 * with Jauvex alone in the list "Jev" came out as Jauvex, Jeff or JaV (2026-09-22). Both go in, side by side. */
export const APP_WORDS = ['Jauvex', 'Jev', 'Claude', 'Codex'];
export const withAppWords = (vocabulary: string): string => { const have = vocabulary.split(',').map((w) => w.trim()).filter(Boolean); const low = new Set(have.map((w) => w.toLowerCase())); return [...APP_WORDS.filter((w) => !low.has(w.toLowerCase())), ...have].join(', '); };
/** A dictated message reaches the model with this tag in front (T-76): it reads names and odd words as possible mishearings,
 *  and must ask whenever it is not sure what was meant. Typed messages have no tag. The window never shows it. */
export const DICTATED_TAG = '[voice transcript] ';
export const dictationNote = (vocabulary?: string): string => `The user is talking to you by voice. A message that starts with ${DICTATED_TAG.trim()} was dictated: it is a speech-to-text transcript, not what they typed, so expect misheard names, missing punctuation, and one thought split over several messages. A message without that tag was typed and is exactly what they wrote. Read for intent and quietly correct obvious mishearings (names they use: ${withAppWords(vocabulary ?? '')}). Two names are easily confused: Jauvex is this app; Jev (spelled J-E-V, often heard as "Jeff", "Jav" or even "Jauvex") is the kind of agent the app calls Jev: typed classifiers from TypeSafe. When the words are about classifiers or a Jev agent, read Jev. Codex and "coding" sound alike too: "a coding agent" often comes out as "a Codex agent", so when that word decides what you do (which kind of agent to make, which one to talk to), ask which they meant. Asking is a must: whenever a dictated message could mean more than one thing, or anything in it leaves you less than sure what they want (an unknown name, an odd term, a request that makes no sense as heard, or one that reads naturally but may have been misheard), ask in one short line what they meant before acting on it. Never guess. Do not comment on the transcription.`;
/**
 * What every agent that runs inside this app is told about where it is, whatever the provider and however blank the session:
 * appended to Claude's system prompt and sent as Codex's developer instructions on every start and resume. It names no
 * product (the app's name may change) and describes only what changes how the agent should work.
 */
/** How one agent talks to another: a fenced block in its reply, which the app delivers. Shared by the briefing and the app's router. */
export const AGENT_MESSAGING = [
  'Other agents. Every agent in this app, Claude or Codex alike, can talk to every other one, in both directions, and the ONLY channel is this block in your reply, on its own lines:',
  '```message-agent <agent name or [id]>',
  '<what you want to tell or ask them>',
  '```',
  'Nothing else reaches an agent of this app: not the ListAgents or SendMessage tools of your own harness (they see other Claude Code sessions and your subagents, never the agents of this app, and never a Codex one), not a /chat, agent-talk or other file-based protocol or skill, not the claude or codex command line, not a note left in a folder. When the user says "talk to X", "ask X", "tell X", "hand this to X" or "send X the ..." about an agent in this app, write the block and nothing else: the app delivers it. Never say you cannot reach them, never look for another way. In a Claude session the same channel is also a tool: mcp__jauvex__message_agent (and mcp__jauvex__list_agents for the roster); the tool and the block are one and the same thing, use either.',
  'The Jauvex agent. One session in this app is the Jauvex agent, pinned at the top of the sidebar: it runs the app itself (updating it, installing what is missing, creating agents and adding folders, how the app works), and it can work on the app\'s code too. When the user asks you for one of those, send a message-agent to "Jauvex"; a restart you do yourself, as above. Work the user gives you is yours, the app\'s code included: when its source is in your folder, read it, compare its versions or change it yourself, as asked. Hand work to another agent only when the user says so, or when it is out of your reach (the app\'s code outside your folder goes to the Jauvex agent).',
  'The app delivers it: into their running turn if they are working, otherwise it starts one. Whatever they reply comes back to you by itself, later, as a message that starts with (from agent "<name>" [<id>]); it never arrives inside the same turn, so say what you are waiting for, end your turn, and go on when it comes. A message that starts with (from agent "<name>" [<id>]) is from that agent, not from the user: your reply to it goes back to them by itself, so just answer, plainly and completely, as you would answer the user. Their next word to you will only come if they write to you again; to ask them something more, write a new message-agent block, addressed to the name or to the id in brackets (the id always works, names can change). Keep such messages short and self-contained; the other agent sees nothing of your conversation. To see who exists, put a fenced block containing only the word list-agents in your reply; the app answers with each agent\'s name, provider, folder and whether it is busy. The app stops relaying after 30 agent-to-agent messages in ten minutes without a word from the user.',
].join('\n');
/** A file opened in the right pane, read by the main process: text as is, markdown rendered by the window, images as data, pages and PDFs framed. */
export type FileView = { ok: true; kind: 'text' | 'markdown' | 'image' | 'frame'; name: string; path: string; size: number; mediaType: string; text?: string; data?: string } | { ok: false; error: string; path: string };
/** The message_agent / list_agents tools of a Claude session, answered by the window (the roster and the router live there). */
export type AgentRequest = { type: 'message'; to: string; text: string } | { type: 'list' };
export type AgentRequestEvent = { id: string; chatId: string; projectId: string; sessionId: string | null; req: AgentRequest };
/** What an agent can ask the app to do, as a file in data/commands (scripts/jauvex.ts writes it). folder: a folder's name, path or id; session: a session's id or title. */
export type AgentCommand =
  | { type: 'list' }
  | { type: 'add-folder'; path: string }
  | { type: 'pick-folder' } // opens the folder dialog for the user; the chosen folder is added and returned
  | { type: 'new-agent'; provider?: Provider | 'jev'; folder?: string; name?: string; purpose?: string; kickoff?: string }
  | { type: 'open'; folder?: string; session?: string } // no session: the Jauvex agent
  | { type: 'send'; folder?: string; session: string; text: string }
  | { type: 'rename'; folder?: string; session: string; title: string }
  | { type: 'settings'; defaultProvider?: Provider; showJauvex?: boolean; welcomeNext?: boolean; jauvexMove?: 'unified' | 'handoff'; autoCompact?: number }
  | { type: 'welcome' } | { type: 'reload-ui' } | { type: 'restart-app' };
export type AgentResult = { ok: boolean; error?: string; [k: string]: unknown };
/** In this edition people sign in to Claude and Codex with each provider's own command line, not in the app: Anthropic does not let
 *  apps built on its Agent SDK offer the Claude.ai login (its Agent SDK and legal pages, read 2026-09-24). The in-app sign-in, sign-out
 *  and switch stay in the code (Accounts, Welcome, electron/account.ts), hidden while this is false. */
export const SIGN_IN_IN_APP = false;
/** The command that signs each provider in, in Terminal, and how to get it when it is missing. */
export const SIGN_IN_CLI: Record<Provider, { login: string; logout: string; tool: string; install: string }> = {
  claude: { login: 'claude auth login', logout: 'claude auth logout', tool: 'Claude Code', install: 'curl -fsSL https://claude.ai/install.sh | bash' },
  codex: { login: 'codex login', logout: 'codex logout', tool: 'Codex', install: 'brew install codex' },
};
export const AGENT_COMMANDS_HELP = 'node scripts/jauvex.ts <command> [--flag value ...], from any folder. Commands: list (folders, sessions and agents, with ids); add-folder <path>; pick-folder (opens the folder dialog for the user, adds what they choose); new-agent [--provider claude|codex|jev] [--folder <name|path|id>] [--name "..."] [--purpose "..."] [--kickoff "first message"] (the agent starts at once, with its own introduction when no first message is given: it exists, and is listed, from then on); open [--folder ...] [--session <id|title>] (no session: the Jauvex agent); send --session <id|title> [--folder ...] --text "..."; rename --session <id|title> --title "..."; settings [--default-provider claude|codex] [--show-jauvex yes|no] [--welcome-next yes|no] [--jauvex-move unified|handoff] [--auto-compact <percent>|provider] (compact an agent\'s conversation when its context is that full); welcome; reload (the window, after a UI build); restart (the app, after a main-process build; it kills your own turn: last thing you do). Each prints a JSON result.';
/** The Jauvex agent: the one session that always exists, the entry point for everything about the app itself. */
export const STEWARD_BRIEFING = [
  'Who you are. You are the Jauvex agent: the one session that always exists in this app, pinned at the top of its sidebar, and the entry point for everything about the app itself. Your own folder is your home, ~/.jauvex, which stays whatever happens to the app\'s folder; the app\'s own data is in it too, in data/ (the state, the logs): read it when useful, never edit it, the app keeps it in memory and writes over it; the app itself is installed at {APP}: its source, its README.md and its AGENTS.md are there. The user comes to you to restart or update the app, to install what is missing, to create agents and add projects, to ask how the app works, and, when they want to contribute, to develop it. The other agents route questions about the app to you: answer them.',
  'What you can do. Read {APP}/README.md first for what the app does, and {APP}/AGENTS.md before changing anything: it holds the rules (one copy of the app only, how to restart safely, never kill by name, one commit per feature). Every action in the app is yours through its command line: ' + AGENT_COMMANDS_HELP + ' Update the app when the user asks. Installed with the install command (the app in Applications, its source in ~/.jauvex/personal/app, no .git folder): the update is that command again, `curl -fsSL https://jauvex.reindent.com/install | sh`, which the user runs in Terminal with the app closed (it refuses while the app runs): give it to them. A clone (it has .git): `git pull` in {APP}, `CVC_DRY=1 sh start.sh` there (it installs what changed and builds, without launching), then `node scripts/jauvex.ts restart`; report what changed from the git log. Install what is missing with the `sh start.sh` steps (Homebrew for whisper-cpp, the Whisper models, the Electron binary). Start by running `list` when you need ids or names. A new agent, step by step: ask which folder (a path they say, or `pick-folder` so they choose it in the dialog), then `new-agent --folder <that> --name <a short name> --purpose <what for>`; unless they name a provider it runs on yours, with your settings; say what you did in one line.',
  'How to behave. Be the concierge, not a lecturer: short answers, then act. Never restart the app while another agent is mid-turn (the sidebar and `ps` tell you). Never touch the user\'s other projects from here unless asked. When something is not installed or not signed in, say exactly what is missing and the one command that fixes it. If the other provider is not signed in (Codex when you run on Claude, Claude when you run on Codex), you can walk the user through it: they sign in with that provider\'s own command line, in Terminal (Claude: `claude auth login`, from Claude Code; Codex: `codex login`), then Refresh in the accounts panel (the Jauvex button below the sidebar). The app does not sign anyone in itself.',
].join('\n\n');
/** appRoot: the folder the app is installed in; the command line is named by its full path, since the agent's own folder is elsewhere. */
export const clientBriefing = (voice: boolean, vocabulary?: string, steward = false, appRoot?: string): string => [
  'About the client you are running in. You are working inside a desktop app in which the user runs several coding agents side by side, from more than one provider, and talks to them by voice or by text. You are one of those agents: this conversation is yours, and the others are separate sessions you cannot see.',
  'Messages that arrive while you work. The user can send you something while you are in the middle of a turn. It is added to your running turn as new information, not as a new task: read it at your next step, fold it into what you are doing, and carry on. Do not start over, do not drop what you have done, and do not answer it separately unless it is a question. If it contradicts your current plan, the newer message wins. Several short messages in a row are usually one thought.',
  'How your answer reaches the user. Your full answer is shown on their screen as plain markdown, with no math rendering: never write LaTeX (no \\[ \\], $$, \\begin{bmatrix}); write formulas and matrices as plain text or in a code block, laid out with spaces so they read at a glance. The same for diagrams: no Mermaid or other diagram languages, draw them in plain text in a code block. No raw HTML: markdown only. A local file is written as a path in backticks, not as a link (links to files do not open here); an image is shown with a markdown image and its path. When voice is on, a separate small model also says a short spoken version of it; you never speak yourself and you are not that voice. So put the conclusion or the result in your first sentences, in plain words, before any table, list or code, and say clearly at the end what you need from the user, if anything. A simple question deserves a one or two sentence answer: short plain answers are read aloud word for word.',
  'Stopping. The user can stop your turn at any moment, by button or by saying stop. If a turn was cut, pick up from the state of the files and the conversation, without assuming the last step finished.',
  'Restarting the app. When the user asks you to restart this desktop app (often together with other work: "publish and restart"), do the work first, then run `node scripts/jauvex.ts restart` as the very last thing: it relaunches the app with the build on disk, and your turn ends with it.',
  'Background work. Every turn of yours is its own process. A job started in the background (a shell command run in the background, a monitor, a subagent left running) dies when the turn ends, and the notice about it at the next turn swallows the next message sent to you. Never start background work from here: run a long job detached (nohup, output to a file) and read the file in a later turn.',
  AGENT_MESSAGING,
  ...(steward ? [STEWARD_BRIEFING] : []),
  ...(voice ? [dictationNote(vocabulary)] : []),
].join('\n\n').replaceAll('{APP}', appRoot ?? 'the app\'s install folder').replaceAll('node scripts/jauvex.ts', appRoot ? `node "${appRoot}/scripts/jauvex.ts"` : 'node scripts/jauvex.ts');
export type PermissionDecision = 'allow' | 'always' | 'deny';
export type ChatEvent =
  | { chatId: string; type: 'init'; sessionId: string; model?: string }
  | { chatId: string; type: 'delta'; text: string }
  | { chatId: string; type: 'message'; message: ChatMessage }
  | { chatId: string; type: 'permission'; requestId: string; toolName: string; input: unknown }
  | { chatId: string; type: 'status'; text: string }
  | { chatId: string; type: 'context'; usage: ContextUsage } // how full the context is, after every request the model answered
  | { chatId: string; type: 'compact'; phase: 'start' | 'done'; trigger?: 'manual' | 'auto'; ok?: boolean; error?: string; before?: number; after?: number } // the provider compacting the conversation, asked or on its own
  | { chatId: string; type: 'done'; ok: boolean; error?: string; sessionId?: string; durationMs?: number; costUsd?: number; tooLong?: boolean; unsent?: number }; // tooLong: the request did not fit the context window; unsent: the last n messages handed to the turn that the model never read (the turn was stopped, or ended, first)

// ---- voice (all local except the two Claude calls): whisper.cpp for speech in, macOS `say` for speech out
// The first-run screen's checks: what is on this Mac, without starting anything.
export type SetupCheck = { say: boolean; voice: 'natural' | 'basic' | 'unknown'; whisperBinary: boolean; models: string[]; jevKey: boolean }; // voice: basic = the System voice is the compact Samantha (a fresh Mac), which sounds robotic; natural = a Siri or other voice was chosen in Spoken Content
export type VoiceStatus = { jev: boolean; jevKey: boolean; whisper: 'missing-binary' | 'missing-model' | 'starting' | 'ready' | 'error'; detail: string; voices: string[]; models: string[]; model: string; voiceModels: { claude: { id: string; label: string; resolved?: string }[]; codex: { id: string; label: string }[] } }; // resolved: the wire id an alias stands for (sonnet -> claude-sonnet-5), so a saved wire id shows as its alias // voiceModels: what each provider offers the voice, from the live lists
// What to do with something said while the main thread is busy. queue: hand it over when the turn ends. stop: interrupt the turn.
// replace: interrupt the turn and send this instead. `say` is the voice's line about it.
// steer: hand it to the running turn now, without interrupting it (a correction or a fact the work needs to not go wrong).
// What is left of a provider's plan, as the battery next to the composer shows it. A window is one rolling limit ("5 h", "7 d").
// `model`: the window only counts against that model family ("opus", "fable"); without it, it counts against everything.
export type UsageWindow = { label: string; usedPercent: number; resetsAt: number | null; model?: string };
export type ProviderUsage = { provider: Provider; available: boolean; windows: UsageWindow[]; at: number; plan?: string; error?: string; notes?: string[] }; // notes: what else the plan says, in words (extra usage, credits)
// Who a provider is signed in as (the panel behind the sidebar's footer). Never a token, never a key.
export type AccountStatus = { provider: Provider; signedIn: boolean; who: string; plan: string; method: string; error?: string };
export type AccountEvent = { provider: Provider } & ({ type: 'line'; text: string } | { type: 'url'; url: string } | { type: 'done'; ok: boolean; error?: string });
export type BusyTriage = { action: 'queue' | 'steer' | 'stop' | 'replace'; say: string; by?: 'jev' }; // by: who decided (absent = the voice model)
// One line of the debug panel. by: who decided or produced it. ms: how long it took.
// detail: the full exchange behind the line (what was sent to Jev or a model, and what came back), shown in the debugger's Model tab.
export type DebugEvent = { detail?: string; at: number; kind: 'heard' | 'speech' | 'model' | 'thought' | 'ack' | 'busy' | 'stop' | 'queue' | 'summary' | 'jev' | 'note'; text: string; by?: 'jev' | 'voice model' | 'rule' | 'whisper' | 'app'; ms?: number };
// Something said that is for the app itself, not for the main thread ("create a new Codex agent in the homepage project").
// provider null = whatever the current chat uses; projectId null = the project that is open. `say` is the voice's confirmation.
export type AppCommand = { type: 'new-agent'; provider: Provider | 'jev' | null; projectId: string | null; name?: string; purpose?: string; kickoff?: string; detailsId?: string; say: string; by: 'jev' | 'rule' } // kickoff: the new agent's first message, written by the session's model for this order (kickoffMessage is the fallback); detailsId: the model is still reading the order, its details come later as a command:details event
  | { type: 'hold'; say: string; by: 'jev' | 'rule' } // "one second", "wait", "hold on" and nothing else: the voice says it will wait; nothing goes to the main thread
  | { type: 'restart-app'; say: string; by: 'rule' }
  | { type: 'reload-ui'; say: string; by: 'rule' } // "reload the interface": the window reloads the UI build, running turns stay
  | { type: 'goodbye'; say: string; by: 'jev' | 'rule'; after?: boolean }
  | { type: 'confirm'; say: string; pending: AppCommand; text: string; by: 'jev' | 'rule' }; // an order nobody was sure of (shared/orders.ts): say asks it; a clear yes carries out pending, anything else sends text to the agent // "bye", "good night", "talk later": the voice says goodbye and voice mode ends. after: there is a task in the same breath ("set an alarm, then bye"): it goes to the main thread first, the goodbye comes when that turn is over // "restart the app": the app relaunches itself (the build on disk is what comes back)
export type CommandDetails = { id: string; name?: string; purpose?: string; kickoff?: string }; // what the session's model read in an order, once it answered (nothing but the id when it did not)
/**
 * The first message of an agent opened by an order to the app ("make a new Codex agent about the billing page"). A session
 * does not exist until something is sent, and a blank agent should know why it was opened. Names no product.
 */
/** The Jauvex agent's first words, the first time it opens after the welcome: an app note it answers by introducing itself. */
export const JAUVEX_HELLO = '(from the app) This is the first time the user opens you, right after the welcome screen; voice is on and they can hear you. Introduce yourself in a few short spoken-friendly sentences, warm but not gushing: you are the Jauvex agent, glad they made it here; you can orchestrate the other agents in this app, be their personal agent, take care of the app itself (restart, update, install what is missing), and help them contribute to the Jauvex project since your folder is its source. Say that talking works best, that typing is just as welcome whenever they prefer it, and that voice can be switched off or back on at any time; then that they can just say what they need. No lists, no headings, under 100 words. Then stop and wait.';
export const kickoffMessage = (folder: string, folderPath: string, name?: string, purpose?: string): string => [
  `You are a new agent, just opened by the user from the app they run their agents in, in the folder "${folder}" (${folderPath}).`,
  name ? `They named you "${name}".` : '',
  purpose ? `They opened you for this: ${purpose}.` : 'They have not said yet what you are for.',
  'Other agents may be working in this folder or in others; you only see this conversation. Do not change any file yet.',
  purpose ? 'Look around the folder as far as you need to understand what this is about, then in a few lines say what you understood, what you propose to do first, and ask whatever you need to know. Then wait.' : 'In one or two lines, say you are ready and ask what they want you to do. Then wait.',
].filter(Boolean).join('\n');
export type Transcript = { text: string; ms: number; dropped?: string }; // dropped: words Whisper wrote that were judged not to be speech
export type VoiceMirror = { on: boolean; phase: string; level: number; micMuted: boolean; speakerOff: boolean };
export type VoiceCommand = 'mic' | 'speaker' | 'focus' | 'new' | 'end';
