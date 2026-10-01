// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CVC_GROK_BIN=__ROOT__/tests/mock/grok CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/debugger-agents/claude CODEX_HOME=__ROOT__/tmp/testrun/debugger-agents/codex GROK_HOME=__ROOT__/tmp/testrun/debugger-agents/grok MOCK_DELAY_MS=5
// The agents in the debugger (T-260; the user, 2026-10-01: "the debugger in the model part, it misses a lot of things. It has only Jev. But it
// doesn't say anything that is going on with Claude or Codex or Grok. I want to be able to see that and that should be logged as well"): a
// turn of a Claude, a Codex and a Grok agent shows in the Model tab, each line saying which agent it is about (what was sent, a tool it ran,
// what it said, how it ended), the whole of a line a click away; the same lines are in voice-debug.log.
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => Promise<unknown> | unknown, ms = 20000) => { for (let t = 0; t < ms; t += 250) { const v = await f(); if (v) return v; await sleep(250); } return null; };
const scratch = () => (run('list').folders ?? []).find((f: any) => f.name === 'scratch')?.sessions ?? [];
const logFile = path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'); const logText = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
const rows = "[...document.querySelectorAll('.debug .debug-row')].map((r) => `${r.querySelector('i')?.textContent} | ${r.querySelector('em')?.textContent} | ${r.querySelector('p')?.textContent}`)";

if (!(await js("!!document.querySelector('.debug')"))) await js("document.querySelector('.tb-right .lucide-bug').closest('button').click()");
await until(() => js("!!document.querySelector('.debug')"), 5000);
await js("[...document.querySelectorAll('.debug-tabs button')].find((b) => b.textContent === 'Model').click()"); await sleep(300);

const agents: Record<string, any> = {};
for (const [provider, label] of [['claude', 'Claude'], ['codex', 'Codex'], ['grok', 'Grok']]) {
  const name = `${label} logged`; run('new-agent', '--provider', provider, '--folder', 'scratch', '--name', name, '--no-kickoff');
  agents[label] = await until(() => scratch().find((s: any) => s.name === name && !s.busy), 20000);
  run('send', '--session', agents[label].id, '--text', `${provider === 'claude' ? '[[tool]] ' : ''}a word for the ${label} agent`); // Grok's tool asks permission first
}
for (const label of ['Claude', 'Codex', 'Grok']) {
  const who = `${label} ${String(agents[label]?.id ?? '').slice(0, 6)} · scratch`;
  const mine = async () => ((await js(rows)) as string[]).filter((r) => r.split(' | ')[1] === who);
  const got = await until(async () => { const m = await mine(); return m.some((r) => /turn starts.*a word for the/.test(r)) && m.some((r) => / \| says: "/.test(r)) && m.some((r) => /turn done/.test(r)) ? m : null; }, 25000) as string[] | null;
  check(`a ${label} agent's turn shows in the Model tab, as "${who}": what was sent, what it said, how it ended`, !!got, ((await mine()) as string[]).join('\n') || ((await js(rows)) as string[]).slice(-6).join('\n'));
  check(`...marked as an agent's line`, !!got && got.every((r) => r.startsWith('agent |')));
  check(`...and in voice-debug.log`, !!(await until(() => logText().split('\n').some((l) => l.includes(`[agent ${who}]: turn starts`)) && logText().split('\n').some((l) => l.includes(`[agent ${who}]`) && /\] \d+ms: turn done/.test(l)), 5000)));
}
const claudeWho = `Claude ${String(agents.Claude?.id ?? '').slice(0, 6)} · scratch`;
check('a tool the Claude agent ran has its line', ((await js(rows)) as string[]).some((r) => r.startsWith(`agent | ${claudeWho} | calls Bash`)));
await js(`[...document.querySelectorAll('.debug .debug-row')].find((r) => r.querySelector('em')?.textContent === ${JSON.stringify(claudeWho)} && /turn starts/.test(r.textContent)).click()`); await sleep(300);
check('a click on a line shows the whole of it', /a word for the Claude agent/.test(await js("document.querySelector('.debug .debug-detail')?.textContent ?? ''")));
await js("[...document.querySelectorAll('.debug-tabs button')].find((b) => b.textContent === 'Voice').click()"); await sleep(300);
check('the Voice tab has none of them', !((await js(rows)) as string[]).some((r) => r.startsWith('agent |')));
done(close);
