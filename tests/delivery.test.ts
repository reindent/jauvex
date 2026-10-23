// A message handed to an agent while its turn is under way (T-228: an agent's answer landed in the chat of another
// agent that had asked it a question meanwhile): which ones wait for a turn of their own.
import { ownTurn, closesWaitingStep, noResponse, unanswered, needsYouIn, withoutNeedsYou, agentBlocks, replyBack } from '../shared/delivery.js';
import { normalize } from '../electron/backend.ts';
let failed = 0; const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const agent = { key: 'p1:s1' }, other = { key: 'p2:s2' }, exp = { key: 'export:p:s', kind: 'export' }, run = { key: 'run:p:wf', kind: 'run' };
check('an agent\'s message while the turn answers another agent waits for its own turn', ownTurn(agent, other));
check('...while the turn answers a reply the app asked for or a workflow\'s step too: each gets its own answer', ownTurn(agent, exp) && ownTurn(agent, run));
check('a reply the app asked for or a step never joins a turn under way, whoever it answers', ownTurn(exp, undefined) && ownTurn(run, undefined) && ownTurn(exp, agent) && ownTurn(run, run));
check('an agent\'s message joins the person\'s own turn, or a turn that already answers that agent, as before', !ownTurn(agent, undefined) && !ownTurn(agent, { key: 'p1:s1' }));
// T-253 (on a server): an agent's answer to messages that had waited in its queue, ending "OUTCOME: done", closed the
// workflow step it had not started yet. A reply with no address closes the step its agent is on only when the window took its turn back after a
// reload (it cannot know whom the turn answered), and never while that step's message still waits in the agent's queue.
const step = 'run:p1:workflows/ship.md';
check("a reply this window knows the address of (another message's, the person's) never closes the step its agent is waited on for", !closesWaitingStep(undefined, step));
check('a turn taken back after a reload may: its address could not be known', closesWaitingStep({ queued: [] }, step) && closesWaitingStep({ queued: ['run:p1:workflows/other.md'] }, step));
check("...unless the step's own message still waits in that agent's queue: its answer is still to come", !closesWaitingStep({ queued: [step] }, step));
// "No response requested." is no answer (as in Jauvex Pro): hidden from the thread, and the message goes again once
check('"No response requested." is no answer, a real answer that mentions it is one', noResponse('No response requested.') && noResponse(' No response requested ') && !noResponse('Owen, the newsletter is out. No response requested from you.'));
check('...an assistant message that says only that is hidden, as plumbing', normalize({ type: 'assistant', uuid: 'a', message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] } } as never)?.meta === true && normalize({ type: 'assistant', uuid: 'b', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } } as never)?.meta === false);
// FB-50: a message nothing visible came back to says so, under it; anything visible after it is a reply
{ const m = (uuid: string, role: 'user' | 'assistant' | 'system', text: string, meta = false) => ({ uuid, role, meta, blocks: text ? [{ type: 'text', text }] : [{ type: 'tool_use' }] });
  check('an empty reply, or only "No response requested.", leaves the message unanswered', unanswered([m('1', 'user', 'Hi'), m('2', 'assistant', '')], false) === '1' && unanswered([m('1', 'user', 'Hi'), m('2', 'assistant', 'No response requested.')], false) === '1' && unanswered([m('1', 'user', 'Hi')], false) === '1');
  check('...an answer, a message to another agent, a failure card or an app note is a reply', [m('2', 'assistant', 'Done.'), m('2', 'assistant', '```message-agent X\nhi\n```'), m('2', 'system', 'It failed'), m('2', 'user', '(from the app) Moved to Codex.')].every((r) => unanswered([m('1', 'user', 'Hi'), r], false) === null));
  check('...hidden lines are skipped, another agent\'s message counts as said to it, and nothing shows while a turn runs', unanswered([m('1', 'user', '(from agent "A") hi'), m('2', 'assistant', 'x', true)], false) === '1' && unanswered([m('1', 'user', 'Hi')], true) === null); }
const asked = 'Done with the copy.\n\n```needs-you\nPublish it today?\n```';
check('a needs-you block is found, and left out of what goes back to an agent', needsYouIn(asked) && !needsYouIn('Done.') && withoutNeedsYou(asked).trim() === 'Done with the copy.');
// T-325 (FB-54, from Pro): a code block inside a message to an agent cut the message there; each message is read to its own closing fence
{ const nested = agentBlocks('Brief:\n```message-agent T06\nPart 3.\n\n```ts\nconst x = 1;\n```\n\nThen report.\n```\nDone.').map((b) => ({ to: b.to, text: b.text }));
  check('a code block inside a message to an agent is kept, the message read to its own closing fence', JSON.stringify(nested) === JSON.stringify([{ to: 'T06', text: 'Part 3.\n\n```ts\nconst x = 1;\n```\n\nThen report.' }]));
  check('...two messages in one reply, a quoted name too', agentBlocks('```message-agent A\none\n```\nmid\n```message-agent "B"\ntwo\n```').map((b) => `${b.to}:${b.text}`).join('|') === 'A:one|B:two');
  check('...a block never closed is words, not a message', agentBlocks('```message-agent A\nnever closed').length === 0);
  check('...an answer that goes back leaves a trailing OUTCOME line out (the runner\'s)', replyBack('Port 8080.\n\nOUTCOME: done') === 'Port 8080.');
  check('...and the words that go back leave the whole message out, its code block included', replyBack('Hi.\n```message-agent A\nx\n```ts\ny\n```\nz\n```\nBye.') === 'Hi.\n\nBye.'); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
