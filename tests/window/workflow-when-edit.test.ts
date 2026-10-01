import { connect, sleep, check, done, V, useWork } from './lib.ts'; import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
// A when line changed in the file reaches the schedule with no refresh (T-204; the user, 2026-09-29: a workflow set to "every weekday 6:32"
// did not run at 6:32, and its row still said manual). The scheduler read the list the window had loaded, and the window loaded it again only
// on a refresh: the edit waited for one. Now every check of the schedule reads the folder's workflows again. A run the schedule starts says
// so in its record (by: its schedule (...)), and the view shows when each run started, to the minute.
const root = process.cwd(); const wdir = path.join(root, 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
const flow = (name, when) => `# ${name}\n\nStarts on its own once its when line says so.\n\nwhen: ${when}\n\n## 1. Your go → you\nthen: go → Done · not now → stop, not now\n\ndone: nothing\n`;
const at = (ms) => { const d = new Date(Date.now() + ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
writeFileSync(path.join(wdir, 'edit-flow.md'), flow('Edit flow', 'manual')); writeFileSync(path.join(wdir, 'later-flow.md'), flow('Later flow', 'manual'));
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const rec = (name, n = 1) => { const f = path.join(wdir, name, 'runs', `${String(n).padStart(3, '0')}.md`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const rowTime = (name) => js(`[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes(${JSON.stringify(name)}))?.querySelector('.row-time')?.textContent ?? ''`);
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(2000);
check('both workflows are listed as manual', (await rowTime('Edit flow')) === 'manual' && (await rowTime('Later flow')) === 'manual', `${await rowTime('Edit flow')} / ${await rowTime('Later flow')}`);
// the files change on disk, the way an agent or an editor changes them: nothing tells the window
const due = at(-60_000); writeFileSync(path.join(wdir, 'edit-flow.md'), flow('Edit flow', `every day at ${due}`)); writeFileSync(path.join(wdir, 'later-flow.md'), flow('Later flow', `every day at ${at(2 * 3600_000)}`));
let started = false; for (let i = 0; i < 30 && !started; i++) { await sleep(1000); started = /waiting for you/.test(rec('edit-flow')); }
check('a when line edited to a slot that just passed starts the run by itself, no refresh', started, rec('edit-flow') || '(no run)');
check('its record says the schedule started it', rec('edit-flow').includes(`by: its schedule (every day at ${due})`), rec('edit-flow').split('\n').slice(0, 6).join(' | '));
check('the other workflow\'s row shows its new when line, no refresh', /^every day/.test(await rowTime('Later flow')), await rowTime('Later flow'));
check('...and it did not run: its slot is later', !existsSync(path.join(wdir, 'later-flow/runs')));
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Edit flow'))?.click()"); await sleep(2500);
const runs = await js(`[...(${V}?.querySelectorAll('.foot .runs small') ?? [])].map((x) => x.textContent).join(' | ')`);
check('the view shows when the run started, to the minute, and that its schedule started it', /\d{4}-\d\d-\d\d \d\d:\d\d.* · by its schedule \(every day at /.test(runs), runs);
const ok = run('decide', '--folder', 'work', '--workflow', 'edit flow', '--outcome', 'go'); await sleep(2000);
check('its gate is decided as before', ok.ok && /^result: done/m.test(rec('edit-flow')), JSON.stringify(ok));
done(close);
