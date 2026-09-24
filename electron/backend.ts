import { promises as fs } from 'node:fs';
import { shortTitle } from '../shared/roster.js';
import path from 'node:path';
import os from 'node:os';
import * as debug from './debug.js';
import { DATA_DIR, JAUVEX_HOME } from './paths.js';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { listSessions, getSessionMessages, getSessionInfo, renameSession, type SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { type JauvexEntry, JEV_TEMPLATE, providerOf, type SessionPrefs, type JevAgent, type JevAnswer, type JevRun, type AppState, type Block, type ChatMessage, type MessagesPage, type ModelOption, type Project, type Provider, type SessionInfo, type UiState } from '../shared/types.js';
import * as codex from './codex.js';
import type { ContextUsage } from '../shared/context.js';
import * as jev from './jev.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// CVC_ROOT is set by the Electron main process (its bundle lives in dist-electron/).
const ROOT = process.env.CVC_ROOT || path.resolve(here, '..');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const JAUVEX_LOG = path.join(path.dirname(STATE_FILE), 'jauvex-transcript.json');
/** The home of the app's own agent (Jauvex): ~/.jauvex, whatever happens to the folder the app is installed in. Its sessions are filed
 * by Claude Code under its working folder; with the install folder as its home, renaming that folder lost its session and left it
 * pointing at a folder that no longer existed. CVC_JAUVEX_HOME moves it (the checks). */
export { JAUVEX_HOME };
export const APP_ROOT = ROOT;
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
  if (!info) throw new HttpError(404, 'Session not found for this folder');
  const key = `${dir}::${sessionId}`; const hit = cache.get(key);
  if (hit && hit.stamp === info.lastModified) return hit.messages;
  const raw = await getSessionMessages(sessionId, { dir });
  const messages = raw.map(normalize).filter((x): x is ChatMessage => x !== null);
  cache.set(key, { stamp: info.lastModified, messages });
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return messages;
}

