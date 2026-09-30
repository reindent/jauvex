// A workflow edited in the window (T-167): each edit is a change to the markdown the parser reads back; only the part edited is rewritten;
// outcomes follow a step that moves, is renamed or is removed. Pure.
import { parseWorkflow, resolveTarget } from '../shared/workflow.js';
import { setStep, addStep, removeStep, setMeta, readStep, stepFileFor } from '../shared/workflow-edit.js';
let failed = 0; const ok = (c: boolean, what: string, detail = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${what}${!c && detail ? `\n${detail}` : ''}`); if (!c) failed++; };
const TEMPLATE = `# News Video Creation

What this workflow does, in a line.

when: manual

## 1. First step → Agent name
What the agent does, in plain words.
out: what it produces
then: done → Your approval · failed → stop, tell the user

## 2. Your approval → you
then: approved → Done · changes → back to step 1 with your notes

done: what the run leaves behind
`;
const where = (md: string, from: number, outcome: string) => { const def = parseWorkflow(md); const s = def.steps[from - 1]!; const o = s.then.split('·').map((x) => x.trim()).find((x) => x.toLowerCase().startsWith(outcome)); const to = o ? o.split(/\s*(?:→|->)\s*/)[1]! : ''; return resolveTarget(def, from, to); };

// a step: agent from the list, instructions typed
let md = setStep(TEMPLATE, 1, { agent: 'Video Agent', text: 'Write a 60-second script from today\'s top story.\nKeep it plain.' });
let def = parseWorkflow(md);
ok(def.steps[0]!.agent === 'Video Agent' && def.steps[0]!.note === 'Write a 60-second script from today\'s top story. Keep it plain.' && def.steps[0]!.out === 'what it produces', 'a step takes the agent picked and the instructions typed, and keeps its other lines', md);
ok(md.includes('Write a 60-second script from today\'s top story.\nKeep it plain.\nout: what it produces'), 'the instructions keep their lines in the file', md);
ok(md.split('## 2.')[1] === TEMPLATE.split('## 2.')[1], 'the rest of the file is left exactly as it was', md);
md = setStep(md, 1, { out: 'the script, in script.md', in: '' });
ok(parseWorkflow(md).steps[0]!.out === 'the script, in script.md' && !/^in:/m.test(md), 'what a step gives changes; an empty field leaves no line', md);
md = setStep(md, 1, { text: '## sneaky heading\nplain' });
ok(parseWorkflow(md).steps.length === 2 && parseWorkflow(md).steps[0]!.note === 'sneaky heading plain', 'nothing typed in the instructions can start a step of its own', md);

// a rename: the outcomes that named the step follow it
md = setStep(TEMPLATE, 2, { name: 'Final check' });
ok(parseWorkflow(md).steps[1]!.name === 'Final check' && /then: done → Final check · failed → stop, tell the user/.test(md), 'a renamed step keeps the outcomes that named it', md);
ok(where(md, 2, 'changes').kind === 'step' && (where(md, 2, 'changes') as { n: number }).n === 1, 'an outcome by number is left alone');

// a step added before the approval: spliced in, numbers move up
md = addStep(TEMPLATE, 2, { name: 'Voiceover', agent: 'Voice Agent', text: 'Record the script.' });
def = parseWorkflow(md);
ok(def.steps.map((s) => `${s.name}/${s.agent}`).join(', ') === 'First step/Agent name, Voiceover/Voice Agent, Your approval/you', 'the step goes where it was added', def.steps.map((s) => s.name).join(', '));
ok(/^## 1\. First step/m.test(md) && /^## 2\. Voiceover → Voice Agent/m.test(md) && /^## 3\. Your approval → you/m.test(md), 'the steps are numbered again', md);
ok((where(md, 1, 'done') as { n: number }).n === 2, 'what led from the step before to the approval now leads to the new step', md);
ok(def.steps[1]!.then === '' && resolveTarget(def, 2, 'next').kind === 'step', 'the new step goes on to the next, the approval');
ok((where(md, 3, 'changes') as { n: number }).n === 1 && /changes → back to step 1 with your notes/.test(md), '"back to step 1" still means the first step', md);
const shifted = addStep(TEMPLATE, 1, { name: 'Research', agent: 'Research Agent' });
ok(/changes → back to step 2 with your notes/.test(shifted) && (where(shifted, 3, 'changes') as { n: number }).n === 2, 'a step added before it moves "back to step 1" to step 2, the same step', shifted);
const appended = addStep(TEMPLATE, 3, { name: 'Publish', agent: 'Social Agent' });
ok(/approved → Publish/.test(appended) && /^## 3\. Publish → Social Agent/m.test(appended) && /\ndone: what the run leaves behind\n$/.test(appended), 'a step added at the end comes after the approval, and the file still ends with done:', appended);

// a step removed: what led to it leads to the one after
md = removeStep(addStep(TEMPLATE, 2, { name: 'Voiceover', agent: 'Voice Agent' }), 2);
ok(md === TEMPLATE.replace('then: done → Your approval', 'then: done → Your approval'), 'adding a step and taking it out again gives the file back', md);
md = removeStep(TEMPLATE, 2);
ok(parseWorkflow(md).steps.length === 1 && /then: done → Done · failed → stop, tell the user/.test(md) && /\ndone: what the run leaves behind\n$/.test(md), 'removing the last step sends what led to it to Done, and keeps done:', md);
md = removeStep(shifted, 1);
ok(/changes → back to step 1 with your notes/.test(md) && parseWorkflow(md).steps[0]!.name === 'First step', 'removing a step moves the numbers after it down', md);

// the workflow's own lines
md = setMeta(TEMPLATE, { name: 'News video', desc: 'A news story made into a short video, approved before it goes out.', when: 'every weekday 9:00', done: 'the video, approved' });
def = parseWorkflow(md);
ok(def.name === 'News video' && def.desc === 'A news story made into a short video, approved before it goes out.' && def.when === 'every weekday 9:00' && def.done === 'the video, approved' && def.steps.length === 2, 'the title, the line on what it does, when it runs and what it leaves behind', md);
ok(md.split('## 1.')[1] === TEMPLATE.split('## 1.')[1]!.replace('done: what the run leaves behind', 'done: the video, approved'), 'the steps are left as they were', md);
md = setMeta('## 1. Only → you\n', { when: 'manual', done: 'nothing' });
ok(parseWorkflow(md).when === 'manual' && parseWorkflow(md).done === 'nothing' && parseWorkflow(md).steps.length === 1, 'lines that were missing are added', md);

// one file per step (T-168): the functions write the link, the window writes the file
md = addStep(TEMPLATE, 2, { name: 'Voiceover', agent: 'Voice Agent', file: 'news-video-creation/voiceover.md' });
ok(/^## 2\. \[Voiceover\]\(news-video-creation\/voiceover\.md\) → Voice Agent$/m.test(md) && parseWorkflow(md).steps[1]!.file === 'news-video-creation/voiceover.md' && parseWorkflow(md).steps[1]!.name === 'Voiceover', 'a new step\'s heading links its file', md);
ok((where(md, 1, 'done') as { n: number }).n === 2, 'and it is spliced in by its name, as before', md);
const moved = setStep(TEMPLATE, 1, { link: 'news-video-creation/first-step.md', text: '' });
ok(/^## 1\. \[First step\]\(news-video-creation\/first-step\.md\) → Agent name\nout: what it produces\n/m.test(moved) && !moved.includes('What the agent does') && readStep(moved, 1)!.link === 'news-video-creation/first-step.md', 'a step of an older file gets a file: the link in, its instructions out of the heading', moved);
const renamed = setStep(moved, 1, { name: 'Script', link: 'news-video-creation/script.md' });
ok(/^## 1\. \[Script\]\(news-video-creation\/script\.md\) → Agent name$/m.test(renamed) && /changes → back to step 1/.test(renamed), 'a rename takes the file\'s new name with it', renamed);
ok(setStep(renamed, 1, { agent: 'Video Agent' }).includes('## 1. [Script](news-video-creation/script.md) → Video Agent'), 'a new agent keeps the link');
ok(removeStep(md, 2) === TEMPLATE, 'a linked step removed gives the file back as it was', removeStep(md, 2));
ok(stepFileFor('workflows/news-video-creation.md', 'New step', []) === 'news-video-creation/new-step.md' && stepFileFor('workflows/news-video-creation.md', 'New step', ['news-video-creation/new-step.md']) === 'news-video-creation/new-step-2.md'
  && stepFileFor('workflows/news-video-creation.md', 'Readme', []) === 'news-video-creation/readme-2.md' && stepFileFor('workflows/x.md', 'Script & assembly!', []) === 'x/script-assembly.md', 'a step\'s file is named after it, never twice, never the README');

// a title is optional (the user, 2026-09-27): a new step can have none; one can be cleared; what led to it by name leads to it by number
const untitledAdd = addStep(TEMPLATE, 2, { name: '', agent: 'Jauvex', file: 'news-video-creation/step.md' });
ok(/^## 2\. \[\]\(news-video-creation\/step\.md\) → Jauvex$/m.test(untitledAdd) && /then: done → step 2 · failed → stop, tell the user/.test(untitledAdd) && (where(untitledAdd, 1, 'done') as { n: number }).n === 2 && parseWorkflow(untitledAdd).steps[1]!.name === '', 'a step with no title: its heading keeps its link, and what led to its place leads to it by number', untitledAdd);
const cleared = setStep(addStep(TEMPLATE, 2, { name: 'Voiceover', agent: 'Jauvex', file: 'news-video-creation/voiceover.md' }), 2, { name: '' });
ok(/^## 2\. \[\]\(news-video-creation\/voiceover\.md\) → Jauvex$/m.test(cleared) && /then: done → step 2 ·/.test(cleared), 'a title cleared: the link stays, and what named the step names its number', cleared);
ok(!/\[\]/.test(setStep(TEMPLATE, 1, { name: '' })) && parseWorkflow(setStep(TEMPLATE, 1, { name: '' })).steps[0]!.name === 'First step', 'a step with no file keeps its name: its heading has nothing else to show');
ok(/then: done → step 2 · failed/.test(removeStep(addStep(untitledAdd, 2, { name: 'Voiceover', agent: 'Jauvex', file: 'news-video-creation/voiceover.md' }), 2)), 'a step removed before an untitled one: what led to it leads to that one by number');
// tries (T-197): the workflow's line, kept when its description changes; a step's, from its instructions file; none, none
{ const md0 = `# T\n\nWhat it does.\n\nwhen: manual\ntries: 3\n\n## 1. [Draft](t/draft.md) → Writer\n\n## 2. [Check](t/check.md) → Checker\n`;
  const d = parseWorkflow(md0, 'workflows/t.md', { 't/draft.md': 'Write the draft.\ntries: 1\n', 't/check.md': 'Check it.\n' });
  ok(d.tries === 3 && d.steps[0]!.tries === 1 && d.steps[1]!.tries === null && parseWorkflow(TEMPLATE).tries === null, 'tries: the workflow\'s line, a step\'s own in its instructions, none when unsaid', JSON.stringify([d.tries, d.steps.map((x) => x.tries)]));
  ok(parseWorkflow(setMeta(md0, { desc: 'Something else.' })).tries === 3, 'the tries: line stays when the description is edited', setMeta(md0, { desc: 'Something else.' })); }

console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
