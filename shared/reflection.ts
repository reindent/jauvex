// Stage two of the voice, the understanding, is a reflection and nothing else (T-201; the user, 2026-09-28: it "should not attempt to solve the
// user's problem or answer the question ... other than just reinforcing what the user said"; the resolution is stage three's). The voice
// model is told so; this is the net for what a small model still slips in, applied before the line is spoken (AGENTS.md: validate every line):
// every clause that speaks for the work, asks the user for something, asks a question, judges or answers is taken out, and what is left
// must still carry an understanding. Found in the logs: "I'll fix the connection stability ... now", "Sending that now.", "Tell me where the
// summary is", "That's a fair point", "I'm doing well, thanks for asking. What can I help you with today?". What it cannot see, an answer
// worded in the third person ("the loop limit would stop you"), is the prompt's to stop. Pure: the main process runs it on the voice model's
// line before it is spoken.

/** A bare quick line ("Sure, one moment"): stage one already said it. */
export const WEAK = /^\W*(sure|okay|ok|got it|alright|right|mmm|one (second|moment|sec)|give me a (second|moment)|let me (check|think|see|look))\W*(one (second|moment|sec)|give me a (second|moment)|on it|working on (it|that)( now)?|let me (check|think|see|look))?\W*$/i;
/** Words: a line under it carries no understanding. The prompt asks for 6 to 20. */
export const FLOOR = 6;
/** A quick line, or too short to carry an understanding. */
export const weak = (line: string): boolean => !line.trim() || WEAK.test(line) || line.trim().split(/\s+/).length < FLOOR;

/** What the assistant is doing, as in "I'm sending" or a bare "Checking ... now". */
const VERBS = 'checking|looking|pulling|sending|starting|opening|digging|fixing|adding|drafting|rendering|connecting|installing|sorting|working|searching|loading|pushing|preparing|updating|verifying|reviewing|deploying|releasing|testing|running|writing|building|creating|switching|stopping|queueing|queuing|keeping|holding|cancelling|canceling';
/** Speaks for the work: a plan or a promise, the assistant's or ours ("I'll check", "let me", "we'll", "I'm sending"). "I can see you want"
 * is a reflection, not an offer. */
const PLAN = new RegExp(`^(i'll|i will|i'm going to|i am going to|i'm gonna|i'm about to|i'd|i would|i can(?! (see|tell|hear))|i could|i should|i need to|i want to|i must|let me|let's|let us|we'll|we will|we're going to|we can|we should|we need to|i'm (${VERBS}|asking|telling|passing|handing|getting|setting|making|taking|trying)|i am (${VERBS})|we're (${VERBS}))\\b`);
/** The same with no "I": "Checking what ... now", "Pulling those up now", "On it". */
const DOING = new RegExp(`^((${VERBS})\\b|on it\\b|one (second|moment|sec)\\b|give me a (second|moment)\\b|stand by\\b|hang on\\b|hold on\\b|right away\\b|coming (right )?up\\b)`);
/** Any verb in -ing opening a clause that never turns to the user is the work too ("moving the export button ... and deploying to staging",
 * after a BUSY word taken off): a list of verbs always misses one. A reflection turns to the user ("you"); words in -ing that are not
 * verbs ("nothing", "something", "morning") open reflections as well. */
const GERUND = /^[a-z]{3,}ing\b/, NOT_VERB = /^(nothing|something|everything|anything|thing|things|morning|evening|meeting|during|string|spring|ceiling|king|ring|wing|bring)\b/, TO_USER = /\byou(r|rs|'re|'ve|'ll|'d)?\b/;
/** Asks the user for something, with or without a "?". */
const REQUEST = /^(tell me|send me|send it|send over|show me|give me|let me know|please (tell|send|show|give|share|paste|let|confirm)|can you|could you|would you|will you|do you want|would you like|should i|shall i|want me to|anything else)\b/;
/** A judgement, praise or cheer, or an answer to small talk. A bare adjective opens a reflection too ("Better logs for the voice"), so it
 * counts only with "that's", "it sounds" and the like before it, a word of judgement after it ("good question"), or on its own. */
