// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/steer-after-stop/claude MOCK_DELAY_MS=80
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
// A message handed to a running turn, then a stop. A stop is the person's (2026-10-07, as Jauvex Pro; the user, 2026-09-25: "When I click
// stop, it doesn't really stop"): what they handed to the stopped turn is not sent again, and nothing starts on its own. Only another agent's
// message handed to it waits again for its answer. The Claude stand-in drops what waits when a turn is interrupted, as Claude Code does.
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
const type = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
  await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); };
const running = `!!${V}?.querySelector('.send.stop')`; const WORDS = 'what we can do later: import from the other app';

check('a Claude agent on the stand-in is made', run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Steer', '--kickoff', 'hello').ok === true);
await until(`!${running} && ${V}.querySelectorAll('.assistant').length > 0`);
await type('a long job, please'); check('a turn runs', await until(running, 5000));
await sleep(900); await type(WORDS); // typed while it runs: queued, with a Send now button
check('typed while it runs, it waits in the queue', await until(`[...${V}.querySelectorAll('.bubble.queued')].some((b) => b.textContent.includes(${JSON.stringify(WORDS)}))`, 3000));
await js(`[...${V}.querySelectorAll('.bubble.queued')].find((b) => b.textContent.includes(${JSON.stringify(WORDS)})).querySelector('.steer-now').click()`);
check('Send now hands it to the running turn', await until(`[...${V}.querySelectorAll('.bubble.steered')].some((b) => b.textContent.includes(${JSON.stringify(WORDS)}))`, 3000));
await sleep(300); await js(`${V}.querySelector('.send.stop').click()`);
check('the Stop ends the turn', await until(`!${running}`, 5000));
await sleep(2500);
check('... and nothing starts again on its own', !(await js(running)));
check('what the person handed to the stopped turn is not sent again', !(await js(`[...${V}.querySelectorAll('.assistant')].some((a) => a.textContent.includes('I got: "' + ${JSON.stringify(WORDS)}))`)));
check('... shown once, not twice', (await js(`[...${V}.querySelectorAll('.user .bubble')].filter((b) => b.textContent.includes(${JSON.stringify(WORDS)})).length`)) === 1);
done(close);
