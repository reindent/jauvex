// A Markdown link served over the web opens as a page in the right pane (2026-10-06, Diego: a .md served by a plain `python3 -m http.server`,
// as text/markdown, opened blank: Chromium downloads that type, and a webview shows nothing). shared/page-kind.ts decides; main asks first.
import { connect, sleep, check, done } from './lib.ts'; import { mkdirSync, writeFileSync } from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const dir = path.join(process.env.CVC_DATA_DIR!, 'served'); mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'notes.md'), '# Served notes\n\nSee [the other one](other.md).\n\n![a picture](img/a.png)\n');
const server = spawn('python3', ['-m', 'http.server', '4474', '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
const { js, close } = await connect(); await sleep(2500);
await js("(() => { const a = document.createElement('a'); a.href = 'http://127.0.0.1:4474/notes.md'; a.textContent = 'x'; document.querySelector('main').appendChild(a); a.click(); a.remove(); })()"); await sleep(2500); // the window catches every link in it
const shown = await js("document.querySelector('.pane-body')?.textContent ?? ''");
check('the served Markdown shows as a page in the pane, not blank', /Served notes/.test(shown) && await js("!!document.querySelector('.pane-body .pane-md h1')"), shown.slice(0, 120));
check('...its relative link made whole against the page', (await js("document.querySelector('.pane-body a')?.getAttribute('href') ?? ''")) === 'http://127.0.0.1:4474/other.md');
check('...and its relative picture is the site\'s, never a file on this computer', (await js("document.querySelector('.pane-body img')?.getAttribute('src') ?? ''")) === 'http://127.0.0.1:4474/img/a.png');
server.kill();
done(close);
