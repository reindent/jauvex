// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/needs-options/claude MOCK_DELAY_MS=5
// An agent's question with the answers it offers (as in the other edition): the
// options under its `options:` line show as buttons under the question, the recommended one marked, with a pen to write your own answer; a tap
// sends your answer with the question quoted over it, and the box is answered: no longer yellow, its buttons off, your pick shown.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e: any) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
const reply = 'The build is ready.\n\n```needs-you\nRelease this version now, later today, or next week?\noptions:\n- Now (recommended): publish it right away\n- Later today: after your evening test\n- Next week: with the next fixes\n```';
check('a Claude agent on the stand-in is made', run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Asks', '--kickoff', `[[reply]]${reply}`).ok === true);
const BOX = `[...${V}.querySelectorAll('.assistant .needs-you')].pop()`;
check('its question shows in yellow with its options as buttons', await until(`!!${BOX} && ${BOX}.querySelectorAll('.needs-opt').length === 3`), await js(`${V}?.querySelector('.assistant')?.innerHTML?.slice(0, 300) ?? 'none'`));
check('...each with its label and what it means, the recommended one marked', await js(`(() => { const b = [...${BOX}.querySelectorAll('.needs-opt')]; return b[0].querySelector('b').textContent === 'Now' && /publish it right away/.test(b[0].textContent) && b[0].classList.contains('rec') && b[1].querySelector('b').textContent === 'Later today'; })()`));
check('...and a pen to write your own answer', await js(`!!${BOX}.querySelector('.needs-own')`));
await js(`[...${BOX}.querySelectorAll('.needs-opt')][1].click()`);
check('a tap sends your answer, the question quoted over it', await until(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /Release this version now/.test(b.querySelector('.bubble-quote')?.textContent ?? '') && /Later today/.test(b.textContent))`, 10000), await js(`[...${V}.querySelectorAll('.user .bubble')].map((b) => b.textContent).join(' | ').slice(-200)`));
check('...and the box is answered: its buttons off, your pick shown', await until(`${BOX}.classList.contains('answered') && [...${BOX}.querySelectorAll('.needs-opt')].every((b) => b.disabled) && ${BOX}.querySelector('.needs-opt.picked b')?.textContent === 'Later today'`, 10000), await js(`${BOX}?.outerHTML.slice(0, 300)`));
done(close);
