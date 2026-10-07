// The right pane and a web link's type (2026-10-06, Diego: a Markdown link served by `python3 -m http.server` as text/markdown opened blank).
import { pageKindOf } from '../shared/page-kind.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
check('a Markdown file served as text/markdown is drawn by the app as a page (it opened blank)', pageKindOf('text/markdown; charset=utf-8', 'http://100.1.2.3:8765/notes.md') === 'markdown');
check('...and so is a .md served as plain text, or with no type', pageKindOf('text/plain', 'http://h/x/README.md') === 'markdown' && pageKindOf('', 'http://h/a.markdown') === 'markdown' && pageKindOf('application/octet-stream', 'http://h/a.md') === 'markdown');
check('a text Chromium would download (YAML, CSV, a script) is shown as text', pageKindOf('text/csv', 'http://h/a.csv') === 'text' && pageKindOf('text/x-python', 'http://h/a.py') === 'text' && pageKindOf('application/x-yaml', 'http://h/a.yml') === 'text');
check('web pages, plain text, JSON, PDFs and images stay in the browser', ['text/html', 'text/plain', 'application/json', 'application/pdf', 'image/png'].every((ct) => pageKindOf(ct, 'http://h/page') === 'web'));
check('an HTML page whose address ends in .md stays a page', pageKindOf('text/html', 'http://h/docs/x.md') === 'web');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
