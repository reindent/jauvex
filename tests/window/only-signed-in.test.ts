// env: CVC_SETUP_FAKE=missing
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// A provider that is not signed in cannot be chosen: not for a new session, not for a move of the Jauvex agent, not as the default.
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
const sel = `[...${V}.querySelectorAll('.composer-row select.model')].find((s) => s.title.startsWith('Who answers'))`;
const opts = await js(`[...${sel}.options].map((o) => o.value + (o.disabled ? ':off' : ':on'))`);
check('the other provider is disabled in the provider selector', Array.isArray(opts) && opts.some((o) => o.endsWith(':off')) && opts.some((o) => o.endsWith(':on')), JSON.stringify(opts));
check('the disabled one says why', await js(`[...${sel}.options].some((o) => o.disabled && o.textContent.includes('not signed in'))`));
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
const def = await js("[...document.querySelector('.modal.settings select').options].filter((o) => o.value).map((o) => o.value + (o.disabled ? ':off' : ':on'))");
check('the default-agent choice disables both here (nobody is signed in)', Array.isArray(def) && def.every((o) => o.endsWith(':off')), JSON.stringify(def));
done(close);
