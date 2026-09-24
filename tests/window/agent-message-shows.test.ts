// llm
import { connect, sleep, check, done, V } from './lib.ts'; import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
// A message from another agent shows in the chat on screen at once, without reloading the window. A new agent's chat was opened under a
// "new session" key; clicking its row later opened a second copy under the session's own key; messages went to the hidden first copy,
// and the one on screen showed them only after Cmd R (reported 2026-09-22 on the public version).
const run = (...a) => JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' }));
await js("localStorage.setItem('cvc.model', 'claude-haiku-4-5'); localStorage.setItem('cvc.permissions', 'auto')");
const say = async (t) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(t)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200); await js(`${V}.querySelector('.composer .send').click()`); };
const idle = async (max = 60) => { await sleep(1500); for (let i = 0; i < max && (await js(`!!${V}?.querySelector('.composer .stop')`)); i++) await sleep(1000); };
const ids = () => run('list').folders.flatMap((f) => f.sessions); const before = new Set(ids().map((x) => x.id));
await js("document.querySelector('.group-head button[title=\"New session\"], .group-head button[title=\"New agent\"]').click()"); await sleep(1500);
await say('Reply with the single word ONE and nothing else.'); await idle(); await sleep(2500);
let mine; for (let i = 0; i < 20 && !mine; i++) { mine = ids().find((x) => !before.has(x.id)); if (!mine) await sleep(1000); } // the provider titles it by itself ("One"): found as the one session that is new
if (!mine) { check('the new agent has a session', false, JSON.stringify(run('list').folders.flatMap((f) => f.sessions).slice(0, 3))); done(close); }
check('the new agent has a session', !!mine);
const other = ids().find((x) => x.id !== mine.id);
run('open', '--session', other.id); await sleep(1500);   // look at another session (the sidebar's own path: key folder:session)
run('open', '--session', mine.id); await sleep(2000);    // then back to the new agent, the same way
const copies = () => js(`[...document.querySelectorAll('.chat-host')].map((h) => (h.style.display !== 'none' ? 'V' : 'h') + (/single word ONE/.test(h.textContent) ? '1' : '0')).join(' ')`);
check('reopened from the sidebar, the new agent is one chat on screen', /single word ONE/.test(await js(`${V}.textContent`)) && (await js(`[...document.querySelectorAll('.chat-host')].filter((h) => /single word ONE/.test(h.textContent)).length`)) === 1);
const answersBefore = await js(`${V}.querySelectorAll('.assistant').length`);
run('send', '--session', mine.id, '--text', '(from agent "Tester" [abc123]) Reply with the single word ZEBRA and nothing else.');
let shown = false; for (let i = 0; i < 40 && !shown; i++) { await sleep(1000); shown = (await js(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /single word ZEBRA/.test(b.textContent))`)) && (await js(`${V}.querySelectorAll('.assistant').length`)) > answersBefore && !(await js(`!!${V}.querySelector('.composer .stop')`)); } // the model's words do not matter (Haiku answered ONE again): a new answer after the message does
check('the message and its answer show in the chat on screen, without a reload', shown);
check('one chat for the session, not two', (await js(`[...document.querySelectorAll('.chat-host')].filter((h) => /single word ONE/.test(h.textContent)).length`)) === 1);
done(close);
