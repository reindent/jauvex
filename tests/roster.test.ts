// The roster helpers: session titles cut short, short ids that stay unique, and the agent a message is addressed to.
const { shortTitle, shortIds, findAgents, matchSession, findFolderIn } = await import('../shared/roster.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const dictated = "Hey, you're going to take care of helping me with the Jauvex development. So basically the name of this application development. So you're going to be the Jauvex development agent.";
const t = shortTitle(dictated);
check('a dictated first message becomes a short title, cut at a word', t.length <= 60 && t.endsWith('…') && !t.includes(' …') && t.startsWith("Hey, you're going to take care"), t);
check('a short title is left alone', shortTitle('Codex Agent') === 'Codex Agent' && shortTitle('  two   lines\nhere ') === 'two lines here');
const ids = ['01a0c51a-7761-7003-a758-d62a577b4e06', '01a0c516-fb83-7133-872d-0fd0642a9bd1', '01a0c510-356a-7201-8f7f-59eb03baf1df', '55e1e83b-8eac-4115-bd00-d4e2ab9ab6c6'];
const short = shortIds(ids); const vals = [...short.values()];
check('short ids are unique even when Codex ids share their first characters', new Set(vals).size === 4 && short.get(ids[3]!) === '55e1e8' && vals.slice(0, 3).every((v) => v.length === 8), vals.join(' '));
const all = [
  { sessionId: '2508b4b0-c533-41e1-83f6-2bb7a3afa7bc', name: 'Jauvex' },
  { sessionId: '55e1e83b-8eac-4115-bd00-d4e2ab9ab6c6', name: 'Jauvex Development Agent' },
  { sessionId: '01a0bf00-0000-7000-8000-000000000000', name: 'Codex Agent' },
  { sessionId: '01a0c600-0000-7000-8000-000000000000', name: shortTitle(dictated) },
];
check('"Jauvex" reaches the Jauvex agent alone, not the development agent', findAgents(all, 'Jauvex', all[3]!.sessionId).map((a) => a.name).join() === 'Jauvex');
check('the full name reaches the development agent', findAgents(all, 'jauvex development agent').map((a) => a.name).join() === 'Jauvex Development Agent');
check('part of a name finds the one agent containing it', findAgents(all, 'Codex').map((a) => a.name).join() === 'Codex Agent');
check('a short id finds by id', findAgents(all, '[55e1e8]').map((a) => a.name).join() === 'Jauvex Development Agent');
check('the sender never reaches itself (the one other name containing the word is what is left)', findAgents(all, 'Jauvex', all[0]!.sessionId).map((a) => a.name).join() === 'Jauvex Development Agent');
check('an unknown name finds nobody', findAgents(all, 'Nobody Here').length === 0 && findAgents(all, '').length === 0);
{ const all = [{ sessionId: 'aaaa1111', name: 'Creative Agent' }, { sessionId: 'bbbb2222', name: 'Social Media Agent' }, { sessionId: 'cccc3333', name: 'Video Agent' }, { sessionId: 'dddd4444', name: 'Acme Video Agent' }];
  check('a name with a word more finds the agent it holds', findAgents(all, 'Acme Creative Agent').map((a) => a.name).join() === 'Creative Agent');
  check('the longest name held wins', findAgents(all, 'the Acme Video Agent').map((a) => a.name).join() === 'Acme Video Agent');
  check('a name holding nobody finds nobody', findAgents(all, 'Acme Legal Agent').length === 0); }
{ // the session an order names (open, send, import), among a folder's
  const list = [{ sessionId: '7956cf18-aaaa', summary: 'Fix the login', customTitle: 'Landing page' }, { sessionId: '01a0bd26-bbbb', summary: 'Write the post' }];
  check('a session is named by id, the start of its id, its title or its summary', matchSession(list, '7956cf18-aaaa')?.summary === 'Fix the login' && matchSession(list, '01a0bd')?.summary === 'Write the post' && matchSession(list, 'landing page')?.sessionId === '7956cf18-aaaa' && matchSession(list, 'write the post')?.sessionId === '01a0bd26-bbbb');
  check('a name nobody has, or none, names no session', matchSession(list, 'nothing like it') === undefined && matchSession(list, '  ') === undefined); }
{ // the folder an order names (--folder), when a folder and the app's own share a name (T-254)
  const own = { id: 'jx', path: '/home/u/.jauvex', name: 'Jauvex', builtin: 'jauvex' }, mine = { id: 'f1', path: '/home/u/Reindent/Jauvex', name: 'Jauvex' };
  const other = { id: 'f2', path: '/home/u/Other/Jauvex', name: 'Jauvex' }, site = { id: 'f3', path: '/home/u/Reindent/site', name: 'site' };
  const all = [own, other, mine, site];
  check("by name, a folder wins over the app's own folder of the same name, whatever the order", findFolderIn(all, 'Jauvex')?.id === 'f2' && findFolderIn([own, mine], 'jauvex')?.id === 'f1');
  check("the app's own folder: by its name when no other folder has it, by its path or id always", findFolderIn([own, site], 'Jauvex')?.id === 'jx' && findFolderIn(all, '/home/u/.jauvex')?.id === 'jx' && findFolderIn(all, 'jx')?.id === 'jx');
  check('a name no folder has names none', findFolderIn(all, 'nowhere') === null); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
