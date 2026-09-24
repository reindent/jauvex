// fresh
// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/sign-in-by-cli/claude MOCK_CLAUDE_SIGNED_OUT=1 CVC_CODEX_BIN=__ROOT__/tests/mock/codex CODEX_HOME=__ROOT__/tmp/testrun/sign-in-by-cli/codex MOCK_DELAY_MS=10
import { connect, sleep, check, done } from './lib.ts';
const { js, close } = await connect(); await sleep(2000);
// 2026-09-24: this edition signs no one in. Anthropic does not let apps built on its Agent SDK offer the Claude.ai login, so people sign in
// with each provider's own command line; the in-app sign-in stays in the code, hidden (SIGN_IN_IN_APP in shared/types.ts).
const claudeRow = "[...document.querySelectorAll('.welcome-checks li')].map((l) => l.textContent).find((t) => /Claude is/.test(t)) ?? ''";
let row = ''; for (let i = 0; i < 40 && !/claude auth login/.test(row); i++) { await sleep(500); row = await js(claudeRow); }
check('the welcome says Claude is not signed in, and gives the command line that signs it in', /not signed in/.test(row) && /claude auth login/.test(row), row.slice(0, 220));
const buttons = await js("[...document.querySelectorAll('.welcome-checks button')].map((b) => b.textContent)");
check('with a Check again button, and no Sign in button', buttons.includes('Check again') && !buttons.some((t) => /Sign in/.test(t)), JSON.stringify(buttons));
await js("document.querySelector('.welcome-close').click()"); await sleep(600);
await js("document.querySelector('button[title^=\\'Accounts\\']').click()"); await sleep(2000);
const panel = await js("document.querySelector('.modal.accounts')?.textContent ?? ''");
check('the accounts panel gives each command line: sign in for Claude, sign out for Codex', /claude auth login/.test(panel) && /codex logout/.test(panel), panel.slice(0, 240));
check('and has no Sign in, Sign out or Switch buttons', !(await js("[...document.querySelectorAll('.modal.accounts button')].some((b) => /Sign in|Sign out|Switch/.test(b.textContent))")));
done(close);
