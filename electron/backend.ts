import { promises as fs } from 'node:fs';
import { shortTitle } from '../shared/roster.js';
import { inSlots } from '../shared/folder-order.js';
import path from 'node:path';
import os from 'node:os';
import * as debug from './debug.js';
import { APP_ROOT, DATA_DIR, JAUVEX_HOME } from './paths.js';
import { randomUUID } from 'node:crypto';
import { listSessions, getSessionMessages, getSessionInfo, renameSession, type SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { type BoardChat, type JauvexEntry, JEV_TEMPLATE, providerOf, type SessionPrefs, type JevAgent, type JevAnswer, type JevRun, type AppState, type Block, type ChatMessage, type MessagesPage, type ModelOption, type Project, type Provider, type SessionInfo, type UiState } from '../shared/types.js';
import * as codex from './codex.js';
import * as grok from './grok.js';
import type { ContextUsage } from '../shared/context.js';
import * as jev from './jev.js';
import { listBoards, readBoardFiles, setBoardStatus, newBoard, deleteBoard, listWorkflows, readWorkflow, saveWorkflow, saveWorkflowStep, removeWorkflowStep, deleteWorkflow, workflowVersions, restoreVersion, readVersion, newWorkflow, readRun, newRun, saveRun, saveRunStep, runStepReply, runFiles, workflowChat, setWorkflowChat, moveWorkflow as moveWorkflowFiles, boardTimes } from './workfiles.js';
import { moveClaudeSession } from './move.js';
import { DASHBOARD_FILE, dashboardDue, type DashboardDue } from '../shared/dashboard.js';

const ROOT = APP_ROOT; // the app's folder (paths.ts)
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const JAUVEX_LOG = path.join(path.dirname(STATE_FILE), 'jauvex-transcript.json');
/** The home of the app's own agent (Jauvex): ~/.jauvex, whatever happens to the folder the app is installed in. Its sessions are filed
 * by Claude Code under its working folder; with the install folder as its home, renaming that folder lost its session and left it
 * pointing at a folder that no longer existed. CVC_JAUVEX_HOME moves it (the checks). */
export { JAUVEX_HOME };
export { APP_ROOT };
async function ensureHome(dir: string, readme: string): Promise<void> { await fs.mkdir(dir, { recursive: true }); const f = path.join(dir, 'README.md'); await fs.access(f).catch(() => fs.writeFile(f, readme)); }
const jauvexReadme = () => `# The Jauvex agent\n\nThe home of the app's own agent: its notes go here, and it stays here whatever happens to the app's folder.\nThe app is installed at ${ROOT} (its source, README.md, AGENTS.md); its settings and this agent's transcript are in ${path.dirname(STATE_FILE)}.\n`;
/** A Jauvex agent left at an old home moves to JAUVEX_HOME; a second one (made by a moved install) goes. True when the state changed. */
function repairHome(state: AppState): boolean {
  const jx = state.projects.filter((p) => p.builtin === 'jauvex').sort((a, b) => b.sessions.length - a.sessions.length); let changed = false;
  if (jx.length > 1) { const drop = new Set(jx.slice(1).map((p) => p.id)); state.projects = state.projects.filter((p) => !drop.has(p.id)); changed = true; }
  if (jx[0] && jx[0].path !== JAUVEX_HOME) { jx[0].path = JAUVEX_HOME; changed = true; }
  return changed;
}
let homeMade = false;

// ---------- state (projects + the sessions picked for each), one small JSON file
// The state is read once and kept in memory: every change edits the same copy and every save writes all of them. Each change used to
// read the file, change it and write it back, and two at once lost one (the Jauvex agent's entry vanished on a first start, a cleared
// session came back).
let stateCache: Promise<AppState> | null = null; let frozen = false;
function loadState(): Promise<AppState> { return (stateCache ??= readState().catch((e) => { stateCache = null; throw e; })); }
/** After a reset the data is gone: nothing may write it back before the app exits. */
export function forgetState(): void { stateCache = null; frozen = true; }
async function readState(): Promise<AppState> {
  let state: AppState; try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as AppState; } catch { return { projects: [] }; }
  if (repairHome(state)) await saveState(state);
  if (!homeMade && state.projects.some((p) => p.builtin === 'jauvex')) { homeMade = true; await ensureHome(JAUVEX_HOME, jauvexReadme()).catch(() => {}); }
  return state;
}
let writing = Promise.resolve(); let seq = 0;
export function saveState(s: AppState): Promise<void> {
  if (frozen) return Promise.resolve(); stateCache = Promise.resolve(s);
  // One write at a time, each through its own temp file: two at once used to share a name, and the second rename found nothing.
  const body = JSON.stringify(s, null, 2);
  const run = writing.then(async () => { await fs.mkdir(path.dirname(STATE_FILE), { recursive: true }); const tmp = `${STATE_FILE}.${process.pid}.${++seq}.tmp`; await fs.writeFile(tmp, body); await fs.rename(tmp, STATE_FILE); });
  writing = run.catch(() => {}); return run;
}
async function addProject(dir: string): Promise<Project> {
  const abs = path.resolve(dir.replace(/\/+$/, ''));
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isDirectory()) throw new HttpError(400, `Not a folder: ${abs}`);
  const state = await loadState();
  const existing = state.projects.find((p) => p.path === abs);
  if (existing) return existing;
  const project: Project = { id: randomUUID(), path: abs, name: path.basename(abs) || abs, sessions: [] };
  state.projects.push(project); await saveState(state);
  return project;
}

