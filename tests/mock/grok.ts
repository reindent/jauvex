#!/usr/bin/env node
// A stand-in for `grok agent stdio` (the app runs it when CVC_GROK_BIN points here): checks and containers with no Grok account get
// sessions that work. It speaks the Agent Client Protocol the way Grok Build does (electron/grok.ts; shapes seen from Grok 1.0.41):
// initialize with the models in _meta.modelState, sessions (new, resume, load with the history replayed, list, close, config options),
// prompts streamed as session/update chunks with Grok's own x.ai notifications (response_completed, queue/changed, prompt_complete),
// cancel, and the x.ai extensions the app uses (auth info and logout, interject, rename, delete). Every message gets one short canned reply
// that quotes what it got, signed with this machine's name. Sessions are kept in <GROK_HOME>/mock-sessions/<id>.json. No network.
// In a message: [[tool]] runs a shell command that asks permission first; [[image]] makes a picture the way Grok's imagine does (saved in
// the session's own folder, the answer linking it as images/1.png); [[too long]] does not fit; [[slow end]] lingers after its last
// step (a message handed over then gets a prompt of its own, as Grok does); /compact compacts.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
if (!(args[0] === 'agent' && args.includes('stdio'))) { console.log(args.includes('--version') ? 'grok 0.0.0 (stand-in)' : 'The Grok stand-in only runs as `grok agent stdio`.'); process.exit(0); }
const out = (m) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
const note = (method, params) => out({ method, params });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 40); // between two streamed pieces
const dir = path.join(process.env.GROK_HOME || path.join(os.homedir(), '.grok'), 'mock-sessions');
const CTX = Number(process.env.MOCK_CONTEXT_TOKENS ?? 0); const WINDOW = Number(process.env.MOCK_CONTEXT_WINDOW ?? 500000);
const efforts = [{ id: 'low', value: 'low', label: 'Low', default: false }, { id: 'high', value: 'high', label: 'High', default: true }];
const MODELS = { currentModelId: 'mock', availableModels: [{ modelId: 'mock', name: 'Mock', description: 'The stand-in: canned replies, no model', _meta: { totalContextTokens: WINDOW, reasoningEfforts: efforts } }, { modelId: 'mock-fast', name: 'Mock Fast', description: 'Fast variant of the stand-in', _meta: { totalContextTokens: WINDOW, reasoningEfforts: efforts } }] };

// sessions: { id, cwd, title, updatedAt, model, effort, rules, prompt (systemPromptOverride), history: [{ update, meta }] }
const sessions = new Map();
if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.json')) { try { const s = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); sessions.set(s.id, s); } catch { /* a broken file */ } }
const save = (s) => { mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s)); };
const get = (id) => { const s = sessions.get(id); if (!s) throw Object.assign(new Error('Resource not found'), { code: -32002, data: `session not found: ${id}` }); return s; };
const models = (s) => ({ ...MODELS, currentModelId: s?.model || MODELS.currentModelId });

