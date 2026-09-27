// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/jauvex-reachable/claude CODEX_HOME=__ROOT__/tmp/testrun/jauvex-reachable/codex MOCK_DELAY_MS=5
// The app's own agent is reachable from any agent, its chat open or not (T-151, the user, 2026-09-26: an agent wanted to report a bug
// to it; "Jauvex" found three "Jauvex …" agents and not it, and its id from `list`, "no such agent": it was listed only while its chat was open).
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return {}; } })() }; } };
const until = async (expr, ms = 30000) => { for (let t = 0; t < ms; t += 400) { if (await js(expr)) return true; await sleep(400); } return false; };
check('the Jauvex agent\'s chat is not open', !(await js("!!document.querySelector('.jauvex-row.on')")));
// an agent of a folder whose answer is a message block to the Jauvex agent (the stand-in says what it is told to after [[reply]])
const ag = run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Bug Reporter', '--kickoff', '[[reply]]```message-agent Jauvex\nA bug report: the import order says it cannot find the folder.\n```');
check('an agent starts with a message for the Jauvex agent', ag.code === 0, JSON.stringify(ag.out));
const got = "[...document.querySelectorAll('.chat-host')].some((h) => [...h.querySelectorAll('.bubble.agent-msg')].some((b) => b.textContent.includes('A bug report: the import order')))";
check('the Jauvex agent gets it, though its chat was closed', await until(got, 30000));
check('and its answer comes back to the agent that wrote', await until("[...document.querySelectorAll('.chat-host')].some((h) => [...h.querySelectorAll('.bubble.agent-msg')].some((b) => b.textContent.includes('From Jauvex')))", 30000));
done(close);
