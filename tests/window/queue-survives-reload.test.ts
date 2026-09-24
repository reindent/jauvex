// llm
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// A message queued while a turn runs survives a reload of the window and still goes out when the turn is over.
const typeAndSend = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); };
const openCodex = async () => { await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.codex')).click()"); await sleep(1500); };
await openCodex();
await typeAndSend('Run the shell command `sleep 20` and then say done. Nothing else.'); await sleep(3000);
check('a turn is running', await js(`!!${V}.querySelector('.composer .send.stop')`));
await typeAndSend('queued before the reload: reply with the word gamma only.'); await sleep(600);
check('it waits in the queue', (await js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent).join('|')`)).includes('queued before the reload'));
await js("location.reload()"); await sleep(4000); await openCodex();
check('after the reload the queued message is still there', (await js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent).join('|')`)).includes('queued before the reload'));
let sent = false; for (let i = 0; i < 90; i++) { await sleep(1000); if (await js(`[...${V}.querySelectorAll('.user .bubble:not(.queued)')].some((b) => b.textContent === 'queued before the reload: reply with the word gamma only.')`)) { sent = true; break; } }
check('and it goes out when the turn is over', sent);
done(close);
