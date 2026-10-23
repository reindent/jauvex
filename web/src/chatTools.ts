// The chat's small tools (1.8.0): a copy button on every code block, a click on what an agent needs from you (its yellow box) quotes it in the
// message box, and a right-click menu on the thread (copy, quote, copy the link or the code). Wired once for the whole window, by delegation,
// so every chat, the right pane's markdown included, gets them. A quote reaches the chat on screen as the `jauvex:quote` event (Composer).
import { t } from '../../shared/i18n';
import { quoteJump } from './quoteJump';

export const QUOTE_EVENT = 'jauvex:quote';
export const quote = (text: string): void => { const q = text.trim(); if (q) window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: q })); };

const copy = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* the older way below */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
  try { return document.execCommand('copy'); } finally { ta.remove(); }
};

/** What a message part says: the selection when it lies inside it, else the whole part (an answer, a bubble, a yellow box). */
const partOf = (el: Element): HTMLElement | null => el.closest<HTMLElement>('.needs-body, .prose, .user .bubble, .pane-md');
const selectedIn = (part: HTMLElement | null): string => { const sel = window.getSelection(); const s = sel?.toString().trim() ?? ''; return s && part && sel?.anchorNode && part.contains(sel.anchorNode) ? s : s && !part ? s : ''; };

let menu: HTMLDivElement | null = null;
const closeMenu = () => { menu?.remove(); menu = null; };

function openMenu(x: number, y: number, items: [string, () => void][]) {
  closeMenu(); if (!items.length) return;
  menu = document.createElement('div'); menu.className = 'menu ctx chat-menu'; menu.setAttribute('role', 'menu');
  for (const [label, run] of items) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); closeMenu(); run(); }; menu.append(b); }
  document.body.append(menu);
  const r = menu.getBoundingClientRect(); // inside the window, never cut off at an edge
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`; menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
}

export function wireChatTools(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null; if (!el) return;
    if (menu && !menu.contains(el)) closeMenu();
    if (quoteJump(el, el.closest<HTMLElement>('.thread'), '.assistant, .user')) { e.preventDefault(); return; } // a quote in a sent message: to what it quotes
    const btn = el.closest<HTMLButtonElement>('.code-copy');
    if (btn) { e.preventDefault(); e.stopPropagation(); const code = btn.parentElement?.querySelector('pre')?.innerText ?? '';
      void copy(code).then((ok) => { if (!ok) return; btn.textContent = t('chat.copied'); btn.classList.add('done'); setTimeout(() => { btn.textContent = t('chat.copy'); btn.classList.remove('done'); }, 1500); }); return; }
    const box = el.closest<HTMLElement>('.needs-you');
    if (box && !box.classList.contains('needs-ask') && !el.closest('a[href]') && !window.getSelection()?.toString().trim()) { /* a box with answer buttons is answered with them (needsAnswer.ts), not by a click on it */ box.classList.add('answered'); quote(box.querySelector<HTMLElement>('.needs-body')?.innerText ?? box.innerText); } // answered: no longer yellow (the CSS also takes a box with a reply after it)
  };
  const onMenu = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null; if (!el || !el.closest('.chat-host, .pane')) return;
    const part = partOf(el); const link = el.closest<HTMLAnchorElement>('a[href]'); const pre = el.closest('pre');
    const sel = selectedIn(part); const text = sel || part?.innerText.trim() || '';
    const items: [string, () => void][] = [];
    if (text) items.push([sel ? t('chat.copySelection') : t('chat.copyMessage'), () => void copy(text)]);
    if (text && el.closest('.chat-host')) items.push([sel ? t('chat.quoteSelection') : t('chat.quoteMessage'), () => quote(text)]);
    if (link) items.push([t('chat.copyLink'), () => void copy(link.getAttribute('href') ?? '')]);
    if (pre) items.push([t('chat.copyCode'), () => void copy((pre as HTMLElement).innerText)]);
    if (!items.length) return;
    e.preventDefault(); openMenu(e.clientX, e.clientY, items);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
  document.addEventListener('click', onClick, true); document.addEventListener('contextmenu', onMenu); document.addEventListener('keydown', onKey); window.addEventListener('blur', closeMenu);
  return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('contextmenu', onMenu); document.removeEventListener('keydown', onKey); window.removeEventListener('blur', closeMenu); };
}
