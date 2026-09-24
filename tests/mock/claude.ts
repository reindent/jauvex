#!/usr/bin/env node
// A stand-in for the Claude Code binary (the app runs it when CVC_CLAUDE_BIN points here): checks and containers with no Claude
// account get sessions that work. It speaks the Agent SDK's stream-json protocol: every control request is answered, every user
// message gets one short canned reply that quotes what it got (a check finds its own words in it), streamed in pieces like a
// model's, signed with this machine's name. Sessions are filed where Claude Code files them (<config>/projects/<the folder, dashed>/<id>.jsonl), so the app lists
// them and reads them back, and a resumed session goes on in the same file. `auth status --json` says signed in. No network.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
if (args[0] === 'auth') {
  if (args[1] === 'status') console.log(JSON.stringify(process.env.MOCK_CLAUDE_SIGNED_OUT ? { loggedIn: false } : { loggedIn: true, authMethod: 'mock', email: 'mock@localhost', subscriptionType: 'mock' })); // MOCK_CLAUDE_SIGNED_OUT: a Mac where Claude Code is not signed in
  else console.log(`(mock) auth ${args[1] ?? ''}: nothing to do, the stand-in is always signed in`);
  process.exit(0);
}
if (args.includes('--version')) { console.log('0.0.0 (Claude Code stand-in)'); process.exit(0); }

const flag = (name) => { for (let i = 0; i < args.length; i++) { if (args[i] === name) return args[i + 1]; if (args[i].startsWith(`${name}=`)) return args[i].slice(name.length + 1); } return undefined; };
const out = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cwd = process.cwd();
const model = flag('--model') || 'mock';
const sessionId = flag('--resume') || flag('--session-id') || randomUUID();
const persist = !args.includes('--no-session-persistence');
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 40); // between two streamed pieces
const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
const file = path.join(dir, `${sessionId}.jsonl`);

// the session file: one entry per message, each pointing at the one before (a resumed session goes on from its last message)
let parent: string | null = null;
if (persist && existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) { try { const e = JSON.parse(line); if (e.uuid && (e.type === 'user' || e.type === 'assistant')) parent = e.uuid; } catch { /* a partial line */ } }
function record(type, message) {
  const uuid = randomUUID(); if (!persist) return uuid;
  mkdirSync(dir, { recursive: true });
  appendFileSync(file, `${JSON.stringify({ parentUuid: parent, isSidechain: false, userType: 'external', cwd, sessionId, version: 'mock', gitBranch: '', type, message, uuid, timestamp: new Date().toISOString() })}\n`);
  parent = uuid; return uuid;
}

const LINES = ['Nothing ran: I am the stand-in for Claude, here so the app can be checked without an account.', 'No model was asked: this is a canned reply.', 'Every message gets the same kind of answer from me.'];
const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '');
function replyTo(text) {
  const said = text.replace(/\s+/g, ' ').trim(); const quote = said.length > 300 ? `${said.slice(0, 120)} … ${said.slice(-120)}` : said; // both ends: a prelude comes first, the words last
  return `(mock Claude on ${os.hostname()}) I got: "${quote}". ${LINES[Math.floor(Math.random() * LINES.length)]}`;
}
const USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
// The context (T-74): MOCK_CONTEXT_TOKENS makes every request carry that many tokens, of a MOCK_CONTEXT_WINDOW window (0: all zeros, as before).
// "/compact" compacts it (the harness's status, boundary and result), and a message with [[too long]] in it does not fit.
const CTX = Number(process.env.MOCK_CONTEXT_TOKENS ?? 0); const WINDOW = Number(process.env.MOCK_CONTEXT_WINDOW ?? 200000);
const usage = () => (CTX > 0 ? { input_tokens: 2, output_tokens: 20, cache_creation_input_tokens: 98, cache_read_input_tokens: CTX - 100 } : USAGE);
const modelUsage = () => (CTX > 0 ? { [model]: { inputTokens: CTX, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0, contextWindow: WINDOW, maxOutputTokens: 32000 } } : {});
const result = (started, text, extra = {}) => out({ type: 'result', subtype: 'success', is_error: false, duration_ms: Date.now() - started, duration_api_ms: 0, num_turns: 1, result: text, stop_reason: 'end_turn', session_id: sessionId, total_cost_usd: 0, usage: USAGE, modelUsage: modelUsage(), permission_denials: [], queued_turn_count: queue.length, uuid: randomUUID(), ...extra });

