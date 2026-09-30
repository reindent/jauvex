// The workflow runner, with a fake channel and a fake record: steps go to the agents they name, outcomes pick branches, gates wait
// for the user, the record is rewritten at every change, a missing OUTCOME line is asked for once, a loop stops the run.
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`); if (!ok) failed++; };
const { Runner, said } = await import('../web/src/runner.ts'); const { parseWorkflow, parseRun } = await import('../shared/workflow.ts');
const md = `# Demo\n\nA check.\n\nwhen: manual\n\n## 1. Gather → Notes agent\nCollect.\nthen: done → Your approval · nothing found → stop, tell the user\n\n## 2. Your approval → you\nthen: approved → Publish · changes → back to step 1 with your notes\n\n## 3. Publish → Social agent\nthen: → Done\n\ndone: out\n`;
const def = parseWorkflow(md, 'workflows/demo.md');
const make = (deliverOk = true) => { const sent: { agent: string; text: string; step: number }[] = []; let record = ''; const run = parseRun('# Run 1\nstarted: 2026-09-22 10:00\nresult: running\n', 'workflows/demo/runs/001.md');
  const r = new Runner(def, run, 'workflows/demo/runs/001/', { deliver: async (agent, text, step) => { sent.push({ agent, text, step }); return deliverOk ? { ok: true } : { ok: false, note: `No agent named "${agent}"` }; }, save: async (m) => { record = m; } });
  return { r, sent, rec: () => record, parsed: () => parseRun(record) }; };
{ const { r, sent, rec, parsed } = make(); await r.start();
  check('the first step goes to its agent with the step message', sent.length === 1 && sent[0]!.agent === 'Notes agent' && /step 1 of 3: "Gather"/.test(sent[0]!.text) && /OUTCOME: one of "done", "nothing found"/.test(sent[0]!.text), sent[0]?.text);
  check('the record says the step started', /## 1\. Gather\nstarted: \d\d:\d\d/.test(rec()) && parsed().result === 'running', rec());
  await r.onReply(1, 'I collected three notes.\n\nOUTCOME: done');
  check('the reply\'s outcome closes the step with what it said, and the gate waits for the user', parsed().steps[1]!.result === 'done' && parsed().steps[1]!.said === 'I collected three notes.' && parsed().steps[1]!.took != null && parsed().steps[2]!.result === 'waiting for you' && r.waiting === 'user', rec());
  check('a reply for a step that is not current is ignored', (await r.onReply(1, 'OUTCOME: done'), parsed().steps[3] === undefined));
  check('an unknown outcome at the gate is refused', !(await r.decide(2, 'maybe')));
  await r.decide(2, 'changes', 'tighter');
  check('a send-back goes back to step 1 with the note in the record, a fresh message to the agent', parsed().steps[2]!.said === 'you: changes — tighter' && sent.length === 2 && sent[1]!.step === 1 && /Step 2 \("Your approval"\) ended with: you: changes — tighter/.test(sent[1]!.text), sent[1]?.text);
  await r.onReply(1, 'Better now.\nOUTCOME: done'); await r.decide(2, 'approved'); 
  check('approved goes on to Publish', sent.length === 3 && sent[2]!.agent === 'Social agent', String(sent.length));
  await r.onReply(3, 'Posted.\nOUTCOME: done');
  check('the run ends done with its total time, every step in the record', r.over && parsed().result === 'done' && parsed().took != null && Object.keys(parsed().steps).length === 3, rec()); }
{ const { r, sent, parsed } = make(); await r.start(); await r.onReply(1, 'I did things but forgot the line.');
  check('a reply without an OUTCOME line is asked for once more', sent.length === 2 && /did not end with an OUTCOME line/.test(sent[1]!.text) && !r.over);
  await r.onReply(1, 'Still nothing.');
  check('a second reply without it stops the run as failed', r.over && /^failed: step 1/.test(parsed().result) && parsed().steps[1]!.result === 'no outcome named', parsed().result); }
{ const { r, parsed } = make(); await r.start(); await r.onReply(1, 'OUTCOME: nothing found');
  check('a stop branch ends the run and says why', r.over && parsed().result === 'stopped: stop, tell the user', parsed().result); }
{ const { r, parsed } = make(false); await r.start();
  check('an agent that cannot be reached fails the run at that step', r.over && /^failed: step 1 \(Gather\): No agent named "Notes agent"/.test(parsed().result), parsed().result); }
// Tries (T-197; the user, 2026-09-28: "agents should not do it more than six times ... but for humans, I wouldn't add that"): a loop through
// a decision of the user's has no limit; one between agents alone stops the run past the step's tries (its own line, else the workflow's, else 6).
{ const { r, sent, parsed } = make(); await r.start(); for (let i = 0; i < 9 && !r.over; i++) { await r.onReply(1, 'OUTCOME: done'); await r.decide(2, 'changes'); }
  check('a loop through a decision of yours goes on past six rounds (nine send-backs, still running)', !r.over && sent.length === 10 && parsed().result === 'running', `${parsed().result} after ${sent.length} messages`); }
const agentsOnly = (tries: string, stepLine = '') => { const d = parseWorkflow(`# Loop\n\nA check.\n\nwhen: manual\n${tries}\n## 1. Draft → Writer\nWrite it.${stepLine}\n\n## 2. Check → Checker\nthen: done → Done · redo → back to step 1\n\ndone: out\n`, 'workflows/loop.md');
  const sent: number[] = []; let rec = ''; const r = new Runner(d, parseRun('# Run 1\nstarted: 2026-09-22 10:00\nresult: running\n'), 'workflows/loop/runs/001/', { deliver: async (_a, _t, step) => { sent.push(step); return { ok: true }; }, save: async (m) => { rec = m; } });
  const round = async () => { for (let i = 0; i < 12 && !r.over; i++) { await r.onReply(1, 'OUTCOME: done'); await r.onReply(2, 'OUTCOME: redo'); } };
  return { r, sent, round, parsed: () => parseRun(rec) }; };
{ const { r, sent, round, parsed } = agentsOnly(''); await r.start(); await round();
  check('a loop between agents alone stops past six tries, and says so', r.over && /^stopped: step 1 \(Draft\) came round 7 times with no decision of yours, more than its 6 tries/.test(parsed().result) && sent.filter((x) => x === 1).length === 6, `${parsed().result} (${sent.join(',')})`); }
{ const { r, sent, round, parsed } = agentsOnly('tries: 2\n'); await r.start(); await round();
  check('the workflow\'s tries: line sets its own number', r.over && /came round 3 times .* more than its 2 tries/.test(parsed().result) && sent.filter((x) => x === 1).length === 2, parsed().result); }
{ const { r, sent, round, parsed } = agentsOnly('tries: 6\n', '\ntries: 1'); await r.start(); await round();
  check('a step\'s own tries: 1 in its instructions overrides the workflow\'s: one try, then the run stops', r.over && /step 1 \(Draft\) came round 2 times .* more than its 1 try/.test(parsed().result) && sent.filter((x) => x === 1).length === 1, parsed().result); }
{ const { r, sent, parsed } = make(); await r.start(); await r.stop();
  check('stop marks the current step and the run', r.over && parsed().steps[1]!.result === 'stopped' && parsed().result === 'stopped: stopped by you' && sent.length === 1); }
{ const run = parseRun('# Run 4\nstarted: 2026-09-22 10:00\nresult: running\n\n## 1. Gather\nstarted: 10:00\ntook: 2 m\nresult: done\nsaid: ok\n\n## 2. Your approval\nstarted: 10:02\nresult: waiting for you\n'); const sent: string[] = []; let rec = '';
  const r = new Runner(def, run, 'workflows/demo/runs/004/', { deliver: async (_a, t) => { sent.push(t); return { ok: true }; }, save: async (m) => { rec = m; } }); await r.resume();
  check('a resumed run picks up at its open step: a gate waits, nothing is re-sent', r.current === 2 && r.waiting === 'user' && sent.length === 0 && /waiting for you/.test(rec)); }
{ const run = parseRun('# Run 5\nstarted: 2026-09-22 10:00\nresult: running\n\n## 1. Gather\nstarted: 10:00\n'); const sent: string[] = []; let rec = ''; const gates: number[] = []; const ends: string[] = [];
  const r = new Runner(def, run, 'workflows/demo/runs/005/', { deliver: async (_a, t) => { sent.push(t); return { ok: true }; }, save: async (m) => { rec = m; }, onGate: (n) => gates.push(n), onFinish: (x) => ends.push(x) });
  check('attach takes over a live run at its agent step without sending anything', r.attach() && r.current === 1 && r.waiting === 'agent' && r.waitingFor === 'Notes agent' && sent.length === 0);
  await r.resend(); check('resend sends the step again, saying it was already sent', sent.length === 1 && /already sent once/.test(sent[0]!));
  await r.onReply(1, 'Found them.\nOUTCOME: done'); check('the reply moves it on to the gate, which is signalled', gates.join() === '2' && r.waiting === 'user' && /took: \d/.test(rec));
  await r.decide(2, 'approved'); await r.onReply(3, 'OUTCOME: done'); check('the end is signalled with its result', ends.join() === 'done'); }
// one file per step (T-168): the step is its agent and its instructions, the file its heading links; no then lines, the usual outcomes
{ const split = parseWorkflow('# Split\n\nwhen: manual\n\n## 1. [Script](split/script.md) → Video agent\n\n## 2. [Your approval](split/your-approval.md) → you\n\n## 3. [Publish](split/publish.md) → Social agent\n',
    'workflows/split.md', { 'split/script.md': 'Write the script.\n\nNever invent a quote.\n', 'split/publish.md': 'Post it.' });
  const sent: { agent: string; text: string; step: number }[] = []; let record = ''; const run = parseRun('# Run 1\nstarted: 2026-09-27 10:00\nresult: running\n', 'workflows/split/runs/001.md');
  const r = new Runner(split, run, 'workflows/split/runs/001/', { deliver: async (agent, text, step) => { sent.push({ agent, text, step }); return { ok: true }; }, save: async (m) => { record = m; } }); await r.start();
  check('a step is sent its own file, as written', sent[0]!.agent === 'Video agent' && sent[0]!.text.includes('Write the script.\n\nNever invent a quote.') && /OUTCOME: one of "done", "failed"/.test(sent[0]!.text), sent[0]?.text);
  check('the step before yours is told to end with what you should do', /starts with FOR YOU:/.test(sent[0]!.text), sent[0]?.text);
  await r.onReply(1, 'Written.\nFOR YOU: Read the script, then approve it or ask for changes.\nOUTCOME: done');
  check('what it tells you is kept in the record, apart from what it said', /said: Written\.\nasks: Read the script, then approve it or ask for changes\./.test(record), record);
  await r.decide(2, 'changes', 'shorter');
  check('an approval with no then line sends changes back to the step before, with the note', sent.length === 2 && sent[1]!.step === 1 && /ended with: you: changes — shorter/.test(sent[1]!.text), sent[1]?.text);
  await r.onReply(1, 'Shorter.\nOUTCOME: done');
  check('a step of yours goes on with continue, and an agent that still says approved is understood (it was the word until 2026-09-27)', await r.decide(2, 'approved') && /said: you: continue/.test(record), record);
  check('continue goes on to the next', sent.length === 3 && sent[2]!.agent === 'Social agent' && sent[2]!.text.includes('Post it.'), String(sent.length));
  await r.onReply(3, 'Could not log in.\nOUTCOME: failed');
  check('a failed step stops the run', /^result: stopped: stop, tell the user/m.test(record), record); }
{ const { r, sent, rec } = make(); await r.start(); // outcomes written out: a reply without its OUTCOME line is asked for once more
  await r.onReply(1, 'Found two notes.\nFOR YOU: Approve them, or ask for more.'); await r.onReply(1, 'OUTCOME: done');
  check('a reply asked again for its OUTCOME line keeps the first one\'s words and what it told you', sent.length === 2 && /said: Found two notes\.\nasks: Approve them, or ask for more\./.test(rec()), rec()); }
check('said: the reply without its OUTCOME line and code, one line, cut short', said('Done.\n```\nx\n```\n**OUTCOME:** done') === 'Done.' && said('a '.repeat(200)).length <= 240);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
