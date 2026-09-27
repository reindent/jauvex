// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/open-stays-listed/claude CODEX_HOME=__ROOT__/tmp/testrun/open-stays-listed/codex MOCK_DELAY_MS=5
// A session an agent opens with the `open` order stays in its folder's sidebar (T-152, the user, 2026-09-26: an agent opened seven
// existing sessions of a folder; they showed while their chats were open, then dropped out a few at a time as other chats took the
// eight open places, since opening had never put them in the folder's list).
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return {}; } })() }; } };
const scratch = () => js("window.desktop.api('state').then((s) => s.projects.find((p) => p.name === 'scratch'))");
const onDisk = async () => { const p = await scratch(); const all = await js(`window.desktop.api('sessions', '${p.id}')`); return all.filter((x) => p.sessions.includes(x.sessionId)); };
// nine sessions of scratch on disk and in its sidebar: agents made here, their first turns done
for (let i = 1; i <= 9; i++) { run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', `Agent ${i}`, '--kickoff', `hello ${i}`); await sleep(400); }
let mine: any[] = []; for (let i = 0; i < 60 && mine.length < 9; i++) { await sleep(500); mine = await onDisk(); }
check('the folder has nine listed sessions to work with', mine.length >= 9, `${mine.length}`);
const s = mine[0]; // one of them taken out of the sidebar (still on disk): a session the folder had never listed
const p = await scratch(); await js(`window.desktop.api('setSessions', '${p.id}', ${JSON.stringify(p.sessions.filter((x) => x !== s.sessionId))}, ${JSON.stringify(p.providers ?? {})})`);
run('import', '--folder', 'scratch', mine[1].sessionId); await sleep(800); // one already listed: nothing changes but the window reads the list again
const o = run('open', '--folder', 'scratch', '--session', s.sessionId); await sleep(800);
check('open shows it', o.code === 0 && o.out.opened === s.sessionId, JSON.stringify(o.out));
check('open puts it in the folder\'s list', (await scratch()).sessions.includes(s.sessionId));
check('and tells the agent that import is the order for that', /import --folder/.test(o.out.listed ?? ''), JSON.stringify(o.out));
for (const x of mine.slice(1, 9)) { run('open', '--folder', 'scratch', '--session', x.sessionId); await sleep(300); } // eight other chats: its own is closed to make room
const after = run('list'); const folder = after.out.folders?.find((f) => f.name === 'scratch');
check('closed to make room, it is still listed', !!folder?.sessions.some((x) => x.id === s.sessionId), `${folder?.sessions.length} listed`);
done(close);
