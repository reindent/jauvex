// llm
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// Two messages typed while a turn runs: the first leaves alone when the turn ends, the second waits for the next turn; nothing is merged.
const typeAndSend = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); };
const bubbles = () => js(`[...${V}.querySelectorAll('.user .bubble:not(.queued)')].map((b) => b.textContent)`);
const queued = () => js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent)`);
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.codex')).click()"); await sleep(1500);
await typeAndSend('Run the shell command `sleep 12` and then say done. Nothing else.'); await sleep(3000);
check('a turn is running', await js(`!!${V}.querySelector('.composer .send.stop')`));
await typeAndSend('FIRST queued: reply with the word alpha only.'); await sleep(300); await typeAndSend('SECOND queued: reply with the word beta only.'); await sleep(500);
check('both wait in the queue, in order', JSON.stringify((await queued()).map((t) => t.replace(/^Queued|Send now$/g, ''))).includes('FIRST') && (await queued()).length === 2);
for (let i = 0; i < 60; i++) { await sleep(500); if ((await bubbles()).some((t) => t.includes('FIRST queued'))) break; }
check('when the turn ends, the first leaves alone', (await bubbles()).some((t) => t === 'FIRST queued: reply with the word alpha only.'));
check('the second still waits, unmerged', (await queued()).length === 1 && (await queued())[0].includes('SECOND'));
for (let i = 0; i < 90; i++) { await sleep(500); if ((await bubbles()).some((t) => t.includes('SECOND queued'))) break; }
check('after that turn, the second leaves on its own', (await bubbles()).some((t) => t === 'SECOND queued: reply with the word beta only.') && (await queued()).length === 0);
done(close);
