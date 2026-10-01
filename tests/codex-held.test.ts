// One program writes to a Codex thread at a time (T-250; a tester's turn failed with "thread <id> already has an active writer", 2026-09-30).
// Codex 0.159 keeps a thread's writer for the program that has it loaded, idle or not, until about a minute after its last subscriber leaves
// (probed on the real Codex). The app lets a thread go when its turn is over, so other Codex programs can have it; a thread
// another program holds is waited for (the chat says so) and, held past the wait, refused in plain words. The Codex stand-in holds a
// thread while MOCK_CODEX_HELD_FILE exists, and logs what the app asks in MOCK_CODEX_LOG.
import path from 'node:path'; import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
const T = path.join(process.env.CVC_DATA_DIR, 'work-held'); rmSync(T, { recursive: true, force: true }); mkdirSync(T, { recursive: true });
const HELD = path.join(T, 'held'), LOG = path.join(T, 'calls.log');
process.env.CVC_CODEX_BIN = path.resolve('tests/mock/codex'); process.env.CODEX_HOME = path.join(T, 'codex'); process.env.MOCK_DELAY_MS = '2';
process.env.MOCK_CODEX_HELD_FILE = HELD; process.env.MOCK_CODEX_LOG = LOG; process.env.CVC_CODEX_HELD_RETRY_MS = '200';
const chat = await import('../electron/chat.ts'); const codex = await import('../electron/codex.ts'); const { backend } = await import('../electron/backend.ts');
type Ev = Parameters<Parameters<typeof chat.startChat>[1]>[0];
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const p = (await backend.state()).projects.find((x) => x.name === 'scratch')!;
// as the app starts a chat (main.ts, chat:start): a start that throws is a failed turn, its message the error the person reads
const turn = async (sessionId: string | null, text: string): Promise<Ev[]> => { const evs: Ev[] = []; const chatId = `held-${Date.now()}-${Math.random()}`;
  await chat.startChat({ chatId, projectId: p.id, sessionId, provider: 'codex', text }, (e) => evs.push(e)).catch((err: Error) => evs.push({ chatId, type: 'done', ok: false, error: err.message } as Ev)); return evs; };
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const first = await turn(null, 'hello'); const done1 = first.find((e) => e.type === 'done') as Extract<Ev, { type: 'done' }> | undefined; const id = done1?.sessionId ?? '';
await sleep(300);
check("a turn over, the app lets its thread go (thread/unsubscribe), so other Codex programs can have it", !!done1?.ok && !!id && calls().includes(`thread/unsubscribe ${id}`), calls().split('\n').slice(-4).join(' | '));

writeFileSync(HELD, 'another program has it'); setTimeout(() => rmSync(HELD, { force: true }), 900); // let go by the other program a little later
const second = await turn(id, 'again'); const done2 = second.find((e) => e.type === 'done') as Extract<Ev, { type: 'done' }> | undefined;
check('a thread another program holds is waited for, and the chat says so', second.some((e) => e.type === 'status' && /another program has this Codex session open/.test(e.text)), JSON.stringify(second.map((e) => e.type)));
check('...then, once it lets go, the turn runs', !!done2?.ok, done2?.error ?? '');

process.env.CVC_CODEX_HELD_MS = '700'; writeFileSync(HELD, 'held for good');
const third = await turn(id, 'once more'); const done3 = third.find((e) => e.type === 'done') as Extract<Ev, { type: 'done' }> | undefined;
check('held past the wait: refused in plain words, what to do and why (never "already has an active writer")', !!done3 && !done3.ok && done3.error === codex.heldNote, done3?.error ?? JSON.stringify(third.map((e) => e.type)));
rmSync(HELD, { force: true }); codex.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
