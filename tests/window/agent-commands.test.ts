// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/agent-commands/claude CODEX_HOME=__ROOT__/tmp/testrun/agent-commands/codex MOCK_DELAY_MS=10
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { cdp, js, close } = await connect(); await sleep(2500);
// The app's command line (scripts/jauvex.ts): a request file in data/commands, answered by the window. Every action an agent may need.
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return { raw: String(e.stdout) + String(e.stderr) }; } })() }; } };
const list = run('list'); check('list answers with the folders and their sessions', list.code === 0 && list.out.folders?.some((f) => f.name === 'scratch' && f.sessions.length > 0), JSON.stringify(list.out).slice(0, 120));
mkdirSync('tmp/scratch2', { recursive: true });
const add = run('add-folder', 'tmp/scratch2'); await sleep(800);
check('add-folder adds a project', add.code === 0 && (await js("[...document.querySelectorAll('.group-head')].some((g) => g.textContent.includes('scratch2'))")));
const st = run('settings', '--default-provider', 'codex', '--show-jauvex', 'no'); await sleep(300);
check('settings sets the default agent and hides the Jauvex row', st.code === 0 && (await js("localStorage.getItem('cvc.provider')")) === 'codex' && !(await js("!!document.querySelector('.jauvex-row')")));
run('settings', '--show-jauvex', 'yes'); await sleep(300);
const ag = run('new-agent', '--folder', 'scratch', '--name', 'Cmd Test', '--no-kickoff'); await sleep(1200);
check('new-agent opens a new session in the folder', ag.code === 0 && (await js("document.querySelector('.tb-name')?.textContent")) === 'Cmd Test', JSON.stringify(ag.out));
const pf = run('pick-folder'); check('pick-folder without a person to choose is refused with a reason', pf.code === 1 && /no folder/.test(pf.out.error ?? ''), JSON.stringify(pf.out));
const op = run('open'); await sleep(800);
check('open with no session opens the Jauvex agent', op.code === 0 && (await js("document.querySelector('.jauvex-row')?.classList.contains('on')")));
const bad = run('open', '--session', 'no-such-session-xyz'); check('an unknown session is refused with a reason', bad.code === 1 && /no session/.test(bad.out.error ?? ''));
const wl = run('welcome'); await sleep(500); check('welcome opens the welcome screen', wl.code === 0 && (await js("!!document.querySelector('.welcome')")));
done(close);
