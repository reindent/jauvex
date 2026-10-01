// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-gate/claude MOCK_DELAY_MS=5
// A step of yours says what to do, and its pane follows the run (T-169; the user, 2026-09-27, after a number-guessing run: "there's no
// instruction or anything ... the previous step ... should have asked ... make it generic"; "when I clicked approve ... the text was still
// open ... I had to go to the next step and then come back"). An agent's step (the stand-in, scripted) ends with a FOR YOU line; the step
// after it, yours, shows that first, then the note and the buttons, in a pane opened before the run got there; approving closes the input
// there and then, and the run goes on.
import { connect, sleep, check, done, V, useWork } from './lib.ts';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const root = process.cwd(); const wdir = path.join(root, 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(path.join(wdir, 'guess'), { recursive: true });
writeFileSync(path.join(wdir, 'guess.md'), '# Guess\n\nA number to guess.\n\nwhen: manual\n\n## 1. [Draw](guess/draw.md) → Jauvex\n\n## 2. [Your guess](guess/your-guess.md) → you\n\n## 3. [Check](guess/check.md) → Jauvex\n\ndone: a guess, checked\n');
writeFileSync(path.join(wdir, 'guess/draw.md'), 'Draw a number, 1 or 2, and keep it secret.\n[[reply]]I drew a number and kept it to myself.\nFOR YOU: Guess the number I drew: 1 or 2.\nOUTCOME: done\n');
writeFileSync(path.join(wdir, 'guess/your-guess.md'), 'Guess the number.\n');
writeFileSync(path.join(wdir, 'guess/check.md'), 'Say whether the guess was right.\n[[reply]]Checked.\nOUTCOME: done\n');
const rec = () => { const f = path.join(wdir, 'guess/runs/001.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const result = (md) => /^# Run \d+\nstarted: .*\n(?:ended: .*\n)?result: (.*)$/m.exec(md)?.[1] ?? ''; // the run's own result, not a step's
const until = async (f, ms = 25000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const pane = () => js("document.querySelector('.pane-view')?.textContent ?? ''");
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(2000);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Guess')).click()"); await sleep(1500);
// opened, a workflow shows the step it is at (the user, 2026-09-27: "when clicking on a workflow item, when it opens, it should show the current
// step it's at, if not initiated then first step, if already finished then last step")
const title = () => js("document.querySelector('.pane .pane-title')?.textContent ?? ''");
const reopen = async () => { await js("document.querySelector('.pane .icon-btn[title=\"Close\"]')?.click()"); await sleep(200); await js("document.querySelector('.jauvex-row')?.click()"); /* away from the workflow: the Jauvex agent's row is always there */ await sleep(800); await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Guess')).click()"); await sleep(1200); };
check('opened, never run: its first step shows in the pane', await until(async () => (await title()) === 'Step 1' && /Draw/.test(await pane()), 5000), await title());
await js(`${V}.querySelectorAll('.steps .st')[2].click()`); await sleep(500); // step 2, yours, opened before the run starts
check('before a run, your step says it waits for you, with no input yet', await js("!document.querySelector('.pane-view .gate-note')") && /waits here/.test(await pane()), await pane());
await js(`${V}.querySelector('.wf-head .btn.primary').click()`);
check('the agent\'s step ends with what you should do, kept in the record', await until(() => /## 1\. Draw\n[\s\S]*?asks: Guess the number I drew: 1 or 2\./.test(rec()) && /## 2\. Your guess\n.*\nresult: waiting for you/.test(rec())), rec());
const first = () => js("(() => { const p = document.querySelector('.pane-view'); const g = p?.querySelector('.wf-gate'); const a = g?.querySelector('.wf-gate-ask'); return !!a && /Draw asks you/.test(a.textContent) && /Guess the number I drew: 1 or 2\\./.test(a.textContent) && !!g.querySelector('.gate-note') && !!g.querySelector('.btns button') && g.compareDocumentPosition(p.querySelector('.wf-step')) === Node.DOCUMENT_POSITION_FOLLOWING; })()");
check('the pane opened before follows the run: what to do comes first, from the step before, then the note and the buttons', await until(first), await pane());
// marked in the sidebar (the user, 2026-09-27: "when a workflow is waiting for the human in the loop, it must be marked in the left pane! with a
// yellow something ... next to the running icon")
const row = "[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Guess'))";
check('the sidebar marks it: a yellow dot beside the turning mark, while the run waits for you', await until(() => js(`(() => { const w = ${row}?.querySelector('.row-working'); return !!w?.querySelector('.wf-waits') && !!w.querySelector('.mark') && /waits for you/.test(w.title) && getComputedStyle(w.querySelector('.wf-waits')).backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`), 8000));
const shot = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null); if (shot?.data) writeFileSync(path.join(root, 'tmp/workflow-gate.png'), Buffer.from(shot.data, 'base64')); // a picture of a step of yours, waiting
await reopen();
check('opened again while the run waits: the step it waits at', await until(async () => (await title()) === 'Step 2' && await js("!!document.querySelector('.pane-view .wf-gate .gate-note')"), 5000), await title());
await js("(() => { const ta = document.querySelector('.pane-view .gate-note'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, '1'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()");
check('your step\'s buttons say continue, not approved: the agent may be asking a question', await js("[...document.querySelectorAll('.pane-view .btns button')].map((b) => b.textContent).join() === 'continue,changes'"), await pane());
await js("[...document.querySelectorAll('.pane-view .btns button')].find((b) => b.textContent === 'continue').click()");
check('continue: the input closes in the same pane, and your answer shows as the step\'s words', await until(() => js("!document.querySelector('.pane-view .gate-note') && !document.querySelector('.pane-view .wf-gate') && /you: continue — 1/.test(document.querySelector('.pane-view')?.textContent ?? '')")), await pane());
check('once you decided, the dot goes: the run goes on without you', await until(() => js(`!${row}?.querySelector('.wf-waits')`), 8000));
check('the run goes on to the check and ends done', await until(() => result(rec()) === 'done' && /## 3\. Check\n[\s\S]*?result: done/.test(rec())), rec());
await reopen();
check('opened again once the run ended: the last step it reached', await until(async () => (await title()) === 'Step 3' && /Check/.test(await pane()), 5000), await title());
// the version it ran (T-169; the user, 2026-09-27: "versioned each time they are run and they change")
check('the run took version 1 of the workflow, kept in its folder', /^version: 1$/m.test(rec()) && existsSync(path.join(wdir, 'guess/versions/001.md')), rec());
await js(`${V}.querySelector('.foot-head .btn').click()`); await sleep(700);
check('all runs shows the version each ran', await js("[...document.querySelectorAll('.pane-view .runs-table tbody tr')].map((r) => r.children[1].textContent).join() === 'v1'"), await pane());
await js("document.querySelector('.pane-view .run-row').click()"); await sleep(700);
await js("document.querySelector('.pane-view .wf-version').click()");
check('a run\'s record opens the version it ran, in the pane', await until(() => js("/Guess · version 1/.test(document.querySelector('.pane-md')?.textContent ?? '') && /Draw a number, 1 or 2/.test(document.querySelector('.pane-md')?.textContent ?? '')"), 8000));
// the versions, and one restored (the user, 2026-09-27: "where I'm supposed to see the versions ... how can I roll back to a previous version")
const versionsBtn = () => js(`[...${V}.querySelectorAll('.foot-head .btn')].find((b) => /^Versions/.test(b.textContent))?.click()`);
await versionsBtn(); await sleep(700);
check('Versions, beside All runs: version 1, the one the workflow is now, with the run that ran it, and nothing to restore', await js("(() => { const rows = [...document.querySelectorAll('.pane-view .wf-version-row')]; return rows.length === 1 && /Version 1/.test(rows[0].textContent) && /now/.test(rows[0].textContent) && /ran #1/.test(rows[0].textContent) && !rows[0].querySelector('.wf-version-restore'); })()"), await pane());
writeFileSync(path.join(wdir, 'guess/draw.md'), 'Draw a number from 1 to 100.\n'); await sleep(2600); // an edit made outside the app: no version taken
await versionsBtn(); await sleep(700);
check('edited since: the list says so, and version 1 can be restored', /Edited since version 1/.test(await pane()) && await js("!!document.querySelector('.pane-view .wf-version-restore')"), await pane());
await js("document.querySelector('.pane-view .wf-version-restore').click()");
check('restored: the step\'s instructions are back as version 1 had them, and what they were is kept as version 2', await until(() => readFileSync(path.join(wdir, 'guess/draw.md'), 'utf8').startsWith('Draw a number, 1 or 2') && existsSync(path.join(wdir, 'guess/versions/002.md')) && readFileSync(path.join(wdir, 'guess/versions/002.md'), 'utf8').includes('Draw a number from 1 to 100.'), 8000)
  && await until(() => js("/Version 1 is back/.test(document.querySelector('.pane-view')?.textContent ?? '') && /What it was is kept as version 2/.test(document.querySelector('.pane-view')?.textContent ?? '')"), 5000), await pane());
done(close);
