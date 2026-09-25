import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
// The message box is sized to its text in pixels; when the text then measured a pixel taller (the font loading, a zoom), the app's
// styled scrollbar showed its thumb at the right of an empty box (the user, 2026-09-24: "a button or something, a border"). A
// scrollbar only past the 220 px cap, where the box stops growing.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
const box = `${V}.querySelector('.composer textarea')`;
const bar = () => js(`(() => { const t = ${box}; return t.offsetWidth - t.clientWidth; })()`); // the width a vertical scrollbar takes
const type = (s: string) => js(`(() => { const t = ${box}; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(s)}); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await type(''); await sleep(300);
await js(`(() => { const t = ${box}; t.style.height = (t.scrollHeight - 1) + 'px'; })()`); await sleep(200); // the text a pixel taller than the box
check('an empty box a pixel short of its text shows no scrollbar', (await bar()) === 0, `${await bar()} px of scrollbar`);
await type('one line'); await sleep(300);
check('one line of text: no scrollbar', (await bar()) === 0, `${await bar()} px`);
await type(Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')); await sleep(300);
check('text past the cap scrolls, with its scrollbar', (await bar()) > 0 && (await js(`${box}.clientHeight`)) <= 220, `${await bar()} px, height ${await js(`${box}.clientHeight`)}`);
await type(''); done(close);
