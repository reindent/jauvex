// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/sessions-picker/claude CODEX_HOME=__ROOT__/tmp/testrun/sessions-picker/codex MOCK_DELAY_MS=5
import { connect, sleep, check, done, ownAgents } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The + on a project: every session of both providers, a switch between all / Claude / Codex with counts, a provider mark per row.
await ownAgents(js, ['Claude one']); await ownAgents(js, ['Codex one'], 'codex');
await js("document.querySelector('button[title=\"Add sessions\"]').click()"); await sleep(1500);
const count = (sel) => js(`document.querySelectorAll('${sel}').length`);
const all = await count('.modal .pick'); const cl = await count('.modal .pick .provider-icon.claude'); const cx = await count('.modal .pick .provider-icon.codex');
check('every row carries its provider mark', cl > 0 && cx > 0 && cl + cx === all, `${all} rows: ${cl} Claude, ${cx} Codex`);
await js("[...document.querySelectorAll('.modal-search .who button')].find((b) => b.textContent.startsWith('Codex')).click()"); await sleep(300);
check('the Codex filter shows Codex only', (await count('.modal .pick')) === cx && (await count('.modal .pick .provider-icon.codex')) === cx);
await js("[...document.querySelectorAll('.modal-search .who button')].find((b) => b.textContent.startsWith('Claude')).click()"); await sleep(300);
check('the Claude filter shows Claude only', (await count('.modal .pick')) === cl && (await count('.modal .pick .provider-icon.claude')) === cl);
check('the counts on the buttons', (await js("[...document.querySelectorAll('.modal-search .who em')].map((e) => e.textContent).join('/')")) === `${all}/${cl}/${cx}`);
done(close);
