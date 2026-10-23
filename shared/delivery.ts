// A message handed to an agent while its turn is under way (T-228: an agent's answer landed in the chat of another agent
// that had asked it a question meanwhile). A chat keeps one address for its turn's answer; a message handed to the turn under way took that
// address, and the answer went to whoever wrote last. Words of the person at the chat still join the turn (steering); a message that wants
// its own answer waits for a turn of its own: a workflow's step (its outcome), a reply the app asked for, or another agent's message while
// the turn answers someone else.
import { withoutOutcome } from './workflow.js';
type Address = { kind?: string; key: string };

/** Whether a message for `to`, delivered while a turn answers `current`, waits for a turn of its own. */
export const ownTurn = (to: Address, current?: Address): boolean =>
  to.kind === 'run' || to.kind === 'export' || (!!current && current.key !== to.key);

/** Whether a reply with no address of its own may close the step a run waits on, because it came from that step's agent (T-253: on a
 *  server, an agent's answer to messages that had waited in its queue, ending "OUTCOME: done", closed the next step, which it had
 *  not started). Only the reply of a turn the window took back after a reload, whose address it cannot know (`takenBack`), and never while
 *  that step's message still waits in the agent's queue (`queued`: the reply addresses waiting there): its answer is still to come. */
export const closesWaitingStep = (takenBack: { queued: string[] } | undefined, step: string): boolean => !!takenBack && !takenBack.queued.includes(step);

/** The message-agent blocks of a reply, each read to its own closing fence (T-325, FB-54, from Pro: a brief with a code block in it was cut
 *  at that code block, the rest shown in the chat as words to them and never sent): a fence inside the message that names a language
 *  (```ts) opens a code block that the next bare ``` closes; a bare ``` outside one ends the message. A block never closed is no message. */
export function agentBlocks(text: string): { to: string; text: string; start: number; end: number }[] {
  const out: { to: string; text: string; start: number; end: number }[] = []; const lines = text.split('\n'); let i = 0, pos = 0;
  while (i < lines.length) {
    const open = /^\s*```(?:message-agent|to-agent)[ \t]+"?([^\n"`]+?)"?[ \t]*$/.exec(lines[i]!);
    if (!open) { pos += lines[i]!.length + 1; i++; continue; }
    let j = i + 1, inner = false; const body: string[] = [];
    for (; j < lines.length; j++) { const fence = /^\s*```(\S*)/.exec(lines[j]!); if (fence && (inner || !fence[1])) { if (!inner) break; inner = false; } else if (fence) inner = true; body.push(lines[j]!); }
    if (j >= lines.length) { pos += lines[i]!.length + 1; i++; continue; } // never closed: the words stay words
    const end = pos + lines.slice(i, j + 1).reduce((n, l) => n + l.length + 1, 0) - 1;
    out.push({ to: open[1]!.trim(), text: body.join('\n').trim(), start: pos, end }); pos = end + 1; i = j + 1;
  }
  return out;
}
/** A reply's words, without the message-agent blocks in it (they went to other agents). */
export const replyBack = (raw: string): string => { const text = withoutOutcome(raw); /* without a trailing OUTCOME line (the runner's, read from the raw text) */ let out = '', at = 0; for (const b of agentBlocks(text)) { out += text.slice(at, b.start); at = b.end; } return (out + text.slice(at)).trim(); };

/** "No response requested.": what Claude Code writes when it answers a turn by itself (a stopped background job's notice), and what a
 *  model sometimes copies as its whole answer to a real message (as in Jauvex Pro, where it showed in the chat).
 *  It is no answer: the app hides it and sends the message again, once. */
export const noResponse = (text: string): boolean => /^\s*No response requested\.?\s*$/i.test(text);

/** The message nothing visible came back to (FB-50: an empty reply, or only "No response requested.", or a
 *  turn cut off or lost, left nothing under the message, as if it was swallowed): the uuid of the last message to this agent (the person's or
 *  another agent's) when no answer, message to another agent, failure card or app note followed it; null when one did, or a turn still runs.
 *  Hidden messages (meta) are not looked at. */
type Said = { uuid: string; role: 'user' | 'assistant' | 'system'; meta: boolean; blocks: { type: string; text?: string }[] };
export function unanswered(messages: Said[], running: boolean): string | null {
  if (running) return null;
  const text = (m: Said) => m.blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!; if (m.meta) continue; const tx = text(m);
    if (m.role === 'system') return null; // a failure card: something visible came back
    if (m.role === 'assistant') { if (tx && !noResponse(tx)) return null; continue; } // an answer, or a message to another agent
    if (/^\(from the app\)/.test(tx)) return null; // the app's own note
    return tx ? m.uuid : null; // the last thing said to this agent, with nothing visible after it
  }
  return null;
}

/** A needs-you block (1.8.0): what an agent needs from the user, which the app shows in yellow. It is the user's, even in a turn that answers
 *  another agent: it stays in sight in their chat, and the answer that goes back to that agent leaves it out (Pro's FB-111). */
const NEEDS_YOU = /```needs-you[ \t]*\n[\s\S]*?```/g;
export const needsYouIn = (text: string): boolean => new RegExp(NEEDS_YOU.source).test(text);
export const withoutNeedsYou = (text: string): string => text.replace(NEEDS_YOU, '');