const ADJ = '(fair|good|great|nice|excellent|interesting|strange|odd|weird|smart|simpler|better|clever|brilliant|valid|reasonable|tricky|frustrating|annoying|shame|pity|awesome|amazing|cool|lovely|wonderful|fantastic)';
const JUDGE = new RegExp(`^(that's|that is|this is|it's|it is|what a|sounds|that sounds|this sounds|it sounds)\\s+((a|an|really|very|so|such a|pretty|quite)\\s+)?${ADJ}\\b|^${ADJ}\\s+(question|point|idea|call|catch|thought|one|choice|plan|find|news)\\b|^${ADJ}[\\s.!,]*$|^(makes sense|that makes sense|fair enough|congratulations|congrats|well done|nice work|good job|great job|great work|happy to help|glad|my pleasure|you're welcome|no problem|thanks for|thank you|i'm (doing )?(well|good|great|fine|okay)|i love|love (it|that|this)|i like)\\b`);
/** A guess the user did not make: why, how or what happened is the main assistant's to find out. */
const GUESS = /^(probably|maybe|perhaps|i think|i guess|i bet|i suspect|likely|it seems|seems like|looks like|it looks like|must be|must have)\b/;
/** Says it cannot see or does not know: never the voice's to say. */
const UNSURE = /^(i don't|i do not|i can't|i cannot|i have no|i haven't|i'm not sure|i am not sure|no idea|not sure)\b/;
/** A question to the user (a "?" after a reflection, "So you're asking whether ...?", is only a rising voice: kept, as a statement). */
const ASKS = /^(what|which|who|whom|whose|where|when|why|how|do|does|did|should|shall|can|could|would|will|is|are|was|were|am|have|has|had|want|need|anything|any|ready)\b/;
/** Words that only open a clause ("Got it,", "So", "and"): skipped to see what the clause does, kept in what is said. */
const FILLER = /^((got it|okay|ok|alright|all right|right|sure|so|and|then|but|now|also|first|yes|yeah|hmm+|mm+|oh|well)\b[\s,.!:]*)+/;
/** A cheer opening a clause, as an interjection, is taken out of what is said ("Great, so you want ..." says "So you want ..."); "Great
 * question" is a judgement, not a cheer. */
const CHEER = /^((great|perfect|nice|awesome|excellent|amazing|wonderful|fantastic|cool|love it)\s*[,!.]\s*)+/i;
/** Where a plan joined by a comma, or by "and", "so" or "then", starts: "... picked up, so I'll check", "... is and I'll review it". Never at
 * a bare space: "You're asking whether I'll restart it" is a reflection. */
const JOINED = new RegExp(`(?:,\\s+(?:(?:so|and|then|but|while)\\s+)?|\\s+(?:so|and|then|but)\\s+)(?:(?:first|now|also|just|then)\\s+)?(?=(?:i'll|i will|i'm going to|i am going to|let me|let's|we'll|we will|i'm (?:${VERBS}))\\b)`, 'i');
/** A pronoun that says who someone is: the user's words may give one, the voice never guesses one (the user's rule for every agent). */
const HE = /\b(he|him|his|himself)\b/i, SHE = /\b(she|her|hers|herself)\b/i;

type Part = { text: string; end: string };
const plain = (s: string) => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');

/** The line split into clauses, each with what ended it: . ! ? ; a dash, a comma before a joined plan, or nothing at the end. */
function clauses(line: string): Part[] {
  const parts: Part[] = []; let from = 0;
  const cut = /([.!?]+)(?=\s|$)|;|\s*[—–]\s*|\s+-\s+/g; let m: RegExpExecArray | null;
  const push = (text: string, end: string) => { const t = text.trim(); if (t) parts.push({ text: t, end }); else if (parts.length && end) parts[parts.length - 1]!.end = end; };
  while ((m = cut.exec(line))) { const end = m[1] ?? (m[0].trim() === ';' ? ';' : '—'); push(line.slice(from, m.index), end); from = m.index + m[0].length; }
  push(line.slice(from), '');
  const out: Part[] = []; // a plan joined by a comma or "and"/"so" inside a clause is a clause of its own
  for (const p of parts) { let rest = p.text; for (let j = JOINED.exec(rest); j && j.index > 0; j = JOINED.exec(rest)) { out.push({ text: rest.slice(0, j.index).trim(), end: ',' }); rest = rest.slice(j.index + j[0].length); } out.push({ text: rest.trim(), end: p.end }); }
  return out.filter((p) => p.text);
}

