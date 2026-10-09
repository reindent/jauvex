// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/silent-reply/claude MOCK_DELAY_MS=10
// A message nothing visible came back to says so, under it (FB-50, Diego, 2026-10-09: "terrible UX"): the reply was only "No response
// requested.", which the app hides (and sends the message again once), so the message looked swallowed. Now "<agent> didn't reply · Send again".
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
const type = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
  await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); };
const running = `!!${V}?.querySelector('.send.stop')`;
check('a Claude agent on the stand-in is made', run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Quiet', '--kickoff', 'hello').ok === true);
await until(`!${running} && ${V}.querySelectorAll('.assistant').length > 0`);
check('after an answer, no "didn\'t reply" line', !(await js(`!!${V}.querySelector('.silent-reply')`)));
await type('[[no reply]] are you there?');
check('a reply that is no answer: the message says so under it', await until(`!${running} && /Quiet didn't reply/.test(${V}.querySelector('.silent-reply')?.textContent ?? '')`, 15000), await js(`${V}.querySelector('.silent-reply')?.textContent ?? 'none'`));
check('...and the hidden "No response requested." is not shown', !(await js(`[...${V}.querySelectorAll('.assistant')].some((a) => /No response requested/.test(a.textContent))`)));
await type('thanks');
check('an answer after it takes the line away', await until(`!${running} && !${V}.querySelector('.silent-reply')`, 15000));
done(close);
