// llm
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { cdp, js, close } = await connect(); await sleep(2500);
// The handover way of moving the Jauvex agent: the leaving assistant writes a note (a visible turn), the next provider starts from it and still knows the secret.
execFileSync('node', ['scripts/jauvex.ts', 'settings', '--jauvex-move', 'handoff'], { env: { ...process.env } }); await sleep(500);
const typeAndSend = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200); await js(`${V}.querySelector('.composer .send').click()`); };
const waitDone = async () => { await sleep(1500); for (let i = 0; i < 120; i++) { await sleep(1000); if (!(await js(`!!${V}.querySelector('.composer .send.stop')`))) break; } await sleep(800); };
const lastReply = () => js(`[...${V}.querySelectorAll('.assistant .prose')].pop()?.textContent ?? ''`);
const providerSelect = `[...${V}.querySelectorAll('.composer-row select.model')].find((s) => s.title.startsWith('Who answers'))`;
const setProvider = async (p) => { await js(`(() => { const s = ${providerSelect}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(p)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500); };
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
const first = await js(`${providerSelect}?.value`); const other = first === 'claude' ? 'codex' : 'claude';
await typeAndSend('The secret word is mango. Remember it. Reply with exactly: OK.'); await waitDone();
check(`${first} took the secret`, /ok/i.test(await lastReply()));
await setProvider(other); await waitDone(); // the handover turn
check('the move is announced as a handover', await js(`[...${V}.querySelectorAll('.app-note')].some((n) => n.textContent.includes('by handover'))`));
const note = await js(`[...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).find((t) => /mango/i.test(t)) ?? ''`); check('the leaving assistant wrote a note that carries the secret', /mango/i.test(note), note.slice(0, 80));
await sleep(1500); check('the selector now shows the new provider', (await js(`${providerSelect}?.value`)) === other);
await typeAndSend('What is the secret word? Reply with that one word only, no tools.'); await waitDone();
const r = await lastReply(); check(`${other} knows the secret from the note`, /mango/i.test(r), r.slice(0, 80));
done(close);
