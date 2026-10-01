// The agents' turns in the debugger's Model tab (T-260; the user, 2026-10-01: "It has only Jev. But it doesn't say anything that is going on
// with Claude or Codex or Grok. I want to be able to see that and that should be logged as well"): what a turn's start and each of its events
// become, and how many lines each tab keeps.
import { agentWho, eventLines, keep, KEEP, steered, toolHint, turnStart } from '../shared/agent-log.js';
import type { ChatEvent, DebugEvent } from '../shared/types.js';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${got}`}`); if (!ok) failed++; };
const msg = (role: 'assistant' | 'user' | 'system', blocks: any[], extra = {}): ChatEvent => ({ chatId: 'c', type: 'message', message: { uuid: 'u', role, blocks, meta: false, ...extra } });

check('who: the provider, the session\'s start and the folder', agentWho('codex', '019a2b3c-dead', 'reindent') === 'Codex 019a2b · reindent' && agentWho('grok', null, 'x') === 'Grok new · x');
const start = turnStart({ text: 'Fix the\nbutton', model: 'opus', effort: 'high', voice: true, images: 2 });
check('a turn\'s start: what was sent and with what', start.text === 'turn starts (model opus, effort high, by voice, 2 pictures): "Fix the button"' && start.detail === 'Fix the\nbutton', start.text);
check('a compact turn says so', turnStart({ text: '/compact', compact: true }).text.startsWith('compact asked'));
check('a message steered into a turn', steered('also this', 1).text === 'steered into the turn (1 picture): "also this"');
check('init: the session and the model', eventLines({ chatId: 'c', type: 'init', sessionId: 's-1', model: 'gpt-5' })[0]?.text === 'session s-1, model gpt-5');
const parts = eventLines(msg('assistant', [{ type: 'thinking', text: 'hmm' }, { type: 'text', text: 'Done it.' }, { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls -la', description: 'list' } }]));
check('an answer: one line per part, what it thinks, says and calls', parts.map((l) => l.text).join(' | ') === 'thinks: "hmm" | says: "Done it." | calls Bash: ls -la', parts.map((l) => l.text).join(' | '));
check('...the call\'s whole input a click away', parts[2].detail === JSON.stringify({ command: 'ls -la', description: 'list' }, null, 2));
const res = eventLines(msg('user', [{ type: 'tool_result', toolUseId: 't', text: 'no such file', isError: true }, { type: 'tool_result', toolUseId: 'u', text: '', isError: false }]));
check('tool results, a failure marked', res[0].text === 'tool failed: "no such file"' && res[1].text === 'tool result: "(empty)"', res.map((l) => l.text).join(' | '));
check('the user\'s own words are not logged twice', eventLines(msg('user', [{ type: 'text', text: 'hello' }])).length === 0);
check('a provider\'s failure reads as an error', eventLines(msg('assistant', [{ type: 'text', text: 'Rate limited' }], { error: true }))[0].text === 'error: "Rate limited"');
const long = 'x'.repeat(5000); const l = eventLines(msg('assistant', [{ type: 'text', text: long }]))[0];
check('a long answer: a short line, the start of it a click away', l.text.length < 200 && l.detail!.startsWith('x'.repeat(4000)) && l.detail!.includes('1000 more characters'));
check('the streamed text and the context numbers make no line', eventLines({ chatId: 'c', type: 'delta', text: 'a' }).length === 0 && eventLines({ chatId: 'c', type: 'context', usage: { used: 1, window: 2 } as any }).length === 0);
check('a permission asked', eventLines({ chatId: 'c', type: 'permission', requestId: 'r', toolName: 'Write', input: { file_path: '/a/b.ts' } })[0].text === 'asks permission for Write: /a/b.ts');
const done = eventLines({ chatId: 'c', type: 'done', ok: true, durationMs: 4200, costUsd: 0.0123 })[0];
check('the end: done, how long, what it cost', done.text === 'turn done ($0.0123)' && done.ms === 4200, done.text);
check('nothing spent: no cost', eventLines({ chatId: 'c', type: 'done', ok: true, costUsd: 0 })[0].text === 'turn done');
check('a failed turn says why', eventLines({ chatId: 'c', type: 'done', ok: false, error: 'Prompt is too long', tooLong: true })[0].text === 'turn failed: Prompt is too long (too long for the context window)');
check('compacting', eventLines({ chatId: 'c', type: 'compact', phase: 'done', ok: true, before: 900, after: 100 })[0].text === 'compacted: 900 -> 100 tokens');
check('a tool\'s hint with no known field: its input, short', toolHint({ a: 1 }) === '{ "a": 1 }');

const ev = (kind: DebugEvent['kind'], at: number): DebugEvent => ({ at, kind, text: String(at) });
let all: DebugEvent[] = []; for (let i = 0; i < 300; i++) all = keep(all, ev('heard', i));
for (let i = 0; i < KEEP.model + 50; i++) all = keep(all, ev('model', 1000 + i));
check('a busy agent never pushes the voice\'s lines out: each tab keeps its own last ones', all.filter((e) => e.kind !== 'model').length === 300 && all.filter((e) => e.kind === 'model').length === KEEP.model && all.find((e) => e.kind === 'model')!.at === 1050, `${all.filter((e) => e.kind !== 'model').length} / ${all.filter((e) => e.kind === 'model').length}`);
all = keep(all, ev('heard', 5000));
check('...and the voice\'s oldest goes when one more comes', all.filter((e) => e.kind !== 'model').length === 300 && all.find((e) => e.kind === 'heard')!.at === 1);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
