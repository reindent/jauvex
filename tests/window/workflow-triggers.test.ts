import { connect, sleep, check, done, V, useWork } from './lib.ts'; import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
// Triggers and gates without a model: a workflow on a schedule starts by itself, once for its slot; `decide` (an agent relaying the
// user's word) passes its gate; a workflow whose when line says "after" it starts when it ends done; a run survives a reload.
const root = process.cwd(); const wdir = path.join(root, 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); rmSync(path.join(root, 'tmp/work/boards'), { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
const d = new Date(Date.now() - 60_000); const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
writeFileSync(path.join(wdir, 'sched-flow.md'), `# Sched flow\n\nStarts on its own.\n\nwhen: every day at ${hhmm}\n\n## 1. Your go → you\nthen: go → Done · not now → stop, not now\n\ndone: nothing\n`);
writeFileSync(path.join(wdir, 'after-flow.md'), '# After flow\n\nStarts when Sched flow ends.\n\nwhen: after Sched flow\n\n## 1. Check it → you\nthen: ok → Done · redo → stop, redo\n');
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e.stdout || e.message).slice(0, 300) }; } } };
const rec = (name, n = 1) => { const f = path.join(wdir, name, 'runs', `${String(n).padStart(3, '0')}.md`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
await js("window.dispatchEvent(new Event('focus'))");
let started = false; for (let i = 0; i < 30 && !started; i++) { await sleep(1000); started = /waiting for you/.test(rec('sched-flow')); }
check('a workflow whose schedule slot just passed starts by itself and waits at its gate', started, rec('sched-flow'));
await sleep(16_000);
check('once for its slot: no second run', !existsSync(path.join(wdir, 'sched-flow/runs/002.md')));
const bad = run('decide', '--folder', 'work', '--workflow', 'sched flow', '--outcome', 'maybe');
check('decide with an outcome the gate does not have is refused, naming the outcomes', !bad.ok && /go → Done/.test(bad.error ?? ''), JSON.stringify(bad).slice(0, 200));
writeFileSync(path.join(wdir, 'late-flow.md'), '# Late flow\n\nWritten a moment before Sched flow ends.\n\nwhen: after Sched flow\n\n## 1. Look → you\nthen: ok → Done\n'); // not in the window's list yet
const ok = run('decide', '--folder', 'work', '--workflow', 'sched flow', '--outcome', 'go', '--note', 'from the user by voice'); await sleep(2500);
check('decide passes the gate: the run ends done, the note in the record', ok.ok && /^result: done/m.test(rec('sched-flow')) && /said: you: go — from the user by voice/.test(rec('sched-flow')), JSON.stringify(ok) + rec('sched-flow'));
check('the workflow that runs "after" it starts', /waiting for you/.test(rec('after-flow')), rec('after-flow'));
check('...and one written a moment before it ended, which the window\'s list did not have yet', /waiting for you/.test(rec('late-flow')), rec('late-flow') || 'no run');
// a reload: the live run is taken over again, the view shows it driven (Stop, no Resume)
run('reload'); await sleep(6000);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('After flow'))?.click()"); await sleep(2500);
const head = await js(`${V}?.querySelector('.wf-head')?.textContent ?? ''`);
check('after a reload the live run is taken over: Stop, no Resume', /Stop/.test(head) && !/Resume/.test(head), head);
const ok2 = run('decide', '--folder', 'work', '--workflow', 'after-flow', '--outcome', 'ok'); await sleep(2000);
check('and its gate is decided as before', ok2.ok && /^result: done/m.test(rec('after-flow')), JSON.stringify(ok2) + rec('after-flow'));
const none = run('decide', '--folder', 'work', '--workflow', 'after-flow', '--outcome', 'ok');
check('decide with no live run says so', !none.ok && /no live run/.test(none.error ?? ''), JSON.stringify(none));
done(close);
