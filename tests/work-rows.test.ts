// Developer mode off (T-247; the user, 2026-09-30: "When it's disabled, then the users will not see bash and all these tool calls ... They
// would just see ... working ... unless they click it ... it's for non-technical users"): what was said and written stays, the pictures a tool
// made stay, and each run of tool calls, thoughts and system events between them is one unit, a Working row.
const { threadUnits } = await import('../shared/thread.ts');
import type { Block, ChatMessage } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const msg = (uuid: string, role: ChatMessage['role'], blocks: Block[], meta = false): ChatMessage => ({ uuid, role, blocks, meta });
const tool = (id: string, name: string, input: unknown): Block => ({ type: 'tool_use', id, name, input } as Block);
const thread: ChatMessage[] = [
  msg('1', 'user', [{ type: 'text', text: 'Make the video' }]),
  msg('2', 'assistant', [{ type: 'text', text: 'On it.' }, tool('t1', 'Bash', { command: 'ls' })]),
  msg('3', 'user', [{ type: 'tool_result', toolUseId: 't1', text: 'a b', isError: false }], true),
  msg('4', 'assistant', [{ type: 'thinking', text: 'which one' } as Block, tool('t2', 'Read', { file_path: '/x' })]),
  msg('5', 'assistant', [tool('t3', 'imagine', { image: '/tmp/a.png' })]),
  msg('6', 'assistant', [{ type: 'text', text: 'Done.' }]),
  msg('7', 'user', [{ type: 'text', text: 'Again' }]),
  msg('8', 'assistant', [tool('t4', 'Bash', { command: 'pwd' }), { type: 'text', text: 'Here.' }]),
];
const show = (u: ReturnType<typeof threadUnits>[number]): string => (u.kind === 'msg' ? `msg:${u.m.blocks.map((b) => (b.type === 'text' ? b.text : b.type)).join('+')}` : u.kind === 'media' ? `media:${u.src}` : `work:${u.parts.map((p) => (p.b ? (p.b.type === 'tool_use' ? p.b.name : p.b.type) : 'event')).join('+')}`);
const off = threadUnits(thread, false).map(show).join(' | ');
check('what was said and written stays; each run of tool calls and thoughts is one unit; a picture a tool made stays, after its run',
  off === 'msg:Make the video | msg:On it. | work:Bash+thinking+Read+imagine | media:/tmp/a.png | msg:Done. | msg:Again | work:Bash | msg:Here.', off);
const withEvents = threadUnits(thread, true).map(show).join(' | ');
check('with system events shown (the eye), they join the run they fall in', withEvents.startsWith('msg:Make the video | msg:On it. | work:Bash+event+thinking+Read+imagine | media:'), withEvents);
const keys = threadUnits(thread, false).map((u) => u.key);
check('every unit has its own key, and a run keeps its key as it grows', new Set(keys).size === keys.length && threadUnits(thread.slice(0, 4), false).find((u) => u.kind === 'work')?.key === threadUnits(thread, false).find((u) => u.kind === 'work')?.key, keys.join(','));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
