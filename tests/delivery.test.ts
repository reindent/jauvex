// A message handed to an agent while its turn is under way (T-228; the user, 2026-09-29: an agent's answer landed in the chat of another
// agent that had asked it a question meanwhile): which ones wait for a turn of their own.
import { ownTurn, closesWaitingStep } from '../shared/delivery.js';
let failed = 0; const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const agent = { key: 'p1:s1' }, other = { key: 'p2:s2' }, exp = { key: 'export:p:s', kind: 'export' }, run = { key: 'run:p:wf', kind: 'run' };
check('an agent\'s message while the turn answers another agent waits for its own turn', ownTurn(agent, other));
check('...while the turn answers a reply the app asked for or a workflow\'s step too: each gets its own answer', ownTurn(agent, exp) && ownTurn(agent, run));
check('a reply the app asked for or a step never joins a turn under way, whoever it answers', ownTurn(exp, undefined) && ownTurn(run, undefined) && ownTurn(exp, agent) && ownTurn(run, run));
check('an agent\'s message joins the person\'s own turn, or a turn that already answers that agent, as before', !ownTurn(agent, undefined) && !ownTurn(agent, { key: 'p1:s1' }));
// T-253 (a server's agents, 2026-10-01): an agent's answer to messages that had waited in its queue, ending "OUTCOME: done", closed the
// workflow step it had not started yet. A reply with no address closes the step its agent is on only when the window took its turn back after a
// reload (it cannot know whom the turn answered), and never while that step's message still waits in the agent's queue.
const step = 'run:p1:workflows/ship.md';
check("a reply this window knows the address of (another message's, the person's) never closes the step its agent is waited on for", !closesWaitingStep(undefined, step));
check('a turn taken back after a reload may: its address could not be known', closesWaitingStep({ queued: [] }, step) && closesWaitingStep({ queued: ['run:p1:workflows/other.md'] }, step));
check("...unless the step's own message still waits in that agent's queue: its answer is still to come", !closesWaitingStep({ queued: [step] }, step));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
