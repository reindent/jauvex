import { APP_ROOT } from './backend.js';
import { randomUUID } from 'node:crypto';
import { query, tool, createSdkMcpServer, type CanUseTool, type PermissionResult, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentRequest } from '../shared/types.js';
import { clientBriefing, providerOf, type Attachment, type ChatEvent, type ChatStart, type PermissionDecision } from '../shared/types.js';
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk';
import { normalize, projectOr404, saveContext, saveState } from './backend.js';
import { autoCompactPct, claudeCompactEnv, claudeUsed, tooLong, type ContextUsage } from '../shared/context.js';
import * as codex from './codex.js';
import { claudeExe } from './account.js';

type Live = { push: (text: string, images?: Attachment[]) => void; q: Query; abort: AbortController; pending: Map<string, (d: PermissionDecision) => void>; always: Set<string>; projectId: string; sessionId: string | null };
const live = new Map<string, Live>();


/**
 * One turn: resume the session (or start a new one in the project folder), stream everything to the UI.
 * Runs the real Claude Code harness through the Agent SDK: same login, same settings, CLAUDE.md, tools.
 * Tools that need permission are asked in the UI (canUseTool), exactly once per call unless "always".
 */
export async function startChat(req: ChatStart, send: (e: ChatEvent) => void): Promise<void> {
  const { chatId } = req;
  if (live.has(chatId)) throw new Error('This chat is already running.');
  const { state, project } = await projectOr404(req.projectId);
  // The session's provider decides who continues it; only a new session takes the one the UI asked for.
  if ((req.sessionId ? providerOf(project, req.sessionId) : req.provider ?? 'claude') === 'codex') return codex.startChat(req, send);
  const abort = new AbortController();
  // How full the context is (T-74): the last known numbers, then every request's. Claude Code compacts on its own when the setting's share
  // of the window is passed (in the middle of a long turn too); the window compacts between turns, and at once when a message did not fit.
  let ctx: ContextUsage | null = (req.sessionId && project.context?.[req.sessionId]) || null; const compactEnv = claudeCompactEnv(autoCompactPct(state.ui), ctx);
  const first = req.compact ? (/^\/compact\b/i.test(req.text.trim()) ? req.text.trim() : '/compact') : req.text; // a compact turn is Claude Code's own /compact (a focus may follow it)
  // The prompt is a stream, not a string: the first message starts the turn, and anything pushed later is folded into the
  // running turn by the harness at its next step (or runs right after it), without interrupting what it is doing.
  const inbox: SDKUserMessage[] = []; let wake: (() => void) | null = null; let closed = false;
  const user = (text: string, images?: Attachment[]): SDKUserMessage => ({ type: 'user', message: { role: 'user', content: images?.length ? [...(text ? [{ type: 'text', text }] : []), ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))] : text }, parent_tool_use_id: null } as SDKUserMessage); // images ride inline, the way the Messages API takes them
  async function* input(): AsyncGenerator<SDKUserMessage> { yield user(first, req.compact ? undefined : req.images); while (!closed) { if (!inbox.length) await new Promise<void>((r) => { wake = r; }); const m = inbox.shift(); if (m) yield m; } }
  // Messages handed to the running turn, and when the model last started an answer: one handed over after that start was never read, and
  // Claude Code drops it when the turn is stopped, or when the turn ends before it is taken up (2026-09-23): the window sends it again.
  const steers: number[] = []; let lastStart = 0;
  const entry: Live = { projectId: req.projectId, sessionId: req.sessionId, push: (text, images) => { steers.push(Date.now()); inbox.push(user(text, images)); wake?.(); }, q: undefined as unknown as Query, abort, pending: new Map(), always: new Set() };

  const canUseTool: CanUseTool = (toolName, input, opts) => new Promise<PermissionResult>((resolve) => {
    if (entry.always.has(toolName) || toolName.startsWith('mcp__jauvex__')) return resolve({ behavior: 'allow', updatedInput: input }); /* the app's own tools (message_agent, list_agents) never ask: they only reach the app's router */
    const requestId = randomUUID();
    const finish = (d: PermissionDecision) => {
      entry.pending.delete(requestId);
      if (d === 'deny') return resolve({ behavior: 'deny', message: 'The user declined this action.' });
      if (d === 'always') entry.always.add(toolName);
      resolve({ behavior: 'allow', updatedInput: input, ...(d === 'always' && opts.suggestions ? { updatedPermissions: opts.suggestions } : {}) });
    };
    entry.pending.set(requestId, finish);
    opts.signal.addEventListener('abort', () => { if (entry.pending.has(requestId)) finish('deny'); }, { once: true });
    send({ chatId, type: 'permission', requestId, toolName, input });
  });

  entry.q = query({
    prompt: input(),
    options: {
      ...claudeExe(),
      cwd: project.path,
      ...(Object.keys(compactEnv).length ? { env: { ...process.env, ...compactEnv } } : {}), // the SDK's env replaces the whole environment
      ...(req.sessionId ? { resume: req.sessionId } : {}),
      ...(req.model ? { model: req.model } : {}),
      ...(req.effort ? { effort: req.effort as EffortLevel } : {}),
      // voice turns get the same prompt (the big model answers for the screen) plus one note: this text was dictated
      systemPrompt: { type: 'preset', preset: 'claude_code', append: clientBriefing(!!req.voice, req.vocabulary, !!req.steward, APP_ROOT) }, // every session is told where it is running (see clientBriefing)
      includePartialMessages: true,
      permissionMode: req.permissions === 'auto' ? 'auto' : 'default',
      canUseTool,
      abortController: abort,
      mcpServers: { jauvex: jauvexTools(chatId) }, // message_agent and list_agents: the app's own channel between agents, as a tool
    },
  });
  live.set(chatId, entry);

  let sessionId = req.sessionId ?? undefined;
  let model = req.model ?? ''; let compactAt = 0; let boundary: { trigger: 'manual' | 'auto'; pre: number; post?: number } | null = null;
  const tell = (u: ContextUsage) => { ctx = u; send({ chatId, type: 'context', usage: u }); };
  const trigger = (): 'manual' | 'auto' => boundary?.trigger ?? (req.compact ? 'manual' : 'auto');
  const compacted = (ok: boolean, error?: string) => { compactAt = 0; send({ chatId, type: 'compact', phase: 'done', trigger: trigger(), ok, ...(error ? { error } : {}), ...(boundary ? { before: boundary.pre, ...(boundary.post !== undefined ? { after: boundary.post } : {}) } : {}) }); };
  try {
    let ended = false;
    for await (const m of entry.q) {
      if (m.type === 'system' && m.subtype === 'status') {
        // Compacting, asked (/compact) or on its own: said as it starts and when it is over, with the tokens before and after.
        if (m.status === 'compacting' && !compactAt) { compactAt = Date.now(); boundary = null; send({ chatId, type: 'compact', phase: 'start', trigger: req.compact ? 'manual' : 'auto', ...(ctx ? { before: ctx.used } : {}) }); }
        else if (compactAt && m.compact_result) compacted(m.compact_result === 'success', m.compact_error);
      } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
        const c = m.compact_metadata; boundary = { trigger: c.trigger, pre: c.pre_tokens, ...(typeof c.post_tokens === 'number' ? { post: c.post_tokens } : {}) };
        if (!compactAt) { compactAt = Date.now(); send({ chatId, type: 'compact', phase: 'start', trigger: c.trigger, before: c.pre_tokens }); } // no status came before it
        if (ctx && boundary.post !== undefined) tell({ ...ctx, used: boundary.post, at: Date.now() });
      } else if (m.type === 'system' && m.subtype === 'init') {
        sessionId = m.session_id; entry.sessionId = sessionId; model = m.model || model;
        if (!req.hidden && !project.sessions.includes(sessionId)) { project.sessions.unshift(sessionId); await saveState(state); }
        send({ chatId, type: 'init', sessionId, model: m.model });
      } else if (m.type === 'stream_event') {
        if (m.parent_tool_use_id) continue; // subagent chatter stays out of the main thread
        const ev = m.event; if (ev.type === 'message_start') lastStart = Date.now(); // a new request: what was handed over before it is in it
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send({ chatId, type: 'delta', text: ev.delta.text });
      } else if (m.type === 'assistant' || m.type === 'user') {
        if (m.parent_tool_use_id) continue;
        if (m.type === 'assistant') { const used = claudeUsed(m.message.usage); if (used > 0 && used !== ctx?.used) tell({ window: 0, ...ctx, used, at: Date.now(), model: m.message.model || model }); } // what this request carried (the harness's own error messages carry nothing)
        const msg = normalize({ type: m.type, uuid: m.uuid ?? randomUUID(), message: m.message, ...(m.type === 'user' && m.isSynthetic ? { isSynthetic: true } : {}) });
        // A message that did not fit comes back as an assistant message of the harness's own: a red card, never read as an answer.
        if (msg && m.type === 'assistant' && m.error && tooLong(null, msg.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' '))) msg.error = true;
        if (msg) send({ chatId, type: 'message', message: msg });
      } else if (m.type === 'result') {
        if ((m as { queued_turn_count?: number }).queued_turn_count || inbox.length) continue; // something handed over mid-turn still has its own turn coming: this chat is not done yet
        const ok = m.subtype === 'success' && !m.is_error;
        // The model's window comes with the result: the meter's scale, kept with the session for the next time it opens.
        const models = Object.entries(m.modelUsage ?? {}); const mine = models.find(([id]) => id === model) ?? models.sort((a, b) => b[1].contextWindow - a[1].contextWindow)[0];
        if (ctx && mine && mine[1].contextWindow > 0) tell({ ...ctx, window: mine[1].contextWindow, ...(mine[1].maxOutputTokens > 0 ? { maxOutput: mine[1].maxOutputTokens } : {}), model: ctx.model || mine[0] });
        if (req.compact && ctx && boundary && boundary.post === undefined) { // compacted, but not told the size after it: the harness's own estimate
          const r = await Promise.race([entry.q.getContextUsage({ detail: 'summary' }).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2000))]);
          if (r && typeof r.totalTokens === 'number' && r.totalTokens > 0) { boundary.post = r.totalTokens; tell({ ...ctx, used: r.totalTokens, at: Date.now() }); } }
        if (compactAt) compacted(!!boundary); // a compaction that never said how it ended
        if (sessionId && ctx && ctx.window > 0) void saveContext(req.projectId, sessionId, ctx).catch(() => { /* shown, just not kept */ });
        live.delete(chatId); // the turn is over for the UI; the next message may start while the process winds down
        const error = 'result' in m && typeof m.result === 'string' ? m.result : m.subtype;
        const unsent = steers.filter((at) => at > lastStart).length;
        send({ chatId, type: 'done', ok, sessionId, durationMs: m.duration_ms, costUsd: m.total_cost_usd, ...(unsent ? { unsent } : {}), ...(ok ? {} : { error, ...(tooLong(m.terminal_reason, error) ? { tooLong: true } : {}) }) });
        ended = true; closed = true; (wake as (() => void) | null)?.(); break; // leaving the loop closes the SDK iterator, which shuts the process down
      }
    }
    // The stream can end without a last result (a result that announced a queued turn that never came, or the process going away):
    // the window must still hear that the turn is over, or it waits for ever and everything said is queued behind nothing.
    if (!ended) { live.delete(chatId); send({ chatId, type: 'done', ok: true, sessionId }); }
  } catch (e) {
    const aborted = abort.signal.aborted;
    const unsent = steers.filter((at) => at > lastStart).length;
    send({ chatId, type: 'done', ok: aborted, sessionId, ...(unsent ? { unsent } : {}), ...(aborted ? {} : { error: e instanceof Error ? e.message : String(e) }) });
  } finally {
    closed = true; (wake as (() => void) | null)?.();
    for (const finish of entry.pending.values()) finish('deny');
    if (live.get(chatId) === entry) live.delete(chatId);
  }
}

