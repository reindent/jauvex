import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown to safe HTML. Images an agent writes with a local path (relative to `base`, its folder, or absolute) are pointed at the file
 *  itself: the window is loaded from a file, so `file://` paths load; DOMPurify would strip that scheme, so it is set after sanitizing. */
export const md = (text: string, base = ''): string => { const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string); if (!/<img/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const img of doc.querySelectorAll('img')) { const src = img.getAttribute('src') ?? ''; if (!src || /^(https?:|data:|blob:|file:)/i.test(src) || src.startsWith('~')) continue; const abs = src.startsWith('/') ? src : `${base.replace(/\/$/, '')}/${src.replace(/^\.\//, '')}`; img.setAttribute('src', location.protocol === 'file:' ? `file://${encodeURI(abs)}` : abs); img.setAttribute('loading', 'lazy'); }
  return doc.body.innerHTML; };
