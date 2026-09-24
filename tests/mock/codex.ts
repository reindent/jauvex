#!/usr/bin/env node
// A stand-in for `codex app-server` (the app runs it when CVC_CODEX_BIN points here): checks and containers with no Codex account
// get sessions that work. It answers the JSON-RPC methods the app uses (electron/codex.ts): the account (signed in), the models (one),
// threads (start, resume, list, read, items, name) and turns: every message gets one short canned reply that quotes what it got,
// streamed in pieces like a model's, signed with this machine's name. Threads are kept in <CODEX_HOME>/mock-threads/<id>.json (ephemeral ones in memory only),
// so the app lists them and reads them back after a restart. No network.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

if (process.argv[2] !== 'app-server') { console.log(process.argv.includes('--version') ? 'codex-cli 0.0.0 (stand-in)' : 'The Codex stand-in only runs as `codex app-server`.'); process.exit(0); }
const out = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 40); // between two streamed pieces
const dir = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'mock-threads');

// threads: { thread, items: [{ turnId, item }], ephemeral }
const threads = new Map();
if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.json')) { try { const t = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); threads.set(t.thread.id, t); } catch { /* a broken file */ } }
const save = (t) => { if (t.ephemeral) return; mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${t.thread.id}.json`), JSON.stringify({ thread: t.thread, items: t.items })); };
const get = (id) => { const t = threads.get(id); if (!t) throw Object.assign(new Error(`no thread ${id}`), { code: -32602 }); return t; };

const LINES = ['Nothing ran: I am the stand-in for Codex, here so the app can be checked without an account.', 'No model was asked: this is a canned reply.', 'Every message gets the same kind of answer from me.'];
const textOf = (input) => (input ?? []).filter((i) => i?.type === 'text').map((i) => i.text).join('\n');
function replyTo(text) {
  const said = text.replace(/\s+/g, ' ').trim(); const quote = said.length > 300 ? `${said.slice(0, 120)} … ${said.slice(-120)}` : said; // both ends: a prelude comes first, the words last
  return `(mock Codex on ${os.hostname()}) I got: "${quote}". ${LINES[Math.floor(Math.random() * LINES.length)]}`;
}

const running = new Map(); // threadId -> { turn, inbox: [text], cut }
// The context (T-74): MOCK_CONTEXT_TOKENS makes every answer report that many tokens of a MOCK_CONTEXT_WINDOW window (0: no report, as before);
// thread/compact/start compacts (a turn of its own, as the app-server does it), and a message with [[too long]] in it does not fit.
const CTX = Number(process.env.MOCK_CONTEXT_TOKENS ?? 0); const WINDOW = Number(process.env.MOCK_CONTEXT_WINDOW ?? 258400);
const breakdown = (n) => ({ totalTokens: n, inputTokens: Math.max(0, n - 20), cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: Math.min(n, 20), reasoningOutputTokens: 0 });
const tokenUsage = (threadId, turnId, n) => { if (CTX > 0) out({ method: 'thread/tokenUsage/updated', params: { threadId, turnId, tokenUsage: { total: breakdown(n), last: breakdown(n), modelContextWindow: WINDOW } } }); };
async function compactTurn(t, turn) {
  const threadId = t.thread.id; running.set(threadId, { turn, inbox: [], cut: false }); const started = Date.now(); const item = { type: 'contextCompaction', id: randomUUID() };
  out({ method: 'turn/started', params: { threadId, turn } }); out({ method: 'item/started', params: { threadId, turnId: turn.id, item } }); await sleep(DELAY * 3);
  tokenUsage(threadId, turn.id, Math.round(CTX / 20)); out({ method: 'item/completed', params: { threadId, turnId: turn.id, item } });
  running.delete(threadId); out({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: 'completed', durationMs: Date.now() - started } } });
}
async function runTurn(t, turn, first) {
  const threadId = t.thread.id; const live = { turn, inbox: [first], cut: false }; running.set(threadId, live); const started = Date.now();
  out({ method: 'turn/started', params: { threadId, turn } });
  while (live.inbox.length && !live.cut) {
    const input = live.inbox.shift(); const user = { type: 'userMessage', id: randomUUID(), content: input };
    t.items.push({ turnId: turn.id, item: user }); out({ method: 'item/started', params: { threadId, turnId: turn.id, item: user } }); out({ method: 'item/completed', params: { threadId, turnId: turn.id, item: user } });
    const text = textOf(input); if (!t.thread.preview) t.thread.preview = text.slice(0, 200);
    if (text.includes('[[too long]]')) { // the model's window is exceeded: an error, and the turn fails
      const error = { message: "Codex ran out of room in the model's context window. Start a new thread or clear earlier history before retrying.", codexErrorInfo: 'contextWindowExceeded', additionalDetails: null };
      out({ method: 'error', params: { threadId, turnId: turn.id, error, willRetry: false } }); running.delete(threadId);
      out({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: 'failed', error, durationMs: Date.now() - started } } }); return;
    }
    const itemId = randomUUID(); let said = '';
    out({ method: 'item/started', params: { threadId, turnId: turn.id, item: { type: 'agentMessage', id: itemId, text: '' } } });
    for (const piece of replyTo(text).match(/\S+\s*/g) ?? []) { if (live.cut) break; said += piece; out({ method: 'item/agentMessage/delta', params: { threadId, turnId: turn.id, itemId, delta: piece } }); await sleep(DELAY); }
    const item = { type: 'agentMessage', id: itemId, text: said.trim() }; t.items.push({ turnId: turn.id, item });
    out({ method: 'item/completed', params: { threadId, turnId: turn.id, item } }); tokenUsage(threadId, turn.id, CTX);
  }
  running.delete(threadId); t.thread.updatedAt = now(); save(t);
  out({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: live.cut ? 'interrupted' : 'completed', durationMs: Date.now() - started } } });
}

const MODELS = [{ id: 'mock', model: 'mock', displayName: 'Mock', description: 'The stand-in: canned replies, no model', hidden: false, isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium' }];
const methods = {
  initialize: () => ({ userAgent: 'codex-stand-in/0.0.0' }),
  'account/read': () => ({ account: { type: 'chatgpt', email: 'mock@localhost', planType: 'mock' }, requiresOpenaiAuth: false }),
  'account/logout': () => ({}),
  'account/login/start': () => { const loginId = randomUUID(); setTimeout(() => out({ method: 'account/login/completed', params: { loginId, success: true, error: null } }), 200); return { type: 'chatgpt', loginId, authUrl: 'http://localhost/mock-sign-in' }; },
  'account/login/cancel': () => ({}),
  'account/rateLimits/read': () => { // with MOCK_USAGE (T-98): a Pro plan's 5 hours and week, credits, and a model's own extra limit
    if (!process.env.MOCK_USAGE) return { rateLimits: { primary: null, secondary: null, planType: 'mock' } };
    const at = (m) => Math.floor(Date.now() / 1000) + m * 60; const main = { limitId: 'codex', limitName: null, normalModelSlug: null, primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: at(90) }, secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: at(3 * 1440) }, credits: { hasCredits: true, unlimited: false, balance: '42' }, planType: 'pro' };
    return { rateLimits: main, rateLimitsByLimitId: { codex: main, codex_astra: { ...main, limitId: 'codex_astra', limitName: 'gpt-6-astra', primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: at(200) }, secondary: null, credits: null } } };
  },
  'model/list': () => ({ data: MODELS, nextCursor: null }),
  'thread/start': (p) => {
    const thread = { id: randomUUID(), preview: '', name: null, createdAt: now(), updatedAt: now(), cwd: p.cwd || process.cwd(), gitInfo: null, modelProvider: 'mock' };
    const t = { thread, items: [], ephemeral: !!p.ephemeral }; threads.set(thread.id, t); save(t); return { thread, model: p.model || 'mock' };
  },
  'thread/resume': (p) => ({ thread: get(p.threadId).thread, model: p.model || 'mock' }),
  'thread/list': () => ({ data: [...threads.values()].filter((t) => !t.ephemeral && t.items.length).map((t) => t.thread).sort((a, b) => b.updatedAt - a.updatedAt), nextCursor: null }),
  'thread/read': (p) => ({ thread: get(p.threadId).thread }),
  'thread/items/list': (p) => ({ data: get(p.threadId).items, nextCursor: null }),
  'thread/name/set': (p) => { const t = get(p.threadId); t.thread.name = p.name; t.thread.updatedAt = now(); save(t); return {}; },
  'turn/start': (p) => {
    const t = get(p.threadId); if (running.has(p.threadId)) throw new Error('a turn is already running on this thread');
    const turn = { id: randomUUID(), items: [], status: 'inProgress', error: null, durationMs: null };
    setTimeout(() => void runTurn(t, turn, p.input), 0); return { turn };
  },
  'thread/compact/start': (p) => {
    const t = get(p.threadId); if (running.has(p.threadId)) throw new Error('a turn is already running on this thread');
    const turn = { id: randomUUID(), items: [], status: 'inProgress', error: null, durationMs: null }; setTimeout(() => void compactTurn(t, turn), 0); return {};
  },
  'turn/steer': (p) => { const live = running.get(p.threadId); if (!live || (p.expectedTurnId && live.turn.id !== p.expectedTurnId)) throw new Error('no active turn to steer'); live.inbox.push(p.input); return { turnId: live.turn.id }; },
  'turn/interrupt': (p) => { const live = running.get(p.threadId); if (live) live.cut = true; return {}; },
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined || !m.method) return; // a notification (initialized), or an answer to a request of ours (there are none)
  const fn = methods[m.method];
  if (!fn) { out({ id: m.id, error: { code: -32601, message: `${m.method} is not in the stand-in` } }); return; }
  try { out({ id: m.id, result: fn(m.params ?? {}) }); } catch (e) { out({ id: m.id, error: { code: e.code ?? -32000, message: e.message } }); }
}).on('close', () => process.exit(0));
