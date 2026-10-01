// llm
import { connect, sleep, check, done, V, useWork } from './lib.ts'; import { execFileSync } from 'node:child_process'; import { readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(); // a folder of this edition's own for workflows and boards (tmp/work)
// The default workflow, end to end with a real model: a new workflow is a hello world; Run now sends step 1 to the Jauvex agent (started
// by that message, never opened before), its OUTCOME line moves the run to the gate, the user approves by command, step 3 writes hello.md.
const root = process.cwd(); const wdir = path.join(root, 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true });
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e.stdout || e.message).slice(0, 300) }; } } };
const rec = () => { const f = path.join(wdir, 'hello-flow/runs/001.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const result = (md) => /^# Run \d+\nstarted: .*\n(?:ended: .*\n)?result: (.*)$/m.exec(md)?.[1] ?? ''; // the run's own result, not a step's
const nw = run('new-workflow', '--folder', 'work', '--name', 'Hello flow'); await sleep(1500);
check('new-workflow writes the hello world', nw.ok && /→ Jauvex/.test(readFileSync(path.join(wdir, 'hello-flow.md'), 'utf8')));
await js(`${V}.querySelector('.wf-head .btn.primary').click()`);
let at = ''; for (let i = 0; i < 90; i++) { await sleep(2000); at = rec(); if (/waiting for you/.test(at) || /^(failed|stopped)/.test(result(at))) break; }
check('step 1 went to the Jauvex agent, its answer ended the step, the run waits at the gate', /## 1\. Say hello\n(started: .*\n)?took: .*\nresult: done\nsaid: .+/.test(at) && /## 2\. Your approval\n.*\nresult: waiting for you/s.test(at), at);
const d = run('decide', '--folder', 'work', '--workflow', 'hello flow', '--outcome', 'continue');
// writing the file asks for permission in the Jauvex agent's chat, which is not on screen: the workflow says so and opens it
let asked = false; for (let i = 0; i < 60 && !asked; i++) { await sleep(2000); asked = /waits for your permission in Jauvex/.test(await js(`${V}?.querySelector('.runline.asking')?.textContent ?? ''`)); if (/^done/.test(result(rec()))) break; }
if (asked) { check('a permission asked in a chat that is not on screen shows on the workflow, with a way to it', true); await js(`${V}.querySelector('.runline.asking button').click()`); await sleep(1500);
  for (let k = 0; k < 4; k++) { const b = await js(`(() => { const x = [...${V}.querySelectorAll('.ask .ask-row button')].find((b) => /^Always allow|^Allow/.test(b.textContent)); if (x) { x.click(); return true; } return false; })()`); if (!b) break; await sleep(2500); } }
for (let i = 0; i < 90; i++) { await sleep(2000); at = rec(); if (/^(done|failed|stopped)/.test(result(at))) break; }
const hello = path.join(wdir, 'hello-flow/runs/001/hello.md');
check('approved: step 3 wrote hello.md in the run folder and the run ended done', d.ok && result(at) === 'done' && existsSync(hello), at + (existsSync(path.join(wdir, 'hello-flow/runs/001')) ? readdirSync(path.join(wdir, 'hello-flow/runs/001')).join(',') : ''));
done(close);
