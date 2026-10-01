// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-queued-reply/claude MOCK_DELAY_MS=5
// Only the reply to a step's own message closes that step (T-253; a server's agents, 2026-10-01: while the Social Media Agent worked on
// step 1, two messages for it waited in its queue; after step 1 its answer to them, ending "OUTCOME: done", was taken as step 3's outcome, which it
// had not started: step 3 done in 7 seconds, the run over, the next workflow started with no sources). A reply with no address of its own was
// taken by any run waiting for its agent; that is only for a turn a reloaded window took back, whose address it cannot know, and never when the
// step's message still waits in that chat's queue. Here: five steps, all Builder's (the Claude stand-in); a message typed to Builder during
// step 1, another during step 3 whose turn a reload takes back, and a reload during step 5's own turn, whose reply must still close it.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 30000): Promise<any> => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
// a folder of its own, under this edition's own tmp/work (tmp/scratch is the other edition's folder, through a link)
const FOLDER = path.join(process.cwd(), 'tmp/work/queued-reply'); rmSync(FOLDER, { recursive: true, force: true }); mkdirSync(FOLDER, { recursive: true }); run('add-folder', FOLDER);
const agents = (): any[] => (run('list').folders ?? []).find((f: any) => f.name === 'queued-reply')?.sessions ?? [];
await until(() => (run('list').folders ?? []).some((f: any) => f.name === 'queued-reply'), 10000);
run('new-agent', '--provider', 'claude', '--folder', 'queued-reply', '--name', 'Builder', '--no-kickoff'); const builder = await until(() => agents().find((x) => x.name === 'Builder' && !x.busy));
const wdir = path.join(FOLDER, 'workflows'); mkdirSync(path.join(wdir, 'ship'), { recursive: true });
const steps: [string, string, number, string][] = [['Build', 'build', 6000, 'Built.'], ['Check', 'check', 0, 'Checked.'], ['Test', 'test', 6000, 'Tested.'], ['Pack', 'pack', 0, 'Packed.'], ['Ship', 'ship', 12000, 'Shipped.']];
writeFileSync(path.join(wdir, 'ship.md'), `# Ship\n\nFive steps, one agent.\n\nwhen: manual\n\n${steps.map(([t, f], i) => `## ${i + 1}. [${t}](ship/${f}.md) → Builder\n`).join('\n')}`);
for (const [t, f, wait, said] of steps) writeFileSync(path.join(wdir, `ship/${f}.md`), `${t} it.${wait ? ` [[wait ${wait}]]` : ''}\n[[reply]]${said}\nOUTCOME: done\n`); // the stand-in works [[wait]] ms, then answers what follows [[reply]]
const rec = () => { const f = path.join(wdir, 'ship/runs/001.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const result = () => /^# Run \d+\nstarted: .*\n(?:ended: .*\n)?result: (.*)$/m.exec(rec())?.[1] ?? '';
const saidOf = (n: number) => new RegExp(`^## ${n}\\. [^\\n]*\\n(?:(?!## )[^\\n]*\\n)*?said: ([^\\n]*)`, 'm').exec(rec())?.[1] ?? '';
const typeToBuilder = async (text: string) => { run('open', '--session', builder.id); await sleep(800); await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); };
const queuedHere = () => js(`[...${V}.querySelectorAll('.bubble.queued')].map((b) => b.textContent).join(' | ')`);
check('(Builder is made)', !!builder);
// a new agent's chat keeps its queue under the name it was opened with, and a reloaded window opens it again under its session's: Builder's
// chat is opened again by its session first, so its queue is still there after the reload below
run('reload'); await sleep(4000); run('open', '--session', builder.id); await sleep(1000);
const started = run('run', '--workflow', 'ship', '--folder', 'queued-reply');
check('(the run starts: step 1 goes to Builder)', started.ok === true && !!(await until(() => /## 1\. Build/.test(rec()) && agents().find((x) => x.name === 'Builder')?.busy, 15000)), JSON.stringify(started));
// 1. a message typed to Builder while it works on step 1 waits in its queue; its answer ends with an OUTCOME line
await typeToBuilder('How is it going? [[wait 3000]] [[reply]]Going well.\nOUTCOME: done');
check('(a message typed to Builder during step 1 waits in its queue)', /How is it going/.test(await until(queuedHere, 5000) ?? ''), await queuedHere());
await until(() => saidOf(2), 40000);
check("step 2 closes on Builder's reply to step 2, not on its answer to the message that waited (it ends with an OUTCOME line too)", /^Checked\./.test(saidOf(2)), `step 2 said: ${saidOf(2)}`);
// 2. the same during step 3, and the window reloads while Builder answers that message, step 4's message waiting behind it
await until(() => /^## 3\. Test/m.test(rec()), 20000); await typeToBuilder('Anything new? [[wait 10000]] [[reply]]Still fine.\nOUTCOME: done');
check('(a message typed to Builder during step 3 waits in its queue)', /Anything new/.test(await until(queuedHere, 5000) ?? ''), await queuedHere());
check('(step 4 is sent while Builder answers that message)', !!(await until(() => /^## 4\. Pack/m.test(rec()), 30000)));
await sleep(1000); run('reload'); await sleep(4000);
await until(() => saidOf(4), 40000);
check("after a reload, the answer the window took back does not close step 4, whose message still waited in Builder's queue: step 4's own reply does", /^Packed\./.test(saidOf(4)), `step 4 said: ${saidOf(4)}`);
// 3. a reload while Builder works on step 5 itself: the reply, whose address the reloaded window cannot know, still closes the step
check('(step 5 is under way)', !!(await until(() => /^## 5\. Ship/m.test(rec()), 20000)));
await sleep(1500); run('reload');
const end = await until(() => (/^(done|failed|stopped)/i.test(result()) ? result() : null), 40000);
check("a reload during step 5's own turn: its reply still closes it, and the run is done", /^done/i.test(end ?? '') && /^Shipped\./.test(saidOf(5)), `${end ?? result()} / step 5 said: ${saidOf(5)}`);
done(close);
