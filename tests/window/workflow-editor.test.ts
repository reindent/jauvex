// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-editor/claude MOCK_DELAY_MS=5
// A workflow edited in the window (T-167; the user, 2026-09-27: "people might want to select agents from a dropdown and be able to type
// the instructions, not just talk to their workflows"). From the template: a step's agent picked from the list and its instructions typed,
// all its pane asks (then: "extremely over complicated ... a step is just an agent and instructions"), kept in a file of its own in the
// workflow's folder (T-168: the template's text, under its heading, moves there); its name edited in place, the file renamed with it; a step added after it (spliced in: the approval moves to 3, the first step now leads to the new one); the line under the title edited in
// place; the trigger picked; the new step removed again, its file with it. Every change is in the files, which the flow is drawn from.
import { connect, sleep, check, done, V, useWork } from './lib.ts';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'; import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
{ const { execFileSync } = await import('node:child_process'); const ls = () => JSON.parse(execFileSync('node', ['scripts/jauvex.ts', 'list'], { encoding: 'utf8' }));
  execFileSync('node', ['scripts/jauvex.ts', 'new-agent', '--provider', 'claude', '--folder', 'work', '--name', 'Scriptwriter', '--no-kickoff'], { encoding: 'utf8' }); // an agent of the workflow's folder, for its group in the list (the Claude stand-in)
  for (let i = 0; i < 60 && !(ls().folders ?? []).find((f: any) => f.name === 'work')?.sessions?.some((x: any) => x.name === 'Scriptwriter' && !x.busy); i++) await sleep(250); }
