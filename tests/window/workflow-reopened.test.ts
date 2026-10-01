// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-reopened/claude MOCK_DELAY_MS=5
// A workflow's later step reaches its agent whatever became of that agent's chat during the run (T-252; a tester's report, 2026-10-01: four
// runs failed at step 2, '"Alerts Codex" could not be reached', 9.2 s after step 1 ended). A run's delivery kept the chats open when it started:
// the reviewer's chat was open then; while step 1 worked, more chats were opened and the app closed the idle reviewer's to make room (it keeps
// eight); step 2 then waited 9 s for that closed chat. Here: Builder and Reviewer (the Claude stand-in, scripted), Reviewer's chat open at the
// start, nine other chats opened while Build works. A folder of its own (tmp/reopened).
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => unknown, ms = 30000) => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
const FOLDER = path.join(process.cwd(), 'tmp/reopened'); rmSync(FOLDER, { recursive: true, force: true }); mkdirSync(FOLDER, { recursive: true }); run('add-folder', FOLDER);
const sessions = (): any[] => (run('list').folders ?? []).find((f: any) => f.name === 'reopened')?.sessions ?? [];
await until(() => (run('list').folders ?? []).some((f: any) => f.name === 'reopened'), 10000);
run('new-agent', '--provider', 'claude', '--folder', 'reopened', '--name', 'Builder', '--no-kickoff'); const builder: any = await until(() => sessions().find((x) => x.name === 'Builder' && !x.busy));
run('new-agent', '--provider', 'claude', '--folder', 'reopened', '--name', 'Reviewer', '--no-kickoff'); const reviewer: any = await until(() => sessions().find((x) => x.name === 'Reviewer' && !x.busy));
const wdir = path.join(FOLDER, 'workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(path.join(wdir, 'review'), { recursive: true });
writeFileSync(path.join(wdir, 'review.md'), '# Review\n\nBuild, then review.\n\nwhen: manual\n\n## 1. [Build](review/build.md) → Builder\n\n## 2. [Review](review/review.md) → Reviewer\n');
writeFileSync(path.join(wdir, 'review/build.md'), 'Build it. [[wait 25000]]\n[[reply]]Built.\nOUTCOME: done\n'); // the stand-in takes 25 s over it
writeFileSync(path.join(wdir, 'review/review.md'), 'Review it.\n[[reply]]Reviewed.\nOUTCOME: done\n');
const rec = () => { const f = path.join(wdir, 'review/runs/001.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const result = () => /^# Run \d+\nstarted: .*\n(?:ended: .*\n)?result: (.*)$/m.exec(rec())?.[1] ?? '';
check('(Builder and Reviewer are made)', !!builder && !!reviewer);
run('open', '--session', reviewer.id); await sleep(1500); // the reviewer's chat is open when the run starts
await js("document.querySelector('.tb-right button[title=\"Refresh\"]')?.click()"); await sleep(1500);
const started = run('run', '--workflow', 'review', '--folder', 'reopened');
check('(the run starts: step 1 goes to Builder)', started.ok === true && !!(await until(() => /## 1\. Build/.test(rec()), 15000)), JSON.stringify(started));
// while Build works (25 s): nine new agents, each opening its chat, and the app closes the idle reviewer's to make room (it keeps eight)
const hosts = () => js("document.querySelectorAll('.chat-host').length");
for (let i = 1; i <= 9; i++) run('new-agent', '--provider', 'claude', '--folder', 'reopened', '--name', `Filler ${i}`, '--no-kickoff');
check('(nine new agents were made while step 1 worked, each opening its chat)', (await until(() => sessions().filter((x) => /^Filler /.test(x.name)).length === 9, 15000)) !== null, `views on screen: ${await hosts()}`);
check('(...step 1 still at work then)', !/^## 2\. Review/m.test(rec()), rec());
const end: any = await until(() => (/^(done|failed)/i.test(result()) ? result() : null), 60000);
check("step 2 reaches Reviewer though its chat from the run's start was closed meanwhile: the run is done", /^done/i.test(end ?? ''), String(end ?? result()));
done(close);
