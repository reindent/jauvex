// New replies, per agent (T-226): counted while the agent is not on screen, cleared when it is opened, the badge's text, and the counts read
// back from this computer's storage.
const { badgeText, counted, seen, countOf, unreadFrom } = await import('../shared/unread.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

check('the badge: nothing for none, the number up to 99, then 99+', [0, -1, NaN, 1, 7, 99, 100, 5000].map(badgeText).join('|') === '|||1|7|99|99+|99+');
let u = counted(counted(counted({}, 'a'), 'a'), 'b');
check('a reply counts on its agent', countOf(u, 'a') === 2 && countOf(u, 'b') === 1 && countOf(u, 'c') === 0 && countOf(u, null) === 0, JSON.stringify(u));
check('a reply of the agent on screen, or of no agent, counts nothing', counted(u, 'a', true) === u && counted(u, null) === u);
u = seen(u, 'a');
check('opening an agent clears its count, and only its count', JSON.stringify(u) === '{"b":1}' && seen(u, 'x') === u && seen(u, null) === u, JSON.stringify(u));
check('kept counts read back; anything else is dropped', JSON.stringify(unreadFrom('{"a":3,"b":"2","c":0,"d":-1,"e":2.7,"f":null}')) === '{"a":3,"e":2}' && JSON.stringify(unreadFrom('[1]')) === '{}' && JSON.stringify(unreadFrom('not json')) === '{}' && JSON.stringify(unreadFrom(null)) === '{}');
check('a count kept per workspace by another edition (a map of maps) is dropped', JSON.stringify(unreadFrom('{"ws1":{"a":2}}')) === '{}');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
