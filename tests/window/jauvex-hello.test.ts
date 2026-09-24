// llm
// needs: mic
// wav: tests/fixtures/silence.wav
import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The first time Start opens the Jauvex agent, it introduces itself (a real turn), and the note that asked it is an app note in the thread.
await js(openWelcome);
for (let i = 0; i < 220; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
await sleep(400); await js("[...document.querySelectorAll('.welcome-pick:not(.welcome-move) button')].find((b) => b.textContent === 'Claude')?.click()"); await sleep(300);
await js("document.querySelector('.welcome-go').click()"); await sleep(3000);
check('Start opened the Jauvex agent', await js("document.querySelector('.jauvex-row')?.classList.contains('on')"), await js("JSON.stringify({ welcome: !!document.querySelector('.welcome'), go: document.querySelector('.welcome-go')?.disabled, picks: [...document.querySelectorAll('.welcome-pick:not(.welcome-move) button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')), tb: document.querySelector('.tb-name')?.textContent })"));
check('the request to introduce itself is an app note, not a user bubble', await js(`[...${V}.querySelectorAll('.app-note')].some((n) => /first time/i.test(n.textContent))`));
let reply = ''; for (let i = 0; i < 90; i++) { await sleep(1000); reply = await js(`[...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).join(' ')`); if (reply.trim() && !(await js(`!!${V}.querySelector('.composer .send.stop')`))) break; }
check('it introduced itself as the Jauvex agent', /jauvex/i.test(reply), reply.slice(0, 100));
check('and kept it short', reply.split(/\s+/).length < 150, `${reply.split(/\s+/).length} words`);
check('and mentioned typing as an option', /typ/i.test(reply));
const { readFileSync } = await import('node:fs'); const path = await import('node:path'); await sleep(6000); const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
check('the greeting was spoken, not only shown', /said: "[^"]*(Jauvex|Javex|orchestrat)/i.test(log) || /summary \[/.test(log), log.split('\n').filter((l) => /said: |NOT said|summary/.test(l)).slice(-3).join(' | ').slice(0, 200));
done(close);
