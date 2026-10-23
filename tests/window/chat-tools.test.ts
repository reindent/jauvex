// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/chat-tools/claude MOCK_DELAY_MS=5
// The chat's tools (1.8.0): what an agent needs from you shows in yellow and a click quotes it in the message box (one quote at a time, sent
// as a markdown quote); a code block has a copy button; a right-click on the thread opens its menu.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
const reply = 'Here is the command:\n\n```sh\nls -la\n```\n\n```needs-you\nWhich folder should I clean, Downloads or Desktop?\n```';
check('a Claude agent on the stand-in is made', run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Tools', '--kickoff', `[[reply]]${reply}`).ok === true);
check('what it needs from you shows in yellow', await until(`!!${V}?.querySelector('.assistant .needs-you')`), await js(`${V}?.querySelector('.assistant')?.innerHTML?.slice(0, 300) ?? 'none'`));
check('...its code block has a copy button', await js(`!!${V}.querySelector('.assistant .code-wrap .code-copy')`));
await js(`${V}.querySelector('.assistant .needs-you').click()`); await sleep(300);
check('a click on the yellow box quotes it above the message box', /Which folder should I clean/.test(await js(`${V}.querySelector('.quote-card')?.textContent ?? ''`)));
await js(`${V}.querySelector('.assistant .needs-you').click()`); await sleep(300);
check('...one quote at a time', (await js(`${V}.querySelectorAll('.quote-card').length`)) === 1);
await js(`${V}.querySelector('.assistant .prose').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }))`); await sleep(200);
const items = await js("[...document.querySelectorAll('.chat-menu button')].map((b) => b.textContent).join(', ')");
check('a right-click on the thread opens its menu', /Copy the message/.test(items) && /Quote the message/.test(items), items);
await js("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Downloads'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
check('the quote goes with the answer, as a markdown quote, and the card goes away', await until(`[...${V}.querySelectorAll('.assistant')].some((a) => /I got: "> Which folder should I clean/.test(a.textContent))`, 15000) && !(await js(`!!${V}.querySelector('.quote-card')`)), await js(`[...${V}.querySelectorAll('.assistant')].map((a) => a.textContent.slice(0, 90)).join(' | ')`));
// The answer shows what it quotes as a quote, not as "> " lines, and a click on it goes to the question it quotes (as in Jauvex Pro).
const U = `[...${V}.querySelectorAll('.user .bubble')].filter((b) => /Downloads/.test(b.textContent) && !/\\[\\[reply\\]\\]/.test(b.textContent)).pop()`; // the answer, not the agent's first message
check('your answer shows its quote as a quote, above your words', !!(await until(`!!${U}?.querySelector('.bubble-quote') && /Which folder should I clean/.test(${U}.querySelector('.bubble-quote').textContent) && !/^>/.test(${U}.textContent.trim())`, 5000)), await js(`${U}?.innerHTML.slice(0, 200) ?? 'none'`));
await js(`${U}.querySelector('.bubble-quote').click()`); await sleep(200);
check('...a click on it goes to the question it quotes, which lights up', !!(await until(`!!${V}.querySelector('.assistant .quote-flash') && /Which folder should I clean/.test(${V}.querySelector('.assistant .quote-flash').textContent)`, 3000)));
// A long quote keeps a line of its own above the message box (a long card had taken the box's line, the box
// shrank to 15 px and "Yes" stood one letter a line).
// Each length, from a few words to past the line: a quote just short enough to share the box's line left the box the rest.
const q = 'Should I create the dashboard (DASHBOARD.md)? Say "write the dashboard", or "no dashboard" and I\'ll keep it empty. ';
const squeezed: string[] = [];
for (const n of [20, 50, 80, 100, 115, 130, 160, 220]) {
  await js(`window.dispatchEvent(new CustomEvent('jauvex:quote', { detail: ${JSON.stringify(q.repeat(3).slice(0, n).trim())} }))`); await sleep(200);
  await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Yes'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
  const fit = await js(`(() => { const c = ${V}.querySelector('.composer').getBoundingClientRect(), qc = ${V}.querySelector('.quote-card').getBoundingClientRect(), t = ${V}.querySelector('.composer textarea').getBoundingClientRect(); return { box: Math.round(t.width), composer: Math.round(c.width), below: t.top >= qc.bottom - 1 }; })()`);
  if (!fit.below || fit.box < fit.composer / 2) squeezed.push(`${n} chars: ${JSON.stringify(fit)}`);
}
check('a quote of any length sits on a line of its own, and the message box keeps its width under it', !squeezed.length, squeezed.join(' | '));
done(close);
