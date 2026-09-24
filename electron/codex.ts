import { APP_ROOT } from './backend.js';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { shortTitle } from '../shared/roster.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { clientBriefing, type Attachment, type Block, type ChatEvent, type ChatMessage, type ChatStart, type ModelOption, type PermissionDecision, type SessionInfo } from '../shared/types.js';
import { projectOr404, saveContext, saveState } from './backend.js';
import { codexUsage, tooLong, type ContextUsage } from '../shared/context.js';

/**
 * Codex sessions, through `codex app-server`: the JSON-RPC interface (one JSON object per line over stdio) that
 * Codex's own clients use. Same login, config and session store as the Codex CLI, so nothing in ~/.codex is parsed
 * by hand. One server process is started on first use and shared by every Codex chat in the app.
 * The protocol types for the installed version come from `codex app-server generate-ts`.
 */
const ROOT = process.env.CVC_ROOT ?? process.cwd();

type Rpc = { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };
type Server = { child: ChildProcess; ready: Promise<void>; nextId: number; waiting: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> };
let server: Server | null = null;

// The npm package ships the native binary per platform, plus the tools it expects on its PATH (rg).
function findCodex(): { bin: string; pathDir: string | null } {
  if (process.env.CVC_CODEX_BIN) return { bin: process.env.CVC_CODEX_BIN, pathDir: null }; // the stand-in (tests/mock/codex): checks with no account
  const triple = `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl'}`;
  const vendor = path.join(ROOT, 'node_modules', '@openai', `codex-${process.platform}-${process.arch}`, 'vendor', triple);
  const bin = path.join(vendor, 'bin', 'codex');
  return existsSync(bin) ? { bin, pathDir: path.join(vendor, 'codex-path') } : { bin: 'codex', pathDir: null }; // else: whatever `codex` the shell PATH has
}

function boot(): Server {
  const { bin, pathDir } = findCodex();
  const child = spawn(bin, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(pathDir ? { PATH: `${pathDir}:${process.env.PATH ?? ''}` } : {}) } });
  const s: Server = { child, nextId: 1, waiting: new Map(), ready: Promise.resolve() };
  let stderr = ''; child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-600); });
  const down = (why: string) => {
    if (server === s) { server = null; loaded.clear(); voiceThread = null; }
    for (const w of s.waiting.values()) w.reject(new Error(why)); s.waiting.clear();
    for (const t of turns.values()) if (t.server === s) t.fail(why);
  };
  child.on('error', (e) => down(`Codex could not start: ${e.message}`));
  child.on('exit', (code) => down(`Codex stopped (${code ?? 'signal'}). ${stderr.split('\n').slice(-2).join(' ')}`.trim()));
  readline.createInterface({ input: child.stdout! }).on('line', (line) => {
    let m: Rpc; try { m = JSON.parse(line) as Rpc; } catch { return; }
    if (m.method === undefined) { // a response to one of our calls
      const w = typeof m.id === 'number' ? s.waiting.get(m.id) : undefined; if (!w) return; s.waiting.delete(m.id as number);
      if (m.error) w.reject(new Error(m.error.message ?? 'Codex error')); else w.resolve(m.result);
    } else if (m.id !== undefined) onServerRequest(s, m.id, m.method, (m.params ?? {}) as Record<string, unknown>);
    else onNotification(m.method, (m.params ?? {}) as Record<string, unknown>);
  });
  s.ready = rawCall(s, 'initialize', { clientInfo: { name: 'jauvex', title: 'Jauvex', version: '1.0.0' }, capabilities: null }).then(() => { write(s, { method: 'initialized' }); });
  s.ready.catch(() => { /* surfaced by the call that awaits it */ });
  return s;
}
function write(s: Server, msg: Rpc): void { s.child.stdin?.write(`${JSON.stringify(msg)}\n`); }
function rawCall<T>(s: Server, method: string, params: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => { const id = s.nextId++; s.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject }); write(s, { method, id, params }); });
}
async function call<T>(method: string, params: unknown): Promise<T> {
  const s = (server ??= boot()); await s.ready; return rawCall<T>(s, method, params);
}
// ---------- the signed-in account
type Account = { type: 'apiKey' } | { type: 'chatgpt'; email: string | null; planType: string } | { type: string; email?: string | null; planType?: string };
export function account(): Promise<{ account: Account | null; requiresOpenaiAuth: boolean }> { return call('account/read', {}); }
export function logout(): Promise<unknown> { return call('account/logout', {}); }
export function loginStart(): Promise<{ loginId: string; authUrl: string }> { return call('account/login/start', { type: 'chatgpt' }); }
export function loginCancel(loginId: string): Promise<unknown> { return call('account/login/cancel', { loginId }); }
let loginDone: ((ok: boolean, error: string | null) => void) | null = null;
export function onLoginCompleted(fn: (ok: boolean, error: string | null) => void): void { loginDone = fn; }
/** The signed-in account's usage windows (percent used, window length, reset time). */
type RateWindow = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type RateSnapshot = { primary: RateWindow | null; secondary: RateWindow | null; planType?: string | null; limitId?: string | null; limitName?: string | null; normalModelSlug?: string | null; credits?: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null }; // limitName: a model's own extra limit is named after the model
export function rateLimits(): Promise<{ rateLimits: RateSnapshot; rateLimitsByLimitId?: Record<string, RateSnapshot | undefined> | null }> { return call('account/rateLimits/read', {}); }
export function shutdown(): void { const s = server; server = null; s?.child.kill('SIGTERM'); }

