// A board as its sections or as a kanban (T-180, asked for 2026-09-27: "we should have both the p0/p1/p2/etc and kanban"). The columns per
// section stay the first view; Kanban shows a lane per status, each card tagged with its section; "Show done" adds the Done lane there too;
// a glyph moves a card to the next lane, in the file; the view chosen is remembered.
import { connect, sleep, check, done, V } from './lib.ts';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
const dir = path.join(process.cwd(), 'tmp/scratch/boards'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); const board = path.join(dir, 'plan.md');
writeFileSync(board, '<!-- boards: v1 -->\n# Plan\n\n## P0 — now\n\n- [ ] **T-01 · First thing** — why.\n- [~] **T-02 · Second thing** — under way.\n\n## P1 — next\n\n- [ ] **T-04 · Fourth thing** — later.\n');
writeFileSync(path.join(dir, 'plan-DONE.md'), '<!-- boards: v1 -->\n# Plan · Done\n\nArchive of the board\'s finished tasks, newest first.\n\n## Done\n\n- [x] **T-03 · Third thing** — shipped 2026-09-20\n');
const until = async (f: () => Promise<boolean>, ms = 8000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const cols = () => js(`[...${V}.querySelectorAll('.board .bcol h2')].map((h) => h.textContent).join(' | ')`);
const lane = (t: string) => js(`[...(([...${V}.querySelectorAll('.board .bcol')].find((c) => c.querySelector('h2')?.textContent === '${t}'))?.querySelectorAll('.card') ?? [])].map((c) => [c.querySelector('.board-tag')?.textContent ?? '', c.querySelector('.id')?.textContent ?? ''].join(' ')).join(', ')`);
const row = "[...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-title')?.textContent === 'Plan')";
const openPlan = async () => { await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await until(() => js(`!!${row}`)); await js(`${row}.click()`); await sleep(1200); };
await js("try { localStorage.removeItem('cvc.board.view'); } catch {}"); await openPlan();
check('a board opens as its sections: P0, P1', (await cols()) === 'P0 — now | P1 — next', await cols());
await js(`[...${V}.querySelectorAll('.board-seg button')].find((b) => b.textContent === 'Kanban').click()`); await sleep(300);
check('Kanban: a lane per status, each card tagged with its section', (await cols()) === 'To do | Doing' && (await lane('To do')) === 'P0 T-01, P1 T-04' && (await lane('Doing')) === 'P0 T-02', `${await cols()} / ${await lane('To do')} / ${await lane('Doing')}`);
await js(`${V}.querySelector('.board-view label.check input').click()`); await sleep(300);
check('Show done adds the Done lane, with the done file\'s tasks', (await cols()) === 'To do | Doing | Done' && /T-03/.test(await lane('Done')), `${await cols()} / ${await lane('Done')}`);
await js(`[...${V}.querySelectorAll('.board .card')].find((c) => c.textContent.includes('T-01')).querySelector('.glyph').click()`);
check('a glyph moves a card to the next lane, in the file', await until(async () => /^- \[~\] \*\*T-01/m.test(readFileSync(board, 'utf8')) && (await lane('Doing')) === 'P0 T-01, P0 T-02'), `${await lane('Doing')} / ${readFileSync(board, 'utf8')}`);
await js('location.reload()'); await sleep(4000); await openPlan();
check('the view chosen is remembered', /^To do \| Doing/.test(await cols()) && (await js(`${V}.querySelector('.board-seg button.on')?.textContent`)) === 'Kanban', await cols());
await js(`[...${V}.querySelectorAll('.board-seg button')].find((b) => b.textContent === 'Sections').click()`); await sleep(300);
check('and Sections brings the columns per section back', /^P0 — now \| P1 — next/.test(await cols()), await cols());
rmSync(dir, { recursive: true, force: true });
done(close);
