import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './paths.js';
import { APP_ROOT, projectOr404, saveContext, saveState } from './backend.js';
import { shortTitle } from '../shared/roster.js';
import { clientBriefing, type Attachment, type Block, type ChatEvent, type ChatMessage, type ChatStart, type ModelOption, type PermissionDecision, type SessionInfo } from '../shared/types.js';
import { tooLong, type ContextUsage } from '../shared/context.js';

/**
 * Grok sessions, through `grok agent stdio`: the Agent Client Protocol (ACP: JSON-RPC 2.0, one JSON object per line over stdio) that
 * Grok Build speaks to editors, plus its own `x.ai/*` extensions (its source is public: github.com/xai-org/grok-build). Same login,
 * config and session store as the Grok CLI (~/.grok): nothing there is read by hand. One agent process, started on first use and shared
 * by every Grok chat in the app; `--no-leader`: the app's own process, never the leader a Grok window on this Mac may share.
 * The shapes on the wire were seen with Grok 1.0.41 (2026-09-24).
 */
type Rpc = { jsonrpc?: string; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
type GrokModel = { modelId: string; name?: string; description?: string; _meta?: { totalContextTokens?: number; reasoningEfforts?: { id: string; default?: boolean }[] } };
type ModelState = { currentModelId?: string; availableModels?: GrokModel[] };
type Server = { child: ChildProcess; ready: Promise<void>; nextId: number; waiting: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>; models: ModelState | null };
let server: Server | null = null;

// The grok on the shell's PATH (taken from the login shell at start), else where Grok's installer puts it.
export const bin = (): string => findGrok();
/** Is Grok on this Mac at all? Without it nothing is started: listing a folder's sessions must not try, and fail, on every call. */
export const installed = (): boolean => findGrok() !== 'grok';
function findGrok(): string {
  if (process.env.CVC_GROK_BIN) return process.env.CVC_GROK_BIN; // a stand-in (tests/mock/grok): checks and containers with no account
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) if (dir && existsSync(path.join(dir, 'grok'))) return path.join(dir, 'grok');
  const own = path.join(os.homedir(), '.grok', 'bin', 'grok');
  return existsSync(own) ? own : 'grok';
}
const errorText = (e: { code?: number; message?: string; data?: unknown }): string => {
  const detail = typeof e.data === 'string' ? e.data : e.data && typeof e.data === 'object' ? String((e.data as { message?: string }).message ?? JSON.stringify(e.data)) : '';
  const text = [e.message, detail].filter(Boolean).join(': ') || 'Grok error';
  return e.code === -32000 || /auth(entication)? required|not (logged|signed) in|unauthori[sz]ed/i.test(text) ? `Grok is not signed in on this Mac: sign in with \`grok login\` in a terminal (or in the accounts panel), then send again. (${text})` : text;
};

