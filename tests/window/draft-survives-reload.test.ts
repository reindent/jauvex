import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// Text typed but not sent survives a reload of the window (a reload used to wipe it, and the queue with it).
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.claude')).click()"); await sleep(1500);
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'half a thought, not sent yet'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);
await js("location.reload()"); await sleep(3500);
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.claude')).click()"); await sleep(1500);
check('the unsent text is back after the reload', (await js(`${V}.querySelector('.composer textarea')?.value`)) === 'half a thought, not sent yet');
done(close);
