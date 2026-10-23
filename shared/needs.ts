// What an agent asks you, with the answers it offers (as in the other edition, its T-404: the options did not show in the highlighted
// box): under a question in its ```needs-you block an agent may list its answers, an `options:` line then one `- Label: what it means` line
// each, and the chat shows them as buttons under the question (web/src/md.ts), with one to write your own answer; a tap goes back as your
// reply, the question quoted over it (web/src/needsAnswer.ts). Which questions you answered is read from what you wrote after the box
// (`personReplies`, `answersIn`). Pure: tests/needs.test.ts.
import type { ChatMessage } from './types.js';

// ---- answer buttons (the other edition's T-404: a few answers under the box, and one to type your own; FB-103,
// FB-104). Under a question an agent may list its answers: an `options:` line (`options, any:` lets several be picked), then one `- Label: what
// it means` line each, "(recommended)" after the label it suggests. The app shows them as buttons under the question, with one to write an answer
// instead; a pick goes back as the person's reply, the question quoted over it. A block with no options line shows as before.
export type NeedsOption = { label: string; detail: string; recommended: boolean };
/** One question of a needs-you block: its words (markdown), its options (none: it is answered by typing), whether several may be picked. */
export type NeedsQuestion = { text: string; options: NeedsOption[]; many: boolean };
const OPTIONS = /^\s*(?:options|opciones)\s*(,\s*(?:any|several|varias|cualquiera)\s*)?:\s*$/i;
const ITEM = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.+)$/;
const RECOMMENDED = /\s*\((?:recommended|recomendad[oa])\)\s*/i;
export const OPTIONS_MAX = 6;
/** An option's line read: the label before the first ": " or dash, what it means after it, "(recommended)" anywhere in it. */
/** Characters that change how text reads without being seen (direction overrides and isolates, zero-width marks, the byte order mark): taken
 *  out of a label, so a button never shows other words than the ones it sends (the Coding Agent's review of alpha-20). */