function boot(): Server {
  const child = spawn(findGrok(), ['agent', '--no-leader', 'stdio'], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  const s: Server = { child, nextId: 1, waiting: new Map(), ready: Promise.resolve(), models: null };
  let stderr = ''; child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-600); });
  const down = (why: string) => {
    if (server === s) { server = null; loaded.clear(); voice = null; }
    for (const w of s.waiting.values()) w.reject(new Error(why)); s.waiting.clear();
    for (const t of turns.values()) if (t.server === s) t.fail(why);
  };
  child.on('error', (e) => down((e as NodeJS.ErrnoException).code === 'ENOENT' ? 'Grok is not installed on this Mac: the grok command was not found. Install Grok Build, sign in with `grok login`, then try again.' : `Grok could not start: ${e.message}`));
  child.on('exit', (code, signal) => down(`Grok stopped (${signal ?? code}). ${stderr.split('\n').filter((l) => l.trim() && !/new version of Grok/i.test(l)).slice(-2).join(' ')}`.trim()));
  child.stdin?.on('error', () => { /* the process is gone: 'exit' says so */ });
  readline.createInterface({ input: child.stdout! }).on('line', (line) => {
    let m: Rpc; try { m = JSON.parse(line) as Rpc; } catch { return; }
    if (m.method === undefined) { // a response to one of our calls
      const w = typeof m.id === 'number' ? s.waiting.get(m.id) : undefined; if (!w) return; s.waiting.delete(m.id as number);
      if (m.error) w.reject(new Error(errorText(m.error))); else w.resolve(m.result);
    } else if (m.id !== undefined) onAgentRequest(s, m.id, m.method, (m.params ?? {}) as Record<string, unknown>);
    else onNotification(s, m.method, (m.params ?? {}) as Record<string, unknown>);
  });
  // No file system or terminal of ours: Grok reads, writes and runs commands with its own tools, under its own permission rules.
  s.ready = rawCall<{ _meta?: { modelState?: ModelState } }>(s, 'initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'jauvex', title: 'Jauvex', version: '1.0.0' } })
    .then((r) => { s.models = r?._meta?.modelState ?? null; });
  s.ready.catch(() => { /* surfaced by the call that awaits it */ });
  return s;
}
function write(s: Server, msg: Rpc): void { s.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`); }
function rawCall<T>(s: Server, method: string, params: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => { const id = s.nextId++; s.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject }); write(s, { id, method, params }); });
}
async function call<T>(method: string, params: unknown): Promise<T> { const s = (server ??= boot()); await s.ready; return rawCall<T>(s, method, params); }
/** Grok's own methods (`_x.ai/...` on the wire): some answer `{ result: ... }`, some the value itself. */
async function ext<T>(method: string, params: unknown): Promise<T> {
  const r = await call<unknown>(`_x.ai/${method}`, params);
  return (r && typeof r === 'object' && 'result' in r && Object.keys(r).length === 1 ? (r as { result: unknown }).result : r) as T;
}

// ---------- the signed-in account (who, never a token)
export type GrokAccount = { methodId?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null; teamName?: string | null };
export function account(): Promise<GrokAccount> { return ext('auth/info', {}); }
export function logout(): Promise<unknown> { return ext('auth/logout', {}); }
/** The plan's credits, as Grok's own usage view reads them (`x.ai/billing`): the share of the period's included credits used, the period,
 *  on-demand spending and bought credits (amounts in cents), and the plan's name. */
export type GrokBilling = { config?: { creditUsagePercent?: number; currentPeriod?: { type?: string; start?: string; end?: string }; monthlyLimit?: { val?: number }; used?: { val?: number };
  onDemandCap?: { val?: number }; onDemandUsed?: { val?: number }; prepaidBalance?: { val?: number }; billingPeriodStart?: string; billingPeriodEnd?: string } | null; subscription_tier?: string | null };
export function billing(): Promise<GrokBilling> { return ext('billing', {}); }
export function shutdown(): void { // the voice's own session goes first; Grok also ends by itself when its input closes
  const s = server; server = null; if (!s) return; if (voice) write(s, { id: s.nextId++, method: '_x.ai/session/delete', params: { sessionId: voice.id } }); voice = null;
  s.child.stdin?.end(); setTimeout(() => { if (s.child.exitCode === null && s.child.signalCode === null) s.child.kill('SIGTERM'); }, 300).unref(); }

// ---------- sessions and transcripts
type AcpSession = { sessionId: string; cwd: string; title?: string | null; updatedAt?: string | null; _meta?: { 'x.ai/session'?: { facets?: { branch?: string } } } };
export async function listSessions(dir: string): Promise<SessionInfo[]> {
  if (!installed()) return [];
  const out: SessionInfo[] = []; let cursor: string | null = null; let pages = 0;
  do {
    const page: { sessions?: AcpSession[]; nextCursor?: string | null } = await call('session/list', { cwd: dir, ...(cursor ? { cursor } : {}) });
    for (const x of page.sessions ?? []) { if (x.cwd !== dir || voice?.id === x.sessionId) continue; const branch = x._meta?.['x.ai/session']?.facets?.branch;
      out.push({ provider: 'grok', sessionId: x.sessionId, summary: shortTitle(x.title ?? '') || 'Grok session', lastModified: Date.parse(x.updatedAt ?? '') || 0, ...(branch ? { gitBranch: branch } : {}), cwd: x.cwd }); }
    cursor = page.nextCursor ?? null;
  } while (cursor && ++pages < 30);
  return out;
}

/** What a session holds, from `session/load`: Grok replays the whole conversation as updates (marked isReplay), then answers. A session
 * the app is not running is closed again afterwards, so a Grok window that goes on with it never races a stale copy in this process. */
const reading = new Map<string, Promise<ChatMessage[]>>();
const replays = new Map<string, Thread>();
export function transcript(sessionId: string, cwd: string): Promise<ChatMessage[]> {
  const busy = reading.get(sessionId); if (busy) return busy;
  const job = (async () => {
    const messages: ChatMessage[] = []; const th = new Thread(sessionId, 'r', (m) => { const i = messages.findIndex((x) => x.uuid === m.uuid); if (i >= 0) messages[i] = m; else messages.push(m); });
    replays.set(sessionId, th);
    try { await call('session/load', { sessionId, cwd, mcpServers: [] }); th.flush(); } finally { replays.delete(sessionId); }
    if (!turns.has(sessionId) && !loaded.has(sessionId)) void call('session/close', { sessionId }).catch(() => { /* already gone */ });
    return messages;
  })().finally(() => reading.delete(sessionId));
  reading.set(sessionId, job); return job;
}

/** Grok keeps the name with the session (`x.ai/session/rename`), so the Grok CLI shows it too. */
export async function rename(sessionId: string, name: string, cwd?: string): Promise<void> { await ext('session/rename', { sessionId, title: name, ...(cwd ? { cwd } : {}) }); }

export async function models(): Promise<ModelOption[]> {
  const s = (server ??= boot()); await s.ready; const st = s.models;
  return (st?.availableModels ?? []).map((m) => ({ id: m.modelId, label: m.name || m.modelId, isDefault: m.modelId === st?.currentModelId, efforts: (m._meta?.reasoningEfforts ?? []).map((e) => e.id).filter(Boolean) }));
}
const windowOf = (s: Server, model?: string): number => s.models?.availableModels?.find((m) => m.modelId === (model || s.models?.currentModelId))?._meta?.totalContextTokens ?? 0;

// ---------- updates -> the app's messages, live or replayed
type Tool = { id: string; name: string; input: unknown; status: string; result: string; failed: boolean; made?: string };
type Update = { sessionUpdate?: string; content?: unknown; toolCallId?: string; title?: string | null; kind?: string | null; status?: string | null; rawInput?: unknown; rawOutput?: unknown; entries?: { content?: string; status?: string }[]; _meta?: Record<string, unknown> };
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** Grok's tools that make a picture or a video (`imagine` and the like): their output names the file, saved in Grok's own session folder. */
const MEDIA = /^(ImageGen|ImageEdit|ImageToVideo|ReferenceToVideo)$/;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
const TOOL_NAMES: Record<string, string> = { execute: 'Shell', edit: 'Edit', read: 'Read', search: 'Search', fetch: 'Fetch', delete: 'Delete', move: 'Move', think: 'Think' };
/** A tool's result as text: what it printed, and a file change as its lines out and in. */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.map((c) => { const x = c as { type?: string; content?: { type?: string; text?: string }; path?: string; oldText?: string | null; newText?: string };
    if (x.type === 'content' && x.content?.type === 'text') return (x.content.text ?? '').replace(ANSI, '');
    if (x.type === 'diff') return [`--- ${x.path ?? ''}`, ...(x.oldText ?? '').split('\n').filter(Boolean).map((l) => `- ${l}`), ...(x.newText ?? '').split('\n').filter(Boolean).map((l) => `+ ${l}`)].join('\n');
    return ''; }).filter(Boolean).join('\n');
}
/** One session's stream of updates, turned into the messages the window shows: a model call's thinking and text become one message
 *  when the call ends (or a tool starts), a tool call shows as it starts and again, same uuid, with its result. A picture a tool made
 *  shows under its row (the tool's input carries the file), and the answer's own link to it, written relative to Grok's session
 *  folder ("images/1.jpg"), is pointed at the file: resolved against the project's folder it was a broken image (2026-09-24). */
class Thread {
  text = ''; thought = ''; part = 0; user: Block[] = []; tools = new Map<string, Tool>(); media = new Map<string, string>();
  constructor(readonly sessionId: string, readonly tag: string, readonly emit: (m: ChatMessage) => void, readonly live?: { delta: (t: string) => void; doing: (what: 'thinking' | 'writing' | 'tool', tool?: string) => void }) {}
  flush(): void {
    if (this.user.length) { this.emit({ uuid: `${this.sessionId}:${this.tag}${++this.part}`, role: 'user', blocks: this.user, meta: false }); this.user = []; }
    const blocks: Block[] = [...(this.thought.trim() ? [{ type: 'thinking', text: this.thought.trim() } as Block] : []), ...(this.text.trim() ? [{ type: 'text', text: this.text } as Block] : [])];
    this.thought = ''; this.text = '';
    for (const b of blocks) if (b.type === 'text') b.text = b.text.replace(/\]\((?:\.\/)?([^)\s]+)\)/g, (all, rel: string) => { const file = this.media.get(rel); return file ? `](${file})` : all; });
    if (blocks.length) this.emit({ uuid: `${this.sessionId}:${this.tag}${++this.part}`, role: 'assistant', blocks, meta: false });
  }
  private tool(t: Tool, done: boolean): void {
    const uuid = `${this.sessionId}:${t.id}`; const input = t.made ? { ...(t.input && typeof t.input === 'object' ? t.input : {}), [IMAGE_FILE.test(t.made) ? 'image' : 'video']: t.made } : t.input;
    const use: Block = { type: 'tool_use', id: uuid, name: t.name, input };
    this.emit({ uuid, role: 'assistant', blocks: done ? [use, { type: 'tool_result', toolUseId: uuid, text: t.result.slice(0, 20_000), isError: t.failed }] : [use], meta: false });
  }
  update(u: Update): void {
    const kind = u.sessionUpdate; const block = u.content as { type?: string; text?: string } | undefined;
    if (kind === 'user_message_chunk') { if (this.live) return; // the window already shows what was sent
      if (this.text || this.thought) this.flush();
      if (block?.type === 'text' && block.text?.trim()) this.user.push({ type: 'text', text: block.text }); else if (block?.type === 'image') this.user.push({ type: 'image' }); }
    else if (kind === 'agent_thought_chunk') { if (this.user.length || this.text) this.flush(); this.thought += block?.text ?? ''; this.live?.doing('thinking'); }
    else if (kind === 'agent_message_chunk') { if (this.user.length) this.flush(); const t = block?.type === 'text' ? block.text ?? '' : ''; this.text += t; if (t) this.live?.delta(t); this.live?.doing('writing'); }
    else if (kind === 'tool_call' || kind === 'tool_call_update') {
      const id = String(u.toolCallId ?? ''); if (!id) return; if (kind === 'tool_call') this.flush();
      const xai = (u._meta?.['x.ai/tool'] ?? {}) as { label?: string; name?: string };
      const t = this.tools.get(id) ?? { id, name: '', input: {}, status: 'pending', result: '', failed: false };
      if (xai.label || u.kind || u.title) t.name = xai.label || (u.kind ? TOOL_NAMES[u.kind] : '') || t.name || String(u.title ?? 'Tool');
      if (u.rawInput && typeof u.rawInput === 'object') { const { variant: _v, ...rest } = u.rawInput as Record<string, unknown>; t.input = { ...(u.title ? { title: u.title } : {}), ...rest }; }
      if (u.content !== undefined) { const r = contentText(u.content); if (r || u.status === 'completed' || u.status === 'failed') t.result = r; }
      const exit = (u.rawOutput as { exit_code?: number } | undefined)?.exit_code;
      const out = (u.rawOutput ?? null) as { type?: string; path?: string; filename?: string; session_folder?: string; uploaded_url?: string } | null;
      const made = out && MEDIA.test(out.type ?? '') ? out.path || out.uploaded_url || '' : '';
      if (made) { t.made = made; if (out?.session_folder && out.filename) this.media.set(`${out.session_folder}/${out.filename}`, made); if (!t.result) t.result = `Saved to ${made}`; }
      if (u.status) t.status = u.status; t.failed = t.status === 'failed' || (typeof exit === 'number' && exit !== 0);
      const known = this.tools.has(id); this.tools.set(id, t);
      if (t.status === 'completed' || t.status === 'failed') this.tool(t, true); else if (!known) { this.tool(t, false); this.live?.doing('tool', t.name); }
    } else if (kind === 'plan') { // the steps Grok set itself, as one card that stays up to date
      const text = (u.entries ?? []).map((e) => `${e.status === 'completed' ? '[x]' : e.status === 'in_progress' ? '[~]' : '[ ]'} ${e.content ?? ''}`).join('\n');
      const uuid = `${this.sessionId}:plan:${this.tag}`; this.emit({ uuid, role: 'assistant', blocks: [{ type: 'tool_use', id: uuid, name: 'Plan', input: { steps: (u.entries ?? []).length } }, { type: 'tool_result', toolUseId: uuid, text, isError: false }], meta: false });
    }
  }
}

// ---------- one turn, streamed to the UI with the same events the Claude path sends
type PromptResult = { stopReason?: string; _meta?: { totalTokens?: number; inputTokens?: number; modelId?: string; usage?: { costUsdTicks?: number; usageIsIncomplete?: boolean; costIsPartial?: boolean } } };
type LiveTurn = { projectId?: string; server: Server; chatId: string; sessionId: string; send: (e: ChatEvent) => void; pending: Map<string, (d: PermissionDecision | 'cancel') => void>; thread: Thread;
  started: number; callStart: number; steers: number[]; ctx: ContextUsage | null; model?: string; compact: boolean; compactAt: number; before?: number;
  answered: PromptResult | null; fallback: boolean; fail: (why: string) => void; finish: (r: PromptResult) => void };
const turns = new Map<string, LiveTurn>(); // by sessionId: Grok runs one prompt per session at a time
const loaded = new Set<string>();          // sessions this agent process made or resumed for a turn
const chosen = new Map<string, { model: string; effort: string; auto: boolean }>(); // what each loaded session was given: a change reaches it before the next turn
const FALLBACK = 'interject-fallback-';     // Grok's own prompt ids for a message handed over after the turn's last step (it runs it as a turn of its own)
const running = new Map<string, string>();  // sessionId -> the prompt Grok says it is running (x.ai/queue/changed)

export async function startChat(req: ChatStart, send: (e: ChatEvent) => void): Promise<void> {
  const { chatId } = req;
  if (byChat(chatId)) throw new Error('This chat is already running.');
  const { state, project } = await projectOr404(req.projectId);
  if (req.compact && !req.sessionId) { send({ chatId, type: 'done', ok: false, error: 'Nothing to compact yet: this session has no conversation.' }); return; }
  const s = (server ??= boot()); await s.ready;
  const auto = req.permissions === 'auto'; let sessionId = req.sessionId; let model = req.model || undefined;
  if (sessionId && loaded.has(sessionId) && chosen.get(sessionId)?.auto !== auto && !turns.has(sessionId)) { await call('session/close', { sessionId }).catch(() => {}); loaded.delete(sessionId); } // Grok takes the permission mode when a session is loaded
  if (!sessionId) {
    // Grok takes the briefing once, when the session is made (`_meta.rules`, folded into its system prompt). The note on dictation goes in
    // whatever the first message was: a session started by typing may be talked to later, and a typed message never carries the tag.
    const rules = clientBriefing(true, req.vocabulary, !!req.steward, APP_ROOT);
    const r = await call<{ sessionId: string; models?: ModelState }>('session/new', { cwd: project.path, mcpServers: [], _meta: { rules, ...(req.model ? { modelId: req.model } : {}), ...(req.effort ? { reasoningEffort: req.effort } : {}), ...(auto ? { autoMode: true } : {}) } });
    sessionId = r.sessionId; model = r.models?.currentModelId ?? model; loaded.add(sessionId); chosen.set(sessionId, { model: model ?? '', effort: req.effort ?? '', auto });
  } else if (!loaded.has(sessionId)) {
    const r = await call<{ models?: ModelState }>('session/resume', { sessionId, cwd: project.path, mcpServers: [], _meta: { ...(req.effort ? { reasoningEffort: req.effort } : {}), ...(auto ? { autoMode: true } : {}) } });
    loaded.add(sessionId); chosen.set(sessionId, { model: r.models?.currentModelId ?? '', effort: req.effort ?? '', auto }); model ??= r.models?.currentModelId;
  }
  const had = chosen.get(sessionId) ?? { model: '', effort: '', auto };
  if (req.model && req.model !== had.model) { await call('session/set_config_option', { sessionId, configId: 'model', value: req.model }).then(() => { had.model = req.model!; }, () => { /* the model it has stays */ }); }
  if (req.effort && req.effort !== had.effort) { await call('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: req.effort }).then(() => { had.effort = req.effort!; }, () => { /* the effort it has stays */ }); }
  chosen.set(sessionId, had); model = had.model || model;
  if (turns.has(sessionId)) throw new Error('This session is already running a turn.');
  let changed = false; if (!req.hidden && !project.sessions.includes(sessionId)) { project.sessions.unshift(sessionId); changed = true; }
  if (project.providers?.[sessionId] !== 'grok') { project.providers = { ...project.providers, [sessionId]: 'grok' }; changed = true; }
  if (changed) await saveState(state);
  send({ chatId, type: 'init', sessionId, ...(model ? { model } : {}) });
  const ctx = project.context?.[sessionId] ?? null;
  if (req.compact) { await runTurn(s, sessionId, chatId, /^\/compact\b/i.test(req.text.trim()) ? req.text.trim() : '/compact', undefined, send, req.projectId, { ctx, model, compact: true }); return; } // Grok's own /compact, a turn of its own
  await runTurn(s, sessionId, chatId, req.text, req.images, send, req.projectId, { ctx, model });
}

/** The prompt's content: the text, then each image inline (Grok takes image blocks although its capabilities say otherwise). */
function promptBlocks(text: string, images?: Attachment[]): unknown[] {
  return [...(text ? [{ type: 'text', text }] : []), ...(images ?? []).map((i) => ({ type: 'image', data: i.data, mimeType: i.mediaType }))];
}
function runTurn(s: Server, sessionId: string, chatId: string, text: string, images: Attachment[] | undefined, send: (e: ChatEvent) => void, projectId: string | undefined, opts: { ctx: ContextUsage | null; model?: string; compact?: boolean }): Promise<void> {
  return new Promise<void>((resolve) => {
    const thread = new Thread(sessionId, `${Date.now().toString(36)}-`, (m) => send({ chatId, type: 'message', message: m }), {
      delta: (t) => send({ chatId, type: 'delta', text: t }),
      doing: () => { /* this edition has no activity line */ },
    });
    const end = (e: ChatEvent) => { if (turns.get(sessionId) !== entry) return; for (const f of [...entry.pending.values()]) f('deny'); thread.flush(); if (entry.compactAt) compacted(entry, e.type === 'done' && e.ok); turns.delete(sessionId);
      if (projectId && entry.ctx && entry.ctx.window > 0) void saveContext(projectId, sessionId, entry.ctx).catch(() => { /* shown, just not kept */ }); send(e); resolve(); };
    const entry: LiveTurn = { projectId, server: s, chatId, sessionId, send, pending: new Map(), thread, started: Date.now(), callStart: Date.now(), steers: [], ctx: opts.ctx, ...(opts.model ? { model: opts.model } : {}), compact: !!opts.compact, compactAt: 0, answered: null, fallback: false,
      fail: (why) => end({ chatId, type: 'done', ok: false, sessionId, error: why, ...(tooLong(null, why) ? { tooLong: true } : {}) }),
      finish: (r) => {
        const m = r._meta; const window = windowOf(s, m?.modelId ?? entry.model);
        // what the last request carried; not after a /compact, whose own request carried the conversation before it (the meter keeps what the compaction left)
        if (!entry.compact && typeof m?.inputTokens === 'number' && m.inputTokens > 0) entry.ctx = { used: m.inputTokens, window: window || entry.ctx?.window || 0, at: Date.now(), ...(m.modelId ?? entry.model ? { model: m.modelId ?? entry.model } : {}) };
        if (entry.ctx && entry.ctx.window > 0) send({ chatId, type: 'context', usage: entry.ctx });
        const ok = r.stopReason !== 'refusal'; const u = m?.usage; const cost = u && typeof u.costUsdTicks === 'number' && !u.usageIsIncomplete && !u.costIsPartial ? u.costUsdTicks / 1e10 : undefined;
        end({ chatId, type: 'done', ok, sessionId, durationMs: Date.now() - entry.started, ...(cost !== undefined ? { costUsd: cost } : {}), ...(ok ? {} : { error: 'Grok declined to answer that (refusal).' }) });
      } };
    turns.set(sessionId, entry);
    if (opts.compact) { entry.compactAt = Date.now(); entry.before = opts.ctx?.used; send({ chatId, type: 'compact', phase: 'start', trigger: 'manual', ...(entry.before !== undefined ? { before: entry.before } : {}) }); }
    rawCall<PromptResult>(s, 'session/prompt', { sessionId, prompt: promptBlocks(text, images) }).then((r) => settle(entry, r), (e: Error) => entry.fail(e.message));
  });
}
/** The prompt is answered. A message handed over after the turn's last step is not lost by Grok: it runs it as a prompt of its own
 *  (`interject-fallback-…`). That prompt belongs to this turn: the turn ends when it does, so its answer reaches the window. */
function settle(t: LiveTurn, r: PromptResult): void {
  if (turns.get(t.sessionId) !== t) return; t.answered = r;
  const late = t.steers.some((at) => at >= t.callStart);
  if ((running.get(t.sessionId) ?? '').startsWith(FALLBACK)) { t.fallback = true; return; }
  if (!late) { t.finish(r); return; }
  setTimeout(() => { if (turns.get(t.sessionId) === t && !t.fallback) t.finish(r); }, 1500); // no prompt of its own came: it was read in time
}
/** A compaction is over: said once, with the tokens before and after when Grok gave them. */
function compacted(t: LiveTurn, ok: boolean, after?: number, before?: number, error?: string): void {
  const b = before ?? t.before; t.compactAt = 0;
  t.send({ chatId: t.chatId, type: 'compact', phase: 'done', trigger: t.compact ? 'manual' : 'auto', ok, ...(error ? { error } : {}), ...(b !== undefined ? { before: b } : {}), ...(after !== undefined ? { after } : {}) });
}

function onNotification(s: Server, method: string, p: Record<string, unknown>): void {
  if (method === '_x.ai/models/update') { s.models = p as ModelState; return; }
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : ''; if (!sessionId) return;
  if (method === '_x.ai/queue/changed') { // what Grok is running for a session: a late message's own prompt joins the turn it was meant for
    const id = typeof p.runningPromptId === 'string' ? p.runningPromptId : ''; if (id) running.set(sessionId, id); else running.delete(sessionId);
    const t = turns.get(sessionId); if (t && id.startsWith(FALLBACK)) t.fallback = true; return;
  }
  if (method === '_x.ai/session/prompt_complete') { const t = turns.get(sessionId); if (t?.fallback && t.answered && String(p.promptId ?? '').startsWith(FALLBACK)) t.finish(t.answered); return; }
  const replay = !!(p._meta as { isReplay?: boolean } | undefined)?.isReplay;
  const u = (p.update ?? {}) as Update & Record<string, unknown>;
  if (replay) { if (method === 'session/update') replays.get(sessionId)?.update(u); return; }
  const t = turns.get(sessionId); if (!t) return;
  const { chatId, send } = t;
  if (method === 'session/update') {
    if ((u.sessionUpdate === 'agent_thought_chunk' || u.sessionUpdate === 'agent_message_chunk') && !t.thread.text && !t.thread.thought) t.callStart = Date.now(); // a model call begins: what was handed over before now is in it
    if (u.sessionUpdate === 'usage_update' && typeof u.used === 'number' && typeof u.size === 'number' && u.size > 0) { t.ctx = { used: u.used, window: u.size, at: Date.now(), ...(t.model ? { model: t.model } : {}) }; send({ chatId, type: 'context', usage: t.ctx }); return; }
    t.thread.update(u); return;
  }
  if (method !== '_x.ai/session_notification' && method !== '_x.ai/session/update') return;
  const kind = u.sessionUpdate;
  if (kind === 'response_completed') { // one model call is over: its words are one message, and what it carried is how full the context is
    t.thread.flush();
    const x = (u.usage ?? {}) as { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    const used = (x.input_tokens ?? 0) + (x.cache_read_input_tokens ?? 0) + (x.cache_creation_input_tokens ?? 0); const window = windowOf(s, t.model) || t.ctx?.window || 0;
    if (used > 0 && window > 0) { t.ctx = { used, window, at: Date.now(), ...(t.model ? { model: t.model } : {}) }; send({ chatId, type: 'context', usage: t.ctx }); }
  } else if (kind === 'model_changed' && typeof u.model_id === 'string') t.model = u.model_id;
  else if (kind === 'auto_compact_started') { t.compactAt = Date.now(); t.before = typeof u.tokens_used === 'number' ? u.tokens_used : t.ctx?.used; send({ chatId, type: 'compact', phase: 'start', trigger: t.compact ? 'manual' : 'auto', ...(t.before !== undefined ? { before: t.before } : {}) }); }
  else if (kind === 'auto_compact_completed') {
    const after = typeof u.tokens_after === 'number' ? u.tokens_after : undefined; const before = typeof u.tokens_before === 'number' ? u.tokens_before : undefined;
    if (after !== undefined && t.ctx) { t.ctx = { ...t.ctx, used: after, at: Date.now() }; send({ chatId, type: 'context', usage: t.ctx }); }
    if (!t.compactAt) { t.compactAt = Date.now(); send({ chatId, type: 'compact', phase: 'start', trigger: t.compact ? 'manual' : 'auto', ...(before !== undefined ? { before } : {}) }); } // a manual /compact says only that it is done
    compacted(t, true, after, before);
  } else if (kind === 'auto_compact_failed' || kind === 'auto_compact_cancelled') { if (t.compactAt) compacted(t, false, undefined, undefined, typeof u.error === 'string' ? u.error : kind === 'auto_compact_cancelled' ? 'cancelled' : undefined); }
}

// Grok asks before a tool its permission rules do not allow already: the same card as Claude's tools.
function onAgentRequest(s: Server, id: number | string, method: string, p: Record<string, unknown>): void {
  if (method !== 'session/request_permission') { write(s, { id, error: { code: -32601, message: `${method} is not supported by this client` } }); return; }
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : ''; const t = turns.get(sessionId);
  const options = (Array.isArray(p.options) ? p.options : []) as { optionId: string; kind?: string; name?: string }[];
  if (!t || /^(voice|once):/.test(t.chatId)) { write(s, { id, result: { outcome: { outcome: 'cancelled' } } }); return; } // nobody here to ask: the voice's own session and one-off prompts never act
  const call = (p.toolCall ?? {}) as { title?: string; kind?: string; rawInput?: unknown; _meta?: Record<string, unknown> };
  const xai = (call._meta?.['x.ai/tool'] ?? {}) as { label?: string };
  const pick = (d: PermissionDecision) => (d === 'allow' ? options.find((o) => o.kind === 'allow_once') : d === 'always' ? options.find((o) => o.kind === 'allow_always') ?? options.find((o) => o.kind === 'allow_once') : options.find((o) => o.kind === 'reject_once') ?? options.find((o) => o.kind === 'reject_always'));
  const requestId = randomUUID();
  t.pending.set(requestId, (d) => { t.pending.delete(requestId); const o = d === 'cancel' ? undefined : pick(d); write(s, { id, result: { outcome: o ? { outcome: 'selected', optionId: o.optionId } : { outcome: 'cancelled' } } }); });
  const { variant: _v, ...input } = (call.rawInput && typeof call.rawInput === 'object' ? call.rawInput : {}) as Record<string, unknown>;
  t.send({ chatId: t.chatId, type: 'permission', requestId, toolName: xai.label || (call.kind ? TOOL_NAMES[call.kind] : '') || call.title || 'Tool', input: { ...(call.title ? { title: call.title } : {}), ...input } });
}

const byChat = (chatId: string): LiveTurn | undefined => [...turns.values()].find((t) => t.chatId === chatId);
export function isRunning(chatId: string): boolean { return !!byChat(chatId); }
export function liveList(): { chatId: string; projectId: string; sessionId: string | null }[] { return [...turns.values()].filter((t) => t.projectId).map((t) => ({ chatId: t.chatId, projectId: t.projectId!, sessionId: t.sessionId })); }
/** Grok takes a message into the running turn (`x.ai/interject`): at its next step, or, when the turn is over by then, as a prompt of its own. */
export async function steerChat(chatId: string, text: string, images?: Attachment[]): Promise<boolean> {
  const t = byChat(chatId); if (!t || t.answered || t.compact) return false;
  try { await ext('interject', { sessionId: t.sessionId, text, ...(images?.length ? { content: promptBlocks(text, images) } : {}) }); t.steers.push(Date.now()); return true; } catch { return false; }
}
export function answerPermission(chatId: string, requestId: string, decision: PermissionDecision): boolean {
  const finish = byChat(chatId)?.pending.get(requestId); if (!finish) return false; finish(decision); return true;
}
export async function stopChat(chatId: string): Promise<boolean> {
  const t = byChat(chatId); if (!t) return false;
  write(t.server, { method: 'session/cancel', params: { sessionId: t.sessionId } }); // the prompt answers with stopReason "cancelled"
  for (const f of [...t.pending.values()]) f('cancel'); // a card still open is answered "cancelled", as the protocol asks of a client that cancels
  if (t.answered) t.finish(t.answered); // stopped while a late message's own prompt ran: the cancel stops that one
  return true;
}
export function stopAll(): void { for (const t of turns.values()) void stopChat(t.chatId); }

// ---------- the speaking voice of Grok sessions: a small, fast Grok model, so a Grok session never talks through another provider
// One session of its own for the whole run, in the system's temporary folder, with the voice's instructions as its whole system prompt,
// low effort, and no permission ever granted (it is only asked to write a line). Asks run one at a time. Grok keeps every session, so the
// voice's is deleted when a new one is made, and the last one's id is kept in the data folder: the next run deletes it (an app that quits
// does not wait for Grok to answer; on 2026-09-24 the one left at quitting was still in Grok's list).
let voice: { id: string; model: string } | null = null;
let voiceQueue: Promise<unknown> = Promise.resolve();
/** The voice model: the one picked in settings if Grok still offers it, else the one described as fast, else Grok's default. */
export async function voiceModel(preferred: string): Promise<string> {
  const list = await models().catch(() => [] as ModelOption[]);
  return (list.find((m) => m.id === preferred) ?? list.find((m) => /fast|mini|small/i.test(`${m.id} ${m.label}`)) ?? list.find((m) => m.isDefault) ?? list[0])?.id ?? '';
}
const VOICE_FILE = path.join(DATA_DIR, 'grok-voice-session');
async function voiceSessionFor(model: string, instructions: string): Promise<string> {
  if (voice && voice.model === model && server) return voice.id;
  let old = voice?.id ?? ''; try { old ||= readFileSync(VOICE_FILE, 'utf8').trim(); } catch { /* none left */ }
  if (old) await ext('session/delete', { sessionId: old }).catch(() => { /* gone already */ });
  const r = await call<{ sessionId: string }>('session/new', { cwd: os.tmpdir(), mcpServers: [], _meta: { systemPromptOverride: instructions, yoloMode: false, reasoningEffort: 'low', ...(model ? { modelId: model } : {}) } });
  voice = { id: r.sessionId, model }; try { writeFileSync(VOICE_FILE, r.sessionId); } catch { /* deleted at quitting only */ }
  return r.sessionId;
}
/** One throwaway prompt in a fresh session of its own (checks and probes): the assistant's text. The session is deleted afterwards. */
export async function runOnce(text: string, model = '', cwd = os.tmpdir()): Promise<string> {
  const s = (server ??= boot()); await s.ready;
  const r = await call<{ sessionId: string }>('session/new', { cwd, mcpServers: [], _meta: { yoloMode: false, reasoningEffort: 'low', ...(model ? { modelId: model } : {}) } });
  let out = ''; await runTurn(s, r.sessionId, `once:${randomUUID()}`, text, undefined, (e) => { if (e.type === 'message' && e.message.role === 'assistant') out += e.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' '); }, undefined, { ctx: null });
  void ext('session/delete', { sessionId: r.sessionId }).catch(() => {});
  return out;
}
export function voiceAsk(instructions: string, message: string, preferred: string, timeoutMs: number): Promise<string> {
  const job = voiceQueue.then(async () => {
    const sessionId = await voiceSessionFor(await voiceModel(preferred), instructions);
    const chatId = `voice:${randomUUID()}`; let text = '';
    const timer = setTimeout(() => void stopChat(chatId), timeoutMs); // too slow to be worth saying: cut the turn so the next one can start
    try {
      await runTurn(server!, sessionId, chatId, message, undefined, (e) => {
        if (e.type === 'message' && e.message.role === 'assistant') { const t = e.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' '); if (t.trim()) text = t; }
        else if (e.type === 'done' && !e.ok) voice = null; // start over with a fresh session next time
      }, undefined, { ctx: null });
    } finally { clearTimeout(timer); }
    return text.replace(/\s+/g, ' ').trim();
  }).catch(() => { voice = null; return ''; });
  voiceQueue = job; return job;
}
/** The first prompt of a session pays for start-up: spend it before the user speaks. */
export function voiceWarm(instructions: string, preferred: string): void {
  if (voice) return;
  void voiceAsk(instructions, 'WARMUP: reply with the single word ok.', preferred, 15_000);
}
