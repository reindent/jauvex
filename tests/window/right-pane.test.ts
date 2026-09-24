import { connect, sleep, check, done, V } from './lib.ts'; import { writeFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
// A file or a link an agent shows opens in the right pane, never in the window itself: markdown rendered, text as is, images
// shown, pages framed and muted; a navigation the app did not catch goes to the pane too; the pane closes.
const root = process.cwd(); const appUrl = await js('location.href');
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
const clickLink = (href) => js(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(href)}; a.textContent = 'x'; ${V}.querySelector('.scroll').appendChild(a); a.click(); a.remove(); })()`);
await clickLink(path.join(root, 'README.md')); await sleep(1500);
check('a markdown file opens in the right pane, rendered', (await js("document.querySelector('.pane-title')?.textContent")) === 'README.md' && (await js("!!document.querySelector('.pane-body .pane-md h1, .pane-body .pane-md h2')")));
await clickLink('package.json'); await sleep(1200); // relative to the session's folder (the fixture's scratch folder has none: the app's own is used by the row? no: relative to data-base)
const t = await js("document.querySelector('.pane-body .pane-text')?.textContent ?? document.querySelector('.pane-note')?.textContent ?? ''");
check('a relative path resolves against the session folder (here: not there, said plainly)', /no such file|ENOENT|not/i.test(t) || t.includes('"name"'), t.slice(0, 80));
await clickLink(path.join(root, 'package.json')); await sleep(1200);
check('a text file shows as it is', (await js("document.querySelector('.pane-body .pane-text')?.textContent ?? ''")).includes('"name": "jauvex"'));
const png = path.join(process.env.CVC_DATA_DIR!, 'dot.png'); writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
await clickLink(png); await sleep(1200);
check('an image shows', (await js("document.querySelector('.pane-body img.pane-img')?.getAttribute('src') ?? ''")).startsWith('data:image/png'));
await clickLink('https://example.com/'); await sleep(1500);
check('a web link is framed in the pane, muted, and the window stayed where it was', (await js("document.querySelector('.pane-body webview')?.getAttribute('src')")) === 'https://example.com/' && (await js('location.href')) === appUrl);
await js("location.assign('https://example.org/')"); await sleep(1500);
check('a navigation the app did not catch goes to the pane instead', (await js("document.querySelector('.pane-body webview')?.getAttribute('src')")) === 'https://example.org/' && (await js('location.href')) === appUrl);
await js("document.querySelector('.pane-head button[title=\"Close\"]').click()"); await sleep(400);
check('the pane closes', !(await js("!!document.querySelector('.pane')")));
// the pane belongs to the session it was opened in: another session shows none, the first one gets its pane back
const title = () => js("document.querySelector('.pane-title')?.textContent ?? null");
await clickLink(path.join(root, 'README.md')); await sleep(1200);
const a = await js("document.querySelector('.tb-name')?.textContent"); const aRow = await js("document.querySelector('.row.on .row-title')?.textContent");
await js(`${rows}.find((r) => !r.classList.contains('on')).click()`); await sleep(1500);
check('another session does not show the first one\'s pane', (await js("document.querySelector('.tb-name')?.textContent")) !== a && (await title()) === null);
await js("document.querySelector('button[title^=\"Back\"]').click()"); await sleep(1500); // the app's own Back: exactly the session before
check('back on the first session, its pane is there again', (await title()) === 'README.md' && (await js("document.querySelector('.tb-name')?.textContent")) === a, String(await title()));
done(close);
