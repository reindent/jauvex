// Messages handed to a running Claude turn that the model never read (2026-09-23, twice): one said just before a stop was dropped by
// Claude Code with the rest of the turn, and one said as the turn was ending was taken up after the app had closed the turn. The turn's
// end now says how many of the last ones were never read (`unsent`), and the window sends them again. With the stand-in, which drops
// what waits when a turn is interrupted, as Claude Code does.
import path from 'node:path';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
process.env.CVC_CLAUDE_BIN = path.resolve('tests/mock/claude'); process.env.CLAUDE_CONFIG_DIR = path.join(process.env.CVC_DATA_DIR, 'claude');
process.env.MOCK_DELAY_MS = '60'; // a reply of about 25 pieces: about a second and a half
const chat = await import('../electron/chat.ts'); const { backend } = await import('../electron/backend.ts');
type Ev = Parameters<Parameters<typeof chat.startChat>[1]>[0];
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const p = (await backend.state()).projects.find((x) => x.name === 'scratch')!;
const turn = async (id: string, during: (chatId: string) => Promise<void>): Promise<Ev[]> => { const evs: Ev[] = []; const run = chat.startChat({ chatId: id, projectId: p.id, sessionId: null, provider: 'claude', text: 'a long job, please' }, (e) => evs.push(e)); await during(id); await run; return evs; };
const done = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { type: 'done' }> => e.type === 'done').at(-1);

const stopped = await turn('lost-on-stop', async (id) => { await sleep(900); await chat.steerChat(id, 'what we can do later: import from the other app'); await sleep(200); await chat.stopChat(id); });
check('a message handed over once the answer had started, then a stop: the end says it was never read', done(stopped)?.unsent === 1, JSON.stringify(done(stopped)));

const read = await turn('read-later', async (id) => { await sleep(250); await chat.steerChat(id, 'and one more thing'); });
const replies = read.filter((e) => e.type === 'message' && e.message.role === 'assistant').map((e) => (e as Extract<Ev, { type: 'message' }>).message.blocks.map((b) => ('text' in b ? b.text : '')).join(' '));
check('handed over and read (a turn of its own after the first): nothing to send again', !done(read)?.unsent && replies.some((r) => r.includes('and one more thing')), JSON.stringify({ done: done(read), replies: replies.length }));

console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
