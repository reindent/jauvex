// llm
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(2500);
// The Jauvex agent moves between providers with its whole context: a secret word told to Claude is known to Codex after the move, and to Claude again after moving back.
const typeAndSend = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200); await js(`${V}.querySelector('.composer .send').click()`); };
const waitDone = async () => { for (let i = 0; i < 120; i++) { await sleep(1000); if (!(await js(`!!${V}.querySelector('.composer .send.stop')`))) break; } await sleep(800); };
const lastReply = () => js(`[...${V}.querySelectorAll('.assistant .prose')].pop()?.textContent ?? ''`);
const providerSelect = `[...${V}.querySelectorAll('.composer-row select.model')].find((s) => s.title.startsWith('Who answers'))`;
const setProvider = async (p) => { await js(`(() => { const s = ${providerSelect}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(p)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500); };
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
check('the Jauvex chat offers the provider selector', await js(`!!${providerSelect}`));
const first = await js(`${providerSelect}?.value`); const other = first === 'claude' ? 'codex' : 'claude';
await typeAndSend('The secret word is pineapple. Remember it. Reply with exactly: OK.'); await waitDone();
check(`${first} took the secret`, /ok/i.test(await lastReply()), (await lastReply()).slice(0, 60));
await setProvider(other);
check('the move is noted in the thread', await js(`[...${V}.querySelectorAll('.app-note')].some((b) => b.textContent.includes('Moved from'))`));
await typeAndSend('What is the secret word? Reply with that one word only, no tools.'); await waitDone();
const r1 = await lastReply(); check(`${other} knows the secret after the move`, /pineapple/i.test(r1), r1.slice(0, 80));
await setProvider(first);
await typeAndSend('And now, what is the secret word? One word only, no tools.'); await waitDone();
const r2 = await lastReply(); check(`${first} still knows it after moving back`, /pineapple/i.test(r2), r2.slice(0, 80));
const log = path.join(process.env.CVC_DATA_DIR!, 'jauvex-transcript.json');
check('the app keeps the transcript', existsSync(log) && JSON.parse(readFileSync(log, 'utf8')).length >= 6);
done(close);