/** Why a clause is not said, or null when it is part of the reflection. `heard`: what the user said, when known. */
function reason(p: Part, heard: string | null): string | null {
  const s = plain(p.text).toLowerCase().replace(CHEER, '').replace(FILLER, '').replace(/^["'(]+/, '').trim();
  if (!s) return 'only a quick word'; // "Got it.": stage one said that already
  if (PLAN.test(s) || DOING.test(s) || (GERUND.test(s) && !NOT_VERB.test(s) && !TO_USER.test(s))) return 'speaks for the work';
  if (REQUEST.test(s)) return 'asks the user for something';
  if (UNSURE.test(s)) return 'says it does not know';
  if (JUDGE.test(s)) return 'judges or answers';
  if (GUESS.test(s)) return 'guesses';
  if (p.end === '?' && ASKS.test(s)) return 'asks a question';
  if (heard !== null && ((HE.test(s) && !HE.test(heard)) || (SHE.test(s) && !SHE.test(heard)))) return 'guesses a pronoun';
  return null;
}

/** The line with only its reflection left, and what was taken out (for the flight recorder). Idempotent: a checked line comes back as it is.
 * `heard`: what the user said, to tell a pronoun they gave from one the voice guessed; left out, pronouns are not checked. */
export function reflectionOnly(line: string, heard?: string): { line: string; dropped: string[] } {
  const said0 = heard === undefined ? null : plain(heard);
  const parts = clauses(plain(line).replace(/\s+/g, ' ').trim().replace(/^"+|"+$/g, '').trim()); const dropped: string[] = [];
  const keep = parts.map((p) => { const why = reason(p, said0); if (why) dropped.push(`${p.text} (${why})`); return !why; });
  let said = '';
  parts.forEach((p, i) => {
    if (!keep[i]) return;
    const text = p.text.replace(CHEER, ''); if (!text) return;
    const next = keep[i + 1] === true; // what ended it stays only when the clause after it is said too
    const end = p.end === '?' ? '.' : p.end === ',' || p.end === ';' ? (next ? p.end : '.') : p.end === '—' ? (next ? ' —' : '.') : p.end || '.';
    said += `${said ? ' ' : ''}${said && /[.!?]$/.test(said) ? text[0]!.toUpperCase() + text.slice(1) : text}${end}`;
  });
  said = said.replace(/\s+([,;])/g, '$1').trim(); if (said) said = said[0]!.toUpperCase() + said.slice(1);
  return { line: said, dropped };
}

/** What the voice may say for stage two: the reflection, or nothing when too little of one is left. */
export const spokenReflection = (line: string, heard?: string): string => { const r = reflectionOnly(line, heard).line; return weak(r) ? '' : r; };

// Greetings, small talk and thanks have nothing to reflect, and whatever stage two says to them answers ("I'm doing well, thanks for
// asking"): stage two says nothing. Jev decides first (electron/voice.ts); this is the rule when Jev is absent or unsure.
const SMALL = /\b(hi|hello|hey|hiya|howdy|good (morning|afternoon|evening|night)|morning|evening|how are (you|things)|how's it going|how is it going|how have you been|what's up|whats up|thanks|thank you|thx|cheers|appreciate it|great job|good job|nice work|well done|good work|great work|awesome|perfect|great|nice|cool|okay|ok|alright|all right|are you there|you there|hope you('re| are| had| have)( a)? (well|good|nice|great|fine|doing well)( (day|weekend|one|night|time))?|nice to (see|meet|hear from) you|bye|goodbye|see you|have a (good|nice|great) (day|one|night|evening|weekend))\b/g;
const FILL = /\b(jauvex|claude|codex|grok|jev|there|buddy|mate|man|guys|again|so|and|just|really|very|much|so much|today|doing|you|all|too|as well|a lot|lot|for that|for this|for it|it|that|this|oh|well|yes|yeah)\b/g;
/** Only a greeting, small talk or thanks: fewer than three words left once those are taken out. */
export function smallTalk(utterance: string): boolean {
  const rest = plain(utterance).toLowerCase().replace(SMALL, ' ').replace(FILL, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/(^|\s)'+|'+(\s|$)/g, ' ').trim();
  return (rest ? rest.split(/\s+/).length : 0) < 3;
}
