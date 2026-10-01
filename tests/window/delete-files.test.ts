// Deleting a workflow or a board from the sidebar (the user, 2026-09-27: "I wanna be able to delete workflows and boards (with
// confirmation)"): a row's secondary click offers it; the confirm names what goes; no deletes nothing; yes deletes the files, takes the row
// away and closes the view that showed it. The backend's part: tests/delete-files.test.ts.
import { connect, sleep, check, done, useWork } from './lib.ts';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const root = path.join(process.cwd(), 'tmp/work'); const put = (f, text) => { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), text); };
const has = (f) => existsSync(path.join(root, f)); const ck = (name, ok, got = '') => check(name, ok, ok ? '' : got);
put('workflows/old-flow.md', '# Old flow\n\nwhen: manual\n\n## 1. [Gather](old-flow/gather.md) → Notes agent\n'); put('workflows/old-flow/gather.md', 'Collect the notes.\n');
put('workflows/old-flow/runs/001.md', '# Run 1\nstarted: 2026-09-20 09:00\nended: 2026-09-20 09:05\nresult: done\n');
put('boards/old-board.md', '<!-- boards: v1 -->\n# Old board\n\n## P0 — now\n\n- [ ] **T-02 · Left** — to do.\n'); put('boards/old-board-DONE.md', '<!-- boards: v1 -->\n# Old board · Done\n\n## Done\n\n- [x] **T-01 · Gone** — shipped 2026-09-27\n');
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(2000);
const row = (t) => `[...document.querySelectorAll('.group .row')].find((r) => r.querySelector('.row-title')?.textContent === '${t}')`;
const menu = (t) => js(`(() => { const r = ${row(t)}; r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 220 })); })()`);
const item = (label) => `[...document.querySelectorAll('.menu.ctx button')].find((b) => b.textContent === '${label}')`;
await js(`${row('Old flow')}.click()`); await sleep(1200);
ck('the workflow is open', await js("document.querySelector('.tb-name')?.textContent === 'Old flow'"));
await menu('Old flow'); await sleep(300);
ck('a workflow row\'s secondary click offers to delete it', await js(`(() => { const b = ${item('Delete workflow')}; return !!b && b.classList.contains('danger'); })()`));
await js(`window.confirm = (m) => { window.__asked = m; return false; }; ${item('Delete workflow')}.click()`); await sleep(800);
ck('the confirm names what goes: the file, its folder, its runs', /^Delete the workflow "Old flow"\?\n\nworkflows\/old-flow\.md and its folder, workflows\/old-flow\/ \(its steps' instructions, its run and its versions\), are deleted from work\. The app cannot undo this\.$/.test(await js('window.__asked')), await js('window.__asked'));
ck('no: nothing is deleted', has('workflows/old-flow.md') && has('workflows/old-flow/runs/001.md') && await js(`!!${row('Old flow')}`));
await menu('Old flow'); await sleep(300); await js(`window.confirm = () => true; ${item('Delete workflow')}.click()`);
ck('yes: the file and its folder are gone, and so is the row', await (async () => { for (let t = 0; t < 8000; t += 300) { if (!has('workflows/old-flow.md') && !has('workflows/old-flow') && !(await js(`!!${row('Old flow')}`))) return true; await sleep(300); } return false; })());
ck('the view that showed it is closed', await js("document.querySelector('.tb-name')?.textContent !== 'Old flow' && ![...document.querySelectorAll('.chat-host')].some((h) => h.style.display !== 'none' && /Old flow/.test(h.querySelector('.wf-head h1')?.textContent ?? ''))"), await js("document.querySelector('.tb-name')?.textContent"));
await menu('Old board'); await sleep(300);
await js(`window.confirm = (m) => { window.__asked = m; return true; }; ${item('Delete board')}.click()`);
ck('a board: asked in words that name its done file, then deleted with it', await (async () => { for (let t = 0; t < 8000; t += 300) { if (!has('boards/old-board.md') && !has('boards/old-board-DONE.md') && !(await js(`!!${row('Old board')}`))) return true; await sleep(300); } return false; })()
  && /^Delete the board "Old board"\?\n\nboards\/old-board\.md is deleted from work, with its done file \(boards\/old-board-DONE\.md\) when it has one\. The app cannot undo this\.$/.test(await js('window.__asked')), await js('window.__asked'));
done(close);
