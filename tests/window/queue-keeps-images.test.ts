// llm
import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
// An image pasted while a turn runs stays with the text it was pasted with: shown in its queued card, sent with that text
// (Send now, or at the end of the turn), and shown in the sent bubble. It never rides along with another queued message.
const type = (text) => js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const enter = () => js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
const paste = () => js(`(async () => { const ta = ${V}.querySelector('.composer textarea'); const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#e33'; g.fillRect(0, 0, 8, 8); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'dot.png', { type: 'image/png' })); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); await new Promise((r) => setTimeout(r, 400)); return ${V}.querySelectorAll('.composer .attach img').length; })()`);
const cards = () => js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => ({ text: b.textContent.replace(/^Queued/, '').replace(/Send now$/, ''), imgs: b.querySelectorAll('img').length }))`);
const sent = () => js(`[...${V}.querySelectorAll('.user')].filter((u) => !u.querySelector('.bubble.queued') && !u.querySelector('.bubble.draft')).map((u) => ({ text: u.textContent, imgs: u.querySelectorAll('img.bubble-img').length }))`); // a sent image is drawn next to its bubble, not inside it
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.codex')).click()"); await sleep(1500);
await type('Run the shell command `sleep 30` and then say done. Nothing else.'); await enter(); await sleep(3000);
check('a turn is running', await js(`!!${V}.querySelector('.composer .send.stop')`));
check('a pasted image shows as a thumbnail in the composer', (await paste()) === 1);
await type('first queued: reply with the word alpha only.'); await enter(); await sleep(600);
await type('second queued: reply with the word beta only.'); await enter(); await sleep(600);
let q = await cards();
check('the queued card keeps its image, the next one has none', q.length === 2 && q[0].imgs === 1 && q[0].text.includes('first queued') && q[1].imgs === 0, JSON.stringify(q));
const before = (await sent()).filter((b) => b.text.includes('first queued')).length; // earlier runs of this check live in the same session's history
await js(`${V}.querySelectorAll('.bubble.queued .steer-now')[0].click()`); await sleep(1500);
const s1 = (await sent()).find((b) => b.text.includes('Sent mid-turn') && b.text.includes('first queued')); const dup = (await sent()).filter((b) => b.text.includes('first queued')).slice(before); q = await cards();
check('Send now hands the text over with its image, shown in the bubble', !!s1 && s1.imgs === 1, JSON.stringify(s1));
check('the handed-over message is shown once, not echoed a second time', dup.length === 1, JSON.stringify(dup));
check('the other queued message did not take the image', q.length === 1 && q[0].imgs === 0 && q[0].text.includes('second queued'), JSON.stringify(q));
check('an image alone can be queued too', (await paste()) === 1 && (await enter(), await sleep(600), (await cards()).some((c) => c.imgs === 1 && !c.text.trim())));
let out: any = null; for (let i = 0; i < 100; i++) { await sleep(1000); const s = await sent(); if (s.some((b) => b.text.includes('second queued')) && s.some((b) => b.imgs === 1 && !b.text.trim())) { out = s; break; } }
check('after the turn, the text and the image-only message go out as their own messages', !!out, JSON.stringify(out?.slice(-3)));
done(close);
