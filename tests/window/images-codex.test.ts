// llm
import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// An image pasted into a codex session reaches the model (a real turn: skipped unless CVC_TEST_LLM=1).
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.codex')).click()"); await sleep(1500);
// a 64x64 red PNG, pasted into the composer as a file, the way a screenshot from the clipboard arrives
await js(`(async () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e02020'; g.fillRect(0, 0, 64, 64); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], 'red.png', { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(file); const ta = ${V}.querySelector('.composer textarea'); ta.focus(); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 'pasted'; })()`);
await sleep(600);
const thumbs = await js(`${V}.querySelectorAll('.attach img').length`); check('the pasted image shows as a thumbnail in the composer', thumbs === 1);
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'What colour is the attached image? Answer with one word, no tools.'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(200); await js(`${V}.querySelector('.composer .send').click()`); await sleep(800);
const bubbleImg = await js(`!!${V}.querySelector('.user .bubble-img')`); check('the sent message shows the image in the thread', bubbleImg);
const cleared = await js(`${V}.querySelectorAll('.attach img').length === 0`); check('the composer is empty again after sending', cleared);
let reply = ''; for (let i = 0; i < 90; i++) { await sleep(1000); const running = await js(`!!${V}.querySelector('.composer .send.stop')`); reply = await js(`[...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).join(' ')`) ?? ''; if (!running && reply.trim()) break; }
check('the model saw the image', /\bred\b/i.test(reply), `reply "${reply.trim().slice(0, 60)}"`);

done(close);
