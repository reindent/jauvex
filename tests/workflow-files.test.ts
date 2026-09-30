// One file per step (T-168; the user, 2026-09-27: "a workflow MD file, and then the workflow folder with MD files for each step. That's it,
// that's all it has to do"): a new workflow is its file and a folder with each step's instructions; reading it brings them; the app writes
// and removes a step's file in the workflow's own folder, nothing outside it. No app, a folder under the check's data folder.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newWorkflow, readWorkflow, saveWorkflowStep, removeWorkflowStep, newRun, listRuns, saveWorkflow, workflowVersions, restoreVersion } from '../electron/workfiles.js';
import { parseWorkflow } from '../shared/workflow.js';
const root = process.env.CVC_DATA_DIR!;
assert(root.includes('/tmp/'));
const dir = path.join(root, 'workflow-files'); await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

const file = await newWorkflow(dir, 'Hello flow', 'Jauvex');
const md = await fs.readFile(path.join(dir, file), 'utf8');
check('a new workflow lists its steps in order, each linked to its file, and who does each', file === 'workflows/hello-flow.md'
  && /^## 1\. \[Say hello\]\(hello-flow\/say-hello\.md\) → Jauvex\n\n## 2\. \[Your approval\]\(hello-flow\/your-approval\.md\) → you\n\n## 3\. \[Write it down\]\(hello-flow\/write-it-down\.md\) → Jauvex$/m.test(md)
  && !/^(then|out|in):/m.test(md), md);
check('each step\'s instructions are a file in the workflow\'s folder', (await fs.readFile(path.join(dir, 'workflows/hello-flow/say-hello.md'), 'utf8')).startsWith('Say your name and greet the user')
  && (await fs.readdir(path.join(dir, 'workflows/hello-flow'))).sort().join(',') === 'README.md,runs,say-hello.md,write-it-down.md,your-approval.md');
const r = await readWorkflow(dir, file); const def = parseWorkflow(r.md, file, r.prompts);
check('reading it brings the steps\' files, and they are the steps\' instructions', Object.keys(r.prompts).length === 3 && def.steps.length === 3 && /greet the user/.test(def.steps[0]!.prompt) && def.steps[1]!.gate && /hello\.md/.test(def.steps[2]!.prompt), JSON.stringify(r.prompts));

await saveWorkflowStep(dir, file, 'hello-flow/say-hello.md', 'Say hello in French.\nOne sentence, no more.\n');
check('a step\'s file is written as typed', parseWorkflow(r.md, file, (await readWorkflow(dir, file)).prompts).steps[0]!.prompt === 'Say hello in French.\nOne sentence, no more.');
const refused: string[] = [];
for (const bad of ['../outside.md', 'other/x.md', 'hello-flow/runs/001.md', 'hello-flow/README.md', 'hello-flow/../../x.md', '/tmp/x.md', 'hello-flow/x.sh']) {
  try { await saveWorkflowStep(dir, file, bad, 'x'); } catch { refused.push(bad); } }
check('nothing outside the workflow\'s own folder is written, nor its README or runs', refused.length === 7 && !(await fs.stat(path.join(dir, 'outside.md')).then(() => true, () => false)), refused.join(', '));
let notWorkflow = false; try { await saveWorkflowStep(dir, 'PROJECT.md', 'PROJECT/x.md', 'x'); } catch { notWorkflow = true; }
check('only a workflow file has steps', notWorkflow);
await fs.writeFile(path.join(dir, file), r.md.replace('## 2. [Your approval](hello-flow/your-approval.md) → you\n\n', '').replace('## 3.', '## 2.'));
await removeWorkflowStep(dir, file, 'hello-flow/your-approval.md');
check('a step\'s file goes with the step', !(await fs.stat(path.join(dir, 'workflows/hello-flow/your-approval.md')).then(() => true, () => false)) && Object.keys((await readWorkflow(dir, file)).prompts).length === 2);
const older = 'workflows/older.md'; await fs.writeFile(path.join(dir, older), '# Older\n\nwhen: manual\n\n## 1. Gather → Notes agent\nCollect the notes.\n\n## 2. [Missing](older/missing.md) → Notes agent\n');
const o = await readWorkflow(dir, older); const od = parseWorkflow(o.md, older, o.prompts);
check('an older file still reads: instructions under a heading, and a linked file not made yet is no instructions', od.steps[0]!.prompt === 'Collect the notes.' && od.steps[1]!.prompt === '' && Object.keys(o.prompts).length === 0);

// versions (T-169; the user, 2026-09-27: "versioned each time they are run and they change. Not before ... it's per run"): a run takes the
// latest version when the workflow is as it was, a new one when its file or a step's instructions changed; editing alone takes none
const vfile = await newWorkflow(dir, 'Versioned', 'Jauvex'); const vdir = path.join(dir, 'workflows/versioned/versions');
const versions = async () => (await fs.readdir(vdir).catch(() => [] as string[])).sort().join(',');
const run1 = await newRun(dir, vfile);
check('the first run takes version 1: the workflow file and each step\'s instructions, as they were', run1.version === 1 && await versions() === '001.md'
  && /^version: 1$/m.test(await fs.readFile(path.join(dir, run1.file), 'utf8')) && (await listRuns(dir, vfile))[0]!.version === 1);
const v1 = await fs.readFile(path.join(vdir, '001.md'), 'utf8');
check('a version reads as the workflow did: its file, then each step\'s file, whole', /^# Versioned · version 1\n\ntaken: .*, when run 1 started\nhash: [0-9a-f]{64}\n/.test(v1) && v1.includes('## workflows/versioned.md') && v1.includes('## 1. [Say hello](versioned/say-hello.md) → Jauvex')
  && v1.includes('## workflows/versioned/say-hello.md\n\n```markdown\nSay your name and greet the user in one short sentence.\n```') && v1.includes('## workflows/versioned/write-it-down.md'), v1);
