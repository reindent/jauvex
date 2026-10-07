// A message handed to an agent while its turn is under way (T-228; the user, 2026-09-29: an agent's answer landed in the chat of another
// agent that had asked it a question meanwhile): which ones wait for a turn of their own.
import { ownTurn, closesWaitingStep, waitsFor, noResponse } from '../shared/delivery.js';
import { normalize } from '../electron/backend.ts';
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
// FB-09 (as Jauvex Pro; a Pro user, 2026-10-05: a lead says it will wait, its turn ends, nothing wakes it): a reply that says it waits names whom
const team = ['Designer Agent', 'Coding Agent', 'Research Agent'];
check('a reply that says it waits for agents to finish names them', waitsFor("I'll start the launch page once the Designer Agent and the Coding Agent are done.", team).join() === 'Designer Agent,Coding Agent' && waitsFor('Waiting for the Research Agent to report back.', team).join() === 'Research Agent');
check('...a reply that only mentions agents, or waits for nobody named, waits for none', waitsFor('The Designer Agent made the logo; the Coding Agent shipped it.', team).length === 0 && waitsFor("I'll wait for your answer.", team).length === 0);
// "No response requested." is no answer (Diego, 2026-10-07, as Jauvex Pro): hidden from the thread, and the message goes again once
check('"No response requested." is no answer, a real answer that mentions it is one', noResponse('No response requested.') && noResponse(' No response requested ') && !noResponse('Diego, the X post is live. No response requested from you.'));
check('...an assistant message that says only that is hidden, as plumbing', normalize({ type: 'assistant', uuid: 'a', message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] } } as never)?.meta === true && normalize({ type: 'assistant', uuid: 'b', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } } as never)?.meta === false);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