/** A session's files where its provider looks for another folder's sessions (T-217, electron/move.ts). */
async function moveSessionFiles(provider: Provider, sessionId: string, from: string, to: string): Promise<void> {
  if (provider === 'codex') await codex.moveThread(sessionId, to); else if (provider === 'grok') await grok.moveSession(sessionId, from, to); else await moveClaudeSession(sessionId, from, to);
}
/** What the app keeps for a session, from its old folder to its new one: its place in the list (a workflow's or a board's chat has none),
 *  its provider, its settings, its context, and Codex's permissions from before YOLO. */
function carrySession(from: Project, to: Project, sessionId: string): void {
  if (from.sessions.includes(sessionId)) { from.sessions = from.sessions.filter((x) => x !== sessionId); if (!to.sessions.includes(sessionId)) to.sessions = [...to.sessions, sessionId]; }
  for (const k of ['providers', 'prefs', 'context', 'codexPermissionBaseline'] as const) {
    const m = from[k] as Record<string, unknown> | undefined; if (!m || !(sessionId in m)) continue;
    (to as Record<string, unknown>)[k] = { ...((to[k] as Record<string, unknown> | undefined) ?? {}), [sessionId]: m[sessionId] };
    const { [sessionId]: _gone, ...rest } = m; (from as Record<string, unknown>)[k] = rest;
  }
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function projectOr404(id: string): Promise<{ state: AppState; project: Project }> {
  const state = await loadState(); const project = state.projects.find((p) => p.id === id);
  if (!project) throw new HttpError(404, 'Unknown project'); return { state, project };
}
/** How full a session's context was after its last turn (shared/context.ts): kept with its folder, so the meter shows it when the chat opens. */
export async function saveContext(projectId: string, sessionId: string, usage: ContextUsage): Promise<void> {
  const state = await loadState(); const project = state.projects.find((p) => p.id === projectId); if (!project || !sessionId) return;
  const keep = Object.entries(project.context ?? {}).filter(([id]) => id !== sessionId).slice(-199); // the newest 200 sessions of a folder
  project.context = Object.fromEntries([...keep, [sessionId, usage]]); await saveState(state);
}

// ---------- transcript normalization: SDK SessionMessage -> blocks the UI can render
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : c && typeof c === 'object' && (c as { type?: string }).type === 'image' ? '[image]' : '')).join('\n');
  return content == null ? '' : JSON.stringify(content);
}
function toBlocks(content: unknown): Block[] {
  if (typeof content === 'string') return content.trim() ? [{ type: 'text', text: content }] : [];
  if (!Array.isArray(content)) return [];
  const out: Block[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case 'text': if (String(b.text ?? '').trim()) out.push({ type: 'text', text: String(b.text) }); break;
      case 'thinking': if (String(b.thinking ?? '').trim()) out.push({ type: 'thinking', text: String(b.thinking) }); break;
      case 'tool_use': out.push({ type: 'tool_use', id: String(b.id ?? ''), name: String(b.name ?? 'tool'), input: b.input }); break;
      case 'tool_result': out.push({ type: 'tool_result', toolUseId: String(b.tool_use_id ?? ''), text: textOf(b.content).slice(0, 20_000), isError: Boolean(b.is_error) }); break;
      case 'image': out.push({ type: 'image' }); break;
      default: out.push({ type: 'other', kind: String(b.type ?? 'unknown') });
    }
  }
  return out;
}
// Harness plumbing that lands in the transcript as "user" text: reminders, command wrappers, caveats.
const META = /^\s*(<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-caveat|task-notification|cross-session-message|user-prompt-submit-hook|ide_opened_file|ide_selection)\b|\[Request interrupted by user|Base directory for this skill:|This session is being continued from a previous conversation|Caveat: The messages below were generated by the user while running local commands)/;
// synthetic: a "user" message the harness wrote, not the person (a loaded skill's instructions, for one). Live messages carry the flag; stored ones are caught by META.
export function normalize(m: Pick<SessionMessage, 'type' | 'uuid' | 'message'> & { isSynthetic?: boolean }): ChatMessage | null {
  const msg = (m.message ?? {}) as { role?: string; content?: unknown };
  const blocks = toBlocks(msg.content);
  if (!blocks.length) return null;
  const role = m.type === 'assistant' ? 'assistant' : m.type === 'system' ? 'system' : 'user';
  const onlyToolResults = role === 'user' && blocks.every((b) => b.type === 'tool_result');
  const meta = role === 'system' || onlyToolResults || (role === 'user' && m.isSynthetic === true) || (role === 'user' && blocks.every((b) => b.type !== 'text' || META.test(b.text)));
  return { uuid: m.uuid, role, blocks, meta };
}

