// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/updated-greeting/claude CODEX_HOME=__ROOT__/tmp/testrun/updated-greeting/codex MOCK_DELAY_MS=5 CVC_UPDATE_INSTALLED=1
// After an update (T-218; the user, 2026-09-30: "the app should notify what the change log is about"): a first start only records the
// version; opened on a newer version than the last it ran, the app opens the Jauvex agent's chat and tells it, with what the versions
// since bring from the app's own CHANGELOG.md, to say so and check the app; once: a reload tells nobody again.
import { connect, sleep, check, done } from './lib.ts';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr, ms = 30000) => { for (let t = 0; t < ms; t += 400) { if (await js(expr)) return true; await sleep(400); } return false; };
const data = process.env.CVC_DATA_DIR!, version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const told = () => { const f = path.join(data, 'jauvex-transcript.json'); if (!existsSync(f)) return 0; return JSON.parse(readFileSync(f, 'utf8')).filter((e) => e.message?.role === 'user' && JSON.stringify(e.message.blocks).includes('has just been updated')).length; };
const last = () => { try { return JSON.parse(readFileSync(path.join(data, 'state.json'), 'utf8')).ui?.lastVersion; } catch { return undefined; } };

for (let i = 0; i < 20 && last() !== version; i++) await sleep(300);
check('a first start records the version it runs, and tells nobody', last() === version && told() === 0, `${last()} ${told()}`);
await js("window.desktop.api('setUi', { lastVersion: '1.0.0' })"); await sleep(300);
await js('location.reload()'); await sleep(2500);
const note = `[...document.querySelectorAll('.app-note')].find((n) => n.textContent.includes('has just been updated from 1.0.0 to Jauvex ${version}'))`;
check('opened on a newer version: the Jauvex agent\'s chat opens and it is told, to say so', await until(`!!${note} && !!document.querySelector('.jauvex-row.on')`, 30000), await js("[...document.querySelectorAll('.app-note')].map((n) => n.textContent.slice(0, 120)).join(' | ')"));
const said = () => { const f = path.join(data, 'jauvex-transcript.json'); if (!existsSync(f)) return ''; return JSON.parse(readFileSync(f, 'utf8')).map((e) => (e.message?.role === 'user' ? JSON.stringify(e.message.blocks) : '')).find((t) => t.includes('has just been updated')) ?? ''; };
for (let i = 0; i < 20 && !said(); i++) await sleep(300);
const t = said(); // the note as it was sent: the window shows its headings as markdown
check('with what the versions since bring, from the app\'s own changelog', t.includes(`What ${version} brings, from its changelog`) && t.includes(`## ${version}`) && t.includes('## 1.1.0') && !t.includes('## 1.0.0'), t.slice(0, 300));
for (let i = 0; i < 20 && last() !== version; i++) await sleep(300);
check('the app remembers the version it runs now', last() === version, String(last()));
await sleep(3000); await js('location.reload()'); await sleep(6000);
check('after a reload nobody is told again', told() === 1, `told ${told()} times`);
done(close);
