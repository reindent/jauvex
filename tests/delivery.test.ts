// A message handed to an agent while its turn is under way (T-228; the user, 2026-09-29: an agent's answer landed in the chat of another
// agent that had asked it a question meanwhile): which ones wait for a turn of their own.
import { ownTurn } from '../shared/delivery.js';
let failed = 0; const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const agent = { key: 'p1:s1' }, other = { key: 'p2:s2' }, exp = { key: 'export:p:s', kind: 'export' }, run = { key: 'run:p:wf', kind: 'run' };
check('an agent\'s message while the turn answers another agent waits for its own turn', ownTurn(agent, other));
check('...while the turn answers a reply the app asked for or a workflow\'s step too: each gets its own answer', ownTurn(agent, exp) && ownTurn(agent, run));
check('a reply the app asked for or a step never joins a turn under way, whoever it answers', ownTurn(exp, undefined) && ownTurn(run, undefined) && ownTurn(exp, agent) && ownTurn(run, run));
check('an agent\'s message joins the person\'s own turn, or a turn that already answers that agent, as before', !ownTurn(agent, undefined) && !ownTurn(agent, { key: 'p1:s1' }));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
