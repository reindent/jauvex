// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/pane-jauvex/claude CODEX_HOME=__ROOT__/tmp/testrun/pane-jauvex/codex MOCK_DELAY_MS=5
// The Jauvex agent's chat takes over the right pane you were looking at (opening the Jauvex agent closed the
// right pane): a file open beside an agent's chat stays open when the Jauvex agent is opened; the agent's chat keeps its own; a session with
// no pane of its own still shows none.
import { connect, sleep, check, done, V, ownAgents, rowOf } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 10000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await sleep(250); } return false; };
const row = (re: string) => `[...document.querySelectorAll('.side-scroll .row')].find((r) => !r.classList.contains('jauvex-row') && /${re}/.test(r.textContent))`;
await ownAgents(js, ['PONG', 'Sea facts']);
const paneTitle = "document.querySelector('.pane .pane-title')?.textContent ?? ''";
await js(`${row('PONG')}?.click()`); await sleep(2000);
await js(`(() => { const a = document.createElement('a'); a.href = 'README.md'; a.textContent = 'readme'; ${V}.querySelector('.thread').appendChild(a); a.click(); })()`); await sleep(1500);
check("(a file is open in the pane beside an agent's chat)", await until(`(${paneTitle}) === 'README.md'`), await js(paneTitle));
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
check('the Jauvex agent is opened: the pane stays, on the same file', await until(`(${paneTitle}) === 'README.md' && !!document.querySelector('.jauvex-row.on')`), await js(paneTitle));
await js(`${row('PONG')}?.click()`); await sleep(1200);
check('back on the agent: its own pane, still there', await until(`(${paneTitle}) === 'README.md' && !document.querySelector('.jauvex-row.on')`));
await js(`${row('Sea facts')}?.click()`); await sleep(1200);
check('another session, with no pane of its own: none', await until("!document.querySelector('.pane') && /Sea facts/.test(document.querySelector('.tb-name')?.textContent ?? '')"));
done(close);
