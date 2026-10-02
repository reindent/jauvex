// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/dashboard-refresh/claude MOCK_DELAY_MS=5
// The dashboard kept current by the Jauvex agent (T-279; the user, 2026-10-01: "on initialization ... the dashboard for the first time ... it
// should rebuild this dashboard ... Or by Jauvex in the case of the personal version", "keeps it up to date, somehow regularly, but not too
// abuse of the workspace agent", "An option to disable this dashboard, because maybe some people don't want it"): the first look at it with no
// DASHBOARD.md asks the Jauvex agent to build it, once (not again at the next reads); you can turn the dashboard off, and on again.
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await js(expr); if (v) return v; await sleep(250); } return null; };
const D = `${V}?.querySelector('[data-testid=dashboard]')`;
const asked = () => { try { return (readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8').match(/asked to bring it up to date/g) ?? []).length; } catch { return 0; } }; // the app's flight recorder, one line per request (the stand-in's reply quotes the note)
const ui = () => { try { return JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui ?? {}; } catch { return {}; } };
await until("!!document.querySelector('.jauvex-row')"); await js("document.querySelector('.jauvex-row').click()");
check("the Jauvex agent's chat opens with its dashboard", !!(await until(`!!${D}`)));
check('the agent keeps no DASHBOARD.md yet: once it has been idle for a while, the app asks it to build one, saying why', !!(await until(`/Your dashboard needs you: it has no file yet/.test(document.body.innerText)`, 45000)), await js("document.body.innerText.match(/.{0,60}dashboard needs you.{0,80}/s)?.[0] ?? 'not asked'"));
for (let i = 0; i < 3; i++) { await js("window.dispatchEvent(new Event('focus'))"); await sleep(700); } // the dashboard read again, as every 30 s and at each focus
check('...once: the next reads ask nothing more (never twice within half an hour)', asked() === 1, String(asked()));
await js(`${D}.querySelector('.dash-more').click()`); await sleep(200);
await js(`${D}.querySelector('.dash-off').click()`);
check('the ⋯ menu turns it off: gone, and kept so', !!(await until(`!${D}`, 5000)) && ui().dashboard === false, JSON.stringify({ dashboard: ui().dashboard }));
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await until("!!document.querySelector('.modal.settings')");
const box = "[...document.querySelectorAll('.modal.settings label.check')].find((l) => /dashboard above the Jauvex agent's chat/.test(l.textContent))?.querySelector('input')";
check('Settings, General, Dashboard says it is off', (await js(`${box}?.checked`)) === false);
await js(`${box}.click()`); await js("document.querySelector('.modal.settings').parentElement.click()"); await sleep(300);
check('...and turns it on again', !!(await until(`!!${D}`, 5000)) && ui().dashboard === true);
done(close);