const LINES = ['Nothing ran: I am the stand-in for Grok, here so the app can be checked without an account.', 'No model was asked: this is a canned reply.', 'Every message gets the same kind of answer from me.'];
function replyTo(text) {
  const said = text.replace(/\s+/g, ' ').trim(); const quote = said.length > 300 ? `${said.slice(0, 120)} … ${said.slice(-120)}` : said;
  return `(mock Grok on ${os.hostname()}) I got: "${quote}". ${LINES[Math.floor(Math.random() * LINES.length)]}`;
}
const textOf = (blocks) => (blocks ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');

// What happens in a session is kept as its history (what `session/load` replays) and sent live.
const update = (s, u, extra = {}) => { s.history.push({ method: 'session/update', update: u }); note('session/update', { sessionId: s.id, update: u, _meta: { ...extra } }); };
const xai = (s, u, keep = false) => { if (keep) s.history.push({ method: '_x.ai/session/update', update: u }); note('_x.ai/session_notification', { sessionId: s.id, update: u }); };

const running = new Map(); // sessionId -> { promptId, inbox: [text], cut, lastCall }
const waitingForUs = new Map(); // our request id -> resolve (permission answers)
let nextRequest = 0;
function ask(method, params): Promise<any> { return new Promise((resolve) => { const id = nextRequest++; waitingForUs.set(id, resolve); out({ id, method, params }); }); }

async function modelCall(s, live, text, promptId) {
  const call = { input_tokens: CTX, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }; // with MOCK_CONTEXT_TOKENS: every call carried that many tokens
  update(s, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'The user wrote something; the stand-in answers it.' } }, { promptId });
  if (text.includes('[[tool]]')) { // a shell command Grok's rules do not allow already: it asks first
    const toolCallId = `call-${randomUUID()}-0`; const tool = { version: 1, name: 'run_terminal_command', kind: 'execute', namespace: 'grok_build', label: 'Run Command', read_only: false };
    update(s, { sessionUpdate: 'tool_call', toolCallId, title: 'run_terminal_command', rawInput: { command: 'ls', description: 'List the folder' }, _meta: { 'x.ai/tool': tool } }, { promptId });
    const answer = await ask('session/request_permission', { sessionId: s.id, toolCall: { toolCallId, kind: 'execute', title: 'Execute `ls`', rawInput: { variant: 'Bash', command: 'ls', description: 'List the folder', is_background: false }, _meta: { 'x.ai/tool': tool } },
      options: [{ optionId: 'always-allow', name: "Yes, and don't ask again for bash commands", kind: 'allow_always' }, { optionId: 'allow-once', name: 'Yes, proceed', kind: 'allow_once' }, { optionId: 'reject-once', name: 'No, and tell Grok what to do differently', kind: 'reject_once' }, { optionId: 'reject-always', name: "No, and don't ask again for this command", kind: 'reject_always' }] });
    const allowed = answer?.outcome?.outcome === 'selected' && /^allow|^always-allow/.test(answer.outcome.optionId);
    update(s, { sessionUpdate: 'tool_call_update', toolCallId, kind: 'execute', title: 'Execute `ls`', status: allowed ? 'completed' : 'failed', content: [{ type: 'content', content: { type: 'text', text: allowed ? `\u001b[1m(mock) ran ls in ${s.cwd}\u001b[0m\n` : 'The user declined this command.' } }], rawInput: { variant: 'Bash', command: 'ls', description: 'List the folder', is_background: false }, rawOutput: { type: 'Bash', exit_code: allowed ? 0 : 1 }, _meta: { 'x.ai/tool': tool } }, { promptId });
    xai(s, { sessionUpdate: 'response_completed', usage: call });
    update(s, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'The command ran; now the answer.' } }, { promptId });
  }
  let picture = '';
  if (text.includes('[[image]]')) { // Grok's imagine: the picture is saved in the session's folder, the tool's output names it, the answer links it relative to that folder
    const toolCallId = `call-${randomUUID()}-0`; const folder = path.join(dir, s.id, 'images'); mkdirSync(folder, { recursive: true }); const file = path.join(folder, '1.png');
    writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    const tool = { version: 1, name: 'imagine', kind: 'other', namespace: 'grok_build', label: 'Imagine', read_only: false };
    update(s, { sessionUpdate: 'tool_call', toolCallId, title: 'imagine', rawInput: { prompt: 'a small red dot' }, _meta: { 'x.ai/tool': tool } }, { promptId });
    update(s, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed', content: [{ type: 'content', content: { type: 'text', text: `Image generated and saved to ${file}.` } }], rawOutput: { type: 'ImageGen', path: file, filename: '1.png', session_folder: 'images' }, _meta: { 'x.ai/tool': tool } }, { promptId });
    picture = ' ![a small red dot](images/1.png)';
  }
  for (const piece of `${replyTo(text.replace('[[tool]]', '').replace('[[image]]', '').trim() || text)}${picture}`.match(/\S+\s*/g) ?? []) { if (live.cut) break; update(s, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: piece } }, { promptId }); await sleep(DELAY); }
  xai(s, { sessionUpdate: 'response_completed', usage: call }); return call;
}
type Live = { promptId: string; inbox: string[]; cut: boolean; last: boolean; late?: string[] };
async function runPrompt(s, promptId: string, first: string, respond?: (result: unknown) => void) {
  const live: Live = { promptId, inbox: [first], cut: false, last: false }; running.set(s.id, live);
  note('_x.ai/queue/changed', { sessionId: s.id, entries: [], runningPromptId: promptId, runningText: first, runningKind: 'prompt' });
  let usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | null = null; const started = Date.now();
  if (/^\/compact\b/.test(first.trim())) { // Grok's own /compact: it says only that it is done, with the tokens before and after
    await sleep(DELAY * 3); xai(s, { sessionUpdate: 'auto_compact_completed', tokens_before: CTX, tokens_after: Math.round(CTX / 20) });
    usage = { input_tokens: Math.round(CTX / 20), output_tokens: 0 }; live.inbox.shift();
  }
  while (live.inbox.length && !live.cut) {
    const text = live.inbox.shift() ?? ''; live.last = false;
    if (!s.title) s.title = text.slice(0, 60);
    s.history.push({ method: 'session/update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } });
    usage = await modelCall(s, live, text, promptId);
    if (!live.inbox.length) { live.last = true; await sleep(text.includes('[[slow end]]') ? 400 : DELAY * 2); } // the last step: a message handed over from now on gets a prompt of its own
  }
  running.delete(s.id); s.updatedAt = new Date().toISOString(); save(s);
  const stopReason = live.cut ? 'cancelled' : 'end_turn';
  xai(s, { sessionUpdate: 'turn_completed', prompt_id: promptId, stop_reason: stopReason, elapsed_ms: Date.now() - started }, true);
  note('_x.ai/session/prompt_complete', { sessionId: s.id, promptId, stopReason, agentResult: null });
  note('_x.ai/queue/changed', { sessionId: s.id, entries: [] });
  const used = usage ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) : 0;
  respond?.({ stopReason, _meta: { sessionId: s.id, promptId, modelId: s.model || 'mock', ...(CTX > 0 && used ? { inputTokens: used, totalTokens: used + 20 } : {}) } });
  for (const t of live.late ?? []) void runPrompt(s, `interject-fallback-${randomUUID()}`, t); // what came after the last step: Grok runs it as a prompt of its own
}

const methods = {
  initialize: () => ({ protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { image: false, audio: false, embeddedContext: true }, sessionCapabilities: { list: {}, resume: {}, close: {} } }, authMethods: [{ id: 'cached_token', name: 'cached_token' }], _meta: { agentVersion: '0.0.0-stand-in', modelState: MODELS } }),
  'session/new': (p) => {
    const m = p._meta ?? {}; const s = { id: randomUUID(), cwd: p.cwd || process.cwd(), title: null, updatedAt: new Date().toISOString(), model: m.modelId || 'mock', effort: m.reasoningEffort || 'high', rules: m.rules ?? '', prompt: m.systemPromptOverride ?? '', autoMode: !!m.autoMode, history: [] };
    sessions.set(s.id, s); save(s); return { sessionId: s.id, models: models(s), configOptions: [] };
  },
  'session/resume': (p) => { const s = get(p.sessionId); if (p._meta?.reasoningEffort) s.effort = p._meta.reasoningEffort; return { models: models(s), configOptions: [] }; },
  'session/load': (p) => { const s = get(p.sessionId); for (const h of s.history) note(h.method, { sessionId: s.id, update: h.update, _meta: { isReplay: true } }); return { models: models(s), configOptions: [] }; },
  'session/close': () => ({}),
  'session/list': (p) => ({ sessions: [...sessions.values()].filter((s) => s.history.length && (!p.cwd || s.cwd === p.cwd)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => ({ sessionId: s.id, cwd: s.cwd, title: s.title, updatedAt: s.updatedAt, _meta: { 'x.ai/session': { kind: 'build', facets: { cwd: s.cwd } } } })) }),
  'session/set_config_option': (p) => { const s = get(p.sessionId); if (p.configId === 'model') { if (!MODELS.availableModels.some((m) => m.modelId === p.value)) throw Object.assign(new Error('Invalid params'), { code: -32602, data: `unknown model ${p.value}` }); s.model = p.value; } else if (p.configId === 'reasoning_effort') s.effort = p.value; else throw Object.assign(new Error('Invalid params'), { code: -32602, data: `unknown config option: ${p.configId}` }); save(s); return { configOptions: [] }; },
  'session/prompt': (p, respond) => {
    const s = get(p.sessionId); if (running.has(s.id)) throw new Error('a prompt is already running in this session');
    const text = textOf(p.prompt);
    if (text.includes('[[too long]]')) throw Object.assign(new Error('Internal error'), { code: -32603, data: 'Prompt is too long: the request exceeds the context window' });
    void runPrompt(s, randomUUID(), text, respond); return undefined; // answered when the prompt is over
  },
  '_x.ai/auth/info': () => ({ methodId: 'cached_token', email: 'mock@localhost', firstName: 'Mock', teamName: null }),
  '_x.ai/auth/logout': () => ({ ok: true, was_logged_in: true }),
  '_x.ai/billing': () => { const now = Date.now(); const period = { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: new Date(now - 2 * 86400_000).toISOString(), end: new Date(now + 5 * 86400_000).toISOString() }; // with MOCK_USAGE: a plan with some credits used
    return { config: { ...(process.env.MOCK_USAGE ? { creditUsagePercent: 35 } : {}), currentPeriod: period, onDemandCap: {}, onDemandUsed: {}, prepaidBalance: {} }, subscription_tier: 'Mock' }; },
  '_x.ai/interject': (p) => { const s = get(p.sessionId); const live = running.get(s.id); const text = p.text ?? textOf(p.content);
    if (live && !live.last) live.inbox.push(text); else if (live) (live.late ??= []).push(text); else void runPrompt(s, `interject-fallback-${randomUUID()}`, text);
    note('_x.ai/session/interjection', { sessionId: s.id, text }); return { result: { status: 'queued' } }; },
  '_x.ai/session/rename': (p) => { const s = get(p.sessionId); s.title = p.title; save(s); return { result: { ok: true } }; },
  '_x.ai/session/delete': (p) => { sessions.delete(p.sessionId); rmSync(path.join(dir, `${p.sessionId}.json`), { force: true }); return { result: { ok: true } }; },
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === undefined) { const w = waitingForUs.get(m.id); if (w) { waitingForUs.delete(m.id); w(m.result); } return; } // an answer to our request
  if (m.method === 'session/cancel') { const live = running.get(m.params?.sessionId); if (live) live.cut = true; return; } // a card still open waits for the client's "cancelled", as the protocol has it
  if (m.id === undefined) return; // another notification
  const fn = methods[m.method];
  if (!fn) { out({ id: m.id, error: { code: -32601, message: 'Method not found', data: `${m.method} is not in the stand-in` } }); return; }
  try { const r = fn(m.params ?? {}, (result) => out({ id: m.id, result })); if (r !== undefined) out({ id: m.id, result: r }); }
  catch (e) { out({ id: m.id, error: { code: e.code ?? -32603, message: e.message, ...(e.data ? { data: e.data } : {}) } }); }
}).on('close', () => process.exit(0));
