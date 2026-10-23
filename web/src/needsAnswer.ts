// The answer buttons under an agent's question (the other edition's T-404, shared/needs.ts, drawn by web/src/md.ts). A box
// with one question is answered at a tap: the pick is sent at once as the person's reply, the question quoted over it; a question that allows
// several picks marks them and its own Send sends them; "Write your own" puts the question in the message box as a quote, to answer there. A box
// with several questions is answered all at once (FB-113; a tap sent one answer and the agent went on before the others were picked): a tap only
// picks (changeable), the pen opens a field under its question to type an answer of its own, and the box's one Send sends every answer given,
// each under its own quoted question; a question left without one stays open. What is picked or typed is held here by question, so a box drawn
// again (a reply arrived, the chat reopened) shows it still.
import { answerText } from '../../shared/needs';

export type NeedsAct = { send: (text: string) => void; own: (questions: string) => void };
/** What the person picked or typed in a box of several questions, not sent yet, by the question's words (md.ts draws it back). */
const held = new Map<string, { picks: string[]; own?: string }>();
/** The question whose own answer was typed last, where the caret was, and when: put back in focus when its box is drawn anew. */
let typing: { key: string; start: number; end: number; at: number } | null = null;
export const heldAnswer = (question: string): { picks: string[]; own?: string } | undefined => held.get(question);
const keep = (q: HTMLElement) => { const picks = [...q.querySelectorAll<HTMLElement>('.needs-opt.picked')].map((b) => b.dataset.label ?? '').filter(Boolean); const field = q.querySelector<HTMLInputElement>('.needs-own-text');
  const key = q.dataset.q ?? ''; if (picks.length || field) held.set(key, { picks, ...(field ? { own: field.value } : {}) }); else held.delete(key); };
const given = (q: HTMLElement): string[] => { const own = q.querySelector<HTMLInputElement>('.needs-own-text')?.value.trim() ?? '';
  const picks = [...q.querySelectorAll<HTMLElement>('.needs-opt.picked')].map((b) => b.dataset.label ?? '').filter(Boolean); return own ? (q.dataset.many ? [...picks, own] : [own]) : picks; };
/** The box's Send: on while any open question has an answer. */
const ready = (box: HTMLElement) => { const send = box.querySelector<HTMLButtonElement>(':scope > .needs-body > .needs-foot .needs-send'); if (send) send.disabled = ![...box.querySelectorAll<HTMLElement>('.needs-q:not(.answered)')].some((q) => given(q).length); };
const done = (box: HTMLElement, qs: HTMLElement[]) => { for (const q of qs) { q.classList.add('answered'); for (const b of q.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) b.disabled = true; held.delete(q.dataset.q ?? ''); } // until the reply comes back and the box is drawn answered
  if ([...box.querySelectorAll('.needs-q')].every((x) => x.classList.contains('answered'))) { box.classList.add('answered'); const send = box.querySelector<HTMLButtonElement>(':scope > .needs-body > .needs-foot .needs-send'); if (send) send.disabled = true; } };

/** A click in a chat's thread: true when it was on one of a question's buttons, which this handles. */
export function needsClick(target: HTMLElement, act: NeedsAct): boolean {
  if (target.closest('.needs-you .needs-own-text')) return true; // typing in a question's own answer: not a click on the box (which quotes it)
  const btn = target.closest<HTMLButtonElement>('.needs-opt, .needs-send, .needs-own'); const box = btn?.closest<HTMLElement>('.needs-you'); if (!btn || !box) return false;
  const together = !!box.dataset.together; const q = btn.closest<HTMLElement>('.needs-q');
  if (together && btn.classList.contains('needs-send') && !q) { // the box's one Send: every open question that has an answer, each under its own quote
    if (btn.disabled || box.classList.contains('answered')) return true;
    const open = [...box.querySelectorAll<HTMLElement>('.needs-q:not(.answered)')].map((x) => ({ x, picks: given(x) })).filter((a) => a.picks.length); if (!open.length) return true;
    done(box, open.map((a) => a.x)); act.send(answerText(open.map((a) => ({ text: a.x.dataset.q ?? '', picks: a.picks })))); return true; }
  if (!q || btn.disabled || q.classList.contains('answered')) return true;
  if (btn.classList.contains('needs-own')) {
    if (!together) { act.own(q.dataset.q ?? ''); return true; }
    let field = q.querySelector<HTMLInputElement>('.needs-own-text'); // several questions: a field of its own, under its answers
    if (!field) { field = ownField(q); keep(q); } field.focus(); return true; }
  if (btn.classList.contains('needs-opt')) {
    if (q.dataset.many) { btn.classList.toggle('picked'); btn.setAttribute('aria-pressed', String(btn.classList.contains('picked'))); const send = q.querySelector<HTMLButtonElement>('.needs-send'); if (send) send.disabled = !q.querySelector('.needs-opt.picked'); if (together) { keep(q); ready(box); } return true; }
    const was = btn.classList.contains('picked'); for (const b of q.querySelectorAll<HTMLButtonElement>('.needs-opt.picked')) { b.classList.remove('picked'); b.setAttribute('aria-pressed', 'false'); }
    if (together) { if (!was) { btn.classList.add('picked'); btn.setAttribute('aria-pressed', 'true'); const field = q.querySelector<HTMLInputElement>('.needs-own-text'); if (field) field.value = ''; } keep(q); ready(box); return true; } // picked, not sent: a second tap takes it back
    btn.classList.add('picked'); btn.setAttribute('aria-pressed', 'true');
  }
  const picks = given(q); if (!picks.length) return true;
  done(box, [q]); act.send(answerText([{ text: q.dataset.q ?? '', picks }])); return true;
}
/** The field to type a question's own answer in a box of several questions; md.ts draws it the same way when it was open. */
export function ownField(q: HTMLElement, value = ''): HTMLInputElement {
  const doc = q.ownerDocument; const field = doc.createElement('input'); field.type = 'text'; field.className = 'needs-own-text'; field.setAttribute('value', value); // an attribute: md.ts's copy is written out as markup
  field.placeholder = q.querySelector<HTMLElement>('.needs-own')?.title ?? ''; field.setAttribute('aria-label', field.placeholder); field.autocomplete = 'off';
  q.querySelector('.needs-own')?.classList.add('on'); q.querySelector('.needs-opts')?.after(field); return field;
}
/** Typing in a question's own field (the thread's input event): a typed answer takes the place of a single pick, and the box's Send follows. */
export function needsInput(target: HTMLElement): void {
  const field = target.closest<HTMLInputElement>('.needs-own-text'); const q = field?.closest<HTMLElement>('.needs-q'); const box = q?.closest<HTMLElement>('.needs-you'); if (!field || !q || !box) return;
  if (field.value.trim() && !q.dataset.many) for (const b of q.querySelectorAll<HTMLButtonElement>('.needs-opt.picked')) { b.classList.remove('picked'); b.setAttribute('aria-pressed', 'false'); }
  keep(q); ready(box); typing = { key: q.dataset.q ?? '', start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length, at: Date.now() };
}
/** What the person picked or typed in a box of several questions and has not sent, put back on the boxes as drawn; run after every render of the
 *  thread. md.ts draws a box from the message and its reply alone, so a chat redrawn while a turn runs leaves the box's markup as it was and the
 *  field being typed in stays the same element (2026-10-22: it lost the focus at every redraw); a box drawn anew (a reply arrived, the chat
 *  reopened) gets back its picks, its own answers, its Send, and the focus of the field typed in a moment ago, where the caret was. */