const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
export function optionOf(line: string): NeedsOption | null {
  const recommended = RECOMMENDED.test(line); const plain = line.replace(HIDDEN, '').replace(RECOMMENDED, ' ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim(); if (!plain) return null;
  const cut = /^(.+?)(?::\s+|\s+[—–-]\s+)(.+)$/.exec(plain); const label = (cut ? cut[1]! : plain).replace(/[:.]$/, '').trim();
  return label ? { label: label.slice(0, 80), detail: cut ? cut[2]!.trim() : '', recommended } : null;
}
/** A needs-you block's questions, each with its options: a question's words run up to its `options:` line, its options are the list lines right
 *  under it (at most OPTIONS_MAX), and whatever follows them starts the next question. */
export function needsQuestions(body: string): NeedsQuestion[] {
  const out: NeedsQuestion[] = []; let words: string[] = []; let cur: NeedsQuestion | null = null; let fence = false;
  const close = () => { if (cur) { out.push(cur); cur = null; } };
  const lines = body.split('\n');
  // a numbered line under a question's options that asks something, or that has an options line of its own under it, is the next question
  // ("1. Keep them? options: … 2. Which items? options: …"), never one more option (alpha-21: the second question showed as a button)
  const nextAsks = (i: number, text: string): boolean => { if (/\?["'”»)*_]*$/.test(text.trim())) return true; for (let j = i + 1; j < lines.length; j++) { if (!lines[j]!.trim()) continue; return OPTIONS.test(lines[j]!); } return false; };
  for (const [i, line] of lines.entries()) {
    if (/^\s*```/.test(line)) fence = !fence;
    const head = fence ? null : OPTIONS.exec(line);
    if (head) { close(); cur = { text: words.join('\n').trim(), options: [], many: !!head[1] }; words = []; continue; }
    if (cur) { const item = ITEM.exec(line); if (item && !nextAsks(i, item[1]!)) { const o = optionOf(item[1]!); if (o && cur.options.length < OPTIONS_MAX) cur.options.push(o); continue; } if (!line.trim()) continue; close(); }
    words.push(line);
  }
  close(); const rest = words.join('\n').trim(); if (rest || !out.length) out.push({ text: rest, options: [], many: false });
  return out.filter((q) => q.text || q.options.length).flatMap((q) => (q.options.length ? [q] : asked(q.text)));
}

// Buttons come only from the agent's own `options:` list (FB-112: buttons were made up from fragments of a question; the agent writes logical
// options itself, the app never infers them from an "or"). The app once read them from the question itself (the choices an "or" seemed to
// name, Yes and No for a question that looked like a yes-or-no one); a rule meant for one instruction had been read as one for every
// question. The agents are briefed to write the
// options themselves (`NEEDS_RULE` in shared/types.ts); a question without them is answered by typing.
/** Whether a line asks something: it ends with a question mark (quotes, brackets and emphasis after it aside), and is not a long paragraph. */
const asks = (line: string): boolean => { const plain = line.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim(); return plain.length <= 600 && /\?["'”»)*_]*$/.test(plain); };
/** Words with no options list, split into the questions they ask: each line that ends with a question mark closes one ("1. …?" "2. …?" on
 *  lines of their own too), with the lines before it as its context; words after the last question stay with it. Code is never split. */
function asked(text: string): NeedsQuestion[] {
  const qs: string[] = []; let ctx: string[] = []; let fence = false;
  for (const line of text.split('\n')) { if (/^\s*```/.test(line)) fence = !fence; ctx.push(line); if (!fence && asks(line)) { qs.push(ctx.join('\n').trim()); ctx = []; } }
  const rest = ctx.join('\n').trim(); if (rest) { if (qs.length) qs[qs.length - 1] += `\n\n${rest}`; else qs.push(rest); }
  return qs.filter(Boolean).map((t) => ({ text: t, options: [], many: false }));
}
/** Whether a needs-you block offers answers to pick. */
export const hasOptions = (body: string): boolean => needsQuestions(body).some((q) => q.options.length > 0);
/** The person's answer to a block's questions, as it goes to the agent: each question quoted, what was picked under it. */
export function answerText(questions: { text: string; picks: string[] }[]): string {
  return questions.map((q) => [quoteLines(q.text), q.picks.join(', ')].filter(Boolean).join('\n\n')).join('\n\n');
}
const quoteLines = (text: string): string => text.trim().split('\n').map((l) => (l.trim() ? `> ${l.trimEnd()}` : '>')).join('\n');
/** The person's answers to a box's questions, from what they wrote after it (`reply`, shared/thread.ts `personReplies`: their reply straight
 *  after the box and their later messages that quote one of its questions): each question's state, answered or open, and what was picked. A
 *  question that is quoted is answered by the words under its quote (alpha-21: a box was taken as answered by any later message, and its buttons
 *  went grey while it was still open). Words under no quote (a reply typed straight after the box, said or typed) answer the questions whose
 *  labels they name; naming none, the whole box. A quote of another question is not this box's answer. */
export function answersIn(reply: string, questions: NeedsQuestion[]): { answered: boolean; picks: string[] }[] {
  const segs: { quote: string; text: string[] }[] = []; let seg = { quote: '', text: [] as string[] }; let inQuote = false; let fence = false;
  for (const line of reply.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = fence ? null : /^\s{0,3}>\s?(.*)$/.exec(line);
    if (m) { if (!inQuote) { segs.push(seg); seg = { quote: '', text: [] }; inQuote = true; } seg.quote += `${seg.quote ? '\n' : ''}${m[1]}`; continue; }
    inQuote = false; seg.text.push(line);
  }
  segs.push(seg);
  const flat = (x: string) => x.toLowerCase().replace(HIDDEN, '').replace(/[*_`#]+/g, '').replace(/^\s*(?:[-•]|\d{1,2}[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
  const norm = (x: string) => x.toLowerCase().replace(/[.!¡¿?]+$/g, '').replace(/\s+/g, ' ').trim();
  const parts = segs.map((x) => ({ quote: flat(x.quote), text: x.text.join('\n').trim() })).filter((x) => x.quote || x.text);
  const picksOf = (q: NeedsQuestion, words: string): string[] => { const said = [norm(words), ...words.split(/\s*,\s*|\n/).map(norm)].filter(Boolean); return q.options.filter((o) => said.includes(norm(o.label))).map((o) => o.label); };
  const out = questions.map((q) => {
    const first = flat(q.text.split('\n').find((l) => l.trim()) ?? ''); const whole = flat(q.text);
    const hit = first.length >= 4 ? parts.filter((x) => x.quote && (x.quote.includes(first) || (x.quote.length >= 12 && whole.includes(x.quote)))) : [];
    return hit.length ? { answered: true, picks: [...new Set(hit.flatMap((x) => picksOf(q, x.text)))] } : { answered: false, picks: [] as string[] };
  });
  const own = parts.filter((x) => !x.quote).map((x) => x.text).join('\n').trim();
  if (own) {
    const open = questions.map((q, k) => ({ q, k })).filter(({ k }) => !out[k]!.answered); const chunks = own.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    let named = false;
    for (const { q, k } of open) { const picks = picksOf(q, own); const alone = open.length > 1 && chunks.length === open.length ? picksOf(q, chunks[open.indexOf(open.find((o) => o.k === k)!)]!) : [];
      const got = alone.length ? alone : picks; if (got.length) { out[k] = { answered: true, picks: got }; named = true; } }
    if (!named && !out.some((x) => x.answered)) for (const { k } of open) out[k] = { answered: true, picks: [] }; // a typed answer that names no choice: the box is answered
  }
  return out;
}

const plainText = (m: ChatMessage): string => m.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
const asksYou = (text: string): boolean => /^\s*```needs-you[ \t]*$/m.test(text);
/** A message the person wrote: not an agent's or the app's, which come in as user messages too. */
const byPerson = (m: ChatMessage, text: string): boolean => m.role === 'user' && !!text && !/^\((?:from agent|from the app)\b/.test(text);
/** The lines the person quoted in a message, as words to find in what was asked. */
const quotedIn = (t: string): string[] => [...t.matchAll(/^\s{0,3}>\s?(.+)$/gm)].map((q) => q[1]!.replace(/^\s*(?:[-•*]|\d{1,2}[.)])\s+/, '').replace(/[*_`]+/g, '').trim()).filter((q) => q.length >= 6);
/** What the person wrote that can answer each of the agent's messages that ask something: their message straight after the latest one that asks,
 *  and every later message of theirs that quotes its words. Which question each answers is `answersIn`'s. */
export function personReplies(messages: ChatMessage[]): Map<string, string> {
  const out = new Map<string, string>(); const asked: { id: string; text: string }[] = []; let latest: string | null = null;
  const add = (id: string, t: string) => out.set(id, out.has(id) ? `${out.get(id)}\n\n${t}` : t);
  for (const m of messages) {
    const t = plainText(m);
    if (byPerson(m, t)) { const direct = latest; if (direct) add(direct, t); latest = null; const quoted = quotedIn(t); for (const a of asked) if (a.id !== direct && quoted.some((q) => a.text.includes(q))) add(a.id, t); continue; }
    if (m.role !== 'assistant' || !asksYou(t)) continue;
    asked.push({ id: m.uuid, text: t.replace(/[*_`]+/g, '') }); latest = m.uuid;
  }
  return out;
}
