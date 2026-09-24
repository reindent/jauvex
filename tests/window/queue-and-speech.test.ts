// llm
// needs: mic
// wav: tests/fixtures/start-codex.wav
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// A message typed while a turn runs waits in the queue; speaking then steers the running turn and must not touch the queued message.
const typeAndSend = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); };
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.codex')).click()"); await sleep(1500);
await typeAndSend('Run the shell command `sleep 45` and then say done. Nothing else.'); await sleep(4000);
check('a turn is running', await js(`!!${V}.querySelector('.composer .send.stop')`));
await typeAndSend('queued while you work: what is 2 plus 2?'); await sleep(800);
check('the typed message waits in the queue', (await js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent).join('|')`)).includes('queued while you work'));
await js(`${V}.querySelector('.voice-start').click()`); // the fake microphone speaks 15 s in
let steered = false; for (let i = 0; i < 140; i++) { await sleep(250); if (await js(`[...${V}.querySelectorAll('.bubble.steered')].length > 0`)) { steered = true; break; } }
check('speaking steered the running turn', steered);
await sleep(500);
check('the queued message is still there after speaking', (await js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent).join('|')`)).includes('queued while you work'));
check('the spoken message is in the thread', await js(`[...${V}.querySelectorAll('.bubble.steered')].some((b) => /start with codex/i.test(b.textContent))`));
done(close);
