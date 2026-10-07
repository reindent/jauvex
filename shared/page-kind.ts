// What the right pane does with a web link (2026-10-06, Diego: a Markdown file served by a plain `python3 -m http.server`, as text/markdown,
// opened blank: Chromium shows no text/markdown page, it downloads it, and a webview downloads nothing). Pure: tests/page-kind.test.ts.
// markdown: drawn as a page by the app; text: shown as plain text by the app; web: the page itself, in a webview, as before.
export type PageKind = 'markdown' | 'text' | 'web';
const SHOWN = /^(?:text\/(?:html|plain|css|javascript|xml)|application\/(?:json|xml|xhtml\+xml|pdf|javascript)|image\/|video\/|audio\/)/i; // Chromium shows these itself

export function pageKindOf(contentType: string | null | undefined, url: string): PageKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  let file = ''; try { file = new URL(url).pathname.toLowerCase(); } catch { /* not a URL: by its type alone */ }
  if (/markdown/.test(ct) || (/\.(?:md|markdown|mdown)$/.test(file) && (!ct || ct === 'text/plain' || ct === 'application/octet-stream'))) return 'markdown';
  if (!ct || SHOWN.test(ct)) return 'web';
  if (ct.startsWith('text/') || /^application\/(?:x-yaml|yaml|toml|x-sh|x-python)/.test(ct)) return 'text'; // a text Chromium would download: shown as text
  return 'web';
}
