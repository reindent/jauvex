// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/boards/claude CODEX_HOME=__ROOT__/tmp/testrun/boards/codex MOCK_DELAY_MS=5
// Boards (T-171): a folder's markdown to-do lists, listed under its sessions and drawn as columns of cards. `new-board` makes one from
// the template and opens it; a glyph clicked moves its task on by rewriting the file; done, the task leaves the board for the top of its
// done file (boards format v1, T-174), shown as a last column with "Show done", and its glyph there reopens it; a board an agent writes
// shows up; plain markdown is not a board.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const dir = path.resolve('tmp/scratch/boards'); rmSync(dir, { recursive: true, force: true });
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(e.stdout || e.stderr); } catch { return {}; } })() }; } };
const until = async (expr, ms = 10000) => { for (let t = 0; t < ms; t += 300) { if (await js(expr)) return true; await sleep(300); } return false; };
const file = () => readFileSync(path.join(dir, 'launch-plan.md'), 'utf8'); const doneFile = () => { try { return readFileSync(path.join(dir, 'launch-plan-DONE.md'), 'utf8'); } catch { return ''; } };
const made = run('new-board', '--folder', 'scratch', '--name', 'Launch Plan');
check('new-board makes boards/<name>.md from the template', made.code === 0 && made.out.board === 'boards/launch-plan.md' && /^<!-- boards: v1 -->\n# Launch Plan/.test(file()), JSON.stringify(made.out));
check('...and opens it: a column per section, Done hidden', await until("document.querySelector('.board-view h1')?.textContent === 'Launch Plan'") && (await js("[...document.querySelectorAll('.board-view .bcol h2')].map((h) => h.textContent).join(' | ')")) === 'P0 — now | P1 — next | P2 — later', await js("[...document.querySelectorAll('.board-view .bcol h2')].map((h) => h.textContent).join(' | ')"));
check('the sidebar lists it under the folder, with its count', await until("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Launch Plan') && r.textContent.includes('0/1'))"));
const glyph = "[...document.querySelectorAll('.board-view .card')].find((c) => c.textContent.includes('T-01')).querySelector('.glyph')";
await js(`${glyph}.click()`); await sleep(600);
check('a glyph clicked moves the item to doing, in the file', /^- \[~\] \*\*T-01/m.test(file()) && await until("[...document.querySelectorAll('.board-view .card')].find((c) => c.textContent.includes('T-01'))?.classList.contains('doing')"));
await js(`${glyph}.click()`); await sleep(600);
check('...and then done: off the board, at the top of launch-plan-DONE.md, with the day', !/^- \[.\] \*\*T-01/m.test(file()) && /^- \[x\] \*\*T-01 · The first thing\*\* — .* — shipped \d{4}-\d{2}-\d{2}$/m.test(doneFile()) && doneFile().startsWith('<!-- boards: v1 -->\n# Launch Plan · Done'), doneFile());
check('the sidebar counts it done', await until("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Launch Plan') && r.textContent.includes('1/1'))"));
await js("(() => { const b = document.querySelector('.board-view label.check input'); b.click(); })()"); await sleep(300);
check('Show done shows the done file as a last Done column', (await js("[...document.querySelectorAll('.board-view .bcol h2')].map((h) => h.textContent).join(' | ')")).endsWith('Done') && await js("[...document.querySelectorAll('.board-view .bcol.done-file .card')].some((c) => c.textContent.includes('T-01'))"));
await js("[...document.querySelectorAll('.board-view .bcol.done-file .card')].find((c) => c.textContent.includes('T-01')).querySelector('.glyph').click()"); await sleep(600);
check('its glyph there reopens it: back at the top of the first section, to do, without its date', /## P0 — now\n\n- \[ \] \*\*T-01 · The first thing\*\* — what it is and why it matters\.\n/.test(file()) && !/T-01/.test(doneFile()), file());
await js("[...document.querySelectorAll('.board-view .card')][0].click()"); await sleep(200);
check('a card clicked shows its body', await js("!!document.querySelector('.board-view .card.open .body')"));
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'agent-made.md'), '# Agent made\n\n## P0 — now\n\n- [~] **T-01 · Written by an agent** — it shows up.\n- [ ] **T-02 · Another** — two items.\n');
writeFileSync(path.join(dir, 'notes.md'), '# Notes\n\nJust text, no items.\n');
await js("document.querySelector('button[title=\"Refresh\"]').click()");
check('a board an agent writes shows up in the sidebar', await until("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Agent made') && r.textContent.includes('0/2'))"));
check('plain markdown is not listed as a board', !(await js("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Notes'))")));
check('a new board starts with the boards format line', file().startsWith('<!-- boards: v1 -->\n# Launch Plan'));
writeFileSync(path.join(dir, 'newer.md'), '<!-- boards: v2 -->\n# Newer board\n\n## P0 — now\n\n- [ ] **T-01 · From a newer app** — its format is v2.\n');
await js("document.querySelector('button[title=\"Refresh\"]').click()");
await until("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Newer board'))"); await js("[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('Newer board')).click()");
check('a board of a newer format is shown, says so, and its circles do nothing', await until(`${V}?.querySelector('.board-view h1')?.textContent === 'Newer board'`) && await js(`!!${V}.querySelector('.board-view .board-newer')`) && await js(`${V}.querySelector('.board-view .card .glyph').disabled`));
await js(`${V}.querySelector('.board-view .card .glyph').click()`); await sleep(400);
check('...and the file is left as it was', readFileSync(path.join(dir, 'newer.md'), 'utf8').startsWith('<!-- boards: v2 -->') && /- \[ \] \*\*T-01/.test(readFileSync(path.join(dir, 'newer.md'), 'utf8')));
// Deleting a board (T-179): its row's secondary click, a yes, and it goes with its done file; its view closes.
await js("[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('Launch Plan')).click()"); await sleep(500);
writeFileSync(path.join(dir, 'launch-plan-DONE.md'), '<!-- boards: v1 -->\n# Launch Plan · Done\n\n## Done\n\n- [x] **T-02 · Shipped** — shipped 2026-09-27\n');
await js("window.__asked = ''; window.confirm = (m) => { window.__asked = m; return true; }");
await js("[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('Launch Plan')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 }))"); await sleep(200);
check('a board\'s row has Delete board on its secondary click', await js("[...document.querySelectorAll('.menu.ctx button')].map((b) => b.textContent).join() === 'Delete board'"), await js("[...document.querySelectorAll('.menu.ctx button')].map((b) => b.textContent).join()"));
await js("[...document.querySelectorAll('.menu.ctx button')].find((b) => b.textContent === 'Delete board').click()"); await sleep(800);
check('it asks first, naming the file and its done file', /^Delete the board "Launch Plan"\?\n\nboards\/launch-plan\.md is deleted from scratch, with its done file \(boards\/launch-plan-DONE\.md\) when it has one\. The app cannot undo this\.$/.test(await js('window.__asked')), await js('window.__asked'));
check('on a yes the board and its done file are gone, its row and its view too', !existsSync(path.join(dir, 'launch-plan.md')) && !existsSync(path.join(dir, 'launch-plan-DONE.md')) && !(await js("[...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Launch Plan'))")) && !(await js("[...document.querySelectorAll('.board-view h1')].some((h) => h.textContent === 'Launch Plan')")));
rmSync(dir, { recursive: true, force: true });
done(close);
