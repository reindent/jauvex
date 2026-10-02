// The Jauvex agent's dashboard, the pure part (T-276, the other edition's rules): the agent's DASHBOARD.md read into what waits on you
// ("## You"), the pinned notes, and the other edition's sections for several people, which this one ignores; the greeting; your own way of
// having it (its size, the cards you hid), kept on this computer.
const { parseDashboard, itemsFor, greetingFor, dashPrefsFrom } = await import('../shared/dashboard.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const f = parseDashboard(`# Dashboard

Kept by the agent.

## You
- [ ] Update the build server to 2.1 — it runs 2.0
- [x] Read the summary of yesterday's run
- [ ] **The weekly report is ready**: read what changed · Reports, 13:03

## Pinned
- Files from a server go as links on its own address

## Notes for later
some prose, not a list
`);
check('"## You" holds what waits on you, a done item left out, the note after a dash or a dot', JSON.stringify(itemsFor(f, 'You')) === JSON.stringify([{ text: 'Update the build server to 2.1', note: 'it runs 2.0' }, { text: 'The weekly report is ready: read what changed', note: 'Reports, 13:03' }]), JSON.stringify(itemsFor(f, 'You')));
check('"## Needs you" is the same section; case does not matter', itemsFor(parseDashboard('## Needs you\n- [ ] One thing\n'), 'You').length === 1 && itemsFor(f, 'you').length === 2);
check('Pinned is its own; prose and other sections give nothing', JSON.stringify(f.pinned) === JSON.stringify(['Files from a server go as links on its own address']) && itemsFor(f, 'Notes for later').length === 0);
check('an empty or missing file is an empty dashboard', JSON.stringify(parseDashboard('')) === JSON.stringify({ people: [], team: [], pinned: [] }));
check('the greeting by the hour', greetingFor(9, '') === 'Good morning' && greetingFor(14, '') === 'Good afternoon' && greetingFor(20, '') === 'Good evening');
check('your own way of having it: its size and the cards you hid, anything else ignored', JSON.stringify(dashPrefsFrom('{"size":"half","hide":["today","nope"]}')) === JSON.stringify({ size: 'half', hide: ['today'] }) && JSON.stringify(dashPrefsFrom('not json')) === JSON.stringify({ size: 'third', hide: [] }) && dashPrefsFrom('{"size":"huge"}').size === 'third');
// When the app asks the agent to bring it up to date (T-279): only for a reason, and never too often.
const { dashboardDue, dashboardNote, DASH_GAP, DASH_UNANSWERED, DASH_STALE } = await import('../shared/dashboard.ts');
const H = 3_600_000; const now = Date.UTC(2026, 9, 1, 18);
check('no file yet: asked to build it', JSON.stringify(dashboardDue(now, { fileAt: null, boardsAt: 0, askedAt: null })) === '["missing"]');
check('a board changed since the file did: asked, and the file six hours old too: both said', JSON.stringify(dashboardDue(now, { fileAt: now - H, boardsAt: now - 60_000, askedAt: null })) === '["boards"]' && JSON.stringify(dashboardDue(now, { fileAt: now - DASH_STALE - 1, boardsAt: now - 60_000, askedAt: null })) === '["boards","stale"]');
check('current and no board changed since: nothing asked', dashboardDue(now, { fileAt: now - H, boardsAt: now - 2 * H, askedAt: null }).length === 0);
check('never twice within half an hour, whatever the reason', dashboardDue(now, { fileAt: null, boardsAt: 0, askedAt: now - DASH_GAP + 1000 }).length === 0);
check('asked and not done yet: three hours before asking again; done since: asked as usual', dashboardDue(now, { fileAt: null, boardsAt: 0, askedAt: now - 2 * H }).length === 0 && dashboardDue(now, { fileAt: null, boardsAt: 0, askedAt: now - DASH_UNANSWERED - 1 }).length === 1 && JSON.stringify(dashboardDue(now, { fileAt: now - 2 * H, boardsAt: now - 60_000, askedAt: now - 3 * H })) === '["boards"]');
const note = dashboardNote({ due: ['missing', 'boards'], boards: ['work/PROJECT.md'], hours: 0 });
check("the agent's note: from the app, why, what matters, and to save it even when nothing changed", /^\(from the app\) Your dashboard needs you/.test(note) && /no file yet/.test(note) && /work\/PROJECT\.md changed/.test(note) && /"## You"/.test(note) && /top-priority tickets/.test(note) && /save it as it is/.test(note) && /DASHBOARD\.md/.test(note), note);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
