// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/import-sessions/claude CODEX_HOME=__ROOT__/tmp/testrun/import-sessions/codex MOCK_DELAY_MS=10
// A folder's existing sessions come into its sidebar with the `import` order (T-150, the user, 2026-09-26: an agent asked to import
// some agents' sessions had only `open`, and opened them over the chat he was in, none of them in the sidebar).
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return {}; } })() }; } };
const scratch = () => js("window.desktop.api('state').then((s) => s.projects.find((p) => p.name === 'scratch'))");
// a session of scratch on disk and in its sidebar: an agent made here, its first turn done
run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Old Agent', '--kickoff', 'hello');
let s: any = null; for (let i = 0; i < 40 && !s; i++) { await sleep(500); const p = await scratch(); const all = await js(`window.desktop.api('sessions', '${p.id}')`); s = all.find((x) => p.sessions.includes(x.sessionId)) ?? null; }
check('the folder has a session on disk and in its sidebar', !!s);
// taken out of the sidebar (the menu's Remove from sidebar): still on disk, not listed
const p = await scratch();
await js(`window.desktop.api('setSessions', '${p.id}', ${JSON.stringify(p.sessions.filter((x) => x !== s.sessionId))}, ${JSON.stringify(p.providers ?? {})})`);
check('taken out of the sidebar', !(await scratch()).sessions.includes(s.sessionId));
const offer = run('import', '--folder', 'scratch');
check('import with no session named answers the folder\'s sessions not in the sidebar', offer.code === 0 && offer.out.importable?.some((x) => x.id === s.sessionId), JSON.stringify(offer.out).slice(0, 200));
const shown = await js("document.querySelector('.tb-name')?.textContent");
const imp = run('import', '--folder', 'scratch', s.sessionId); await sleep(800);
check('import puts it back in the folder\'s sidebar', imp.code === 0 && (await scratch()).sessions.includes(s.sessionId) && imp.out.imported?.[0]?.id === s.sessionId, JSON.stringify(imp.out).slice(0, 200));
check('...and leaves the screen as it was', (await js("document.querySelector('.tb-name')?.textContent")) === shown);
const none = run('import', '--folder', 'scratch', 'no-such-session-xyz');
check('a session the folder does not have is refused with a reason', none.code === 1 && /no session/.test(none.out.error ?? ''), JSON.stringify(none.out));
done(close);
