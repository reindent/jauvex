import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { t } from '../../shared/i18n';
import { fileUrl, imageFile, imagePaths } from '../../shared/imagepath';
import { answersIn, needsQuestions } from '../../shared/needs';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown to safe HTML. Images an agent writes with a local path (relative to `base`, its folder, or absolute) are pointed at the file
 *  itself: the window is loaded from a file, so `file://` paths load; DOMPurify would strip that scheme, so it is set after sanitizing. */
/** A local file as an image source: `file://` when the window itself is loaded from a file (the app), the path as it is otherwise. */
export const localSrc = (abs: string): string => (location.protocol === 'file:' ? fileUrl(abs) : abs); // spaces, # and ? encoded, a Windows drive with its third slash
/** "Write your own answer" as an icon, a pen on a form (lucide's file-pen-line, the app's icon set), at the end of a question's answers (T-404,
 *  in place of an "Other..." button). */
const FORM_PEN = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"/><path d="M14.487 7.858A1 1 0 0 1 14 7V2"/><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"/><path d="M8 18h1"/></svg>';
const KEY = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌥' : 'Alt+';
/** `reply`: what you answered the message with, when you have: its questions show as answered, with what you picked. */
export const md = (text: string, base = '', page = '' /* a web page's address: its relative pictures are that site's, never this computer's files */, reply?: string): string => { const html = DOMPurify.sanitize(marked.parse(imagePaths(text), { async: false }) as string); /* a picture's path with spaces or a Windows drive read whole: shared/imagepath.ts */ if (!/<img|<pre/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const img of doc.querySelectorAll('img')) { const src = img.getAttribute('src') ?? ''; if (page && src && !/^(data:|blob:)/i.test(src)) { try { img.setAttribute('src', new URL(src, page).href); } catch { img.removeAttribute('src'); } continue; } if (!src || /^(https?:|data:|blob:|file:)/i.test(src) || src.startsWith('~')) continue; const abs = imageFile(src, base); /* a path with spaces, %20 or a Windows drive: shared/imagepath.ts */ img.setAttribute('src', localSrc(abs)); img.setAttribute('loading', 'lazy'); }
  for (const pre of doc.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    // What an agent needs from you (a question, a decision, a sign-in): its ```needs-you block, drawn in yellow with a blinking dot; a click
    // quotes it in the message box, to answer there (chatTools.ts)
    if (code?.classList.contains('language-needs-you')) {
      const box = doc.createElement('div'); box.className = 'needs-you'; box.setAttribute('role', 'note'); box.title = t('chat.needsYouReply');
      const qs = needsQuestions(code.textContent ?? '');
      if (!qs.some((q) => q.options.length)) box.innerHTML = `<span class="needs-dot" aria-hidden="true"></span><div class="needs-body">${DOMPurify.sanitize(marked.parse(code.textContent ?? '', { async: false }) as string)}</div>`;
      else { const dot = doc.createElement('span'); dot.className = 'needs-dot'; dot.setAttribute('aria-hidden', 'true'); const body = doc.createElement('div'); body.className = 'needs-body'; answerButtons(doc, box, body, qs, reply); box.append(dot, body); } // its answers as buttons, one to write your own
      pre.replaceWith(box); continue;
    }
    // a code block: a button copies it (chatTools.ts)
    const wrap = doc.createElement('div'); wrap.className = 'code-wrap'; pre.replaceWith(wrap); wrap.append(pre);
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'code-copy'; b.textContent = t('chat.copy'); b.title = t('chat.copyCode'); wrap.append(b);
  }
  return doc.body.innerHTML; };

