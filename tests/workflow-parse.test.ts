import { readFileSync, readdirSync } from 'node:fs'; import path from 'node:path';
// The workflow definition and its run records are markdown; the parser turns them into the flow, the live state and the averages.
const { parseWorkflow, parseRun, stateFor, mins, fmt, took, outcomes, matchOutcome, resolveTarget, formatRun, stepMessage, parseTrigger, lastSlot, nextSlot, isDue, firesAfter, windowDue, describeTrigger, SCHEDULE_TICK_MS, missedSlot, missedBy, missedNote, MISSED_OPTIONS, MISSED_DEFAULT, stepFileOk, askOf, stepBefore, stepTitle } = await import('../shared/workflow.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const dir = path.resolve('tests/fixtures/workflows'); const def = parseWorkflow(readFileSync(path.join(dir, 'news-video.md'), 'utf8'));
check('the title, the trigger and the end are read', def.name === 'News video' && /Monday 09:00/.test(def.when) && /by voice/.test(def.done), `${def.name} · ${def.when}`);
check('seven steps, each with its agent', def.steps.length === 7 && def.steps[0]!.agent === 'Social Media Agent' && def.steps[2]!.agent === 'Video Agent', def.steps.map((s) => `${s.name}→${s.agent}`).join(' | '));
check('a step addressed to you is a gate', def.steps[5]!.gate && def.steps[5]!.name === 'Your approval' && !def.steps[0]!.gate);
check('the instructions, in and out are kept', /verbatim quote/.test(def.steps[0]!.note) && def.steps[0]!.out.startsWith('research/brief.md') && def.steps[1]!.in === 'the ranked stories');
check('branches come from the then line, the happy path left out', def.steps[0]!.branches.join('|') === 'nothing usable this week: stop, tell the user' && def.steps[5]!.branches[0] === 'changes requested: back to step 3 with your notes' && def.steps[1]!.branches.length === 0, def.steps[0]!.branches.join('|'));
check('durations parse both ways', mins('1 h 48') === 108 && mins('14 m') === 14 && mins('2 h') === 120 && mins('9 min') === 9 && mins('') === null && fmt(108) === '1 h 48' && fmt(14) === '14 m');
const runsDir = path.join(dir, 'news-video', 'runs'); const runs = readdirSync(runsDir).filter((f) => f.endsWith('.md')).map((f) => parseRun(readFileSync(path.join(runsDir, f), 'utf8'), f));
check('run records are read: number, result, time, steps', runs.length === 4 && runs.find((r) => r.n === 11)!.took === 108 && runs.find((r) => r.n === 12)!.steps[3]!.started === '14:37' && /Disk|MiMo/.test(runs.find((r) => r.n === 12)!.steps[3]!.said));
const st = stateFor(def, runs);
check('the latest run is live: done, done, running, next', st.live && st.st[1]![0] === 'ok' && st.st[2]![0] === 'ok' && st.st[3]![0] === 'run' && st.st[4]![1] === 'next' && st.sel === 3, JSON.stringify(st.st));
check('the run line says where it is', st.text === 'Run #12 · step 3 of 7 · started 14:02', st.text);
check('the workflow average over finished runs, and per step', st.avg === 113 && st.finished === 3 && st.stepAvg[0] === 13 && st.stepAvg[2] === 31, `${st.avg} · ${st.stepAvg.join(',')}`);
const idle = stateFor(def, runs.filter((r) => r.n !== 12));
check('the step a workflow is at: the live run\'s, else the last one the latest run reached, else the first (the user, 2026-09-27)', st.sel === 3
  && idle.sel === Math.max(...Object.keys(runs.find((r) => r.n === 11)!.steps).map(Number)) && stateFor(def, []).sel === 1, `${st.sel} · ${idle.sel}`);
check('with no live run the rows show the step averages and the line says idle', !idle.live && idle.st[1]![1] === 'avg 13 m' && /^Idle · last run #11: published · 1 h 48/.test(idle.text), idle.text);
// ---- running: outcomes, the outcome a reply names, where it leads, the record written back
const stepN = def.steps.findIndex((s) => outcomes(s).length > 1) + 1; const step = def.steps[stepN - 1]!; const outs = outcomes(step);
check('the then line gives the outcomes and their targets', outs.length >= 2 && outs[0]!.name === 'done' && outs.some((o) => /stop/i.test(o.to)), JSON.stringify(outs));
check('a reply names its outcome on the OUTCOME line, the last one wins, case and punctuation aside', matchOutcome(step, 'Some text.\nOUTCOME: failed\nmore\n**OUTCOME:** Done.')?.name === 'done' && matchOutcome(step, 'nothing here') === null);
check('a step with one outcome takes a reply without the line', matchOutcome({ ...step, then: '' }, 'all good')?.name === 'done');
// a step is an agent and its instructions (the user, 2026-09-27): with no then line, the usual outcomes
const plain = { ...step, then: '', gate: false }, approval = { ...def.steps[5]!, then: '' };
check('with no then line an agent\'s step is done (on) or failed (the run stops), and a step of yours continue (on) or changes (back one step)',
  JSON.stringify(outcomes(plain).map((o) => [o.name, resolveTarget(def, 2, o.to).kind])) === '[["done","step"],["failed","stop"]]' && matchOutcome(plain, 'OUTCOME: failed')?.name === 'failed'
  && JSON.stringify(outcomes(approval).map((o) => o.name)) === '["continue","changes"]' && JSON.stringify(resolveTarget(def, 6, outcomes(approval)[1]!.to)) === '{"kind":"step","n":5}' && resolveTarget(def, 1, outcomes(approval)[1]!.to).kind === 'stop',
  JSON.stringify([outcomes(plain), outcomes(approval)]));
check('targets: next, a step by number or name, done, stop', JSON.stringify([resolveTarget(def, 3, 'Next'), resolveTarget(def, 7, 'next'), resolveTarget(def, 5, 'back to step 3 with the notes'), resolveTarget(def, 5, def.steps[1]!.name), resolveTarget(def, 6, 'Done'), resolveTarget(def, 2, 'stop, tell the user')]) === JSON.stringify([{ kind: 'step', n: 4 }, { kind: 'done' }, { kind: 'step', n: 3 }, { kind: 'step', n: 2 }, { kind: 'done' }, { kind: 'stop', note: 'stop, tell the user' }]), JSON.stringify([resolveTarget(def, 5, 'back to step 3 with the notes'), resolveTarget(def, 5, def.steps[1]!.name)]));
const live = runs.find((r) => r.n === 12)!; const back = parseRun(formatRun(live, def), live.file);
check('a record written back reads the same', JSON.stringify(back.steps) === JSON.stringify(live.steps) && back.started === live.started && back.result === live.result, formatRun(live, def).slice(0, 200));
const msg = stepMessage(def, stepN, live, 'workflows/news-video/runs/012/');
check('the step message names the workflow, the step, what came before and how to end', new RegExp(`run 12, step ${stepN} of 7`).test(msg) && /ended with:/.test(msg) && /OUTCOME: one of "/.test(msg), msg);
check('seconds in took: written, read and shown', mins('40 s') === 40 / 60 && fmt(40 / 60) === '40 s' && took(0, 45_000) === '45 s' && took(0, 61 * 60_000) === '1 h 01' && took(0, 14 * 60_000) === '14 m');
// ---- one file per step (T-168): the workflow file lists the steps and who does each, each step's instructions are a file its heading links
const split = `# News video\n\nwhen: manual\n\n## 1. [Script](news-video/script.md) → Video Agent\n\n## 2. [Your approval](news-video/your-approval.md) → you\n\n## 3. Publish → Social Agent\nPost it.\n\ndone: the video, out\n`;
const sd = parseWorkflow(split, 'workflows/news-video.md', { 'news-video/script.md': 'Write a 60-second script from today\'s top story.\n\nNever invent a quote.\n' });
check('a heading links its step\'s file: the name is the link\'s text, the instructions the file, lines kept', sd.steps.length === 3 && sd.steps[0]!.name === 'Script' && sd.steps[0]!.file === 'news-video/script.md' && sd.steps[0]!.agent === 'Video Agent'
  && sd.steps[0]!.prompt === 'Write a 60-second script from today\'s top story.\n\nNever invent a quote.' && sd.steps[0]!.note === 'Write a 60-second script from today\'s top story. Never invent a quote.', JSON.stringify(sd.steps[0]));
check('a linked file not read yet: no instructions; a step of an older file keeps the ones under its heading', sd.steps[1]!.name === 'Your approval' && sd.steps[1]!.gate && sd.steps[1]!.prompt === '' && sd.steps[2]!.file === '' && sd.steps[2]!.prompt === 'Post it.', JSON.stringify(sd.steps.slice(1)));
const sm = stepMessage(sd, 1, parseRun('# Run 1\nstarted: 2026-09-27 12:00\nresult: running\n', 'workflows/news-video/runs/001.md'), 'workflows/news-video/runs/001/');
check('the step\'s message carries its instructions as written, lines and all, and the usual outcomes', sm.includes('today\'s top story.\n\nNever invent a quote.') && /OUTCOME: one of "done", "failed"/.test(sm), sm);
check('a step\'s file is a markdown file in the workflow\'s own folder, nothing else', stepFileOk('workflows/news-video.md', 'news-video/script.md') && !stepFileOk('workflows/news-video.md', '../secrets.md') && !stepFileOk('workflows/news-video.md', 'other/script.md')
  && !stepFileOk('workflows/news-video.md', 'news-video/runs/001.md') && !stepFileOk('workflows/news-video.md', 'news-video/README.md') && !stepFileOk('workflows/news-video.md', 'news-video/.env.md') && !stepFileOk('workflows/news-video.md', '/etc/x.md') && !stepFileOk('workflows/news-video.md', 'news-video/script.txt'));
// ---- the step before one of yours tells you what to do (T-169; the user, 2026-09-27: "there's no instruction or anything ... make it generic")
const gd = parseWorkflow('# G\n\nwhen: manual\n\n## 1. [Draw](g/draw.md) → Notes agent\n\n## 2. [Your guess](g/your-guess.md) → you\n\n## 3. [Check](g/check.md) → Notes agent\n', 'workflows/g.md', { 'g/draw.md': 'Draw a number.', 'g/your-guess.md': 'Guess the number.' });
const r1 = parseRun('# Run 1\nstarted: 2026-09-27 12:00\nresult: running\n', 'workflows/g/runs/001.md');
const m1 = stepMessage(gd, 1, r1, 'workflows/g/runs/001/'), m3 = stepMessage(gd, 3, r1, 'workflows/g/runs/001/');
check('a step before one of yours is told to end with what you should do, and what yours says', /The next step, "Your guess", is the user's/.test(m1) && /it says: "Guess the number\."/.test(m1) && /starts with FOR YOU:/.test(m1) && !/FOR YOU/.test(m3) && !/^\s*FOR YOU\s*:/m.test(m1), m1);
check('its FOR YOU line is read, the last one wins; none, nothing', askOf('Done.\nFOR YOU: Guess: 1 or 2?\n**FOR YOU:** Guess the number: 1 or 2.\nOUTCOME: done') === 'Guess the number: 1 or 2.' && askOf('Done.\nOUTCOME: done') === '');
const rr = parseRun(formatRun({ ...r1, steps: { 1: { started: '12:00', took: 1, tookText: '51 s', result: 'done', said: 'I drew one.', asks: 'Guess: 1 or 2?' }, 2: { started: '12:01', took: null, result: 'waiting for you', said: '' } } }, gd), r1.file);
const rv = parseRun(formatRun({ ...r1, version: 3 }, gd), r1.file);
check('a run record keeps the version it ran, after its result, and reads it back', rv.version === 3 && /^result: running\nversion: 3$/m.test(formatRun({ ...r1, version: 3 }, gd)) && parseRun('# Run 1\nstarted: x\nresult: running\n').version === undefined);
check('the record keeps it, and a step of yours finds the step before it', rr.steps[1]!.asks === 'Guess: 1 or 2?' && stepBefore(rr, 2) === 1 && stepBefore(rr, 1) === 0, formatRun(rr, gd));
// a step's title is optional: without one it is called by its instructions, cut short (the user, 2026-09-27)
check('a step is called by its title, else by its instructions cut short, else it is a new step', stepTitle({ name: 'Script', note: 'Write it.' }) === 'Script' && stepTitle({ name: '', note: 'Guess the number.' }) === 'Guess the number.'
  && stepTitle({ name: '', note: 'Record the voiceover for the script, in a calm voice, one take, no music under it.' }) === 'Record the voiceover for the script, in a calm…' && stepTitle({ name: ' ', note: '' }) === 'New step');
const untitled = parseWorkflow('# U\n\n## 1. [](u/step.md) → Notes agent\n\n## 2. [Your guess](u/your-guess.md) → you\n', 'workflows/u.md', { 'u/step.md': 'Draw a number, 1 or 2, and keep it secret.' });
check('an untitled step reads, and its messages and records call it by its instructions', untitled.steps[0]!.name === '' && untitled.steps[0]!.file === 'u/step.md'
  && /step 1 of 2: "Draw a number, 1 or 2, and keep it secret\." is yours/.test(stepMessage(untitled, 1, r1, 'workflows/u/runs/001/')) && /^## 1\. Draw a number, 1 or 2, and keep it secret\.$/m.test(formatRun({ ...r1, steps: { 1: { started: '12:00', took: null, result: '', said: '' } } }, untitled)));
// ---- triggers
const T = (w: string) => JSON.stringify(parseTrigger(w));
check('when: manual, schedules and events parse', T('manual') === '{"kind":"manual"}' && T('') === '{"kind":"manual"}' && T('every Monday 09:00') === '{"kind":"at","days":[1],"h":9,"m":0}' && T('every weekday at 8:30') === '{"kind":"at","days":[1,2,3,4,5],"h":8,"m":30}' && T('every day at 7pm') === '{"kind":"at","days":[],"h":19,"m":0}' && T('every 2 hours') === '{"kind":"every","minutes":120}' && T('every 30 minutes') === '{"kind":"every","minutes":30}' && T('every Monday and Thursday 10:15') === '{"kind":"at","days":[1,4],"h":10,"m":15}' && T('after News video finishes') === '{"kind":"after","workflow":"news video"}',
  [T('every Monday 09:00'), T('every weekday at 8:30'), T('every day at 7pm'), T('every 2 hours'), T('every Monday and Thursday 10:15'), T('after News video finishes')].join(' '));
const mon = new Date(2026, 8, 21, 9, 4); // Monday 21 Sep 2026, 09:04
const wk = parseTrigger('every Monday 09:00');
check('the last and next slot of a weekly schedule', lastSlot(wk, mon)!.getTime() === new Date(2026, 8, 21, 9, 0).getTime() && nextSlot(wk, mon)!.getTime() === new Date(2026, 8, 28, 9, 0).getTime());
check('due within ten minutes of its slot, once', !!isDue(wk, '2026-09-14 09:00', mon) && !isDue(wk, '2026-09-21 09:00', mon) && !isDue(wk, null, new Date(2026, 8, 21, 9, 20)) && !isDue(wk, null, new Date(2026, 8, 22, 9, 4)));
check('every N minutes: slots on the clock', lastSlot(parseTrigger('every 15 minutes'), new Date(2026, 8, 21, 9, 44, 30))!.getTime() === new Date(2026, 8, 21, 9, 30).getTime());
check('an event fires after the workflow it names, by title or file', firesAfter(parseTrigger('after News video'), { name: 'News video', file: 'workflows/news-video.md' }) && firesAfter(parseTrigger('after news-video'), { name: 'Other', file: 'workflows/news-video.md' }) && !firesAfter(parseTrigger('after Weekly report'), { name: 'News video' }));
// A window (T-204; the user, 2026-09-29: "anytime between 9 and 12 a.m. ... randomize it with equal probabilities on each draw ... If ... it's
// not run already by the end, it must run at the end ... if ... the check ... change[s] ... that probability [must] change as well")
const win = (w: string) => JSON.stringify(parseTrigger(w));
check('a window is read: "between 9 and 12 a.m." is the morning, and "11 and 2pm", "2 and 5pm", the days as for a time',
  win('anytime between 9 and 12 a.m.') === '{"kind":"window","days":[],"from":540,"to":720}' && win('every weekday between 9am and 12pm') === '{"kind":"window","days":[1,2,3,4,5],"from":540,"to":720}'
  && win('between 11 and 2pm') === '{"kind":"window","days":[],"from":660,"to":840}' && win('every Monday between 2 and 5pm') === '{"kind":"window","days":[1],"from":840,"to":1020}'
  && win('between 9:30 and 10:15') === '{"kind":"window","days":[],"from":570,"to":615}' && parseTrigger('between 12 and 9').kind === 'manual' && parseTrigger('after Between report').kind === 'after', win('anytime between 9 and 12 a.m.'));
check('...and said as one', /^once, at a random time between 09:00 and 12:00 · next window/.test(describeTrigger(parseTrigger('every weekday between 9am and 12pm'), new Date(2026, 8, 29, 8, 0))), describeTrigger(parseTrigger('every weekday between 9am and 12pm'), new Date(2026, 8, 29, 8, 0)));
const tr = parseTrigger('between 9 and 9:30'); const day = (h: number, m: number, s = 0) => new Date(2026, 8, 29, h, m, s);
check('outside the window, or on a day it does not name, never; once run in it, not again; missed by the app being closed, at once within ten minutes',
  windowDue(tr, null, day(8, 59), SCHEDULE_TICK_MS, () => 0) === null && windowDue(parseTrigger('every Monday between 9 and 10'), null, day(9, 10), SCHEDULE_TICK_MS, () => 0) === null
  && windowDue(tr, '2026-09-29 09:05', day(9, 20), SCHEDULE_TICK_MS, () => 0) === null && windowDue(tr, null, day(9, 35), SCHEDULE_TICK_MS, () => 0.99)?.getHours() === 9 && windowDue(tr, null, day(9, 41), SCHEDULE_TICK_MS, () => 0) === null);
// Every tick of the window equally likely, it always runs by the end, whatever the tick: 3000 windows drawn with a seeded generator
const seeded = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (const tick of [SCHEDULE_TICK_MS, 60_000, 5_000]) {
  const rnd = seeded(tick); const buckets = [0, 0, 0, 0, 0, 0]; let late = 0, never = 0; const trials = 3000;
  for (let t = 0; t < trials; t++) { const phase = Math.floor(rnd() * tick); let at = day(9, 0).getTime() + phase, fired = false;
    for (; at <= day(9, 40).getTime(); at += tick) { const slot = windowDue(tr, null, new Date(at), tick, rnd); if (slot) { fired = true; if (at > day(9, 30).getTime()) late++; else buckets[Math.min(5, Math.floor((at - day(9, 0).getTime()) / 300_000))]!++; break; } }
    if (!fired) never++; }
  const even = buckets.every((b) => Math.abs(b - trials / 6) < trials / 6 * 0.2);
  check(`...with a tick of ${tick / 1000} s: each five minutes of the window gets its share, and every window runs once, by its end`, even && late === 0 && never === 0, `${buckets.join(' ')} late ${late} never ${never}`);
}
const rec = formatRun({ ...parseRun('# Run 3\nstarted: 2026-09-29 06:37\nresult: running\n'), by: 'its schedule, every weekday 6:32' }, parseWorkflow('# T\n\n## 1. A → X\n'));
check('a run keeps what started it', /^started: 2026-09-29 06:37\nby: its schedule, every weekday 6:32$/m.test(rec) && parseRun(rec).by === 'its schedule, every weekday 6:32', rec);
// A schedule missed while the app was closed (T-208; the user, 2026-09-29: "it should at least be prompted"): the latest slot between the
// app's last look and now, that the schedule itself no longer runs, with no run since. Tuesday 2026-09-29; the app last looked on Monday evening.
const at = (d: number, h: number, m: number) => new Date(2026, 8, d, h, m); /* day 31 is 1 October */ const t = (x: Date) => x.getTime(); const iso = (x: Date | null) => (x ? `${x.getDate()} ${x.toTimeString().slice(0, 5)}` : 'null');
const daily = parseTrigger('every weekday 6:32'); const monEve = t(at(28, 20, 0));
check('closed Monday evening, opened Tuesday 8:00: the 6:32 run is missed', iso(missedSlot(daily, '2026-09-28 06:32', monEve, at(29, 8, 0))) === '29 06:32', iso(missedSlot(daily, '2026-09-28 06:32', monEve, at(29, 8, 0))));
check('...not when the app was open at 6:32 (its last look came after), nor when a run started since, nor with no last look known',
  missedSlot(daily, '2026-09-28 06:32', t(at(29, 7, 0)), at(29, 8, 0)) === null && missedSlot(daily, '2026-09-29 06:33', monEve, at(29, 8, 0)) === null && missedSlot(daily, null, null, at(29, 8, 0)) === null && missedSlot(daily, null, undefined, at(29, 8, 0)) === null);
check('...nor within ten minutes of the slot: the schedule itself still runs it (opened at 6:40)', missedSlot(daily, '2026-09-28 06:32', monEve, at(29, 6, 40)) === null);
check('a weekday schedule closed from Thursday to Saturday: Friday\'s run is the one missed', iso(missedSlot(daily, '2026-10-01 06:32', t(at(31, 18, 0)), at(33, 10, 0))) === '2 06:32', iso(missedSlot(daily, '2026-10-01 06:32', t(at(31, 18, 0)), at(33, 10, 0))));
check('every 2 hours, closed from 1:00 to 9:30: one missed run, the latest (8:00), not four', iso(missedSlot(parseTrigger('every 2 hours'), '2026-09-29 00:00', t(at(29, 1, 0)), at(29, 9, 30))) === '29 08:00');
const win9 = parseTrigger('anytime between 9 and 12 am');
check('a window that ended while the app was closed is missed; one still open, or in its ten minutes after, is the draw\'s',
  iso(missedSlot(win9, null, t(at(29, 8, 0)), at(29, 12, 30))) === '29 09:00' && missedSlot(win9, null, t(at(29, 8, 0)), at(29, 11, 0)) === null && missedSlot(win9, null, t(at(29, 8, 0)), at(29, 12, 5)) === null);
check('...closed in the middle of the window, before it ran: missed; open at its end (the last draw is sure): not',
  iso(missedSlot(win9, null, t(at(29, 10, 0)), at(29, 13, 0))) === '29 09:00' && missedSlot(win9, null, t(at(29, 12, 1)), at(29, 13, 0)) === null && missedSlot(win9, '2026-09-29 09:40', t(at(29, 10, 0)), at(29, 13, 0)) === null);
check('manual and "after" workflows are never missed', missedSlot(parseTrigger('manual'), null, monEve, at(29, 8, 0)) === null && missedSlot(parseTrigger('after News video'), null, monEve, at(29, 8, 0)) === null);
check('the setting\'s options: run it first, ask (the default), nothing last', MISSED_OPTIONS.map(([k]) => k).join(' ') === 'run alert nothing' && MISSED_DEFAULT === 'alert');
check('a missed run started when the app opens says so in its record', missedBy('every weekday 6:32', at(29, 6, 32), at(29, 8, 0)) === 'its schedule (every weekday 6:32), missed today 06:32 while the app was closed', missedBy('every weekday 6:32', at(29, 6, 32), at(29, 8, 0)));
const note = missedNote([{ name: 'Test', file: 'workflows/test.md', folder: 'acme', when: 'every weekday 6:32', slot: at(29, 6, 32) }, { name: 'Digest', file: 'workflows/digest.md', folder: 'acme', when: 'every day at 7am', slot: at(29, 7, 0) }], at(29, 8, 0));
check('the note to the Jauvex agent names each missed workflow, its time and how to run it, and asks first',
  /^\(from the app\) While the app was closed/.test(note) && /"Test" in the folder acme \(every weekday 6:32; due today 06:32\)/.test(note) && /run --folder "acme" --workflow "workflows\/digest.md"/.test(note) && /ask whether to run them now/.test(note) && /On a yes/.test(note), note);
// the sidebar's order (the user, 2026-09-29: "when it needs a human supervision, it should be on top, 100% ... when a workflow is running, that is
// considered as an update. It should move to the top ... then by those that were last modified, not created or last run")
{ const { sortWorkflows } = await import('../shared/workflow.ts');
  const wf = (name: string, modified: number, latest: { result: string; waiting?: boolean } | null = null) => ({ file: `workflows/${name}.md`, name, when: 'manual', steps: 2, runs: latest ? 1 : 0, latest: latest ? { n: 1, took: null, started: '2026-09-01 10:00', ...latest } : null, modified });
  const list = [wf('Old, run yesterday', 100, { result: 'done' }), wf('Edited now', 900), wf('Running', 50, { result: 'running: step 2' }), wf('Waits for you', 10, { result: 'running: step 3', waiting: true }), wf('Edited before', 500), wf('Running too', 60, { result: 'running: step 1' })];
  const order = sortWorkflows(list).map((w) => w.name);
  check('workflows waiting for a person first, then the running ones, then the rest by their last change, the newest first (not by their last run)',
    JSON.stringify(order) === JSON.stringify(['Waits for you', 'Running too', 'Running', 'Edited now', 'Edited before', 'Old, run yesterday']), JSON.stringify(order)); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