// ---------- protocol shapes (the subset this app reads; see `codex app-server generate-ts`)
type Input = { type: string; text?: string };
type Item = { type: string; id: string; text?: string; content?: Input[] | string[]; summary?: string[]; command?: string; cwd?: string; aggregatedOutput?: string | null; exitCode?: number | null; status?: string;
  changes?: { path: string; kind: { type: string }; diff: string }[]; server?: string; tool?: string; arguments?: unknown; result?: { content: unknown[] } | null; error?: { message: string } | null; query?: string };
type Thread = { id: string; preview: string; name: string | null; createdAt: number; updatedAt: number; cwd: string; gitInfo: { branch: string | null; originUrl?: string | null } | null };
/** A git remote in one form, so the same repository is recognised whatever the transport: github.com/acme/website. */
export function normalizeOrigin(url: string | null | undefined): string {
  if (!url) return ''; let u = url.trim().toLowerCase().replace(/\.git\/?$/, '').replace(/\/+$/, '');
  u = u.replace(/^ssh:\/\/[^@/]+@/, '').replace(/^[a-z][a-z0-9+.-]*:\/\/([^@/]+@)?/, '').replace(/^[^@:/]+@([^:/]+):/, '$1/'); return u;
}
/** Does a thread belong to a folder? It ran in the folder itself, or in a Codex worktree of it (~/.codex/worktrees/<id>/<basename>), which is
 * recognised by the basename and the git origin: nothing in ~/.codex is read for it. A folder without an origin keeps only the threads that ran in it. */
