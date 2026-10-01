// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/whats-new/claude CODEX_HOME=__ROOT__/tmp/testrun/whats-new/codex MOCK_DELAY_MS=5 CVC_UPDATE_INSTALLED=1 CVC_UPDATE_SITE=http://127.0.0.1:4481
// What's new (T-245; the user, 2026-09-30: "when you click what's new, it should check if there's a new version"): a click asks the site right
// then (here a stand-in on 4481), the notes open at once with "checking" on top. Out of reach: this copy's notes, under a line that says so. The latest already: the notes, under a line that
// says so. A newer version: no notes; the Jauvex agent's chat opens and it is told what the version brings, to ask the user; the notice that
// then takes What's new's place asks again on a click.
import { connect, sleep, check, done } from './lib.ts';
import { readFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await js(expr)) return true; await sleep(300); } return false; };
const version = JSON.parse(readFileSync('package.json', 'utf8')).version, data = process.env.CVC_DATA_DIR!;
const told = () => { const f = path.join(data, 'jauvex-transcript.json'); if (!existsSync(f)) return [] as string[]; return JSON.parse(readFileSync(f, 'utf8')).filter((e: any) => e.message?.role === 'user').map((e: any) => JSON.stringify(e.message.blocks)).filter((t: string) => t.includes('Jauvex 9.9.0 is out')); };
const box = "document.querySelector('.modal.whats-new')";
const click = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const closeBox = async () => { await js(`${box}?.querySelector('.modal-foot button')?.click()`); await sleep(400); };

await until("!!document.querySelector('.foot-news')", 10000);
await click('.foot-news');
check('the site out of reach: the notes, under a line that says so', await until(`!!${box} && ${box}.querySelector('.whats-new-check').textContent.includes('could not be reached')`), await js(`${box}?.querySelector('.whats-new-check')?.textContent`));
check('...the notes are this copy\'s own changelog, the newest release first', await js(`(() => { const t = ${box}?.querySelector('.whats-new-body')?.textContent ?? ''; return t.indexOf(${JSON.stringify(version)}) >= 0 && t.indexOf(${JSON.stringify(version)}) < t.indexOf('1.3.0'); })()`));
await closeBox();

let latest = version, slow = 0; const log = '# Changelog\n\n## 9.9.0: 2026-10-02\n\n- **Timers.** Agents that wake up on their own.\n';
const server = http.createServer((q, r) => { if (q.url === '/api/personal/version') { r.setHeader('content-type', 'application/json'); setTimeout(() => r.end(JSON.stringify({ latest_version: latest })), slow); } else if (q.url === '/api/personal/changelog') { r.setHeader('content-type', 'text/plain'); r.end(log); } else { r.statusCode = 404; r.end(); } });
await new Promise<void>((r) => server.listen(4481, '127.0.0.1', () => r()));
slow = 2500; await click('.foot-news');
check('the notes open at once, the check under way on top', await until(`!!${box} && ${box}.querySelector('.whats-new-check').textContent === 'Checking for a newer version…'`, 2000), await js(`${box}?.querySelector('.whats-new-check')?.textContent`));
slow = 0;
check('the latest already: the notes, under "this copy runs the latest version"', await until(`!!${box} && ${box}.querySelector('.whats-new-check').textContent === 'This copy runs the latest version, ${version}.'`), await js(`${box}?.querySelector('.whats-new-check')?.textContent`));
await closeBox();

latest = '9.9.0';
await click('.foot-news');
check('a newer version: no notes; the Jauvex agent\'s chat opens and it is told, to ask the user', await until(`!${box} && !!document.querySelector('.jauvex-row.on') && [...document.querySelectorAll('.app-note')].some((n) => n.textContent.includes('Jauvex 9.9.0 is out'))`), await js("[...document.querySelectorAll('.app-note')].map((n) => n.textContent.slice(0, 80)).join(' | ')"));
for (let i = 0; i < 20 && !told().length; i++) await sleep(300);
check('...with what the new version brings, from the site\'s changelog, told once', told().length === 1 && told()[0]!.includes('What 9.9.0 brings') && told()[0]!.includes('Timers'), JSON.stringify(told()).slice(0, 300));
check('the notice takes What\'s new\'s place', await until("document.querySelector('.foot-update')?.textContent === '9.9.0 is out' && !document.querySelector('.foot-news')", 5000));
await sleep(3000); // the Jauvex agent's turn ends
await click('.foot-update');
check('a click on the notice asks again', await (async () => { for (let i = 0; i < 40; i++) { if (told().length === 2) return true; await sleep(300); } return false; })(), `told ${told().length} times`);
server.close();
done(close);
