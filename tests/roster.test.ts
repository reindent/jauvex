// The roster helpers: session titles cut short, short ids that stay unique, and the agent a message is addressed to.
const { shortTitle, shortIds, findAgents, exactAgents, matchSession, findFolderIn } = await import('../shared/roster.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const dictated = "Good afternoon, from today you look after the choir's rehearsal calendar, the dates and the venues and the reminders, so you are the calendar agent.";
const t = shortTitle(dictated);
check('a dictated first message becomes a short title, cut at a word', t.length <= 60 && t.endsWith('…') && !t.includes(' …') && t.startsWith("Good afternoon, from today you look"), t);
check('a short title is left alone', shortTitle('Codex Agent') === 'Codex Agent' && shortTitle('  two   lines\nhere ') === 'two lines here');
const ids = ['01b2c71a-4f2e-7003-9a11-3c5d7e9f0a12', '01b2c716-8d3a-7133-8b22-4e6f8091a2b3', '01b2c710-2c4b-7201-8c33-5f708192b3c4', 'a3f9d27e-6b1c-4d2a-9e8f-0c1d2e3f4a5b'];
const short = shortIds(ids); const vals = [...short.values()];
check('short ids are unique even when Codex ids share their first characters', new Set(vals).size === 4 && short.get(ids[3]!) === 'a3f9d2' && vals.slice(0, 3).every((v) => v.length === 8), vals.join(' '));
const all = [
  { sessionId: 'e7c4a1d0-3b2f-4c8e-9a6d-1f2e3d4c5b6a', name: 'Jauvex' },
  { sessionId: 'a3f9d27e-6b1c-4d2a-9e8f-0c1d2e3f4a5b', name: 'Jauvex Helper Agent' },
  { sessionId: '01b2bf00-0000-7000-8000-000000000000', name: 'Codex Agent' },
  { sessionId: '01b2c800-0000-7000-8000-000000000000', name: shortTitle(dictated) },
];
check('"Jauvex" reaches the Jauvex agent alone, not the helper agent', findAgents(all, 'Jauvex', all[3]!.sessionId).map((a) => a.name).join() === 'Jauvex');
check('the full name reaches the helper agent', findAgents(all, 'jauvex helper agent').map((a) => a.name).join() === 'Jauvex Helper Agent');
check('part of a name finds the one agent containing it', findAgents(all, 'Codex').map((a) => a.name).join() === 'Codex Agent');
check('a short id finds by id', findAgents(all, '[a3f9d2]').map((a) => a.name).join() === 'Jauvex Helper Agent');
check('the sender never reaches itself (the one other name containing the word is what is left)', findAgents(all, 'Jauvex', all[0]!.sessionId).map((a) => a.name).join() === 'Jauvex Helper Agent');
check('the wait order binds by the exact name or id only, never a near one (FB-122)', exactAgents(all, 'Jauvex').map((a) => a.name).join() === 'Jauvex' && exactAgents(all, 'jauvex helper agent').map((a) => a.name).join() === 'Jauvex Helper Agent' && exactAgents(all, 'Codex').length === 0 && exactAgents(all, '[a3f9d2]').map((a) => a.name).join() === 'Jauvex Helper Agent');
check('an unknown name finds nobody', findAgents(all, 'Nobody Here').length === 0 && findAgents(all, '').length === 0);
{ const all = [{ sessionId: 'aaaa1111', name: 'Photo Agent' }, { sessionId: 'bbbb2222', name: 'Writer Agent' }, { sessionId: 'cccc3333', name: 'Editor Agent' }, { sessionId: 'dddd4444', name: 'Acme Editor Agent' }];
  check('a name with a word more finds the agent it holds', findAgents(all, 'Acme Photo Agent').map((a) => a.name).join() === 'Photo Agent');
  check('the longest name held wins', findAgents(all, 'the Acme Editor Agent').map((a) => a.name).join() === 'Acme Editor Agent');
  check('a name holding nobody finds nobody', findAgents(all, 'Acme Billing Agent').length === 0); }
{ // the session an order names (open, send, import), among a folder's
  const list = [{ sessionId: '4c2e9a17-aaaa', summary: 'Fix the login', customTitle: 'Landing page' }, { sessionId: '01b2bd26-bbbb', summary: 'Write the post' }];
  check('a session is named by id, the start of its id, its title or its summary', matchSession(list, '4c2e9a17-aaaa')?.summary === 'Fix the login' && matchSession(list, '01b2bd')?.summary === 'Write the post' && matchSession(list, 'landing page')?.sessionId === '4c2e9a17-aaaa' && matchSession(list, 'write the post')?.sessionId === '01b2bd26-bbbb');
  check('a name nobody has, or none, names no session', matchSession(list, 'nothing like it') === undefined && matchSession(list, '  ') === undefined); }
{ // the folder an order names (--folder), when a folder and the app's own share a name (T-254)
  const own = { id: 'jx', path: '/home/u/.jauvex', name: 'Jauvex', builtin: 'jauvex' }, mine = { id: 'f1', path: '/home/u/Acme/Jauvex', name: 'Jauvex' };
  const other = { id: 'f2', path: '/home/u/Other/Jauvex', name: 'Jauvex' }, site = { id: 'f3', path: '/home/u/Acme/site', name: 'site' };
  const all = [own, other, mine, site];
  check("by name, a folder wins over the app's own folder of the same name, whatever the order", findFolderIn(all, 'Jauvex')?.id === 'f2' && findFolderIn([own, mine], 'jauvex')?.id === 'f1');
  check("the app's own folder: by its name when no other folder has it, by its path or id always", findFolderIn([own, site], 'Jauvex')?.id === 'jx' && findFolderIn(all, '/home/u/.jauvex')?.id === 'jx' && findFolderIn(all, 'jx')?.id === 'jx');
  check('a name no folder has names none', findFolderIn(all, 'nowhere') === null); }
{ // FB-38 (from Pro): Codex ids are time-ordered, so a unique short id can run past the first hyphen; written that way, it still finds its agent
  const codex = [{ sessionId: '01a11d25-7b3c-7000-8000-000000000001', name: 'Worker A' }, { sessionId: '01a11d25-7c10-7000-8000-000000000002', name: 'Worker B' }];
  const sid = shortIds(codex.map((c) => c.sessionId)).get(codex[0]!.sessionId)!;
  check('a short id with a hyphen in it, as the roster writes it, finds its agent', sid.includes('-') && findAgents(codex, `[${sid}]`).map((a) => a.name).join() === 'Worker A', sid);
  check('...and so does the same id without its hyphen', findAgents(codex, '01a11d257b').map((a) => a.name).join() === 'Worker A'); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
