// llm
// needs: mic
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2500);
// "Make a new agent" said to the Jauvex agent (voice on, typed here) is the agent's job: the chat stays on Jauvex and the agent answers by asking the folder, instead of the app opening a session in its own folder.
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(2500);
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'Make a new agent named Tester. Do not run any command: only tell me what you need from me first, in one sentence.'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
await sleep(2000);
check('the chat stays on the Jauvex agent', await js("document.querySelector('.jauvex-row')?.classList.contains('on')"));
check('no session was opened in the app folder by the shortcut', !(await js("[...document.querySelectorAll('.tb-name')].some((t) => t.textContent === 'Tester')")));
let reply = ''; for (let i = 0; i < 90; i++) { await sleep(1000); reply = await js(`[...${V}.querySelectorAll('.assistant .prose')].pop()?.textContent ?? ''`); if (reply.trim() && !(await js(`!!${V}.querySelector('.composer .send.stop')`))) break; }
check('the Jauvex agent asks about the folder', /folder|directory|project|path/i.test(reply), reply.slice(0, 100));
done(close);