export function restoreHeld(root: HTMLElement | null): void {
  if (!root || !held.size) return;
  for (const box of root.querySelectorAll<HTMLElement>('.needs-you[data-together]:not(.answered)')) {
    let any = false;
    for (const q of box.querySelectorAll<HTMLElement>('.needs-q:not(.answered)')) {
      const key = q.dataset.q ?? ''; const h = held.get(key); if (!h) continue; any = true;
      for (const b of q.querySelectorAll<HTMLButtonElement>('.needs-opt')) { const on = h.picks.includes(b.dataset.label ?? ''); if (b.classList.contains('picked') !== on) { b.classList.toggle('picked', on); b.setAttribute('aria-pressed', String(on)); } }
      if (h.own === undefined) continue;
      let field = q.querySelector<HTMLInputElement>('.needs-own-text'); if (!field) { field = ownField(q, h.own); field.value = h.own; }
      const lost = !document.activeElement || document.activeElement === document.body;
      if (typing && typing.key === key && lost && Date.now() - typing.at < 10_000) { field.focus(); try { field.setSelectionRange(typing.start, typing.end); } catch { /* a field that takes no selection */ } }
    }
    if (any) ready(box);
  }
}
/** Alt (Option on a Mac) and a digit: that option of the newest question still open in the thread, as a click on it; true when one was there.
 *  In a box of several questions it picks in the first one with nothing picked yet. Enter in a question's own field sends the box.
 *  Never while typing: on a Mac, Option and a digit type a character (¡ ™ £ …), and one typed in the message box must stay a character, never
 *  send an answer (a code review of alpha-20). */
export function needsKey(e: KeyboardEvent, thread: HTMLElement | null): boolean {
  const own = e.target instanceof Element ? e.target.closest<HTMLInputElement>('.needs-own-text') : null;
  if (own && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { const send = own.closest('.needs-you')?.querySelector<HTMLButtonElement>(':scope > .needs-body > .needs-foot .needs-send'); if (send && !send.disabled) { e.preventDefault(); send.click(); } return true; }
  if (!thread || !e.altKey || e.ctrlKey || e.metaKey || e.isComposing || !/^Digit[1-9]$/.test(e.code)) return false;
  const at = (e.target instanceof Element ? e.target : null) ?? document.activeElement;
  if (at?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false; // typing somewhere
  const box = [...thread.querySelectorAll<HTMLElement>('.needs-you.needs-ask:not(.answered)')].filter((b) => b.querySelector('.needs-q:not(.answered) .needs-opt')).at(-1); if (!box) return false;
  const open = [...box.querySelectorAll<HTMLElement>('.needs-q:not(.answered)')].filter((x) => x.querySelector('.needs-opt'));
  const q = (box.dataset.together ? open.find((x) => !given(x).length) : undefined) ?? open[0];
  const btn = q?.querySelectorAll<HTMLButtonElement>('.needs-opt')[Number(e.code.slice(5)) - 1]; if (!btn) return false;
  e.preventDefault(); btn.click(); return true;
}
