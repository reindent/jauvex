// env: CVC_SETUP_FAKE=claude-only CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/new-agent-provider/claude CODEX_HOME=__ROOT__/tmp/testrun/new-agent-provider/codex MOCK_DELAY_MS=5
// An order for an agent of a provider makes an agent of that provider, or none (T-229, from the other edition; the user, 2026-09-29, on a
// server: "I'm asking Reindent agent to create a Codex agent and keeps creating a Claude agent instead"). A new chat took the last chosen
// provider only when the window thought it signed in, and fell back to another one otherwise; the window looked at sign-ins once, at start.
// Here Codex answers "not signed in".
import { connect, sleep, check, done, useWork } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { close } = await connect(); await sleep(2500);
await useWork(); // a folder of this edition's own (tmp/work)
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const made = run('new-agent', '--provider', 'codex', '--folder', 'work', '--name', 'Coder', '--no-kickoff'); await sleep(6000);
const coder = (run('list').folders ?? []).find((f: any) => f.name === 'work')?.sessions?.find((s: any) => s.name === 'Coder');
check('an order for a Codex agent, Codex signed out: refused, saying so, and no agent of another provider made', made.ok === false && /^Codex is not signed in on this computer.*no agent was made/.test(made.error ?? '') && !coder, JSON.stringify({ made, coder }));
done(close);
