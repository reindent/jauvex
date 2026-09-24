// The context meter and compaction through the stand-ins (tests/mock/claude, tests/mock/codex), for both providers (T-74): every answered
// request says how full the context is and the numbers are kept with the session; a compact turn says when it starts and ends, with the
// tokens before and after; a message that does not fit ends marked tooLong (the window then compacts and sends it again).
import path from 'node:path';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
process.env.CVC_CLAUDE_BIN = path.resolve('tests/mock/claude'); process.env.CVC_CODEX_BIN = path.resolve('tests/mock/codex');
process.env.CLAUDE_CONFIG_DIR = path.join(process.env.CVC_DATA_DIR, 'claude'); process.env.CODEX_HOME = path.join(process.env.CVC_DATA_DIR, 'codex'); // the stand-ins file their sessions here
process.env.MOCK_DELAY_MS = '2'; process.env.MOCK_CONTEXT_TOKENS = '150000'; process.env.MOCK_CONTEXT_WINDOW = '200000';
const chat = await import('../electron/chat.ts'); const codex = await import('../electron/codex.ts'); const { backend } = await import('../electron/backend.ts');
type Ev = Parameters<Parameters<typeof chat.startChat>[1]>[0];
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };

const p = (await backend.state()).projects.find((x) => x.name === 'scratch')!;
const turn = async (provider: 'claude' | 'codex', sessionId: string | null, text: string, compact = false): Promise<Ev[]> => {
  const evs: Ev[] = []; await chat.startChat({ chatId: `check-${provider}-${evs.length}-${Date.now()}`, projectId: p.id, sessionId, provider, text, ...(compact ? { compact: true } : {}) }, (e) => evs.push(e)); return evs;
};
const last = <T extends Ev['type']>(evs: Ev[], type: T) => evs.filter((e): e is Extract<Ev, { type: T }> => e.type === type).at(-1);

for (const provider of ['claude', 'codex'] as const) {
  const name = provider === 'claude' ? 'Claude' : 'Codex';
  const t1 = await turn(provider, null, 'hello'); const sid = last(t1, 'init')?.sessionId ?? '';
  const c1 = last(t1, 'context');
  check(`${name}: a turn says how full the context is`, c1?.usage.used === 150_000 && c1.usage.window === 200_000, JSON.stringify(c1));
  const kept = (await backend.state()).projects.find((x) => x.id === p.id)?.context?.[sid];
  check(`${name}: the numbers are kept with the session`, kept?.used === 150_000 && kept.window === 200_000, JSON.stringify(kept));

  const t2 = await turn(provider, sid, '/compact', true);
  const began = t2.find((e) => e.type === 'compact' && e.phase === 'start'); const ended = t2.find((e): e is Extract<Ev, { type: 'compact' }> => e.type === 'compact' && e.phase === 'done');
  check(`${name}: compacting says when it starts and when it ends, with the tokens before and after`, !!began && ended?.ok === true && ended.before === 150_000 && ended.after === 7_500, JSON.stringify(ended ?? t2.map((e) => e.type)));
  check(`${name}: after compacting, the meter goes down`, last(t2, 'context')?.usage.used === 7_500, JSON.stringify(last(t2, 'context')));
  check(`${name}: the compaction ends as a turn, once`, t2.filter((e) => e.type === 'done').length === 1 && last(t2, 'done')?.ok === true, JSON.stringify(last(t2, 'done')));
  check(`${name}: nothing of the compaction shows as a message`, !t2.some((e) => e.type === 'message' && !e.message.meta), JSON.stringify(t2.filter((e) => e.type === 'message')));

  const t3 = await turn(provider, sid, 'this one [[too long]]'); const d3 = last(t3, 'done');
  check(`${name}: a message that does not fit ends marked tooLong`, d3?.ok === false && d3.tooLong === true, JSON.stringify(d3));
  if (provider === 'claude') check('Claude: its "Prompt is too long" is a red card, never an answer', t3.some((e) => e.type === 'message' && e.message.error === true && e.message.role === 'assistant'), JSON.stringify(t3.filter((e) => e.type === 'message')));
  const t4 = await turn(provider, sid, 'fine again'); check(`${name}: the next message goes through as usual`, last(t4, 'done')?.ok === true && !last(t4, 'done')?.tooLong);
}
codex.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
