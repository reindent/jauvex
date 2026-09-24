// What every agent is told about the Jauvex agent (clientBriefing in shared/types.ts). A Codex agent the user had made a development
// agent of the app refused to read the app's code, even after "You are hereby authorized": the briefing said anything about the app,
// developing it included, goes to the Jauvex agent "rather than acting on the app yourself", and Codex keeps its briefing above the
// user's words. The Jauvex agent runs the app and may develop it; any agent with the source in its folder may develop it too.
import { clientBriefing } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };

const b = clientBriefing(false); const jx = b.split('\n').find((l) => l.startsWith('The Jauvex agent.')) ?? '';
check('the briefing has its paragraph about the Jauvex agent', !!jx);
check('nothing about the app is the Jauvex agent\'s alone', !/Anything about the app goes to it|rather than acting on the app yourself|developing it\)/.test(b));
check('the app\'s code is the work of whoever the user asks, when its source is in their folder', /Work the user gives you is yours, the app's code included/.test(jx));
check('work goes to another agent only when the user says so, or when it is out of reach', /only when the user says so, or when it is out of your reach/.test(jx));
check('running the app still goes to the Jauvex agent', /send a message-agent to "Jauvex"/.test(jx));
check('a restart is the agent\'s own, as the restart paragraph says: the two agree', /a restart you do yourself/.test(jx) && !/restarting or updating it/.test(jx) && /Restarting the app\. When the user asks you to restart/.test(b));
// 2026-09-24: "call him a coding agent", dictated, came out as "a Codex agent", and the Jauvex agent made a Codex agent. Agents are told
// the two sound alike, and to ask when that word decides what they do.
{ const v = clientBriefing(true); check('a voice turn is told that Codex and "coding" sound alike, and to ask when it matters', /Codex and "coding" sound alike/.test(v) && /which kind of agent to make/.test(v)); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
