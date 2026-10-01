import { connect, sleep, check, done, V, useWork } from './lib.ts'; import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
// Running a workflow, with no model in the loop: a gate step waits for the user, the decision moves the run on, a step addressed to an agent
// that does not exist fails the run and says so; the record in the workflow's folder is written at every change; Stop stops; the
// `run` and `runs` commands do the same for agents.
const root = process.cwd(); rmSync(path.join(root, 'tmp/work/workflows'), { recursive: true, force: true }); rmSync(path.join(root, 'tmp/work/boards'), { recursive: true, force: true }); const wdir = path.join(root, 'tmp/work/workflows'); mkdirSync(wdir, { recursive: true });
writeFileSync(path.join(wdir, 'gate-flow.md'), '# Gate flow\n\nA run that starts with you.\n\nwhen: manual\n\n## 1. Your go → you\nthen: go → Deliver · not now → stop, later then\n\n## 2. Deliver → Nobody Agent\nDo the thing.\nthen: done → Done\n\ndone: delivered\n');
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, error: String(e.stdout || e.message).slice(0, 300) }; } };
const rec = (n) => { const f = path.join(wdir, 'gate-flow/runs', `${String(n).padStart(3, '0')}.md`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
await js("window.dispatchEvent(new Event('focus'))"); await sleep(2000);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Gate flow')).click()"); await sleep(1200);
check('the workflow opens with a Run now button', await js(`!!${V}.querySelector('.wf-head .btn.primary')`));
await js(`${V}.querySelector('.wf-head .btn.primary').click()`); await sleep(2500);
check('Run now writes run 001: running, step 1 waiting for the user', /result: running/.test(rec(1)) && /## 1\. Your go\nstarted: \d\d:\d\d\nresult: waiting for you/.test(rec(1)), rec(1));
check('the sidebar shows the workflow running: the app\'s mark turns in its row, as for a working agent, with the yellow dot of a run waiting for you (its first step is yours)', await js("(() => { const r = [...document.querySelectorAll('.group .row')].find((x) => x.textContent.includes('Gate flow')); return !!r?.querySelector('.row-working .mark') && !!r.querySelector('.row-working .wf-waits') && /run #1 waits for you/i.test(r.querySelector('.row-working').title); })()"));
check('the view shows the live run waiting at step 1, with Stop instead of Run now', /Run #1 · step 1 of 2/.test(await js(`${V}.querySelector('.runline')?.textContent ?? ''`)) && (await js(`${V}.querySelectorAll('.steps .st')[1].querySelector('.stat')?.textContent`)) === 'waiting for you' && /Stop/.test(await js(`${V}.querySelector('.wf-head').textContent`)), await js(`${V}.querySelector('.runline')?.textContent`));
await js(`${V}.querySelectorAll('.steps .st')[1].click()`); await sleep(500);
const btns = await js("[...document.querySelectorAll('.pane-view .btns button')].map((b) => b.textContent)");
check('the gate in the pane offers one button per outcome', JSON.stringify(btns) === JSON.stringify(['go', 'not now']), JSON.stringify(btns));
await js("(() => { const ta = document.querySelector('.pane-view .gate-note'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'ship it'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()");
await js("[...document.querySelectorAll('.pane-view .btns button')].find((b) => b.textContent === 'go').click()"); await sleep(12000); /* step 2 looks for its agent for up to 9 s */
check('the decision closes step 1 with the note, step 2 fails for want of its agent, the run ends failed', /## 1\. Your go\n(started: \d\d:\d\d\n)?took: \d+ s\nresult: go\nsaid: you: go — ship it/.test(rec(1)) && /## 2\. Deliver\n.*\nresult: no agent named "Nobody Agent" in the app/s.test(rec(1)) && /^result: failed: step 2 \(Deliver\): no agent named/m.test(rec(1)), rec(1));
check('and stops turning when the run ends', await js("(() => { const r = [...document.querySelectorAll('.group .row')].find((x) => x.textContent.includes('Gate flow')); return !!r && !r.querySelector('.row-working'); })()"));
check('the sidebar row and the run line say so', /Stopped · last run #1: failed/.test(await js(`${V}.querySelector('.runline')?.textContent ?? ''`)), await js(`${V}.querySelector('.runline')?.textContent`));
// the commands: run starts run 002; runs lists both; Stop from the view ends it
const r2 = run('run', '--folder', 'work', '--workflow', 'gate-flow'); await sleep(4500); /* the view re-reads the record every 2 s */
check('the run command starts run 002 and returns its record', r2.ok && r2.run === 2 && /runs\/002\.md$/.test(r2.record) && /waiting for you/.test(rec(2)), JSON.stringify(r2).slice(0, 200));
const again = run('run', '--folder', 'work', '--workflow', 'Gate flow');
check('a second run while one runs is refused', !again.ok && /still running|is live/.test(again.error), JSON.stringify(again).slice(0, 200));
const ls = run('runs', '--folder', 'work', '--workflow', 'gate flow');
check('runs lists them, latest first', ls.ok && ls.runs.length === 2 && ls.runs[0].n === 2 && /running/.test(ls.runs[0].result) && /failed/.test(ls.runs[1].result), JSON.stringify(ls).slice(0, 200));
await js(`[...${V}.querySelectorAll('.wf-head button')].find((b) => b.textContent === 'Stop').click()`); await sleep(1500);
check('Stop ends the run and marks the step', /^result: stopped: stopped by you/m.test(rec(2)) && /## 1\. Your go\nstarted: \d\d:\d\d\nresult: stopped/.test(rec(2)), rec(2));
// new-workflow by command
const nw = run('new-workflow', '--folder', 'work', '--name', 'Made by command'); await sleep(800);
check('new-workflow writes the file from the template and opens it', nw.ok && nw.file === 'workflows/made-by-command.md' && existsSync(path.join(wdir, 'made-by-command.md')) && (await js("document.querySelector('.tb-name')?.textContent")) === 'Made by command', JSON.stringify(nw).slice(0, 200));
// a workflow an agent has just written is found by an order at once: the window's list is read again when it is not there yet
writeFileSync(path.join(wdir, 'fresh-flow.md'), '# Fresh flow\n\nWritten a moment ago.\n\nwhen: manual\n\n## 1. Your go → you\nthen: go → Done\n');
const fresh = run('runs', '--folder', 'work', '--workflow', 'fresh-flow');
check('an order names a workflow written a moment ago, before any refresh', fresh.ok && fresh.file === 'workflows/fresh-flow.md', JSON.stringify(fresh).slice(0, 200));
done(close);
