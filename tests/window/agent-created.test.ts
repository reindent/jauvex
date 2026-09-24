// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/agent-created/claude MOCK_DELAY_MS=10
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { close } = await connect(); await sleep(2500);
// The incident (2026-09-24): asked by voice for a new agent, the Jauvex agent made one with no first message (--no-kickoff); the app
// opened an empty chat, no session was ever made, and the agent was gone: "the agent was not created actually". An agent ordered through
// the command line always starts, with its own introduction when it is given no first message, so it exists and is listed.
const run = (...args: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const scratch = () => (run('list').folders ?? []).find((f) => f.name === 'scratch')?.sessions ?? [];
const made = run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Coding Agent', '--no-kickoff');
check('new-agent answers', made.ok === true, JSON.stringify(made).slice(0, 200));
let listed = false; for (let t = 0; t < 20000 && !listed; t += 500) { await sleep(500); listed = scratch().some((s) => s.name === 'Coding Agent'); }
check('the new agent has a session, listed in its folder under its name', listed, JSON.stringify(scratch().slice(0, 4)));
done(close);
