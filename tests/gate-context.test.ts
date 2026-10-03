// A gate shows what to decide on (the user, 2026-10-03: "when it asks me to choose something, it doesn't tell me what to choose"; News video
// research run 4 kept only its opening narration, while its six candidates sat in a file). The runner keeps the agent step's whole reply in
// the run's folder (step-N.md), the record's `said:` comes from its end, the gate's notification carries the question, and the step before a
// gate is told to put what the person decides on in its reply, with CHOICE lines.
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`); if (!ok) failed++; };
const { Runner } = await import('../web/src/runner.ts'); const { parseWorkflow, parseRun, stepMessage } = await import('../shared/workflow.ts');
const def = parseWorkflow('# News\n\nwhen: manual\n\n## 1. Find topics → Social Media Agent\nFind them.\n\n## 2. Pick the topic → you\n\n## 3. Gather → Social Media Agent\nGather.\n', 'workflows/news.md');
const run = parseRun('# Run 4\nstarted: 2026-10-03 13:11\nresult: running\n', 'workflows/news/runs/004.md');
const steps: Record<number, string> = {}; let gate: { n: number; asks?: string } | null = null; let rec = '';
const r = new Runner(def, run, 'workflows/news/runs/004/', { deliver: async () => ({ ok: true }), save: async (m) => { rec = m; }, saveStep: async (n, text) => { steps[n] = text; }, onGate: (n, _name, asks) => { gate = { n, asks }; } });
await r.start();
check('the step before a gate is told to put the decision in its reply, with CHOICE lines', /CHOICE: <short label>/.test(stepMessage(def, 1, run, 'workflows/news/runs/004/')) && /in the reply itself/.test(stepMessage(def, 1, run, 'workflows/news/runs/004/')));
const reply = "I'll check @ReindentAI, read For You and trends.\n\n## Candidates\n\n1. Opus builds a city\n2. Agents in finance\n\nSix candidates in runs/004/candidates.md, the first two strongest.\n\nCHOICE: Opus city — the most watched\nCHOICE: Agents in finance — closest to our audience\nFOR YOU: Pick a topic and angle, or tell me what to look for instead.\nOUTCOME: done";
await r.onReply(1, reply);
check('the whole reply is kept for the gate, its CHOICE lines in, OUTCOME and FOR YOU out', /## Candidates/.test(steps[1] ?? '') && /CHOICE: Opus city/.test(steps[1] ?? '') && !/OUTCOME:|FOR YOU:/.test(steps[1] ?? ''), steps[1]);
check('the record says what the step found, from the end of its reply, not its opening narration', /## 1\. Find topics[\s\S]*said: Six candidates/.test(rec) && !/said: I.ll check/.test(rec), rec);
const g = gate as { n: number; asks?: string } | null; // set inside a callback: TypeScript keeps it null here
check('the gate is announced with its question', !!g && g.n === 2 && g.asks === 'Pick a topic and angle, or tell me what to look for instead.', JSON.stringify(gate));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
