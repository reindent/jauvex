import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The wheel in the sidebar's footer opens Jauvex settings; "Open it now" opens the welcome.
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
check('the wheel opens Jauvex settings', await js("!!document.querySelector('.modal.settings')"));
// Tabs across the top (the user, 2026-09-24: the settings were "a freaking mess because there are no tabs"): General open first, one kind of
// setting per tab, and the window keeps its size from tab to tab.
const tabs = "[...document.querySelectorAll('.modal.settings .settings-tab')].map((t) => t.textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')).join(' | ')";
check('Jauvex settings have tabs across the top, General open', (await js(tabs)) === 'General* | Voice | Context | Safety | Reset', await js(tabs));
const size = "(() => { const r = document.querySelector('.modal.settings').getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })()";
const heights: string[] = []; for (const t of ['General', 'Voice', 'Context', 'Safety', 'Reset']) { await js("[...document.querySelectorAll('.modal.settings .settings-tab')].find((x) => x.textContent === '" + t + "').click()"); await sleep(150); heights.push(await js(size)); }
check('each tab shows its own settings, in a window of the same size', new Set(heights).size === 1 && (await js("!!document.querySelector('.settings-group.danger') && !document.querySelector('.vsettings-main')")), heights.join(', '));
await js("[...document.querySelectorAll('.modal.settings .settings-tab')].find((t) => t.textContent === 'General').click()"); await sleep(150);
await js("[...document.querySelectorAll('.modal.settings button')].find((b) => b.textContent === 'Open it now').click()"); await sleep(300);
check('"Open it now" opens the welcome and closes the settings', await js("!!document.querySelector('.welcome') && !document.querySelector('.modal.settings')"));
check('no sparkle in the footer any more', !(await js("!!document.querySelector('button[title^=\"Welcome screen\"]')")));
// the voice settings are in the main settings too (Voice chat); a text setting saves as it is typed, without leaving the box
const { readFileSync } = await import('node:fs'); const path = await import('node:path');
const ui = () => JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui?.voice ?? {};
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(600);
await js("[...document.querySelectorAll('.modal.settings .settings-tab')].find((t) => t.textContent === 'Voice').click()"); await sleep(300);
check('the main settings have a Voice tab with the voice chat settings', await js("!!document.querySelector('.vsettings-main')"));
await js(`(() => { const i = [...document.querySelectorAll('.vsettings-main input[type=text]')].find((x) => x.placeholder === 'Hey Jauvex'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Hakuna Matata'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(1200);
check('a wake phrase typed is saved without leaving the box', ui().wakePhrase === 'Hakuna Matata', JSON.stringify(ui().wakePhrase));
await js("[...document.querySelectorAll('.vsettings-main label.check')].find((l) => /Wake phrase/.test(l.textContent)).querySelector('input').click()"); await sleep(500);
check('the checkbox turns the wake phrase off', ui().wakeOn === false);
done(close);