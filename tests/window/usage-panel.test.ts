// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/usage-panel/claude CODEX_HOME=__ROOT__/tmp/testrun/usage-panel/codex MOCK_USAGE=1 MOCK_DELAY_MS=10
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
// The usage battery's panel (T-98), on the stand-ins: a Claude chat's battery shows the tightest window that counts (the 5 hours, 38 % left);
// a click opens every window of Claude (Fable's own week greyed: another model) and of Codex (its model limit too), the plans, extra usage,
// credits and when each window resets; Refresh keeps it open; Escape closes it.
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await sleep(250); } return false; };
const battery = `${V}?.querySelector('.battery')`; const pop = `(${V}?.querySelector('.use-pop')?.innerText ?? '')`;

check('a Claude agent on the stand-in is made', run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Usage', '--kickoff', 'hello, usage').ok === true);
check('its battery shows the tightest window that counts: 38 % left, amber', await until(`${battery}?.textContent === '38%' && ${battery}.classList.contains('mid')`), await js(`${battery}?.outerHTML?.slice(0, 160) ?? 'no battery'`));
await js(`${battery}.click()`);
check('a click opens the panel with both providers', await until(`${pop}.includes('Claude · Max plan') && ${pop}.includes('Codex · Pro plan')`), (await js(pop)).slice(0, 300));
const text = await js(pop);
check('Claude: 5 hours, 38 % left, 62 % used, and when it resets', /5 hours\s*38 % left/.test(text) && /62 % used · resets in 2 h 1[34] min/.test(text), text.slice(0, 300));
check('Claude: the week, days ahead', /7 days\s*82 % left/.test(text) && /resets in 4 d [23] h/.test(text), text.slice(0, 400));
check("Claude: Fable's own week is there, marked as another model's", /7 days, Fable\s*60 % left/.test(text) && text.includes('another model: not counted in this chat') && (await js(`${V}.querySelectorAll('.use-pop .use-row.other').length`)) === 1);
check('Claude: extra usage', text.includes('Extra usage is on: 24 % of its monthly limit used.'));
check('Codex: 5 hours, the week, its model limit, the credits', /5 hours\s*70 % left/.test(text) && /7 days\s*30 % left/.test(text) && /5 hours, gpt-6-astra\s*95 % left/.test(text) && text.includes('Credits balance: 42.'), text.slice(-500));
await js(`${V}.querySelector('.use-refresh').click()`); await sleep(1500);
check('Refresh keeps the panel open, with the numbers', (await js(pop)).includes('Claude · Max plan') && !(await js(`${V}.querySelector('.use-refresh').disabled`)));
await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); await sleep(200);
await js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))"); await sleep(200);
check('Escape closes it', !(await js(`!!${V}.querySelector('.use-pop')`)));
done(close);
