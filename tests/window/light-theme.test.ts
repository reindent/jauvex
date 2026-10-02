// A light theme, following the Mac (T-248; the user, 2026-09-30: "we need a light theme for Jauvex", then "make it system aware, depends on
// the system settings (light/dark/auto) or overriden in Jauvex settings"): with nothing chosen the window takes the Mac's appearance and
// changes with it (the Mac's setting stood in for by the page's emulated prefers-color-scheme); Settings, General, Appearance: Light or Dark
// hold whatever the Mac does, are kept, and paint from a reload's first frame; Same as the Mac follows it again. Screenshots: tmp/light-*.png.
import { connect, sleep, check, done } from './lib.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { js, cdp, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await js(expr); if (v) return v; await sleep(200); } return null; };
const shot = async (name: string) => { const s = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null); if (s?.data) writeFileSync(`tmp/light-${name}.png`, Buffer.from(s.data, 'base64')); };
const mac = (look: 'light' | 'dark') => cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: look }] });
const theme = () => js('document.documentElement.dataset.theme');
const bg = "[document.querySelector('.main'), document.querySelector('.app'), document.body, document.documentElement].filter(Boolean).map((el) => getComputedStyle(el).backgroundColor).find((c) => c !== 'rgba(0, 0, 0, 0)') ?? ''"; // the first that paints
const bright = (c: string) => (c.match(/\d+/g) ?? []).slice(0, 3).map(Number); // the channels of an rgb() colour
const kept = async (want: string | undefined) => { for (let t = 0; t < 5000; t += 250) { try { if (JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui?.theme === want) return true; } catch { /* not yet */ } await sleep(250); } return false; };
const pick = async (k: string) => { if (!(await js("!!document.querySelector('.theme-pick')"))) { await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await until("!!document.querySelector('.theme-pick')"); } await js(`document.querySelector('.theme-pick.${k}').click()`); };

await mac('dark'); await sleep(300);
check('nothing chosen, a dark Mac: the window is dark', (await until("document.documentElement.dataset.theme === 'dark'")) && bright(await js(bg)).every((x) => x < 40), `${await theme()} ${await js(bg)}`);
await mac('light');
check('...the Mac turns light (or Auto turns it at dusk): the window follows at once', !!(await until("document.documentElement.dataset.theme === 'light'")) && bright(await js(bg)).every((x) => x > 200), `${await theme()} ${await js(bg)}`);
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await until("!!document.querySelector('.theme-pick')");
check('Settings say so: Same as the Mac is the choice, the first of the four (Custom: T-278)', (await js("[...document.querySelectorAll('.theme-pick')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(', ')")) === 'Same as the Mac*, Light, Dark, Custom', await js("[...document.querySelectorAll('.theme-pick')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(', ')"));
check('...its text dark', /rgb\((\d{1,2}), (\d{1,2}), (\d{1,2})\)/.test(await js("getComputedStyle(document.querySelector('.modal.settings h2')).color")), await js("getComputedStyle(document.querySelector('.modal.settings h2')).color"));
await shot('settings');
await pick('dark');
check('Dark for the app alone: dark on a light Mac, and kept', !!(await until("document.documentElement.dataset.theme === 'dark'")) && await kept('dark'), String(await theme()));
await mac('dark'); await mac('light'); await sleep(400);
check('...and it holds when the Mac changes', (await theme()) === 'dark', String(await theme()));
await pick('light'); await mac('dark'); await sleep(400);
check('Light for the app alone: light on a dark Mac, and kept', (await theme()) === 'light' && await kept('light'), String(await theme()));
await js("document.querySelector('.modal.settings').parentElement.click()"); await sleep(400);
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
if (await js(`${rows}.length > 0`)) { await js(`${rows}[0].click()`); await sleep(1500); }
await shot('chat');
await js('location.reload()'); await sleep(3000); await mac('dark'); await sleep(300);
check('a reload starts light on a dark Mac: the choice paints from the first frame', (await theme()) === 'light', String(await theme()));
await pick('system');
check('Same as the Mac again: the window follows the dark Mac, and the choice is kept', !!(await until("document.documentElement.dataset.theme === 'dark'")) && await kept('system'), String(await theme()));
await mac('light');
check('...and the light one', !!(await until("document.documentElement.dataset.theme === 'light'")), String(await theme()));
done(close);