// ---------- the API the renderer calls over Electron IPC (see electron/main.ts + preload.ts)
const notesFile = (sessionId: string) => path.join(path.dirname(STATE_FILE), 'notes', `${sessionId.replace(/[^\w-]/g, '')}.json`);
let uiTurn: Promise<boolean> = Promise.resolve(true); let jxMaking: Promise<Project> | null = null;
export const backend = {
  state: () => loadState(),
  // One settings change at a time: each reads the whole state, merges its part and saves; two at once lost one (the Jauvex agent's cleared
  // session came back when another setting was saved in the same instant).
  setUi: (ui: UiState) => (uiTurn = uiTurn.then(async () => { const state = await loadState(); state.ui = { ...state.ui, ...ui }; await saveState(state); return true; }, async () => { const state = await loadState(); state.ui = { ...state.ui, ...ui }; await saveState(state); return true; })),
  /** A Claude session is filed under its working folder: false when it is not there (the folder moved). Codex resumes by id anywhere. */
  // What the app answered by itself in a session (an order for the app, and its reply): kept next to the session so it survives a restart,
  // each after the message it followed (data/notes/<session>.json). The provider never sees these lines.
  notes: async (sessionId: string): Promise<{ after: string; message: ChatMessage }[]> => { try { return JSON.parse(await fs.readFile(notesFile(sessionId), 'utf8')); } catch { return []; } },
  noteAppend: async (sessionId: string, entries: { after: string; message: ChatMessage }[]) => { const f = notesFile(sessionId); let all: { after: string; message: ChatMessage }[] = []; try { all = JSON.parse(await fs.readFile(f, 'utf8')); } catch { /* first */ } all.push(...entries); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, JSON.stringify(all.slice(-500))); return true; },
  sessionExists: async (id: string, sessionId: string): Promise<boolean> => { const { project } = await projectOr404(id); if (providerOf(project, sessionId) === 'codex') return true; return !!(await getSessionInfo(sessionId, { dir: project.path }).catch(() => undefined)); },
  /** The app's own folder as a project, for the Jauvex agent: created once, marked builtin, never listed with the others. */
  // The Jauvex agent's transcript, kept by the app (user and assistant text only): the one session that moves between providers.
  jauvexTranscript: async (): Promise<JauvexEntry[]> => { try { return JSON.parse(await fs.readFile(JAUVEX_LOG, 'utf8')) as JauvexEntry[]; } catch { return []; } },
  jauvexAppend: async (entry: JauvexEntry) => { let all: JauvexEntry[] = []; try { all = JSON.parse(await fs.readFile(JAUVEX_LOG, 'utf8')); } catch { /* first entry */ } all.push(entry); if (all.length > 4000) all.splice(0, all.length - 4000); await fs.writeFile(JAUVEX_LOG, JSON.stringify(all)); return true; },
  jauvexHandover: async (note: string, from: string, to: string) => { await fs.writeFile(path.join(path.dirname(STATE_FILE), 'jauvex-handover.md'), `# Handover note\n\nFrom ${from} to ${to}, ${new Date().toISOString()}.\n\n${note}\n`); return true; },
  /** Once at a time: two callers at start used to make two entries, and the repair then removed the one the window held. */
  jauvexProject: (): Promise<Project> => (jxMaking ??= (async () => { await ensureHome(JAUVEX_HOME, jauvexReadme()); const state = await loadState(); const have = state.projects.find((x) => x.builtin === 'jauvex'); if (have) return have;
    const p = await addProject(JAUVEX_HOME); const s2 = await loadState(); const q = s2.projects.find((x) => x.id === p.id)!; q.builtin = 'jauvex'; q.name = 'Jauvex'; await saveState(s2); return q; })().finally(() => { jxMaking = null; })),
  addProject: async (dir: string) => {
    const clean = String(dir ?? '').trim().replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
    if (!clean) throw new HttpError(400, 'path is required');
    return addProject(clean);
  },
  removeProject: async (id: string) => { const state = await loadState(); state.projects = state.projects.filter((p) => p.id !== id); if (state.ui?.sel?.projectId === id) state.ui.sel = null; await saveState(state); return true; },
  sessions: async (id: string): Promise<SessionInfo[]> => {
    const { project } = await projectOr404(id);
    // Both providers' sessions for this folder. Codex being absent or logged out must not hide Claude's.
    // A failing Claude listing no longer hides Codex's; none found is said in the debug panel with where the app looked, so a user can
    // tell a Claude Code folder moved elsewhere (CLAUDE_CONFIG_DIR, taken from the login shell at start) from a folder with no sessions.
    const [all, fromCodex] = await Promise.all([listSessions({ dir: project.path, limit: 500 }).catch((e: Error) => { debug.log('note', `Claude Code sessions of ${project.path} could not be listed: ${e.message}`, { by: 'app' }); return []; }), codex.listSessions(project.path).catch(() => [] as SessionInfo[])]);
    if (!all.length) { const cfg = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'); const sub = path.join(cfg, 'projects', project.path.replace(/[^a-zA-Z0-9]/g, '-')); const files = await fs.readdir(sub).then((f) => f.filter((x) => x.endsWith('.jsonl')).length, () => -1);
      debug.log('note', `no Claude Code sessions listed for ${project.path}: looked in ${sub} (${files < 0 ? 'no such folder' : `${files} session files there`}); Claude Code's folder is ${cfg}${process.env.CLAUDE_CONFIG_DIR ? ' (CLAUDE_CONFIG_DIR)' : ''}`, { by: 'app' }); }
    return [...fromCodex, ...all.map((s): SessionInfo => ({ provider: 'claude', sessionId: s.sessionId, summary: shortTitle(s.summary ?? ''), lastModified: s.lastModified, createdAt: s.createdAt, fileSize: s.fileSize, customTitle: s.customTitle, firstPrompt: s.firstPrompt, gitBranch: s.gitBranch, cwd: s.cwd }))].sort((a, b) => b.lastModified - a.lastModified);
  },
  setSessions: async (id: string, sessionIds: string[], providers: Record<string, Provider> = {}) => {
    const { state, project } = await projectOr404(id);
    if (!Array.isArray(sessionIds) || !sessionIds.every((x) => typeof x === 'string')) throw new HttpError(400, 'sessionIds: string[] required');
    project.sessions = [...new Set(sessionIds)];
    const known = { ...project.providers, ...providers }; // a session keeps the provider it was imported with
    const trainers = (project.jev ?? []).map((a) => a.sessionId).filter((x): x is string => Boolean(x)); // a Jev agent's trainer session is not in the list, but keeps its provider
    project.providers = Object.fromEntries([...project.sessions, ...trainers].filter((sid) => known[sid] === 'codex').map((sid) => [sid, 'codex' as const]));
    await saveState(state); return project;
  },
  messages: async (id: string, sessionId: string, before?: number, limit = 150): Promise<MessagesPage> => {
    const { project } = await projectOr404(id);
    const all = providerOf(project, sessionId) === 'codex' ? await codex.transcript(sessionId) : await transcript(project.path, sessionId);
    const end = before === undefined ? all.length : Math.max(0, Math.min(all.length, before));
    const start = Math.max(0, end - Math.min(500, Math.max(1, limit)));
    return { total: all.length, start, messages: all.slice(start, end) };
  },
  // The name is written where the provider keeps it (a custom-title entry in Claude's session file, the thread's name in Codex),
  // so it is the same name in Claude Code, in Codex, and here.
  rename: async (id: string, sessionId: string, title: string) => {
    const { project } = await projectOr404(id); const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'A session needs a name');
    if (providerOf(project, sessionId) === 'codex') await codex.rename(sessionId, name); else await renameSession(sessionId, name, { dir: project.path });
    return true;
  },
  setPrefs: async (id: string, sessionId: string, prefs: SessionPrefs) => {
    const { state, project } = await projectOr404(id);
    project.prefs = { ...project.prefs, [sessionId]: { model: String(prefs.model ?? ''), effort: String(prefs.effort ?? ''), permissions: prefs.permissions === 'auto' ? 'auto' : 'ask' } };
    await saveState(state); return true;
  },
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
  models: async (provider: Provider): Promise<ModelOption[]> => (provider === 'codex' ? codex.models() : []), // Claude's list is fixed in the UI
};
export type Backend = typeof backend;
