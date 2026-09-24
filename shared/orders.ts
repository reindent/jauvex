/**
 * When the app carries out an order said to it (open a new agent, restart) and when it asks first. Pure, checked in tests/orders.test.ts.
 * The rule (the user's, 2026-09-23): the app acts on its own only when it is sure the words are an order for it. When nobody is sure,
 * it asks in one short line; a clear yes carries the order out, anything else sends the words to the agent as they were said.
 * A misread order creates or stops things nobody asked for: "give me the handoff instructions so the other agent can work on this"
 * opened a new agent (Jev leaned to the agent at 0.55, the voice model read an order, and the app acted on the voice model alone).
 */
export const JEV_MIN_CONFIDENCE = 0.6; // below this Jev's pick is not taken: the voice model is asked instead
export const JEV_SURE = 0.85;          // at or above this, Jev's word alone makes the app act; between the two, it asks

export type OrderVerdict = 'act' | 'ask' | 'pass';
/** exact: the words are the order and nothing else ("restart the app"). jev: its pick (for the app or the agent) and how sure.
 *  model: what the voice model read, when it was asked (null: not asked, or no usable answer). */
export function orderVerdict(o: { exact?: boolean; jev?: { forApp: boolean; confidence: number } | null; model?: 'order' | 'not' | null }): OrderVerdict {
  if (o.exact) return 'act';
  const j = o.jev;
  if (j && j.confidence >= JEV_MIN_CONFIDENCE) return !j.forApp ? 'pass' : j.confidence >= JEV_SURE ? 'act' : 'ask';
  return o.model === 'not' ? 'pass' : 'ask'; // nobody sure: it may be an order, so it is asked, never carried out
}

/** The answer to the app's question: a clear yes, a clear no, or neither (then the words go to the agent). */
export function answerIs(text: string): 'yes' | 'no' | null {
  const t = text.trim().toLowerCase().replace(/[.,!?…]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!t || t.split(' ').length > 8) return null;
  if (/^(?:no|nope|nah|not that|don'?t|do not|cancel|never ?mind|stop)\b/.test(t) || /\b(?:for the agent|to the agent|send it)\b/.test(t)) return 'no';
  if (/^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|correct|right|exactly|please do|do it|go ahead|go for it|open it|create it|make it|restart(?: it)?)\b/.test(t)) return 'yes';
  return null;
}

/** Does a spoken stop carry more than the stop itself? "Okay, wait a second. List, list, list. Before you do anything, stop." does:
 * the turn is cut and those words then go to the agent, since they tell it what to do next. "Stop", "hold on, stop that" or
 * "okay wait, before you do anything, stop" do not: nothing is left once the words that only stop are taken out. (2026-09-23: a
 * stop's words were dropped whatever they said, and never shown in the chat either.) */
const ONLY_STOP = /\b(?:before you do anything(?: else)?|don'?t do anything(?: yet| else)?|wait a (?:second|sec|minute|moment)|hold on|hang on|one (?:second|sec|moment)|a (?:second|sec|moment)|right now|stop (?:it|that|this|now|there)|cancel (?:it|that|this)|stop+(?:ping)?|wait|cancel|enough|halt|pause|okay|ok|hey|so|and|just|please|now|no|that|it|this|everything|all)\b/gi;
export const stopSaysMore = (text: string): boolean => /\p{L}/u.test(text.replace(ONLY_STOP, ' '));
