// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/copy-earlier/claude MOCK_DELAY_MS=5
// The Jauvex agent's chat, which the app keeps its own copy of, loads what came before that copy from the agent's own session (T-272, from the
// other edition's fix; the user, 2026-10-01, of an agent there: "the workspace agent chat history is cut. There's not even a load earlier
// messages. At least there should be a load earlier messages button": saves that overlapped had cut its copy to the last 12 messages, T-269,
// while its session kept them all). Six questions to the Jauvex agent (the Claude stand-in), its copy cut to the last two, the window loaded
// again: the chat shows those two, "Load earlier messages" counts what the session has before them, and brings it back, each question once,
// in order.
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 20000) => { for (let t = 0; t < ms; t += 300) { const v = await js(expr); if (v) return v; await sleep(300); } return null; };
const typeAndSend = async (text: string) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200); await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); };
const answered = (i: number) => `[...${V}.querySelectorAll('.assistant .prose')].some((p) => p.textContent.includes('I got: "Message ${i}"'))`;
const asked = () => js(`[...${V}.querySelectorAll('.user')].map((u) => (u.textContent.match(/Message \\d/) ?? [''])[0]).filter(Boolean)`);
const answers = () => js(`[...${V}.querySelectorAll('.assistant .prose')].filter((p) => /I got: "Message \\d"/.test(p.textContent)).length`);
const openJauvex = async () => { await js("document.querySelector('.jauvex-row').click()"); await sleep(1500); };
await openJauvex();
for (let i = 1; i <= 6; i++) { await typeAndSend(`Message ${i}`); await until(answered(i)); await sleep(300); }
check("(six questions and their answers in the Jauvex agent's chat)", (await answers()) === 6, JSON.stringify(await asked()));
await sleep(1000); const file = path.join(process.env.CVC_DATA_DIR!, 'jauvex-transcript.json');
writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, 'utf8')).slice(-2))); // cut to its last two, as saves that overlapped left an agent's
await js('location.reload()'); await sleep(3500); await openJauvex();
check('the chat opens on what its copy kept: the last question and its answer', !!(await until(`${answered(6)} && ![...${V}.querySelectorAll('.assistant .prose')].some((p) => p.textContent.includes('I got: "Message 5"'))`)) && JSON.stringify(await asked()) === '["Message 6"]', JSON.stringify(await asked()));
const button = () => js(`${V}.querySelector('.earlier')?.textContent ?? ''`);
check('...with "Load earlier messages (10 more)": what the agent\'s own session has before them', (await until(`/Load earlier messages \\(10 more\\)/.test(${V}.querySelector('.earlier')?.textContent ?? '')`, 10000)) !== null, await button());
await js(`${V}.querySelector('.earlier')?.click()`);
check("it brings the conversation back from the agent's session: every question once, in order, every answer", !!(await until(`[...${V}.querySelectorAll('.user')].length >= 6`, 10000)) && JSON.stringify(await asked()) === JSON.stringify(['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5', 'Message 6']) && (await answers()) === 6, `${JSON.stringify(await asked())}, ${await answers()} answers`);
check('...and nothing is left before them: the button goes', (await button()) === '', await button());
done(close);
