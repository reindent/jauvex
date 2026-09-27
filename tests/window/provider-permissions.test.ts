// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/provider-permissions/claude CODEX_HOME=__ROOT__/tmp/testrun/provider-permissions/codex MOCK_DELAY_MS=5
// Provider permissions (asked for 2026-09-26): Ask, Auto or YOLO for every session of a provider, from Settings › Safety or the command
// line; the composer shows the mode its turns run with and is locked while the setting holds it; "Use session setting" gives it back.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return {}; } })() }; } };
await js("[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.claude')).click()"); await sleep(1500);
const pick = `[...${V}.querySelectorAll('.composer-row select.model')].find((s) => [...s.options].some((o) => o.value === 'yolo'))`;
check('the composer offers YOLO next to Ask and Auto', await js(`[...${pick}.options].map((o) => o.value).join()`) === 'ask,auto,yolo');
const set = run('settings', '--permission-provider', 'claude', '--permission-mode', 'yolo'); await sleep(500);
check('the command line sets YOLO for Claude', set.code === 0 && set.out.providerPermissions?.claude === 'yolo', JSON.stringify(set.out));
check('the Claude composer shows YOLO, locked by the setting', (await js(`${pick}.value`)) === 'yolo' && (await js(`${pick}.disabled`)), `${await js(`${pick}.value`)} ${await js(`${pick}.disabled`)}`);
check('a bad mode is refused with the usage', run('settings', '--permission-provider', 'claude', '--permission-mode', 'root').code === 1);
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(400);
await js("[...document.querySelectorAll('.modal.settings .settings-tab')].find((t) => t.textContent === 'Safety').click()"); await sleep(300);
const sel = "document.querySelector('.modal.settings select[aria-label=\"Claude permissions\"]')";
check('Settings › Safety has each provider\'s permissions, Claude at YOLO', (await js(`${sel}?.value`)) === 'yolo' && (await js("!!document.querySelector('.modal.settings select[aria-label=\"Grok permissions\"]')")));
await js(`(() => { const s = ${sel}; s.value = 'session'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500);
check('"Use session setting" gives the composer back its own pick, unlocked', (await js(`${pick}.value`)) !== 'yolo' && !(await js(`${pick}.disabled`)) && !(await js("window.desktop.api('state').then((s) => s.ui?.providerPermissions?.claude)")));
done(close);