// one message at a time; what arrives during a reply waits its turn and the result says so (queued_turn_count), the way a steer does
const queue: any[] = []; let busy = false; let cut = false; let ended = false; let announced = false;
async function work() {
  if (busy) return; busy = true;
  while (queue.length) {
    const m = queue.shift()!; const started = Date.now(); cut = false;
    if (!announced) { announced = true; out({ type: 'system', subtype: 'init', cwd, session_id: sessionId, tools: [], mcp_servers: [], model, permissionMode: flag('--permission-mode') || 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: 'mock', output_style: 'default', agents: [], skills: [], plugins: [], uuid: randomUUID() }); }
    const content = m.message?.content ?? ''; record('user', { role: 'user', content });
    if (/^\/compact\b/.test(textOf(content).trim())) { // the harness's own /compact: nothing goes to a model
      const sys = (x) => out({ type: 'system', session_id: sessionId, uuid: randomUUID(), ...x });
      sys({ subtype: 'status', status: 'compacting' }); await sleep(DELAY * 3);
      sys({ subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: CTX, post_tokens: Math.round(CTX / 20), duration_ms: DELAY * 3 } });
      sys({ subtype: 'status', status: null, compact_result: 'success' });
      result(started, 'Compacted'); continue;
    }
    if (textOf(content).includes('[[too long]]')) { // what the harness says when a message does not fit: an error of its own, then the result
      const message = { id: `msg_mock_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'Prompt is too long' }], stop_reason: 'stop_sequence', stop_sequence: '', usage: USAGE };
      out({ type: 'assistant', message, parent_tool_use_id: null, error: 'invalid_request', session_id: sessionId, uuid: record('assistant', message) });
      result(started, 'Prompt is too long', { is_error: true, terminal_reason: 'prompt_too_long', modelUsage: {} }); continue;
    }
    let said = ''; out({ type: 'stream_event', event: { type: 'message_start', message: { id: `msg_mock_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model, content: [], usage: usage() } }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() }); // a request starts: what was handed over before it is in it
    for (const piece of replyTo(textOf(content)).match(/\S+\s*/g) ?? []) {
      if (cut) break; said += piece;
      out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }, parent_tool_use_id: null, session_id: sessionId, uuid: randomUUID() });
      await sleep(DELAY);
    }
    const message = { id: `msg_mock_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model, content: [{ type: 'text', text: said.trim() }], stop_reason: 'end_turn', stop_sequence: null, usage: usage() };
    out({ type: 'assistant', message, parent_tool_use_id: null, session_id: sessionId, uuid: record('assistant', message) });
    result(started, said.trim());
  }
  busy = false; if (ended) process.exit(0);
}

// The plan's usage (T-98): with MOCK_USAGE set, /usage answers a Max plan with a 5-hour window, a week, Fable's own week and extra usage.
const inMin = (m) => new Date(Date.now() + m * 60_000).toISOString();
const USAGE_REPORT = () => (process.env.MOCK_USAGE ? { subscription_type: 'max', rate_limits_available: true, rate_limits: { five_hour: { utilization: 62, resets_at: inMin(134) }, seven_day: { utilization: 18, resets_at: inMin(4 * 1440 + 180) },
  model_scoped: [{ display_name: 'Fable', utilization: 40, resets_at: inMin(4 * 1440 + 180) }], extra_usage: { is_enabled: true, monthly_limit: 100, used_credits: 24, utilization: 24, currency: 'USD' } } } : { rate_limits_available: false });
const INIT = { commands: [], agents: [], output_style: 'default', available_output_styles: ['default'], models: [{ value: 'mock', displayName: 'Mock', description: 'The stand-in: canned replies, no model' }], account: { email: 'mock@localhost', subscriptionType: 'mock' } };
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.type === 'control_request') {
    const sub = m.request?.subtype; if (sub === 'interrupt') { cut = true; queue.length = 0; }
    out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: sub === 'initialize' ? INIT : sub === 'get_usage' ? USAGE_REPORT() : {} } });
  } else if (m.type === 'user') { queue.push(m); void work(); }
}).on('close', () => { ended = true; if (!busy) process.exit(0); });
