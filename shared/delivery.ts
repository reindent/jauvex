// A message handed to an agent while its turn is under way (T-228; the user, 2026-09-29: an agent's answer landed in the chat of another agent
// that had asked it a question meanwhile). A chat keeps one address for its turn's answer; a message handed to the turn under way took that
// address, and the answer went to whoever wrote last. Words of the person at the chat still join the turn (steering); a message that wants
// its own answer waits for a turn of its own: a workflow's step (its outcome), a reply the app asked for, or another agent's message while
// the turn answers someone else.
type Address = { kind?: string; key: string };

/** Whether a message for `to`, delivered while a turn answers `current`, waits for a turn of its own. */
export const ownTurn = (to: Address, current?: Address): boolean =>
  to.kind === 'run' || to.kind === 'export' || (!!current && current.key !== to.key);

/** Whether a reply with no address of its own may close the step a run waits on, because it came from that step's agent (T-253; a server's
 *  agents, 2026-10-01: an agent's answer to messages that had waited in its queue, ending "OUTCOME: done", closed the next step, which it had
 *  not started). Only the reply of a turn the window took back after a reload, whose address it cannot know (`takenBack`), and never while
 *  that step's message still waits in the agent's queue (`queued`: the reply addresses waiting there): its answer is still to come. */
export const closesWaitingStep = (takenBack: { queued: string[] } | undefined, step: string): boolean => !!takenBack && !takenBack.queued.includes(step);

/** A reply's words, without the message-agent blocks in it (they went to other agents). */
export const replyBack = (text: string): string => text.replace(/```(?:message-agent|to-agent)[ \t]+[^\n]*\n[\s\S]*?```/g, '').trim();

/** Which of these agents a reply says it will wait for (FB-09, as Jauvex Pro: "I'll start the third when the Designer and the Coding Agent are
 *  done", and nothing woke it): the names it mentions, when it also says it waits for them to finish or answer. The app then waits for those of
 *  them that are working. */
export function waitsFor(text: string, names: string[]): string[] {
  const t = replyBack(text);
  if (!/\b(?:wait(?:ing)?|once|when|as soon as|after|until)\b[^.!?\n]{0,160}\b(?:finish(?:es|ed)?|done|complete[sd]?|repl(?:y|ies|ied)|answers?|report(?:s|ed)?|back|ready)\b|\bwait(?:ing)? for\b/i.test(t)) return [];
  return names.filter((n) => n.trim().length > 2 && new RegExp(`\\b${n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t));
}

/** "No response requested.": what Claude Code writes when it answers a turn by itself (a stopped background job's notice), and what a
 *  model sometimes copies as its whole answer to a real message (Diego, 2026-10-07, as Jauvex Pro: "I still see this in the chat btw, bug").
 *  It is no answer: the app hides it and sends the message again, once. */
export const noResponse = (text: string): boolean => /^\s*No response requested\.?\s*$/i.test(text);
