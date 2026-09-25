// Grok as a provider (T-133), through the stand-in (tests/mock/grok, which speaks the Agent Client Protocol as `grok agent stdio` does):
// a new session streams its answer and is kept as a Grok session of the folder; the folder lists it and its history reads back; a tool
// that needs permission shows the same card as Claude's and its answer reaches Grok; a message handed to a running turn is read in it,
// and one handed over after its last step (Grok runs it as a prompt of its own) still ends in the same turn; stop, compaction, a message
// that does not fit, the model picked in the composer, renaming, the account, and the voice's own Grok session.
import path from 'node:path';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
process.env.CVC_GROK_BIN = path.resolve('tests/mock/grok'); process.env.GROK_HOME = path.join(process.env.CVC_DATA_DIR, 'grok'); // the stand-in files its sessions there
process.env.MOCK_DELAY_MS = '2'; process.env.MOCK_CONTEXT_TOKENS = '150000'; process.env.MOCK_CONTEXT_WINDOW = '200000';
const chat = await import('../electron/chat.ts'); const grok = await import('../electron/grok.ts'); const { backend } = await import('../electron/backend.ts'); const account = await import('../electron/account.ts');
type Ev = Parameters<Parameters<typeof chat.startChat>[1]>[0];
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = (await backend.state()).projects.find((x) => x.name === 'scratch')!;
let n = 0;
const turn = async (sessionId: string | null, text: string, opts: { compact?: boolean; model?: string; on?: (e: Ev, chatId: string) => void } = {}): Promise<Ev[]> => {
  const evs: Ev[] = []; const chatId = `check-grok-${++n}`;
  await chat.startChat({ chatId, projectId: p.id, sessionId, provider: 'grok', text, ...(opts.compact ? { compact: true } : {}), ...(opts.model ? { model: opts.model } : {}) }, (e) => { evs.push(e); opts.on?.(e, chatId); }); return evs;
};
const last = <T extends Ev['type']>(evs: Ev[], type: T) => evs.filter((e): e is Extract<Ev, { type: T }> => e.type === type).at(-1);
const texts = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { type: 'message' }> => e.type === 'message' && e.message.role === 'assistant').map((e) => e.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')).join('\n');

// A new session: streamed, answered, kept as Grok's.
const t1 = await turn(null, 'hello'); const sid = last(t1, 'init')?.sessionId ?? '';
check('a new Grok session starts and says its id and model', !!sid && last(t1, 'init')?.model === 'mock', JSON.stringify(last(t1, 'init')));
check('the answer streams in pieces', t1.filter((e) => e.type === 'delta').length > 3, String(t1.filter((e) => e.type === 'delta').length));
check('the answer comes as one message, with the thinking before it', /I got: "hello"/.test(texts(t1)) && t1.some((e) => e.type === 'message' && e.message.blocks[0]?.type === 'thinking'), texts(t1));
check('the turn ends once, well', t1.filter((e) => e.type === 'done').length === 1 && last(t1, 'done')?.ok === true, JSON.stringify(last(t1, 'done')));
const st1 = (await backend.state()).projects.find((x) => x.id === p.id)!;
check('the session is kept in the folder as a Grok session', st1.sessions.includes(sid) && st1.providers?.[sid] === 'grok', JSON.stringify({ sessions: st1.sessions.slice(0, 3), provider: st1.providers?.[sid] }));
check('the context meter: what the request carried, against the model\'s window', last(t1, 'context')?.usage.used === 150_000 && last(t1, 'context')?.usage.window === 200_000, JSON.stringify(last(t1, 'context')));
{ const { readFileSync } = await import('node:fs'); const kept = JSON.parse(readFileSync(path.join(process.env.GROK_HOME!, 'mock-sessions', `${sid}.json`), 'utf8')) as { rules?: string };
  check('Grok is told the app\'s briefing once, as the session\'s rules, with the note on dictation', /About the client you are running in/.test(kept.rules ?? '') && /The user is talking to you by voice/.test(kept.rules ?? ''), (kept.rules ?? '').slice(0, 80)); }

// Listing and history.
const listed = (await backend.sessions(p.id)).find((s) => s.sessionId === sid);
check('the folder lists the Grok session, with its title', listed?.provider === 'grok' && /hello/.test(listed.summary), JSON.stringify(listed));
const hist = await backend.messages(p.id, sid);
check('its history reads back: what was said and the answer', hist.messages.some((m) => m.role === 'user' && m.blocks.some((b) => b.type === 'text' && b.text === 'hello')) && hist.messages.some((m) => m.role === 'assistant' && m.blocks.some((b) => b.type === 'text' && /I got: "hello"/.test(b.text))), JSON.stringify(hist.messages.map((m) => [m.role, m.blocks.map((b) => b.type)])));

// A tool that needs permission: the card, then the answer goes back to Grok.
const t2 = await turn(sid, 'look around [[tool]]', { on: (e, chatId) => { if (e.type === 'permission') setTimeout(() => chat.answerPermission(chatId, e.requestId, 'allow'), 10); } });
const perm = last(t2, 'permission');
check('a tool that needs permission shows the card, with what it will run', perm?.toolName === 'Run Command' && (perm.input as { command?: string }).command === 'ls', JSON.stringify(perm));
const ran = t2.filter((e): e is Extract<Ev, { type: 'message' }> => e.type === 'message').map((e) => e.message).filter((m) => m.blocks.some((b) => b.type === 'tool_result')).at(-1);
const result = ran?.blocks.find((b) => b.type === 'tool_result') as { text: string; isError: boolean } | undefined;
check('allowed, it runs: the result comes back, without terminal colours', !!result && !result.isError && result.text.includes('(mock) ran ls') && !result.text.includes('\u001b'), JSON.stringify(result));
check('the call shows as it starts, and its result replaces it (same id)', t2.filter((e) => e.type === 'message' && e.message.uuid === ran?.uuid).length === 2);
const t3 = await turn(sid, 'again [[tool]]', { on: (e, chatId) => { if (e.type === 'permission') setTimeout(() => chat.answerPermission(chatId, e.requestId, 'deny'), 10); } });
const denied = t3.filter((e): e is Extract<Ev, { type: 'message' }> => e.type === 'message').flatMap((e) => e.message.blocks).filter((b) => b.type === 'tool_result').at(-1) as { isError: boolean } | undefined;
check('declined, it does not run', denied?.isError === true && last(t3, 'done')?.ok === true, JSON.stringify(denied));

// A message handed to the running turn is read in it.
let steered = false;
const t4 = await turn(sid, 'a longer piece of work, one two three four five six seven eight nine ten', { on: (e, chatId) => { if (e.type === 'delta' && !steered) { steered = true; void chat.steerChat(chatId, 'and one more thing'); } } });
check('a message handed to the running turn is answered in it', /I got: "and one more thing"/.test(texts(t4)) && t4.filter((e) => e.type === 'done').length === 1, texts(t4));
// ...and one handed over after the turn's last step: Grok runs it as a prompt of its own, and it still belongs to this turn.
let lateSent = false; let lateOk: boolean | null = null; let seenContext = 0;
const t5 = await turn(sid, 'short [[slow end]]', { on: (e, chatId) => { if (e.type === 'context' && ++seenContext === 1 && !lateSent) { lateSent = true; void chat.steerChat(chatId, 'late words').then((ok) => { lateOk = ok; }); } } });
check('a message handed over after the last step is taken', lateOk === true, String(lateOk));
check('its answer still comes in the same turn, which ends once, after it', /I got: "late words"/.test(texts(t5)) && t5.filter((e) => e.type === 'done').length === 1 && t5.findIndex((e) => e.type === 'done') === t5.length - 1, texts(t5));

// Stop.
let stopped = false;
const t6 = await turn(sid, 'stop me please, this is long enough to be stopped halfway through its answer', { on: (e, chatId) => { if (e.type === 'delta' && !stopped) { stopped = true; void chat.stopChat(chatId); } } });
check('a stopped turn ends at once, as stopped (not as a failure)', last(t6, 'done')?.ok === true && !/halfway through its answer"/.test(texts(t6)), JSON.stringify(last(t6, 'done')));

// Stopped while its card is open: the card is answered "cancelled" (the protocol asks it of a client that cancels) and the turn ends.
const t6b = await Promise.race([turn(sid, 'stop at the card [[tool]]', { on: (e, chatId) => { if (e.type === 'permission') setTimeout(() => void chat.stopChat(chatId), 10); } }), sleep(5000).then(() => null)]);
check('stopped while its permission card is open, the turn still ends', !!t6b && last(t6b, 'done')?.ok === true, t6b ? JSON.stringify(last(t6b, 'done')) : 'no end after 5 s');

// Compaction, and a message that does not fit.
const t7 = await turn(sid, '/compact', { compact: true });
const began = t7.find((e) => e.type === 'compact' && e.phase === 'start'); const ended = t7.find((e): e is Extract<Ev, { type: 'compact' }> => e.type === 'compact' && e.phase === 'done');
check('compacting says when it starts and when it ends, with the tokens before and after', !!began && ended?.ok === true && ended.before === 150_000 && ended.after === 7_500, JSON.stringify(t7.filter((e) => e.type === 'compact')));
check('after compacting, the meter goes down', last(t7, 'context')?.usage.used === 7_500, JSON.stringify(last(t7, 'context')));
check('the compaction ends as a turn, once, with no message', t7.filter((e) => e.type === 'done').length === 1 && !t7.some((e) => e.type === 'message'), JSON.stringify(t7.map((e) => e.type)));
const t8 = await turn(sid, 'this one [[too long]]');
check('a message that does not fit ends marked tooLong', last(t8, 'done')?.ok === false && last(t8, 'done')?.tooLong === true, JSON.stringify(last(t8, 'done')));

// The model picked in the composer, the name, the lists.
const t9 = await turn(sid, 'faster please', { model: 'mock-fast' });
check('the model picked in the composer reaches the session', last(t9, 'init')?.model === 'mock-fast' && last(t9, 'done')?.ok === true, JSON.stringify(last(t9, 'init')));
await backend.rename(p.id, sid, 'Grok check');
check('a rename is kept by Grok: the folder lists the new name', (await backend.sessions(p.id)).find((s) => s.sessionId === sid)?.summary === 'Grok check');
const ms = await backend.models('grok');
check('Grok\'s models, with their efforts and the default', ms.length === 2 && ms[0]?.id === 'mock' && ms[0].isDefault === true && ms[0].efforts?.join() === 'low,high', JSON.stringify(ms));
const acc = await account.status('grok');
check('who Grok is signed in as', acc.signedIn && acc.who === 'mock@localhost', JSON.stringify(acc));

// The voice of a Grok session is a Grok model: its own session, never listed with the folder's.
const said = await grok.voiceAsk('You are the voice.', 'HEARD: hello there', '', 5000);
check('the voice of a Grok session answers through Grok', /I got: "HEARD: hello there"/.test(said), said);
check('the voice\'s own session is not one of the folder\'s', !(await backend.sessions(p.id)).some((s) => s.provider === 'grok' && /HEARD/.test(s.summary)));
check('the voice model is the fast one when none is picked', (await grok.voiceModel('')) === 'mock-fast', await grok.voiceModel(''));
{ const { readFileSync, existsSync } = await import('node:fs'); const file = path.join(process.env.CVC_DATA_DIR!, 'grok-voice-session'); const first = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  const kept = (id: string) => existsSync(path.join(process.env.GROK_HOME!, 'mock-sessions', `${id}.json`));
  check('the voice\'s session is noted in the data folder, to be deleted next time', !!first && kept(first), first);
  await grok.voiceAsk('Another voice.', 'HEARD: again', 'mock', 5000); const second = readFileSync(file, 'utf8').trim(); // another model: a new session, the old one deleted
  check('a new voice session deletes the one before it: Grok keeps no trail of them', second !== first && !kept(first) && kept(second), `${first} -> ${second}`); }

await sleep(50); grok.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