/** Every turn running right now, Claude and Codex: a window that reloads takes them back by these ids. */
export function liveList(): { chatId: string; projectId: string; sessionId: string | null }[] { return [...live.entries()].map(([chatId, l]) => ({ chatId, projectId: l.projectId, sessionId: l.sessionId })).concat(codex.liveList()); }
/** Is a turn of this chat running in this process (Claude here, or Codex there)? The window asks when a hand-over fails. */
export function isRunning(chatId: string): boolean { return live.has(chatId) || codex.isRunning(chatId); }
/** Hand a message to the turn that is running, without interrupting it. False when there is no running turn to take it. */
// ---------- the app's own tools for a Claude session: the same channel as the message-agent block (the window routes both), for the
// models that look for a tool when the user says "talk to X" (one searched its harness and a chat skill instead). Answered by the window.
let agentRequest: (chatId: string, req: AgentRequest) => Promise<string> = async () => 'The app is not ready to route messages yet.';
export function setAgentRequest(fn: typeof agentRequest): void { agentRequest = fn; }
export function liveInfo(chatId: string): { projectId: string; sessionId: string | null } | null { const e = live.get(chatId); return e ? { projectId: e.projectId, sessionId: e.sessionId } : null; }
function jauvexTools(chatId: string) {
  return createSdkMcpServer({ name: 'jauvex', version: '1.0.0', tools: [
    tool('message_agent', 'Send a message to another agent of this Jauvex app (Claude or Codex), by its name or its short id in brackets. The app delivers it; their reply comes back to you later, as a message that starts with (from agent "<name>" [<id>]). Use it whenever the user asks you to talk to, ask, tell or hand something to another agent in this app. It is the same channel as a fenced message-agent block in your reply.',
      { to: z.string().describe("The agent's name, or its id in brackets"), text: z.string().describe('What to tell or ask them: short and self-contained, they see nothing of your conversation') },
      async ({ to, text }) => ({ content: [{ type: 'text' as const, text: await agentRequest(chatId, { type: 'message', to, text }) }] })),
    tool('list_agents', 'The agents in this Jauvex app right now: name, id, provider, folder, working or idle.', {}, async () => ({ content: [{ type: 'text' as const, text: await agentRequest(chatId, { type: 'list' }) }] })),
  ] });
}
export async function steerChat(chatId: string, text: string, images?: Attachment[]): Promise<boolean> {
  const entry = live.get(chatId); if (!entry) return codex.steerChat(chatId, text, images);
  entry.push(text, images); return true;
}
export function answerPermission(chatId: string, requestId: string, decision: PermissionDecision): boolean {
  const finish = live.get(chatId)?.pending.get(requestId); if (!finish) return codex.answerPermission(chatId, requestId, decision); finish(decision); return true;
}
export async function stopChat(chatId: string): Promise<boolean> {
  const entry = live.get(chatId); if (!entry) return codex.stopChat(chatId);
  try { await entry.q.interrupt(); } catch { /* not in a state that can be interrupted */ }
  entry.abort.abort(); return true;
}
export function stopAll(): void { for (const id of live.keys()) void stopChat(id); codex.stopAll(); }