/** A question's answers as buttons (the other edition's T-404: a few alternatives, and a way to type your own): each question
 *  of the box with its options under it, the recommended one marked, the pen-on-form icon to write your own answer at the end of its row. Each
 *  question is answered on its own (alpha-22): in a box of one question a tap sends its pick, and one that allows several picks has a Send of its own; in a box of
 *  several (FB-113) a tap picks, the pen opens a field for an answer of its own, and the box's one Send sends them all. `reply`: what the person answered
 *  (shared/thread.ts `personReplies`), read per question (`answersIn`): an answered question shows what was picked and nothing more can be
 *  pressed; the others stay open. The clicks are the chat's (web/src/needsAnswer.ts); every word here is set as text, never as markup. The box
 *  is drawn from the message and its reply alone: what the person picks or types before sending lives in the page and is put back after each
 *  redraw (`restoreHeld`), so a chat redrawn while a turn runs never rebuilds the field being typed in (2026-10-22: it lost the focus). */
function answerButtons(doc: Document, box: HTMLElement, body: HTMLElement, qs: ReturnType<typeof needsQuestions>, reply?: string): void {
  box.classList.add('needs-ask'); const together = qs.length > 1; if (together) box.dataset.together = '1'; // several questions: picked here, sent together (FB-113)
  const ans = reply !== undefined ? answersIn(reply, qs) : qs.map(() => ({ answered: false, picks: [] as string[] }));
  if (ans.every((a) => a.answered)) box.classList.add('answered');
  const keyed = qs.findIndex((q, i) => q.options.length > 0 && !ans[i]!.answered); // Alt and a digit pick in the first open question
  qs.forEach((q, i) => {
    const done = ans[i]!.answered; const qd = doc.createElement('div'); qd.className = `needs-q${done ? ' answered' : ''}`; qd.dataset.q = q.text; if (q.many) qd.dataset.many = '1';
    const picked = done ? ans[i]!.picks : [];
    if (q.text) { const w = doc.createElement('div'); w.className = 'needs-q-text'; w.innerHTML = DOMPurify.sanitize(marked.parse(imagePaths(q.text), { async: false }) as string); qd.append(w); }
    if (q.options.length || !done) { const row = doc.createElement('div'); row.className = 'needs-opts'; row.setAttribute('role', 'group'); if (q.text) row.setAttribute('aria-label', q.text.slice(0, 120));
      q.options.forEach((o, k) => { const bt = doc.createElement('button'); bt.type = 'button'; bt.className = `needs-opt${o.recommended ? ' rec' : ''}${picked.includes(o.label) ? ' picked' : ''}`; if (together && !done) bt.setAttribute('aria-pressed', String(picked.includes(o.label)));
        bt.dataset.label = o.label; if (done) bt.disabled = true; if (i === keyed && k < 9) bt.title = t('needs.key', { key: `${KEY}${k + 1}` });
        const l = doc.createElement('b'); l.textContent = o.label; bt.append(l);
        if (o.recommended) { const r = doc.createElement('em'); r.textContent = t('needs.recommended'); bt.append(r); }
        if (o.detail) { const d = doc.createElement('small'); d.textContent = o.detail; bt.append(d); }
        row.append(bt); });
      if (!done) { const own = doc.createElement('button'); own.type = 'button'; own.className = 'needs-own'; own.title = t('needs.writeOwn'); own.setAttribute('aria-label', t('needs.writeOwn')); own.innerHTML = FORM_PEN; row.append(own); } // an icon at the end of its answers, the same height as them
      qd.append(row); }
    if (q.many && !done && !together) { const foot = doc.createElement('div'); foot.className = 'needs-foot'; const send = doc.createElement('button'); send.type = 'button'; send.className = 'needs-send'; send.disabled = true; send.textContent = t('needs.send'); foot.append(send); qd.append(foot); }
    body.append(qd); });
  if (together && !ans.every((a) => a.answered)) { const foot = doc.createElement('div'); foot.className = 'needs-foot'; const send = doc.createElement('button'); send.type = 'button'; send.className = 'needs-send'; send.disabled = true; send.textContent = t('needs.sendAll'); foot.append(send); body.append(foot); }
}
