// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/folder-name-collision/claude MOCK_DELAY_MS=5
// --folder by name picks a folder before the app's own (T-254; a server's agents, 2026-10-01: a folder named "Jauvex", and `new-agent --folder
// Jauvex` and `new-board --folder Jauvex` put two agents and a board in the app's own folder, whose name is Jauvex too). Here: a folder named
// Jauvex (under this edition's own tmp/work), a board and an agent made for it by name; the app's own folder is still reached by its path.
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
const { close } = await connect(); await sleep(2500);
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 30000): Promise<any> => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
const DIR = path.join(process.cwd(), 'tmp/work/collide/Jauvex'); rmSync(path.dirname(DIR), { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
run('add-folder', DIR);
const mine = await until(() => (run('list').folders ?? []).find((f: any) => f.path === DIR), 10000); const own = run('list').jauvex;
check("(a folder named Jauvex is added, beside the app's own folder, also Jauvex)", !!mine && mine.name === 'Jauvex' && !!own?.path && own.path !== DIR, JSON.stringify({ mine, own }));
const board = run('new-board', '--name', 'Collide', '--folder', 'Jauvex');
check("new-board --folder Jauvex makes the board in the folder named Jauvex, not in the app's own", board.ok === true && existsSync(path.join(DIR, 'boards/collide.md')) && !existsSync(path.join(own.path, 'boards/collide.md')), JSON.stringify(board));
run('new-agent', '--provider', 'claude', '--folder', 'Jauvex', '--name', 'Collider', '--no-kickoff');
const agent = await until(() => (run('list').folders ?? []).find((f: any) => f.path === DIR)?.sessions.find((s: any) => s.name === 'Collider'), 20000);
check('new-agent --folder Jauvex makes the agent there too', !!agent, JSON.stringify(run('list').folders?.map((f: any) => ({ name: f.name, sessions: f.sessions.map((s: any) => s.name) }))));
const ownBoard = run('new-board', '--name', 'Own', '--folder', own.path);
check("the app's own folder is still reached by its path", ownBoard.ok === true && existsSync(path.join(own.path, 'boards/own.md')) && !existsSync(path.join(DIR, 'boards/own.md')), JSON.stringify(ownBoard));
done(close);
