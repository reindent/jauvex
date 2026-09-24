// needs: mic
// wav: tests/fixtures/reload-ui.wav
import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
// An order the app handles itself (here "Reload the interface.", said out loud in a session) is kept with the session: after the
// reload the user's words and the app's reply are still in the thread, in their place. A restart used to wipe both.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon.claude'))";
await js(`${rows}[0].click()`); await sleep(1500); const title = await js("document.querySelector('.tb-name')?.textContent");
await js(`${V}.querySelector('.voice-start').click()`);
let shown = false; for (let i = 0; i < 40 && !shown; i++) { await sleep(300); shown = await js(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /reload the interface/i.test(b.textContent))`); }
check('the order shows in the thread', shown);
await sleep(4000); // the app says it, then reloads the window
for (let i = 0; i < 30 && !(await js("!!document.querySelector('.row')")); i++) await sleep(500); await sleep(1500);
await js(`[...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-title')?.textContent === ${JSON.stringify(title)})?.click()`); await sleep(2500);
const bubbles = await js(`[...${V}.querySelectorAll('.user .bubble')].map((b) => b.textContent)`);
check('after the reload, the words are still there', bubbles.some((b) => /reload the interface/i.test(b)), JSON.stringify(bubbles.slice(-3)));
const notes = await js(`[...${V}.querySelectorAll('.app-note')].map((n) => n.textContent)`);
check('and so is the app\'s reply, right after them', notes.some((n) => /reload/i.test(n)), JSON.stringify(notes.slice(-3)));
done(close);
