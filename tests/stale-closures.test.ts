// A workflow's later step could not reach its agent (T-252; a tester's report, 2026-10-01: four runs failed at step 2, '"Alerts Codex" could
// not be reached'). A run's delivery was made when the run started and kept the window's state of that moment: a step looked for its agent's
// chat among the chats open then, and one closed since (the app keeps eight) was waited for 9 s. Code that outlives a render (a run, a timer, a
// listener) reaches the window's state through refs. This check reads the source, in milliseconds: the run delivers through the latest
// delivery, and the delivery looks for the chats open now. The behaviour itself, run in the window: tests/workflow-reopened.test.mjs.
import { readFileSync } from 'node:fs';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const src = readFileSync('web/src/App.tsx', 'utf8');
/** A function of App's body, from `const <name> = ` to the next declaration at the same depth. */
const body = (name: string): string => { const i = src.indexOf(`  const ${name} = `); if (i < 0) return ''; const j = src.indexOf('\n  const ', i + 10); return src.slice(i, j < 0 ? undefined : j); };
const runner = body('makeRunner'), deliverTo = body('deliverTo');
check('a run delivers each step through the latest delivery (a ref), never the one of its start', /deliver: \(agent, text, step\) => deliverToAgentRef\.current\(/.test(runner), runner.slice(0, 300));
check('...and that ref is set to the latest delivery at every render', /\n {2}deliverToAgentRef\.current = deliverToAgent;/.test(src));
check('the delivery looks for the chats open now (openedRef), never the list of the render it was made in', /openedRef\.current\.find\(/.test(deliverTo) && !/[^.\w]opened\.find\(/.test(deliverTo), deliverTo.slice(0, 400));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