check('run again unchanged: the same version, none taken', (await newRun(dir, vfile)).version === 1 && await versions() === '001.md');
await saveWorkflowStep(dir, vfile, 'versioned/say-hello.md', 'Say hello in French.\n'); await saveWorkflowStep(dir, vfile, 'versioned/say-hello.md', 'Say hello in Spanish.\n');
check('two edits, then a run: one new version, with the last edit', (await newRun(dir, vfile)).version === 2 && await versions() === '001.md,002.md' && (await fs.readFile(path.join(vdir, '002.md'), 'utf8')).includes('Say hello in Spanish.') && !(await fs.readFile(path.join(vdir, '002.md'), 'utf8')).includes('French'));
check('run again unchanged: still version 2', (await newRun(dir, vfile)).version === 2 && await versions() === '001.md,002.md');
const vmd = await fs.readFile(path.join(dir, vfile), 'utf8'); await saveWorkflow(dir, vfile, vmd.replace('when: manual', 'when: every weekday 9:00'));
check('the workflow file changed: version 3 at the next run', (await newRun(dir, vfile)).version === 3 && (await fs.readFile(path.join(vdir, '003.md'), 'utf8')).includes('when: every weekday 9:00'));
const fence = 'Show them this:\n```\ncode\n```\n'; await saveWorkflowStep(dir, vfile, 'versioned/write-it-down.md', fence);
check('instructions with a code block of their own stay whole in a version', (await newRun(dir, vfile)).version === 4 && (await fs.readFile(path.join(vdir, '004.md'), 'utf8')).includes('````markdown\nShow them this:\n```\ncode\n```\n````'));

// seeing and restoring them (the user, 2026-09-27: "where I'm supposed to see the versions ... how can I roll back to a previous version")
check('the versions, and the one the workflow is now', JSON.stringify((await workflowVersions(dir, vfile)).versions.map((x) => x.n)) === '[1,2,3,4]' && (await workflowVersions(dir, vfile)).current === 4 && /when run \d+ started/.test((await workflowVersions(dir, vfile)).versions[0]!.taken));
await saveWorkflowStep(dir, vfile, 'versioned/say-hello.md', 'An edit nobody ran.\n');
check('edited since: no version is the workflow now', (await workflowVersions(dir, vfile)).current === null);
const back = await restoreVersion(dir, vfile, 1);
const said1 = await fs.readFile(path.join(dir, 'workflows/versioned/say-hello.md'), 'utf8');
check('restoring version 1 writes its file and each step\'s instructions back as they were', back.restored === 1 && said1 === 'Say your name and greet the user in one short sentence.\n'
  && (await fs.readFile(path.join(dir, vfile), 'utf8')).includes('when: manual') && (await workflowVersions(dir, vfile)).current === 1, said1);
check('what it was is kept first as a version of its own, so nothing is lost', back.kept === 5 && (await fs.readFile(path.join(vdir, '005.md'), 'utf8')).includes('An edit nobody ran.') && /before version 1 was restored/.test((await fs.readFile(path.join(vdir, '005.md'), 'utf8'))));
check('a run of the restored workflow is a run of version 1, no new version', (await newRun(dir, vfile)).version === 1 && await versions() === '001.md,002.md,003.md,004.md,005.md');
const undo = await restoreVersion(dir, vfile, 5);
check('and the restore can be undone the same way, nothing kept twice', undo.kept === null && (await fs.readFile(path.join(dir, 'workflows/versioned/say-hello.md'), 'utf8')) === 'An edit nobody ran.\n' && (await workflowVersions(dir, vfile)).current === 5);
// a step added since goes when an older version comes back
const withExtra = (await fs.readFile(path.join(dir, vfile), 'utf8')).replace('done:', '## 4. [Extra](versioned/extra.md) → Jauvex\n\ndone:'); await saveWorkflow(dir, vfile, withExtra); await saveWorkflowStep(dir, vfile, 'versioned/extra.md', 'More.\n');
await restoreVersion(dir, vfile, 1);
check('a step added since goes, its file with it', !(await fs.readFile(path.join(dir, vfile), 'utf8')).includes('Extra') && !(await fs.stat(path.join(dir, 'workflows/versioned/extra.md')).then(() => true, () => false)));
let refusedV = 0; for (const bad of [0, 99]) { try { await restoreVersion(dir, vfile, bad); } catch { refusedV++; } }
await fs.writeFile(path.join(vdir, '050.md'), '# x · version 50\n\ntaken: x\nhash: ' + '0'.repeat(64) + '\n\n## workflows/versioned.md\n\n```markdown\n# x\n```\n\n## workflows/other/evil.md\n\n```markdown\nx\n```\n');
try { await restoreVersion(dir, vfile, 50); } catch { refusedV++; }
check('no such version, or one that names a file outside the workflow\'s folder: refused, nothing written', refusedV === 3 && !(await fs.stat(path.join(dir, 'workflows/other/evil.md')).then(() => true, () => false)) && !(await fs.readFile(path.join(dir, vfile), 'utf8')).startsWith('# x\n'));

{ const f1 = await newWorkflow(dir, 'Default tries', 'Jauvex'); const f2 = await newWorkflow(dir, 'Three tries', 'Jauvex', 3); // T-197: the app's setting
  check('a new workflow is written with the tries it is given (the app\'s setting), six when none', parseWorkflow(await fs.readFile(path.join(dir, f1), 'utf8')).tries === 6 && parseWorkflow(await fs.readFile(path.join(dir, f2), 'utf8')).tries === 3); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
