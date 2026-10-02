// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/jauvex-chat-keeps/claude MOCK_DELAY_MS=5
// The Jauvex agent's chat keeps what you wrote, whatever it was opened under (2026-10-01, found with the dashboard, T-279): once the agent has a
// session, a reload opens its chat by that session, and the draft and the waiting messages, kept under the name it was opened with, were not
// found; and a message handed to a running turn (another agent's word, or the app's own) was missing from the agent's copy of the chat after a reload:
// the line that kept it sat inside a comment.
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await js(expr); if (v) return v; await sleep(250); } return null; };
const type = (text: string) => js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const enter = () => js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
const copy = () => { const f = path.join(process.env.CVC_DATA_DIR!, 'jauvex-transcript.json'); if (!existsSync(f)) return ''; return (JSON.parse(readFileSync(f, 'utf8')) as any[]).filter((e) => e.message?.role === 'user').map((e) => JSON.stringify(e.message.blocks)).join('\n'); }; // the person's own words in it (the stand-in's reply quotes them)
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
await type('[[wait 4000]] A long first question.'); await sleep(200); await enter(); // a turn that takes a while, and makes the agent's session
await until(`!!${V}.querySelector('.composer .stop, button[title*="Stop"]')`, 8000); await sleep(500);
execFileSync('node', ['scripts/jauvex.ts', 'send', '--session', 'Jauvex', '--text', 'And one more thing while you work.'], { encoding: 'utf8' }); // handed to the running turn, as another agent's word or the app's is (typed words wait for their own turn)
await until(`!${V}.querySelector('.composer .stop, button[title*="Stop"]')`, 20000); await sleep(1500);
check("a message handed to the running turn is in the agent's own copy of the chat", copy().includes('And one more thing while you work.'), copy().slice(-300));
await type('A draft, not sent yet'); await sleep(1500);
await js('location.reload()'); await sleep(3500); // the window opens again on the chat that was on screen, by its session
await until(`!!${V}?.querySelector('.composer textarea')`, 8000);
check('after a reload the chat opens by its session, with the draft still there', (await js(`${V}?.querySelector('.composer textarea')?.value`)) === 'A draft, not sent yet', String(await js(`${V}?.querySelector('.composer textarea')?.value`)));
check("...and the message handed to the running turn shows in it", !!(await until(`/And one more thing while you work/.test(${V}?.textContent ?? '')`, 8000)));
done(close);
