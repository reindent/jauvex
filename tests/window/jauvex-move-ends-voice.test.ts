// needs: mic
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// Moving the Jauvex agent to another provider ends voice mode (the engine belongs to the provider it started with) and says so in the thread.
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(2500);
check('voice is on in the Jauvex chat', await js(`!!${V}.querySelector('.voice-dock')`));
const providerSelect = `[...${V}.querySelectorAll('.composer-row select.model')].find((s) => s.title.startsWith('Who answers'))`;
const first = await js(`${providerSelect}?.value`); const other = first === 'claude' ? 'codex' : 'claude';
await js(`(() => { const s = ${providerSelect}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(other)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(1500);
check('the move ends voice mode', !(await js(`!!${V}.querySelector('.voice-dock')`)) && !(await js("!!document.querySelector('.side-voice')")));
check('and the thread says so', await js(`[...${V}.querySelectorAll('.app-note')].some((n) => /Moved from .* Voice mode ended/.test(n.textContent))`));
check('the selector shows the new provider', (await js(`${providerSelect}?.value`)) === other);
done(close);
