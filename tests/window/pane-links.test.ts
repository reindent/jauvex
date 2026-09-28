// A link inside a file shown in the right pane opens beside that file, not beside the app (T-183): the pane sat outside <main>, where the
// app catches links, so a click there became a navigation and a relative link resolved against the app's own dist/ folder.
import { connect, sleep, check, done, V } from './lib.ts'; import { mkdirSync, writeFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const dir = path.join(process.env.CVC_DATA_DIR!, 'notes'); mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'a.md'), '# First note\n\nSee [the other note](other.md) for the rest.\n');
writeFileSync(path.join(dir, 'other.md'), '# The other note\n\nIt sits beside the first one.\n');
const appUrl = await js('location.href');
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
await js(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(path.join(dir, 'a.md'))}; a.textContent = 'x'; ${V}.querySelector('.scroll').appendChild(a); a.click(); a.remove(); })()`); await sleep(1500);
check('the file opens in the pane, with its link', (await js("document.querySelector('.pane-title')?.textContent")) === 'a.md' && await js("!!document.querySelector('.pane-body a[href=\"other.md\"]')"));
await js("document.querySelector('.pane-body a[href=\"other.md\"]').click()"); await sleep(1500);
const shown = await js("document.querySelector('.pane-body')?.textContent ?? ''");
check('its link opens the file beside it, in the pane', (await js("document.querySelector('.pane-title')?.textContent")) === 'other.md' && /The other note/.test(shown) && /beside the first one/.test(shown), shown.slice(0, 120));
check('...and the window stayed where it was', (await js('location.href')) === appUrl);
done(close);
