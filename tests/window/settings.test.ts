import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The wheel in the sidebar's footer opens Jauvex settings; "Open it now" opens the welcome.
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
check('the wheel opens Jauvex settings', await js("!!document.querySelector('.modal.settings')"));
await js("[...document.querySelectorAll('.modal.settings button')].find((b) => b.textContent === 'Open it now').click()"); await sleep(300);
check('"Open it now" opens the welcome and closes the settings', await js("!!document.querySelector('.welcome') && !document.querySelector('.modal.settings')"));
check('no sparkle in the footer any more', !(await js("!!document.querySelector('button[title^=\"Welcome screen\"]')")));
// the voice settings are in the main settings too (Voice chat); a text setting saves as it is typed, without leaving the box
const { readFileSync } = await import('node:fs'); const path = await import('node:path');
const ui = () => JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui?.voice ?? {};
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(600);
check('the main settings have a Voice chat section', await js("!!document.querySelector('.vsettings-main')"));
await js(`(() => { const i = [...document.querySelectorAll('.vsettings-main input[type=text]')].find((x) => x.placeholder === 'Hey Jauvex'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Hakuna Matata'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(1200);
check('a wake phrase typed is saved without leaving the box', ui().wakePhrase === 'Hakuna Matata', JSON.stringify(ui().wakePhrase));
await js("[...document.querySelectorAll('.vsettings-main label.check')].find((l) => /Wake phrase/.test(l.textContent)).querySelector('input').click()"); await sleep(500);
check('the checkbox turns the wake phrase off', ui().wakeOn === false);
done(close);