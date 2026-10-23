// A quote in a sent message takes you to what it quotes (as in the other edition): the newest message above it that holds the quoted words is scrolled
// to, a fold it sits in is opened, and the part it quotes lights up a moment (`.quote-flash`). A quote whose message is not in the thread (an
// older page not loaded) does nothing.
import { flatText, quoteKey } from '../../shared/quote';

/** A click in a chat's thread: true when it was on a quote in a message, which this handles. `messages`: what a message is in this thread. */
export function quoteJump(target: HTMLElement, thread: HTMLElement | null, messages: string): boolean {
  const quote = target.closest<HTMLElement>('.bubble-quote'); if (!quote || !thread) return false;
  const key = quoteKey(quote.textContent ?? ''); if (!key) return true;
  const above = [...thread.querySelectorAll<HTMLElement>(messages)].filter((el) => !el.contains(quote) && !!(el.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING));
  const hit = above.reverse().find((el) => flatText(el.textContent ?? '').includes(key)); if (!hit) return true;
  for (let d = hit.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
  const holds = (el: HTMLElement) => flatText(el.textContent ?? '').includes(key); // a question with its buttons, else the smallest part that holds the words
  const spot = [...hit.querySelectorAll<HTMLElement>('.needs-q')].find(holds) ?? [...hit.querySelectorAll<HTMLElement>('p, li, blockquote, pre, h1, h2, h3, h4')].reverse().find(holds) ?? hit;
  spot.scrollIntoView({ behavior: 'smooth', block: 'center' });
  spot.classList.remove('quote-flash'); void spot.offsetWidth; spot.classList.add('quote-flash'); setTimeout(() => spot.classList.remove('quote-flash'), 2000);
  return true;
}
