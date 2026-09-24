// llm
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2000);
// A Claude agent that leaves a background job running swallows the next message: its next turn answers only the job's "stopped"
// notice, empty, in under a second (reproduced with the SDK: "What is 2 + 2?" got an empty answer in 846 ms). Between agents it read
// as "the third message fails". The app sends such a message again, once.
await js("localStorage.setItem('cvc.model', 'claude-haiku-4-5'); localStorage.setItem('cvc.permissions', 'auto')");
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.claude')).click()"); await sleep(1500);
await js("document.querySelector('.group-head button[title=\"New session\"]').click()"); await sleep(1500);
const say = async (t) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(t)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200); await js(`${V}.querySelector('.composer .send').click()`); };
const idle = async (max = 90) => { for (let i = 0; i < max; i++) { await sleep(1000); const ask = await js(`(() => { const b = [...${V}.querySelectorAll('.ask .ask-row button')].find((x) => x.textContent === 'Allow once'); if (b) { b.click(); return true; } return false; })()`); if (ask) continue; if (!(await js(`!!${V}.querySelector('.composer .stop')`))) return; } };
await say('Use the Bash tool with run_in_background set to true to run: sleep 300. Then end your turn with the single word STARTED.'); await sleep(2000); await idle();
check('the first turn started a background job', /STARTED/.test(await js(`[...${V}.querySelectorAll('.assistant')].map((a) => a.textContent).join(' ')`)));
await say('What is 2 + 2? Answer with the number only.'); await sleep(3000); await idle();
const answers = await js(`[...${V}.querySelectorAll('.assistant')].map((a) => a.textContent.trim())`);
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
check('the swallowed turn was noticed and the message sent again', /with no answer .*sending the message again/.test(log), log.split('\n').filter((l) => /no answer/.test(l)).join(' | ').slice(0, 200));
check('the question got its answer', answers.some((a) => /(^|\D)4(\D|$)/.test(a)), JSON.stringify(answers.slice(-3)));
done(close);
