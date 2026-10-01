// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-missed/claude MOCK_DELAY_MS=5
// A schedule missed while the app was closed (T-208; the user, 2026-09-29: "if a workflow was missed because the app was closed, it should at
// least be prompted"): a setting, under Workflows, says what the app does when it opens again: run it (the first option), tell the user and
// ask (the default: the Jauvex agent asks, in words), or nothing (the last). The app keeps, on this computer, when it last looked at
// each folder's schedules; the check sets that look an hour back and reloads the window, as an app that was closed for an hour and opened.
import { connect, sleep, check, done, useWork } from './lib.ts'; import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f, ms = 20000) => { for (let t = 0; t < ms; t += 400) { if (await f()) return true; await sleep(400); } return false; };
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } };
const wdir = path.join(process.cwd(), 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
const d = new Date(Date.now() - 30 * 60_000); const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; // half an hour ago: past the ten minutes a slot is waited for
const flow = (name) => `# ${name}\n\nOn a schedule.\n\nwhen: every day at ${hhmm}\n\n## 1. Your go → you\nthen: go → Done\n`;
writeFileSync(path.join(wdir, 'missed-flow.md'), flow('Missed flow'));
const rec = (name, n = 1) => { const f = path.join(wdir, name, 'runs', `${String(n).padStart(3, '0')}.md`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const scratch = (run('list').folders ?? []).find((f) => f.name === 'work');
// the app was closed for the last hour, then opened: its last look at the folder is an hour back
const reopen = async () => { await js(`localStorage.setItem('cvc.scheduleLooked', JSON.stringify({ ${JSON.stringify(scratch.id)}: Date.now() - 3600000 })); location.reload()`); await sleep(1500); };
await js("window.dispatchEvent(new Event('focus'))"); await sleep(6000); // the schedule looks once: the slot passed while it was open, so nothing is missed
check('a slot that passed while the app was open is not a missed one', !/was missed at/.test(log()) && !existsSync(path.join(wdir, 'missed-flow/runs')));
check('the setting: ask is the default', run('settings').workflowMissed === 'alert', JSON.stringify(run('settings')));
await reopen();
check('by default the Jauvex agent is told, to ask the user', await until(() => /missed workflows: the Jauvex agent asks the user about "Missed flow"/.test(log())), log().split('\n').filter((l) => /missed/.test(l)).slice(-3).join(' | '));
check('...its chat has the note: the workflow and its time (the rest, how to run it, is folded in the bubble: the pure check reads it)', await until(() => js(`[...document.querySelectorAll('.chat-host')].some((h) => /missed its schedule: "Missed flow" in the folder work \\(every day at ${hhmm}; due/.test(h.textContent))`)));
check('...and nothing ran by itself', !existsSync(path.join(wdir, 'missed-flow/runs')));
const bad = run('settings', '--workflow-missed', 'sometimes');
check('the setting takes run, alert or nothing', !bad.ok && /run .*alert .*nothing/.test(bad.error ?? ''), JSON.stringify(bad));
check('...set to run', run('settings', '--workflow-missed', 'run').workflowMissed === 'run' && run('settings').workflowMissed === 'run');
await reopen();
check('set to run: the missed workflow runs as the app opens, and its record says why', await until(() => /waiting for you/.test(rec('missed-flow')) && /^by: its schedule \(every day at \d\d:\d\d\), missed (today|\w{3}) \d\d:\d\d while the app was closed$/m.test(rec('missed-flow'))), rec('missed-flow').split('\n').slice(0, 4).join(' | '));
const go = run('decide', '--folder', 'work', '--workflow', 'missed flow', '--outcome', 'go'); await sleep(1500);
check('...once: its run is the latest, nothing is missed any more', go.ok && !existsSync(path.join(wdir, 'missed-flow/runs/002.md')));
writeFileSync(path.join(wdir, 'quiet-flow.md'), flow('Quiet flow'));
run('settings', '--workflow-missed', 'nothing'); await reopen();
check('set to nothing: nothing runs, nobody is told (the recorder says why)', await until(() => /workflow "Quiet flow": its schedule .* was missed at .* nothing done, as the setting says/.test(log())) && !existsSync(path.join(wdir, 'quiet-flow/runs')) && !/asks the user about "Quiet flow"/.test(log()));
// the settings, under Workflows: the three choices in their order, the one set shown
await js("document.querySelector('button[title=\"Jauvex settings\"]')?.click()"); await sleep(800);
const sel = await js("(() => { const s = document.querySelector('select[aria-label=\"A missed workflow\"]'); return s ? { value: s.value, options: [...s.options].map((o) => o.textContent) } : null; })()");
check('the settings show it, run first and nothing last, the default named', sel?.value === 'nothing' && sel.options.join(' | ') === 'Run it as soon as the app opens | Tell me, and ask whether to run it (default) | Do nothing', JSON.stringify(sel));
done(close);
