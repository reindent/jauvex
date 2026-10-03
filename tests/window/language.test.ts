import { connect, sleep, check, done } from './lib.ts';
const { readFileSync } = await import('node:fs'); const path = await import('node:path');
const { js, close } = await connect(); await sleep(1500);
// The app's language (i18n, 2026-10-03): English and Spanish, the system's by default (run.sh starts the checks with --lang=en-US), or the one
// picked in Settings, General. Picking one draws the window again in it and keeps it in the settings; the agents' own words are untouched.
const ui = () => JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui ?? {};
const side = "document.querySelector('.sidebar, aside')?.innerText ?? document.body.innerText";
const settings = "(async () => { document.querySelector('button[title=\"Jauvex settings\"], button[title=\"Ajustes de Jauvex\"]').click(); await new Promise((r) => setTimeout(r, 400)); return true; })()";
const pick = (v: string) => `(() => { const s = [...document.querySelectorAll('.modal.settings select')].find((x) => [...x.options].some((o) => o.value === 'es') && [...x.options].some((o) => o.value === 'auto')); s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); return [...s.options].map((o) => o.textContent).join(' | '); })()`;
check('the system language here is English, so the app speaks English', /Add folder/.test(await js(side)), (await js(side)).slice(0, 60));
await js(settings);
const options = await js(pick('es'));
check('Settings, General offers the system language (named), English and Español', options === 'System (English) | English | Español', options);
await sleep(2500); // the window reloads in the new language
check('picking Español draws the window again in Spanish', /Agregar carpeta/.test(await js(side)), (await js(side)).slice(0, 60));
check('...and keeps it in the settings', ui().language === 'es', JSON.stringify(ui().language));
await js(settings);
check('the settings speak Spanish too', /Idioma/.test(await js("document.querySelector('.modal.settings')?.innerText ?? ''")) && /Apariencia/.test(await js("document.querySelector('.modal.settings')?.innerText ?? ''")));
await js(pick('auto')); await sleep(2500);
check('back to the system language: English again', /Add folder/.test(await js(side)) && ui().language === 'auto', JSON.stringify(ui().language));
done(close);
