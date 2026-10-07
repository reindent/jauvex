// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/custom-theme/claude MOCK_DELAY_MS=5
// The app's own colours, made with the Jauvex agent (T-278; the user, 2026-10-01: "We have right now Auto, Dark, Light, and then one more that
// says Custom. And when you do custom ... You're going to talk with the Jauvex agent ... it will give you three ideas ... of colors. And then
// once you select one, You will be able to ... modify ... to the colors that you want"): Settings, Appearance has a fourth choice, Custom; it
// opens the Jauvex agent's chat and tells the agent to ask and propose; the agent's `theme --custom` puts a palette on at once, kept after a
// reload; one whose text would be hard to read is refused and changes nothing; `theme --set` goes back to one of the app's themes.
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 200) { const v = await js(expr); if (v) return v; await sleep(200); } return null; };
const data = process.env.CVC_DATA_DIR!;
const told = () => { const f = path.join(data, 'jauvex-transcript.json'); return existsSync(f) && readFileSync(f, 'utf8').includes('picked Custom'); };
const ui = () => { try { return JSON.parse(readFileSync(path.join(data, 'state.json'), 'utf8')).ui ?? {}; } catch { return {}; } };
const v = (k: string) => js(`getComputedStyle(document.documentElement).getPropertyValue('--${k}').trim()`);
const openSettings = async () => { await until("!!document.querySelector('button[title=\"Jauvex settings\"]')"); await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await until("!!document.querySelector('.theme-pick')"); };

await openSettings();
check('Appearance has four choices: Same as the system, Light, Dark, Custom', (await js("[...document.querySelectorAll('.theme-pick')].map((b) => b.textContent).join(', ')")) === 'Same as the system, Light, Dark, Custom', await js("[...document.querySelectorAll('.theme-pick')].map((b) => b.textContent).join(', ')"));
await js("document.querySelector('.theme-pick.custom').click()");
check('Custom closes Settings and opens the Jauvex agent\'s chat', !!(await until("!document.querySelector('.theme-pick') && !!document.querySelector('.jauvex-row.on')")));
let t = false; for (let i = 0; i < 60 && !(t = told()); i++) await sleep(250);
check('...and tells the agent: ask what they feel like, offer three palettes, put one on', t);

const forest = JSON.stringify({ name: 'Forest', base: 'dark', colors: { bg: '#0f1a14', side: '#0b130e', fg: '#e6efe8', accent: '#6fcf97', muted: '#8fa597' } });
const r = run('theme', '--custom', forest);
check("the agent's palette is put on at once: the dark theme under it, its colours over it", r.ok && (await js('document.documentElement.dataset.theme')) === 'dark' && (await v('bg')) === '#0f1a14' && (await v('accent')) === '#6fcf97' && (await js('getComputedStyle(document.body).backgroundColor')) === 'rgb(15, 26, 20)', JSON.stringify(r));
check('...and kept in the settings', ui().theme === 'custom' && ui().customTheme?.name === 'Forest' && ui().customTheme?.colors?.side === '#0b130e', JSON.stringify(ui().customTheme));
const bad = run('theme', '--custom', JSON.stringify({ base: 'dark', colors: { fg: '#1a1a1a' } }));
check('a palette whose text would be hard to read is refused, saying why, and the look stays', !bad.ok && /hard to read/.test(bad.error) && (await v('bg')) === '#0f1a14' && ui().customTheme?.name === 'Forest', JSON.stringify(bad));
check('theme alone says the look on now', (() => { const n = run('theme'); return n.ok && n.theme === 'custom' && n.palette?.name === 'Forest'; })());
await js('location.reload()'); await sleep(3000);
check('after a reload it is there from the start', (await v('bg')) === '#0f1a14' && (await js('document.documentElement.dataset.theme')) === 'dark');
await openSettings();
check('...and Settings show Custom as the choice', !!(await until("!!document.querySelector('.theme-pick.custom.on')", 5000)), await js("[...document.querySelectorAll('.theme-pick')].map((b) => b.className).join(' | ') + ' / stored ' + localStorage.getItem('cvc.theme')"));
await js("document.querySelector('.modal.settings').parentElement.click()"); await sleep(300);
const back = run('theme', '--set', 'light');
check('theme --set light goes back to the app\'s light theme: its own colours, none of the palette', back.ok && (await js('document.documentElement.dataset.theme')) === 'light' && (await js('getComputedStyle(document.body).backgroundColor')) === 'rgb(255, 255, 255)' && (await js('document.documentElement.style.length')) === 0 && ui().theme === 'light', `${JSON.stringify(back)} ${await v('bg')}`);
done(close);