export function threadBelongs(t: { cwd: string; gitInfo?: { originUrl?: string | null } | null }, dir: string, origin: string): boolean {
  if (t.cwd === dir) return true;
  const base = path.basename(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const inWorktree = new RegExp(`[\\\\/]\\.codex[\\\\/]worktrees[\\\\/][^\\\\/]+[\\\\/]${base}$`).test(t.cwd);
  return inWorktree && !!origin && normalizeOrigin(t.gitInfo?.originUrl) === origin;
}
const gitOrigin = (dir: string): Promise<string> => new Promise((resolve) => execFile('git', ['-C', dir, 'remote', 'get-url', 'origin'], (e, out) => resolve(e ? '' : normalizeOrigin(out))));
type Turn = { id: string; status: 'completed' | 'interrupted' | 'failed' | 'inProgress'; error: { message: string } | null; durationMs: number | null };

// ---------- sessions and transcripts
export async function listSessions(dir: string): Promise<SessionInfo[]> {
  // Codex's default listing scans the rollout files and leaves out the threads an agent created (the desktop app's own agents: threadSource
  // agent_created_thread) although the desktop lists them; its state database has them all (useStateDbOnly; older servers ignore the flag and
  // list as before). A thread that ran in a Codex worktree of the folder belongs to it too. So: every thread from the database, kept when it belongs here.
  const origin = await gitOrigin(dir); const out: SessionInfo[] = []; let cursor: string | null = null; let seen = 0;
  do {
    const page: { data: Thread[]; nextCursor: string | null } = await call('thread/list', { limit: 100, sortKey: 'updated_at', useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
    for (const t of page.data) { seen++; if (!threadBelongs(t, dir, origin)) continue; out.push({ provider: 'codex', sessionId: t.id, summary: t.name || shortTitle(t.preview ?? '') || 'Codex session', customTitle: t.name || undefined, lastModified: t.updatedAt * 1000, createdAt: t.createdAt * 1000, firstPrompt: t.preview || undefined, gitBranch: t.gitInfo?.branch ?? undefined, cwd: t.cwd }); }
    cursor = page.nextCursor;
  } while (cursor && seen < 3000);
  return out;
}

/** One Codex item -> one message the UI can render. A tool call carries its own result, so nothing is left dangling. */
export function normalizeItem(turnId: string, item: Item): ChatMessage | null {
  const uuid = `${turnId}:${item.id}`; const tool = (name: string, input: unknown, text: string, isError: boolean): Block[] => [{ type: 'tool_use', id: uuid, name, input }, { type: 'tool_result', toolUseId: uuid, text: text.slice(0, 20_000), isError }];
  let role: ChatMessage['role'] = 'assistant'; let blocks: Block[] = [];
  switch (item.type) {
    case 'userMessage': role = 'user'; blocks = ((item.content ?? []) as Input[]).map((c): Block => (c.type === 'text' ? { type: 'text', text: c.text ?? '' } : c.type === 'image' || c.type === 'localImage' ? { type: 'image' } : { type: 'other', kind: c.type })).filter((b) => b.type !== 'text' || b.text.trim()); break;
    case 'agentMessage': case 'plan': if (item.text?.trim()) blocks = [{ type: 'text', text: item.text }]; break;
    case 'reasoning': { const text = [...(item.summary ?? []), ...((item.content ?? []) as string[])].join('\n\n').trim(); if (text) blocks = [{ type: 'thinking', text }]; break; }
    case 'commandExecution': blocks = tool('Shell', { command: item.command, cwd: item.cwd }, item.aggregatedOutput ?? '', item.status === 'failed' || item.status === 'declined' || (item.exitCode ?? 0) !== 0); break;
    case 'fileChange': blocks = tool('Edit files', { files: (item.changes ?? []).map((c) => `${c.kind.type} ${c.path}`) }, (item.changes ?? []).map((c) => c.diff).join('\n'), item.status === 'failed' || item.status === 'declined'); break;
    case 'mcpToolCall': blocks = tool(`${item.server}.${item.tool}`, item.arguments, item.error?.message ?? JSON.stringify(item.result?.content ?? '', null, 2), Boolean(item.error)); break;
    case 'webSearch': blocks = [{ type: 'tool_use', id: uuid, name: 'Web search', input: { query: item.query } }]; break;
    default: return null; // compaction markers, review mode, sub-agent bookkeeping
  }
  return blocks.length ? { uuid, role, blocks, meta: false } : null;
}

const cache = new Map<string, { stamp: number; messages: ChatMessage[] }>();
export async function transcript(threadId: string): Promise<ChatMessage[]> {
  const { thread } = await call<{ thread: Thread }>('thread/read', { threadId });
  const hit = cache.get(threadId); if (hit && hit.stamp === thread.updatedAt) return hit.messages;
  const messages: ChatMessage[] = []; let cursor: string | null = null; let pages = 0;
  do {
    const page: { data: { turnId: string; item: Item }[]; nextCursor: string | null } = await call('thread/items/list', { threadId, limit: 200, ...(cursor ? { cursor } : {}) });
    for (const e of page.data) { const m = normalizeItem(e.turnId, e.item); if (m) messages.push(m); }
    cursor = page.nextCursor;
  } while (cursor && ++pages < 100);
  cache.set(threadId, { stamp: thread.updatedAt, messages });
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return messages;
}

/** Codex keeps the name with the thread itself (`thread/name/set`), so the Codex CLI and app show it too. */
export async function rename(threadId: string, name: string): Promise<void> { await call('thread/name/set', { threadId, name }); cache.delete(threadId); }

let modelCache: (ModelOption & { description: string })[] | null = null;
export async function models(): Promise<ModelOption[]> {
  if (modelCache) return modelCache;
  const r = await call<{ data: { id: string; displayName: string; description: string; hidden: boolean; isDefault: boolean; supportedReasoningEfforts: { reasoningEffort: string }[] }[] }>('model/list', { limit: 100 });
  return (modelCache = r.data.filter((m) => !m.hidden).map((m) => ({ id: m.id, label: m.displayName || m.id, description: m.description ?? '', isDefault: m.isDefault, efforts: (m.supportedReasoningEfforts ?? []).map((e) => e.reasoningEffort).filter(Boolean) })));
}

// ---------- one turn, streamed to the UI with the same events the Claude path sends
type LiveTurn = { projectId?: string; server: Server; chatId: string; threadId: string; turnId: string | null; send: (e: ChatEvent) => void; pending: Map<string, (d: PermissionDecision) => void>; items: Map<string, Item>; error: string; fail: (why: string) => void; finish: (turn: Turn) => void;
  compact: boolean; ctx: ContextUsage | null; model?: string; compactAt: number; before?: number; tooLong: boolean }; // compact: a turn that only compacts (thread/compact/start); ctx: how full the context is (T-74)
/** Options of one turn: a compaction instead of a message, and what is known of the context so far. */
type TurnOpts = { compact?: boolean; ctx?: ContextUsage | null; model?: string };
const turns = new Map<string, LiveTurn>(); // by threadId: Codex runs one turn per thread at a time
const loaded = new Set<string>();          // threads this server process has already started or resumed

export async function startChat(req: ChatStart, send: (e: ChatEvent) => void): Promise<void> {
  const { chatId } = req;
  if ([...turns.values()].some((t) => t.chatId === chatId)) throw new Error('This chat is already running.');
  const { state, project } = await projectOr404(req.projectId);
  if (req.compact && !req.sessionId) { send({ chatId, type: 'done', ok: false, error: 'Nothing to compact yet: this session has no conversation.' }); return; }
  // Approval policy and sandbox are left to the user's Codex config, the way the Claude path keeps Claude Code's settings.
  let threadId = req.sessionId; let model = req.model;
  const s = (server ??= boot());
  const spoken = { developerInstructions: clientBriefing(!!req.voice, req.vocabulary, !!req.steward, APP_ROOT) }; // every session is told where it is running; dictated text is read for intent
  if (!threadId) { const r = await call<{ thread: Thread; model: string }>('thread/start', { cwd: project.path, ...(req.model ? { model: req.model } : {}), ...spoken }); threadId = r.thread.id; model = r.model; loaded.add(threadId); }
  else if (!loaded.has(threadId)) { const r = await call<{ model: string }>('thread/resume', { threadId, excludeTurns: true, ...spoken }); model ??= r.model; loaded.add(threadId); }
  if (turns.has(threadId)) throw new Error('This session is already running a turn.');
  if (!req.hidden && !project.sessions.includes(threadId)) project.sessions.unshift(threadId);
  if (project.providers?.[threadId] !== 'codex') { project.providers = { ...project.providers, [threadId]: 'codex' }; await saveState(state); }
  send({ chatId, type: 'init', sessionId: threadId, model });
  const opts: TurnOpts = { ctx: project.context?.[threadId] ?? null, ...(model ? { model } : {}) };
  if (req.compact) { await runTurn(s, threadId, chatId, '', undefined, {}, send, req.projectId, { ...opts, compact: true }); return; } // Codex compacts as a turn of its own
  await runTurn(s, threadId, chatId, req.text, req.images, { ...(req.model ? { model: req.model } : {}), ...(req.effort ? { effort: req.effort } : {}), approvalsReviewer: req.permissions === 'auto' ? 'auto_review' : 'user' }, send, req.projectId, opts);
}

/** Start one turn in a loaded thread and resolve when it is over; everything in between goes to `send`. */
/** The turn's input items: the text, then each image as a file Codex can read (app-server takes a path, not bytes). */
function inputItems(text: string, images?: Attachment[]): unknown[] {
  const items: unknown[] = text ? [{ type: 'text', text, text_elements: [] }] : [];
  if (images?.length) { const dir = path.join(process.env.CVC_DATA_DIR || path.join(os.tmpdir(), 'jauvex'), 'uploads'); mkdirSync(dir, { recursive: true });
    for (const i of images) { const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>)[i.mediaType] ?? 'png'; const file = path.join(dir, `${randomUUID()}.${ext}`); writeFileSync(file, Buffer.from(i.data, 'base64')); items.push({ type: 'localImage', path: file }); } }
  return items;
}
function runTurn(s: Server, id: string, chatId: string, text: string, images: Attachment[] | undefined, extra: Record<string, unknown>, send: (e: ChatEvent) => void, projectId?: string, opts: TurnOpts = {}): Promise<void> {
  return new Promise<void>((resolve) => {
    const end = (e: ChatEvent) => { for (const f of entry.pending.values()) f('deny'); if (entry.compactAt) compacted(entry, e.type === 'done' && e.ok); turns.delete(id); cache.delete(id);
      if (projectId && entry.ctx && entry.ctx.window > 0) void saveContext(projectId, id, entry.ctx).catch(() => { /* shown, just not kept */ }); send(e); resolve(); };
    const entry: LiveTurn = { projectId, server: s, chatId, threadId: id, turnId: null, send, pending: new Map(), items: new Map(), error: '', compact: !!opts.compact, ctx: opts.ctx ?? null, ...(opts.model ? { model: opts.model } : {}), compactAt: 0, tooLong: false,
      fail: (why) => end({ chatId, type: 'done', ok: false, sessionId: id, error: why, ...(tooLong(null, why) ? { tooLong: true } : {}) }),
      finish: (turn) => { const ok = turn.status !== 'failed'; const error = turn.error?.message || entry.error || 'The turn failed.'; end({ chatId, type: 'done', ok, sessionId: id, ...(turn.durationMs ? { durationMs: turn.durationMs } : {}), ...(ok ? {} : { error, ...(entry.tooLong || tooLong(null, error) ? { tooLong: true } : {}) }) }); } };
    turns.set(id, entry);
    (opts.compact ? call<{ turn?: Turn }>('thread/compact/start', { threadId: id }) : call<{ turn?: Turn }>('turn/start', { threadId: id, input: inputItems(text, images), ...extra })) // a compaction answers {} at once; its turn is announced by turn/started
      .then((r) => { if (r?.turn?.id) entry.turnId ??= r.turn.id; }, (e: Error) => { if (turns.get(id) === entry) entry.fail(e.message); });
  });
}
/** A compaction item ended (or its turn did): said once, with the tokens before and, when the server re-counted them, after. */
function compacted(t: LiveTurn, ok: boolean): void {
  const since = t.compactAt; t.compactAt = 0;
  t.send({ chatId: t.chatId, type: 'compact', phase: 'done', trigger: t.compact ? 'manual' : 'auto', ok, ...(t.before !== undefined ? { before: t.before } : {}), ...(t.ctx && t.ctx.at >= since ? { after: t.ctx.used } : {}) });
}

function onNotification(method: string, p: Record<string, unknown>): void {
  if (method === 'account/login/completed') { const fn = loginDone; loginDone = null; fn?.(Boolean(p.success), typeof p.error === 'string' ? p.error : null); return; }
  const t = typeof p.threadId === 'string' ? turns.get(p.threadId) : undefined; if (!t) return;
  const { chatId, send } = t;
  if (method === 'turn/started') t.turnId = (p.turn as Turn).id;
  else if (method === 'item/agentMessage/delta') send({ chatId, type: 'delta', text: String(p.delta ?? '') });
  else if (method === 'thread/tokenUsage/updated') { const u = codexUsage(p.tokenUsage as Parameters<typeof codexUsage>[0], Date.now()); if (u) { t.ctx = { ...u, ...(t.model ? { model: t.model } : {}) }; send({ chatId, type: 'context', usage: t.ctx }); } }
  else if (method === 'item/started' && (p.item as Item | undefined)?.type === 'contextCompaction') { t.compactAt = Date.now(); t.before = t.ctx?.used; send({ chatId, type: 'compact', phase: 'start', trigger: t.compact ? 'manual' : 'auto', ...(t.before !== undefined ? { before: t.before } : {}) }); }
  else if (method === 'item/completed' && (p.item as Item | undefined)?.type === 'contextCompaction') { if (t.compactAt) compacted(t, true); }
  else if (method === 'item/started') { const item = p.item as Item; t.items.set(item.id, item); if (item.type === 'commandExecution' || item.type === 'fileChange' || item.type === 'mcpToolCall' || item.type === 'webSearch') { const msg = normalizeItem(String(p.turnId), item); if (msg) send({ chatId, type: 'message', message: { ...msg, blocks: msg.blocks.filter((b) => b.type !== 'tool_result') } }); } } // the call shows at once (no result yet); the completed item replaces it, same uuid
  else if (method === 'item/completed') { const item = p.item as Item; if (item.type === 'userMessage') return; // the UI already shows what was typed
    const msg = normalizeItem(String(p.turnId), item); if (msg) send({ chatId, type: 'message', message: msg }); }
  else if (method === 'error') { if (!p.willRetry) t.error = (p.error as { message?: string } | undefined)?.message ?? ''; if (!p.willRetry && JSON.stringify(p.error ?? '').includes('contextWindowExceeded')) t.tooLong = true; } // Codex compacts and retries on its own first
  else if (method === 'turn/completed') t.finish(p.turn as Turn);
}

// Codex asks before it runs a command or writes files outside what its sandbox allows: same card as Claude's tools.
function onServerRequest(s: Server, id: number | string, method: string, p: Record<string, unknown>): void {
  const t = typeof p.threadId === 'string' ? turns.get(p.threadId) : undefined;
  const isCommand = method === 'item/commandExecution/requestApproval'; const isFiles = method === 'item/fileChange/requestApproval';
  if (!t || (!isCommand && !isFiles)) { write(s, { id, error: { code: -32601, message: `${method} is not supported by this client` } }); return; }
  const requestId = randomUUID(); const item = t.items.get(String(p.itemId));
  t.pending.set(requestId, (d) => { t.pending.delete(requestId); write(s, { id, result: { decision: d === 'allow' ? 'accept' : d === 'always' ? 'acceptForSession' : 'decline' } }); });
  const input = isCommand ? { command: p.command ?? item?.command, cwd: p.cwd ?? item?.cwd, ...(p.reason ? { reason: p.reason } : {}) }
    : { files: (item?.changes ?? []).map((c) => `${c.kind.type} ${c.path}`), ...(p.reason ? { reason: p.reason } : {}), ...(p.grantRoot ? { grantRoot: p.grantRoot } : {}) };
  t.send({ chatId: t.chatId, type: 'permission', requestId, toolName: isCommand ? 'Shell' : 'Edit files', input });
}

const byChat = (chatId: string): LiveTurn | undefined => [...turns.values()].find((t) => t.chatId === chatId);
export function isRunning(chatId: string): boolean { return [...turns.values()].some((t) => t.chatId === chatId); }
export function liveList(): { chatId: string; projectId: string; sessionId: string | null }[] { return [...turns.values()].filter((t) => t.projectId).map((t) => ({ chatId: t.chatId, projectId: t.projectId!, sessionId: t.threadId })); }
/** Codex takes input for the active turn directly (`turn/steer`). False when the turn is over or not started yet. */
export async function steerChat(chatId: string, text: string, images?: Attachment[]): Promise<boolean> {
  const t = byChat(chatId); if (!t?.turnId) return false;
  try { await call('turn/steer', { threadId: t.threadId, expectedTurnId: t.turnId, input: inputItems(text, images) }); return true; } catch { return false; }
}
export function answerPermission(chatId: string, requestId: string, decision: PermissionDecision): boolean {
  const finish = byChat(chatId)?.pending.get(requestId); if (!finish) return false; finish(decision); return true;
}
export async function stopChat(chatId: string): Promise<boolean> {
  const t = byChat(chatId); if (!t) return false;
  for (let i = 0; !t.turnId && i < 40; i++) await new Promise((r) => setTimeout(r, 50)); // turn/start has not answered yet
  if (!t.turnId) { t.fail('Stopped before the turn started.'); return true; }
  try { await call('turn/interrupt', { threadId: t.threadId, turnId: t.turnId }); } catch { /* the turn ended on its own */ }
  return true; // turn/completed (status: interrupted) closes the chat
}
export function stopAll(): void { for (const t of turns.values()) void stopChat(t.chatId); }

// ---------- the speaking voice of Codex sessions: a small Codex model, so a Codex session never talks through Claude
// One throwaway thread (ephemeral: nothing is written to the Codex session store), its own instructions, no tools
// allowed to act (read-only sandbox, never asks), low reasoning effort. Asks run one at a time, like the thread does.
let voiceThread: { id: string; model: string } | null = null;
let voiceQueue: Promise<unknown> = Promise.resolve();

/** The voice model: the one picked in settings if the account still has it, else the fast/affordable one, else Codex's default. */
export async function voiceModel(preferred: string): Promise<string> {
  await models(); const list = modelCache ?? [];
  return (list.find((m) => m.id === preferred) ?? list.find((m) => /fast|affordable|small|mini|nano|lightweight/i.test(m.description)) ?? list.filter((m) => !m.isDefault).at(-1) ?? list[0])?.id ?? ''; // a saved id that is gone: the fast one; none described as fast: the last, smallest one on the list
}
async function voiceThreadFor(model: string, instructions: string): Promise<string> {
  if (voiceThread && voiceThread.model === model && server) return voiceThread.id;
  const r = await call<{ thread: Thread }>('thread/start', { cwd: os.tmpdir(), ...(model ? { model } : {}), ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', baseInstructions: instructions });
  voiceThread = { id: r.thread.id, model }; return r.thread.id;
}
/** One throwaway turn on a fresh ephemeral thread (checks and probes): the assistant's text. `start` is merged into thread/start. */
export async function runOnce(text: string, start: Record<string, unknown> = {}, cwd = os.tmpdir()): Promise<string> {
  const s = (server ??= boot()); await s.ready;
  const r = await call<{ thread: Thread }>('thread/start', { cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', ...start });
  let out = ''; await runTurn(s, r.thread.id, `once:${randomUUID()}`, text, undefined, {}, (e) => { if (e.type === 'message' && e.message.role === 'assistant') out += e.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' '); });
  return out;
}
export function voiceAsk(instructions: string, message: string, preferred: string, timeoutMs: number): Promise<string> {
  const job = voiceQueue.then(async () => {
    const threadId = await voiceThreadFor(await voiceModel(preferred), instructions);
    const chatId = `voice:${randomUUID()}`; let text = '';
    const timer = setTimeout(() => void stopChat(chatId), timeoutMs); // too slow to be worth saying: cut the turn so the next one can start
    try {
      await runTurn(server!, threadId, chatId, message, undefined, { effort: 'low' }, (e) => {
        if (e.type === 'message') text = e.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ');
        else if (e.type === 'done' && !e.ok) voiceThread = null; // start over with a fresh thread next time
      });
    } finally { clearTimeout(timer); }
    return text.replace(/\s+/g, ' ').trim();
  }).catch(() => { voiceThread = null; return ''; });
  voiceQueue = job; return job;
}
/** The first turn of a thread pays for start-up (about 4 s against 1 to 2 s afterwards), so spend it before the user speaks. */
export function voiceWarm(instructions: string, preferred: string): void {
  if (voiceThread) return;
  void voiceAsk(instructions, 'WARMUP: reply with the single word ok.', preferred, 15_000);
}
