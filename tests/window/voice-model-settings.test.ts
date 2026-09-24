// needs: mic
// wav: tests/fixtures/silence.wav
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// The voice settings list the provider's models live, offer "Automatic (the smallest)" first, and say which model is in use.
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.claude')).click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(3000);
await js(`${V}.querySelector('.voice-controls button[title="Voice settings"]').click()`); await sleep(2500);
const label = `[...${V}.querySelectorAll('.vsettings label')].find((l) => l.textContent.startsWith('Voice model for Claude'))`;
const opts = await js(`[...${label}.querySelector('select').options].map((o) => o.textContent)`);
check('the first choice is automatic, the smallest', Array.isArray(opts) && /^Automatic \(the smallest/.test(opts[0] ?? ''), JSON.stringify(opts).slice(0, 160));
check('the live list has more than the two names that were hard-coded', Array.isArray(opts) && opts.length > 3, `${opts?.length} options`);
for (let i = 0; i < 20; i++) { await sleep(500); if (!/in use: …/.test(await js(`${label}.textContent`))) break; }
const inUse = await js(`${label}.querySelector('em')?.textContent`); check('it says which model is in use', /in use: .+/.test(inUse ?? '') && !/…/.test(inUse ?? ''), inUse);
const sel = await js(`${label}.querySelector('select').selectedOptions[0]?.textContent`); check('the selector and the model in use agree', (/Automatic/.test(sel) && /Haiku/.test(inUse)) || (inUse ?? '').includes(sel.replace(/ \(.*$/, '')), `${sel} / ${inUse}`);
done(close);
