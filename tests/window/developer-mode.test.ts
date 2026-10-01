// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/developer-mode/claude MOCK_DELAY_MS=20
// Developer mode (T-247; the user, 2026-09-30: "add one more for developer, like some glasses, and by default, should be disabled. When it's
// disabled, then the users will not see bash and all these tool calls ... They would just see ... working ... unless they click it"): an
// agent's tool call (the Claude stand-in's Bash call, for a message with [[tool]] in it) shows as one Worked row; a click opens it; the
// glasses at the top right show every tool call, and the choice is kept.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => Promise<unknown> | unknown, ms = 20000) => { for (let t = 0; t < ms; t += 250) { const v = await f(); if (v) return v; await sleep(250); } return null; };
const builder = () => (run('list').folders ?? []).find((f: any) => f.name === 'scratch')?.sessions?.find((x: any) => x.name === 'Builder' && !x.busy);
run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Builder', '--no-kickoff'); const b: any = await until(builder);
const row = "[...document.querySelectorAll('.side-scroll .row')].find((x) => x.querySelector('.row-title')?.textContent === 'Builder')";
await until(() => js(`!!${row}`)); await js(`${row}.click()`); await sleep(1000);
run('send', '--session', b.id, '--text', '[[tool]] look at the folder');
check('the answer comes', !!(await until(() => js(`[...${V}.querySelectorAll('.assistant .prose')].some((p) => /I got:.*\\[\\[tool\\]\\]/.test(p.textContent))`))));
const bashOut = `[...${V}.querySelectorAll('.fold b')].some((x) => x.textContent === 'Bash' && !x.closest('.work-parts'))`;
check('off by default: the tool call is one Worked row, the Bash call itself out of sight', !!(await until(() => js(`/Worked/.test(${V}.querySelector('.work-row')?.textContent ?? '') && /1 step/.test(${V}.querySelector('.work-row').textContent) && !document.querySelector('.dev-btn.lit')`), 10000)) && !(await js(bashOut)),
  await js(`(${V}.querySelector('.thread')?.textContent ?? '').slice(0, 300)`));
await js(`${V}.querySelector('.work-row > button').click()`);
check('a click on it shows what the agent did: the Bash call', !!(await until(() => js(`[...${V}.querySelectorAll('.work-parts .fold b')].some((x) => x.textContent === 'Bash')`), 5000)));
await js("document.querySelector('.dev-btn').click()");
check('the glasses: every tool call shows, no Working rows', !!(await until(() => js(`!!document.querySelector('.dev-btn.lit') && !${V}.querySelector('.work-row') && ${bashOut}`), 5000)));
const kept = await until(() => { try { return JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).ui?.developer === true; } catch { return false; } }, 5000);
check('...and the choice is kept', !!kept);
await js("document.querySelector('.dev-btn').click()");
check('off again: back to the Worked row', !!(await until(() => js(`!!${V}.querySelector('.work-row') && !(${bashOut})`), 5000)));
done(close);