// Whole transcript cached per session + mtime, so paging from the end is cheap.
const cache = new Map<string, { stamp: number; messages: ChatMessage[] }>();
async function transcript(dir: string, sessionId: string): Promise<ChatMessage[]> {
  const info = await getSessionInfo(sessionId, { dir });
  // A session whose first message starts with a tag (a Jev trainer's chat: the app's context goes first) is one Claude Code leaves out of its
  // listing and of getSessionInfo, though its messages read as any other's (T-182: the trainer's history was lost at a reload): read them,
  // stamped by the file's own time; "not found" only when neither knows it. Claude Code files a session by the folder's real path: a folder
  // reached through a symlink is looked for under both (T-199: a board's chat was "not found" after a reload, its folder a symlink).
  const fileTime = (d: string) => fs.stat(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects', d.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`)).then((s) => s.mtimeMs, () => 0);
  const stamp = info?.lastModified || await fileTime(dir) || await fileTime(await fs.realpath(dir).catch(() => dir));
  if (!stamp) throw new HttpError(404, 'Session not found for this folder');
  const key = `${dir}::${sessionId}`; const hit = cache.get(key);
  if (hit && hit.stamp === stamp) return hit.messages;
  const raw = await getSessionMessages(sessionId, { dir }); if (!info && !raw.length) throw new HttpError(404, 'Session not found for this folder');
  const messages = raw.map(normalize).filter((x): x is ChatMessage => x !== null);
  cache.set(key, { stamp, messages });
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return messages;
}

// ---------- the API the renderer calls over Electron IPC (see electron/main.ts + preload.ts)
const notesFile = (sessionId: string) => path.join(path.dirname(STATE_FILE), 'notes', `${sessionId.replace(/[^\w-]/g, '')}.json`);
let uiTurn: Promise<boolean> = Promise.resolve(true); let jxMaking: Promise<Project> | null = null;
// The chats' own files (the Jauvex agent's transcript, a chat's notes) are saved one at a time per file, and whole (T-269, from the other
// edition's fix: an agent's transcript there kept one message). Every save read the file, added its message and wrote it back: saves that
// overlapped (a burst of replies, each with its tool calls) dropped each other's messages, and one that read the file while another was
// writing it found it half written, took it for a first message, and wrote that one alone over the whole conversation.
const saving = new Map<string, Promise<void>>();
const oneAtATime = <T>(f: string, op: () => Promise<T>): Promise<T> => { const run = (saving.get(f) ?? Promise.resolve()).then(op); const tail = run.then(() => {}, () => {}); saving.set(f, tail); void tail.then(() => { if (saving.get(f) === tail) saving.delete(f); }); return run; };
const writeWhole = async (f: string, text: string) => { await fs.mkdir(path.dirname(f), { recursive: true }); const tmp = `${f}.${process.pid}.tmp`; await fs.writeFile(tmp, text); await fs.rename(tmp, f); }; // a reader sees the old file or the new, never half of one
/** A list kept in a file: none yet is empty; one that cannot be read is put aside whole, never taken for empty and written over. */
const readList = async <T>(f: string): Promise<T[]> => { let text: string; try { text = await fs.readFile(f, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  try { const v: unknown = JSON.parse(text); if (Array.isArray(v)) return v as T[]; } catch { /* kept aside below */ }
  const aside = `${f.replace(/\.json$/, '')}.unreadable-${Date.now()}.json`; await fs.rename(f, aside); debug.log('note', `${path.basename(f)} could not be read: kept aside, whole, as ${path.basename(aside)}; a new one starts`); return []; };
const appendList = <T>(f: string, items: T[], keep: number) => oneAtATime(f, async () => { const all = await readList<T>(f); all.push(...items); await writeWhole(f, JSON.stringify(all.slice(-keep))); return true; });
// The dashboard kept current by the Jauvex agent (T-279): the window reads the file while it shows it; when it is due (shared/dashboard.ts) the
// window is told, and asks the agent. When the agent was last asked, in memory; one check at a time (two reads at once asked twice).
let dashAsked: number | null = null; let dashChecking = false;
let dashSink: (d: DashboardDue) => void = () => {};
export const onDashboardDue = (fn: typeof dashSink): void => { dashSink = fn; };
async function dashboardCheck(file: string): Promise<void> {
  if (dashChecking) return; dashChecking = true;
  try {
    const state = await loadState(); const fileAt = (await fs.stat(file).catch(() => null))?.mtimeMs ?? null;
    const times = (await Promise.all(state.projects.filter((p) => !p.builtin).map(async (p) => (await boardTimes(p.path).catch(() => [])).map((t) => ({ name: `${p.name}/${t.file}`, at: t.at }))))).flat();
    const now = Date.now(); const due = dashboardDue(now, { fileAt, boardsAt: Math.max(0, ...times.map((t) => t.at)), askedAt: dashAsked });
    if (!due.length) return; dashAsked = now;
    dashSink({ due, boards: [...new Set(times.filter((t) => fileAt == null || t.at > fileAt).map((t) => t.name))].slice(0, 6), hours: fileAt ? Math.round((now - fileAt) / 3_600_000) : 0 });
  } finally { dashChecking = false; }
}
export const backend = {
  state: () => loadState(),
  // One settings change at a time: each reads the whole state, merges its part and saves; two at once lost one (the Jauvex agent's cleared
  // session came back when another setting was saved in the same instant).
  setUi: (ui: UiState) => (uiTurn = uiTurn.then(async () => { const state = await loadState(); state.ui = { ...state.ui, ...ui }; await saveState(state); return true; }, async () => { const state = await loadState(); state.ui = { ...state.ui, ...ui }; await saveState(state); return true; })),
  /** A Claude session is filed under its working folder: false when it is not there (the folder moved). Codex resumes by id anywhere. */
  // What the app answered by itself in a session (an order for the app, and its reply): kept next to the session so it survives a restart,
  // each after the message it followed (data/notes/<session>.json). The provider never sees these lines.
  notes: async (sessionId: string): Promise<{ after: string; message: ChatMessage }[]> => { try { return JSON.parse(await fs.readFile(notesFile(sessionId), 'utf8')); } catch { return []; } },
  noteAppend: (sessionId: string, entries: { after: string; message: ChatMessage }[]) => appendList(notesFile(sessionId), entries, 500),
  sessionExists: async (id: string, sessionId: string): Promise<boolean> => { const { project } = await projectOr404(id); if (providerOf(project, sessionId) !== 'claude') return true; return !!(await getSessionInfo(sessionId, { dir: project.path }).catch(() => undefined)); },
  /** The app's own folder as a project, for the Jauvex agent: created once, marked builtin, never listed with the others. */
  // The Jauvex agent's transcript, kept by the app (user and assistant text only): the one session that moves between providers.
  jauvexTranscript: async (): Promise<JauvexEntry[]> => { try { return JSON.parse(await fs.readFile(JAUVEX_LOG, 'utf8')) as JauvexEntry[]; } catch { return []; } },
  jauvexAppend: (entry: JauvexEntry) => appendList(JAUVEX_LOG, [entry], 4000),
  jauvexHandover: async (note: string, from: string, to: string) => { await fs.writeFile(path.join(path.dirname(STATE_FILE), 'jauvex-handover.md'), `# Handover note\n\nFrom ${from} to ${to}, ${new Date().toISOString()}.\n\n${note}\n`); return true; },
  /** Once at a time: two callers at start used to make two entries, and the repair then removed the one the window held. */
  jauvexProject: (): Promise<Project> => (jxMaking ??= (async () => { await ensureHome(JAUVEX_HOME, jauvexReadme()); const state = await loadState(); const have = state.projects.find((x) => x.builtin === 'jauvex'); if (have) return have;
    const p = await addProject(JAUVEX_HOME); const s2 = await loadState(); const q = s2.projects.find((x) => x.id === p.id)!; q.builtin = 'jauvex'; q.name = 'Jauvex'; await saveState(s2); return q; })().finally(() => { jxMaking = null; })),
  addProject: async (dir: string) => {
    const clean = String(dir ?? '').trim().replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
    if (!clean) throw new HttpError(400, 'path is required');
    return addProject(clean);
  },
  /** The folders in a new order (T-255; the user, 2026-10-01: "I want to be able to rearrange the folders"): the ids given take the places they
   *  held in the list, in the order given; the app's own folder, which the panel does not show, stays where it is. */
  orderFolders: async (ids: string[]) => { if (!Array.isArray(ids)) throw new HttpError(400, 'ids'); const state = await loadState(); const byId = new Map(state.projects.map((p) => [p.id, p])); state.projects = inSlots(state.projects.map((p) => p.id), ids.map(String)).map((id) => byId.get(id)!); await saveState(state); return true; },
  removeProject: async (id: string) => { const state = await loadState(); state.projects = state.projects.filter((p) => p.id !== id); if (state.ui?.sel?.projectId === id) state.ui.sel = null; await saveState(state); return true; },
  sessions: async (id: string): Promise<SessionInfo[]> => {
    const { project } = await projectOr404(id);
    // Every provider's sessions for this folder. Codex or Grok being absent or logged out must not hide Claude's.
    // A failing Claude listing no longer hides Codex's; none found is said in the debug panel with where the app looked, so a user can
    // tell a Claude Code folder moved elsewhere (CLAUDE_CONFIG_DIR, taken from the login shell at start) from a folder with no sessions.
    const [all, fromCodex, fromGrok] = await Promise.all([listSessions({ dir: project.path, limit: 500 }).catch((e: Error) => { debug.log('note', `Claude Code sessions of ${project.path} could not be listed: ${e.message}`, { by: 'app' }); return []; }), codex.listSessions(project.path).catch(() => [] as SessionInfo[]), grok.listSessions(project.path).catch(() => [] as SessionInfo[])]);
    if (!all.length) { const cfg = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'); const sub = path.join(cfg, 'projects', project.path.replace(/[^a-zA-Z0-9]/g, '-')); const files = await fs.readdir(sub).then((f) => f.filter((x) => x.endsWith('.jsonl')).length, () => -1);
      debug.log('note', `no Claude Code sessions listed for ${project.path}: looked in ${sub} (${files < 0 ? 'no such folder' : `${files} session files there`}); Claude Code's folder is ${cfg}${process.env.CLAUDE_CONFIG_DIR ? ' (CLAUDE_CONFIG_DIR)' : ''}`, { by: 'app' }); }
    return [...fromCodex, ...fromGrok, ...all.map((s): SessionInfo => ({ provider: 'claude', sessionId: s.sessionId, summary: shortTitle(s.summary ?? ''), lastModified: s.lastModified, createdAt: s.createdAt, fileSize: s.fileSize, customTitle: s.customTitle, firstPrompt: s.firstPrompt, gitBranch: s.gitBranch, cwd: s.cwd }))].sort((a, b) => b.lastModified - a.lastModified);
  },
  setSessions: async (id: string, sessionIds: string[], providers: Record<string, Provider> = {}) => {
    const { state, project } = await projectOr404(id);
    if (!Array.isArray(sessionIds) || !sessionIds.every((x) => typeof x === 'string')) throw new HttpError(400, 'sessionIds: string[] required');
    project.sessions = [...new Set(sessionIds)];
    const known = { ...project.providers, ...providers }; // a session keeps the provider it was imported with
    const trainers = (project.jev ?? []).map((a) => a.sessionId).filter((x): x is string => Boolean(x)); // a Jev agent's trainer session is not in the list, but keeps its provider
    project.providers = Object.fromEntries([...project.sessions, ...trainers].flatMap((sid) => { const p = known[sid]; return p && p !== 'claude' ? [[sid, p] as const] : []; }));
    await saveState(state); return project;
  },
  messages: async (id: string, sessionId: string, before?: number, limit = 150): Promise<MessagesPage> => {
    const { project } = await projectOr404(id);
    const provider = providerOf(project, sessionId);
    const all = provider === 'codex' ? await codex.transcript(sessionId) : provider === 'grok' ? await grok.transcript(sessionId, project.path) : await transcript(project.path, sessionId);
    const end = before === undefined ? all.length : Math.max(0, Math.min(all.length, before));
    const start = Math.max(0, end - Math.min(500, Math.max(1, limit)));
    return { total: all.length, start, messages: all.slice(start, end) };
  },
  /** The Jauvex agent's chat, which the app keeps its own copy of, past the start of that copy (T-272, from the other edition's fix; the user,
   *  2026-10-01: "There's not even a load earlier messages"): the agent's own session's messages before the first of `uuids` it has (the
   *  copy's earliest, or the first shown), at most `limit`, and how many come before those. None when it has none of them: the copy is not
   *  this session's (an earlier provider's), and nothing is guessed. */
  /** The Jauvex agent's dashboard file, kept by the agent in its own folder (T-276): '' when it has none yet, or one too big to be a dashboard.
   *  Read for the view, it also checks whether the agent should bring it up to date (T-279). */
  dashboard: async (): Promise<string> => { const f = path.join(JAUVEX_HOME, DASHBOARD_FILE); void dashboardCheck(f).catch(() => {}); /* due for an update? (T-279) */ try { if ((await fs.stat(f)).size > 256_000) return ''; return await fs.readFile(f, 'utf8'); } catch { return ''; } },
  sessionBefore: async (id: string, sessionId: string, uuids: string[], limit = 150): Promise<{ messages: ChatMessage[]; left: number }> => {
    const { project } = await projectOr404(id); const provider = providerOf(project, sessionId);
    const all = provider === 'codex' ? await codex.transcript(sessionId) : provider === 'grok' ? await grok.transcript(sessionId, project.path) : await transcript(project.path, sessionId);
    const want = new Set((Array.isArray(uuids) ? uuids : []).filter((u): u is string => typeof u === 'string').slice(0, 400)); const i = all.findIndex((m) => want.has(m.uuid));
    if (i <= 0) return { messages: [], left: 0 }; const start = Math.max(0, i - Math.min(500, Math.max(1, Number(limit) || 150)));
    return { messages: all.slice(start, i), left: start };
  },
  // The name is written where the provider keeps it (a custom-title entry in Claude's session file, the thread's name in Codex, the
  // session's title in Grok), so it is the same name in Claude Code, in Codex, in Grok, and here.
  rename: async (id: string, sessionId: string, title: string) => {
    const { project } = await projectOr404(id); const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'A session needs a name');
    const provider = providerOf(project, sessionId);
    if (provider === 'codex') await codex.rename(sessionId, name); else if (provider === 'grok') await grok.rename(sessionId, name, project.path); else await renameSession(sessionId, name, { dir: project.path });
    return true;
  },
  setPrefs: async (id: string, sessionId: string, prefs: SessionPrefs) => {
    const { state, project } = await projectOr404(id);
    project.prefs = { ...project.prefs, [sessionId]: { model: String(prefs.model ?? ''), effort: String(prefs.effort ?? ''), permissions: prefs.permissions === 'yolo' ? 'yolo' : prefs.permissions === 'auto' ? 'auto' : 'ask' } };
    await saveState(state); return true;
  },
  /** The app's own changelog (T-218): what the version it runs brings, told after an update. */
  changelog: async (): Promise<string> => fs.readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8').catch(() => ''),
  // ---- workflows: a file per workflow and a folder beside it, its steps' instructions, runs and versions (electron/workfiles.ts)
  workflows: async (id: string) => listWorkflows((await projectOr404(id)).project.path),
  workflow: async (id: string, file: string) => readWorkflow((await projectOr404(id)).project.path, file),
  saveWorkflow: async (id: string, file: string, md: string) => { await saveWorkflow((await projectOr404(id)).project.path, file, md); return true; },
  saveWorkflowStep: async (id: string, file: string, step: string, text: string) => { await saveWorkflowStep((await projectOr404(id)).project.path, file, step, text); return true; },
  removeWorkflowStep: async (id: string, file: string, step: string) => { await removeWorkflowStep((await projectOr404(id)).project.path, file, step); return true; },
  workflowVersions: async (id: string, file: string) => workflowVersions((await projectOr404(id)).project.path, file),
  restoreWorkflowVersion: async (id: string, file: string, v: number) => restoreVersion((await projectOr404(id)).project.path, file, v),
  workflowVersion: async (id: string, file: string, v: number) => readVersion((await projectOr404(id)).project.path, file, v),
  newWorkflow: async (id: string, name: string, agent?: string) => newWorkflow((await projectOr404(id)).project.path, name, agent, (await loadState()).ui?.workflowTries), // written with the app's tries
  workflowChat: async (id: string, file: string) => workflowChat((await projectOr404(id)).project.path, file),
  setWorkflowChat: async (id: string, file: string, c: { provider?: string; sessionId?: string | null }) => { await setWorkflowChat((await projectOr404(id)).project.path, file, c); return true; },
  run: async (id: string, file: string) => readRun((await projectOr404(id)).project.path, file),
  newRun: async (id: string, file: string) => newRun((await projectOr404(id)).project.path, file),
  saveRun: async (id: string, file: string, md: string) => { await saveRun((await projectOr404(id)).project.path, file, md); return true; },
  deleteWorkflow: async (id: string, file: string) => deleteWorkflow((await projectOr404(id)).project.path, file),
  /** A workflow moved to another folder (T-217; the user, 2026-09-29: its files moved "but the sessions of the agents were not"): its file,
   *  its folder beside it, and its chat's session, so the chat opens there with its conversation. The session's move failing puts the files
   *  back: nothing is left half moved. Its steps' agents stay where they are (they are found by name, wherever they live). */
  moveWorkflow: async (fromId: string, file: string, toId: string) => {
    const { state, project: from } = await projectOr404(fromId); const to = state.projects.find((p) => p.id === toId);
    if (!to) throw new HttpError(404, 'Unknown folder'); if (from.id === to.id) throw new HttpError(400, 'it is in that folder already');
    const chat = await workflowChat(from.path, file); await moveWorkflowFiles(from.path, file, to.path);
    if (chat.sessionId) {
      const provider = (['claude', 'codex', 'grok'] as const).find((p) => p === chat.provider) ?? providerOf(from, chat.sessionId);
      try { await moveSessionFiles(provider, chat.sessionId, from.path, to.path); } catch (e) {
        await moveWorkflowFiles(to.path, file, from.path).catch(() => { /* left where it went: the error says so */ });
        throw new HttpError(409, `${file} stayed in ${from.name}: its chat's session could not move (${(e as Error).message})`); }
      carrySession(from, to, chat.sessionId); await saveState(state);
    }
    return { file, chat: chat.sessionId ? { provider: chat.provider ?? providerOf(to, chat.sessionId), sessionId: chat.sessionId } : null };
  },
  /** A session moved to another folder (T-217): its provider's files where that provider looks for the new folder's sessions, then what
   *  the app keeps for it (its place in the folder's list, its provider, settings and context). It works in the new folder from its
   *  next turn. The window refuses it while a turn runs in it. */
  moveSession: async (fromId: string, sessionId: string, toId: string) => {
    const { state, project: from } = await projectOr404(fromId); const to = state.projects.find((p) => p.id === toId);
    if (!to) throw new HttpError(404, 'Unknown folder'); if (from.builtin || to.builtin) throw new HttpError(400, "the app's own agent stays in its own folder");
    if (from.id === to.id) return { provider: providerOf(from, sessionId) };
    const provider = providerOf(from, sessionId); await moveSessionFiles(provider, sessionId, from.path, to.path); carrySession(from, to, sessionId); await saveState(state);
    return { provider };
  },
  // ---- boards: markdown to-do lists in the project folder (electron/workfiles.ts, T-171)
  boards: async (id: string) => listBoards((await projectOr404(id)).project.path),
  board: async (id: string, file: string) => readBoardFiles((await projectOr404(id)).project.path, file),
  boardSet: async (id: string, file: string, line: number, status: 'todo' | 'doing' | 'done', where: 'board' | 'done' = 'board', task = '') => setBoardStatus((await projectOr404(id)).project.path, file, line, status, where, task),
  newBoard: async (id: string, name: string) => newBoard((await projectOr404(id)).project.path, name),
  deleteBoard: async (id: string, file: string) => deleteBoard((await projectOr404(id)).project.path, file),
  // a board's own chat (T-199): its session, kept for the board's file in the app's state (a board's folder is often a repository: no file of ours in it)
  boardChat: async (id: string, file: string): Promise<BoardChat> => (await projectOr404(id)).project.boardChats?.[file] ?? {},
  setBoardChat: async (id: string, file: string, c: BoardChat) => { const { state, project } = await projectOr404(id); if (!/^(?:[\w .-]+\.md|boards\/[^/\\]+\.md)$/.test(file) || file.includes('..')) throw new Error('not a board file');
    project.boardChats = { ...(project.boardChats ?? {}), [file]: { ...(c.provider ? { provider: c.provider } : {}), sessionId: c.sessionId ?? null } }; await saveState(state); return true; },
  // ---- Jev agents: a state and typed questions, evaluated; kept here because Jev keeps nothing
  jevAvailable: () => jev.hasKey(),
  jevCreate: async (id: string): Promise<JevAgent> => {
    const { state, project } = await projectOr404(id); const n = (project.jev?.length ?? 0) + 1;
    const agent: JevAgent = { id: randomUUID(), name: `Jev agent ${n}`, state: JEV_TEMPLATE.state, questions: JEV_TEMPLATE.questions, runs: [], updatedAt: Date.now() };
    project.jev = [agent, ...(project.jev ?? [])]; await saveState(state); return agent;
  },
  jevSave: async (id: string, agentId: string, patch: Partial<Pick<JevAgent, 'name' | 'state' | 'questions' | 'llm' | 'sessionId'>>): Promise<JevAgent> => {
    const { state, project } = await projectOr404(id); const agent = project.jev?.find((a) => a.id === agentId); if (!agent) throw new HttpError(404, 'Unknown Jev agent');
    if (typeof patch.name === 'string' && patch.name.trim()) agent.name = patch.name.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (typeof patch.state === 'string') agent.state = patch.state; if (typeof patch.questions === 'string') agent.questions = patch.questions;
    if ('llm' in patch) { if (patch.llm !== agent.llm) agent.sessionId = null; agent.llm = patch.llm ?? null; } // another trainer starts its own session
    if ('sessionId' in patch) agent.sessionId = patch.sessionId ?? null;
    agent.updatedAt = Date.now(); await saveState(state); return agent;
  },
  jevDelete: async (id: string, agentId: string) => { const { state, project } = await projectOr404(id); project.jev = (project.jev ?? []).filter((a) => a.id !== agentId); await saveState(state); return true; },
  jevEvaluate: async (id: string, agentId: string, stateText: string, questionsText: string): Promise<JevRun> => {
    let questions: unknown; try { questions = JSON.parse(questionsText); } catch (e) { throw new HttpError(400, `The questions are not valid JSON: ${(e as Error).message}`); }
    if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length) throw new HttpError(400, 'The questions must be a JSON object: { "name": { "type": ..., "instructions": ..., "criteria": ... } }');
    let input: unknown = stateText; const t = stateText.trim(); if (t.startsWith('{') || t.startsWith('[')) { try { input = JSON.parse(t); } catch { /* not JSON after all: send it as text */ } }
    const r = await jev.evaluate(input, questions);
    const run: JevRun = { at: Date.now(), ms: r.ms, state: stateText, questions: questionsText, ok: r.ok, model: r.model, answers: r.answers as Record<string, JevAnswer> | undefined, usage: r.usage, error: r.error };
    const { state, project } = await projectOr404(id); const agent = project.jev?.find((a) => a.id === agentId);
    if (agent) { agent.state = stateText; agent.questions = questionsText; agent.runs = [run, ...agent.runs].slice(0, 20); agent.updatedAt = run.at; await saveState(state); }
    return run;
  },
  models: async (provider: Provider): Promise<ModelOption[]> => (provider === 'codex' ? codex.models() : provider === 'grok' ? grok.models() : []), // Claude's list is fixed in the UI
  saveRunStep: async (id: string, file: string, n: number, text: string) => { await saveRunStep((await projectOr404(id)).project.path, file, n, text); return true; },
  runStepReply: async (id: string, file: string, n: number) => runStepReply((await projectOr404(id)).project.path, file, n),
  runFiles: async (id: string, file: string) => runFiles((await projectOr404(id)).project.path, file),
};
export type Backend = typeof backend;