const root = process.cwd(); const wdir = path.join(root, 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
const FILE = path.join(wdir, 'news-video-creation.md'); const md = () => readFileSync(FILE, 'utf8');
const step = (f) => { const p = path.join(wdir, 'news-video-creation', f); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
writeFileSync(FILE, '# News Video Creation\n\nWhat this workflow does, in a line.\n\nwhen: manual\n\n## 1. First step → Agent name\nWhat the agent does, in plain words.\nout: what it produces\nthen: done → Your approval · failed → stop, tell the user\n\n## 2. Your approval → you\nthen: approved → Done · changes → back to step 1 with your notes\n\ndone: what the run leaves behind\n');
const until = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 250) { if (await f()) return true; await sleep(250); } return false; };
const setValue = (sel, value, event = 'input') => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); return true; })()`);
const click = (label) => js(`(() => { const b = [...document.querySelectorAll('.pane-view .wf-ed button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(2000);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('News Video Creation')).click()"); await sleep(2000);

// a step opens to be read (the user, 2026-09-27: "the default view, when you see a step, it's the edit mode. I think we should have a button
// to enable that, and otherwise we should see the runs for that step or the configuration"); Edit opens the editor
await js(`${V}.querySelectorAll('.steps .st')[1].click()`); await sleep(600);
check('a step opens to be read: who does it and its instructions, its last runs, no field to type in, and an Edit button', await js("(() => { const p = document.querySelector('.pane-view'); return !!p?.querySelector('.wf-step') && /Agent name/.test(p.querySelector('.wf-step-who')?.textContent ?? '') && /What the agent does/.test(p.querySelector('.wf-step-text')?.textContent ?? '') && /No run has reached it yet/.test(p.textContent) && !p.querySelector('input, select, textarea') && !!p.querySelector('.wf-step-edit'); })()"), await js("document.querySelector('.pane-view')?.textContent"));
await js("document.querySelector('.pane-view .wf-step-edit').click()"); await sleep(400);
// a step: the agent from the list, the instructions typed
const options = await js("[...document.querySelectorAll('.pane-view .wf-ed select option')].map((o) => o.value)");
const agent = (options ?? []).find((o) => o && o !== 'you' && o !== 'Agent name' && o !== '-');
check('the step opens with a list of agents, and you', !!agent && options.includes('you') && options.includes('Agent name'), JSON.stringify(options));
// this folder's agents first, apart from the rest (the user, 2026-09-27: "the agent selection should be the project agents ... the first ones
// that should appear, and it should be differentiated"): then the app's own agent, which every install has, and the other folders' agents
const groups = await js("[...document.querySelectorAll('.pane-view .wf-ed select optgroup')].map((g) => ({ label: g.label, values: [...g.querySelectorAll('option')].map((o) => o.value), texts: [...g.querySelectorAll('option')].map((o) => o.textContent) }))");
check('the agents come in two groups: this folder\'s first, then the rest, the app\'s own agent first',
  groups?.length === 2 && groups[0].label === 'In this folder' && groups[0].values.includes(agent) && groups[1].label === 'Elsewhere' && groups[1].values[0] === 'Jauvex' && !groups[0].values.includes('Jauvex'), JSON.stringify(groups));
await setValue('.pane-view .wf-ed select', agent, 'change');
check('the agent picked is the step\'s, in the file', await until(() => md().includes(`## 1. First step → ${agent}\n`)), md());
await sleep(500);
await setValue('.pane-view .wf-ed textarea', 'Write a 60-second script from today\'s top story.\nKeep it plain.');
check('the instructions typed are the step\'s, with their lines, in a file of its own that its heading links', await until(() => md().includes(`## 1. [First step](news-video-creation/first-step.md) → ${agent}\nout: what it produces`)
  && step('first-step.md') === 'Write a 60-second script from today\'s top story.\nKeep it plain.' && !md().includes('What the agent does')), md() + '\n---\n' + step('first-step.md'));
check('the pane says where they are kept', await until(() => js("document.querySelector('.pane-view .wf-ed-where')?.textContent === 'workflows/news-video-creation/first-step.md'")));
await setValue('.pane-view .wf-ed textarea', 'Write a 60-second script from today\'s top story.\nKeep it plain.\nNever invent a quote.');
check('what is typed next goes on into the file', await until(() => step('first-step.md') === 'Write a 60-second script from today\'s top story.\nKeep it plain.\nNever invent a quote.'), step('first-step.md'));
check('the flow shows the agent', await until(() => js(`${V}.querySelectorAll('.steps .st')[1].textContent.includes(${JSON.stringify(agent)})`)));
// what a step asks (the user, 2026-09-27: "a step is just an agent and instructions ... that's all"), then its title, optional ("the title of a
// workflow step should go after description and should be editable and optional")
const asks = await js("[...document.querySelectorAll('.pane-view .wf-ed label')].map((l) => l.firstChild?.textContent ?? '').join(' | ') + ' · inputs ' + document.querySelectorAll('.pane-view .wf-ed input').length");
check('the editor asks who does it and the instructions, then the title, optional', asks === 'Who does it | Instructions | Title (optional) · inputs 1', asks);
const title = "[...document.querySelectorAll('.pane-view .wf-ed label')].find((l) => /^Title/.test(l.textContent)).querySelector('input')";
await js(`(() => { const el = ${title}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Script'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
await js(`${title}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); // Enter saves (a hidden window may hold no focus to leave)
check('the title typed after the instructions is the step\'s, and its file takes the new name', await until(() => md().includes(`## 1. [Script](news-video-creation/script.md) → ${agent}\n`) && step('script.md') === 'Write a 60-second script from today\'s top story.\nKeep it plain.\nNever invent a quote.' && step('first-step.md') === null), md());
await sleep(300);

// a step added after it, spliced in before the approval
check('the pane offers a step before or after', await click('Add a step after'));
check('the new step is step 2, with no title and an empty file of its own, the approval step 3, and the first step leads to it by number', await until(() => /## 2\. \[\]\(news-video-creation\/step\.md\) → /.test(md()) && step('step.md') === '' && /## 3\. Your approval → you/.test(md()) && /then: done → step 2 · failed → stop, tell the user/.test(md())), md());
check('the flow draws three steps', await until(() => js(`${V}.querySelectorAll('.steps .st:not(.trigger):not(.end)').length === 3`)));
check('and the pane shows the new step', await until(() => js("document.querySelector('.pane-view .wf-ed-name')?.textContent === 'New step'")));
await setValue('.pane-view .wf-ed textarea', 'Record the voiceover for the script, in a calm voice, one take, no music under it.');
check('a step with no title is called by its instructions, cut short, in the flow and in its editor as they are typed', await until(() => js(`${V}.querySelectorAll('.steps .st')[2].querySelector('.line1 b')?.textContent === 'Record the voiceover for the script, in a calm…' && document.querySelector('.pane-view .wf-ed-name')?.textContent === 'Record the voiceover for the script, in a calm…'`)), await js(`${V}.querySelectorAll('.steps .st')[2].querySelector('.line1 b')?.textContent`));
const row = await js(`(() => { const r = ${V}.querySelectorAll('.steps .st')[2]; const who = r.querySelector('.line1 .who'); return { who: who.textContent, fits: who.scrollWidth <= who.clientWidth + 1 }; })()`);
check('a long title gives way in the row, and who does the step shows whole', /Jauvex/.test(row.who) && row.fits, JSON.stringify(row));
const shot = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null); if (shot?.data) writeFileSync(path.join(root, 'tmp/workflow-editor.png'), Buffer.from(shot.data, 'base64')); // a picture of the editor, for a person to look at

// the line under the title, edited in place
await js(`${V}.querySelector('.wf-head p .wf-inline').click()`); await sleep(300);
await setValue('.wf-head p input', 'A news story made into a short video, approved before it goes out.');
await js("document.querySelector('.wf-head p input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))"); // Enter saves (a hidden window may hold no focus to leave)
check('the line under the title is edited in place', await until(() => md().includes('\nA news story made into a short video, approved before it goes out.\n') && !md().includes('What this workflow does')), md());

// the trigger, picked
await js(`${V}.querySelector('.steps .st.trigger').click()`); await sleep(500);
check('the trigger\'s pane offers the usual ones', await click('every weekday 9:00'));
check('the trigger picked is in the file', await until(() => /^when: every weekday 9:00$/m.test(md())), md());

// the new step removed: the first step leads to the approval again
await js(`${V}.querySelectorAll('.steps .st')[2].click()`); await sleep(500);
check('another step opens to be read again, not in the editor', await js("!!document.querySelector('.pane-view .wf-step') && !document.querySelector('.pane-view .wf-ed')"));
await js("document.querySelector('.pane-view .wf-step-edit').click()"); await sleep(400);
check('a step can be removed', await click('Remove this step'));
check('removed: two steps, the first leads to the approval again, and the step\'s file is gone', await until(() => !/\[\]\(news-video-creation\/step\.md\)/.test(md()) && /then: done → Your approval · failed → stop, tell the user/.test(md()) && /## 2\. Your approval → you/.test(md()) && step('step.md') === null), md());

// a + on the line between two steps adds one there (the user, 2026-09-27, from a quiz builder's screenshot: "the only thing ... is the plus
// sign ... in between there's a plus sign to add steps")
check('a + sits on the line after the trigger and after each step; no other adder in the flow', await js(`${V}.querySelectorAll('.steps .wf-plus').length === 3 && !${V}.querySelector('.steps .wf-add')`), await js(`${V}.querySelectorAll('.steps .wf-plus').length`));
const geo = await js(`(() => { const rows = [...${V}.querySelectorAll('.steps .st')]; const p = rows[1].querySelector('.wf-plus').getBoundingClientRect(); const a = rows[1].querySelector('.mark-n').getBoundingClientRect(), b = rows[2].querySelector('.mark-n').getBoundingClientRect();
  return { plus: Math.round(p.top + p.height / 2), between: Math.round((a.top + a.height / 2 + b.top + b.height / 2) / 2), x: Math.round(p.left + p.width / 2), line: Math.round(a.left + a.width / 2), clear: p.top >= a.bottom && p.bottom <= b.top }; })()`);
check('it sits on the line, halfway between the two steps\' marks, touching neither', Math.abs(geo.plus - geo.between) <= 2 && Math.abs(geo.x - geo.line) <= 1 && geo.clear, JSON.stringify(geo));
await js(`${V}.querySelectorAll('.steps .st')[1].querySelector('.wf-plus').click()`);
check('the + between step 1 and the approval adds a step there, with its own empty file, and shows it', await until(() => /## 2\. \[\]\(news-video-creation\/step\.md\) → /.test(md()) && /## 3\. Your approval → you/.test(md()) && step('step.md') === '')
  && await until(() => js("document.querySelector('.pane-view .wf-ed-name')?.textContent === 'New step'")), md());
await js(`${V}.querySelector('.steps .st.trigger .wf-plus').click()`);
check('the + after the trigger adds a step first', await until(() => /## 1\. \[\]\(news-video-creation\/step-2\.md\) → /.test(md()) && /## 2\. \[Script\]/.test(md()) && /## 4\. Your approval → you/.test(md())), md());
done(close);
