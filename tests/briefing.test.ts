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
{ const v = clientBriefing(true); check('a voice turn is told that Claude comes out as "cloud" and gets swapped with Codex, and to ask', /Claude comes out as "cloud"/.test(v) && /Claude and Codex get swapped/.test(v)); }
// T-126 (2026-09-24): "that was for the Reindent coding agent that runs on Claude", dictated to the Creative Agent, came out as "the Reindent
// code engine that runs on Cloud"; it sent the task to the Codex "Coding Agent", corrected itself further down the same reply, and both went
// out: the Codex agent started the work. Agents are told to ask when two agents fit a spoken name, and that every block is delivered.
{ const v = clientBriefing(true); check('a voice turn is told to ask which agent when two fit the name, before sending', /names that contain one another, such as "Coding Agent" and "Reindent Coding Agent"/.test(v) && /ask which one, naming each with its provider, before you send anything/.test(v)); }
{ const t = clientBriefing(false); check('every agent is told that each block in its reply is delivered, a corrected one too', /Every message-agent block in your reply is delivered/.test(t) && /goes out all the same/.test(t)); }
// T-128 (2026-09-24): the user ordered a video; the Marketing Agent passed his words to the Video Agent, which was working on another video.
// The order landed in its running turn, where the briefing said a message is "new information, not a new task": it answered, finished
// the other video for forty minutes, and waited on him for the rest. New work comes first; a wait on the user is never filled with other work.
{ const t = clientBriefing(false); check('a new request that arrives mid-turn is told apart from a detail of the work in hand, and comes first', /About the work in hand \(a correction, a detail, an answer, more of the same task\) it is new information/.test(t) && /A new piece of work that is not part of what you are doing \(a different request from the user, or one another agent passes on from the user\) comes first/.test(t)); }
{ const t = clientBriefing(false); check('a request that waits on the user is not filled with other work', /keep doing every part of it that does not need the answer; never fill the wait with other or older work/.test(t)); }
// Grok is one of the app's own words (2026-09-24): Whisper gets it in its vocabulary, so "Grok" is heard as Grok, not "grog".
{ const { APP_WORDS, withAppWords } = await import('../shared/types.ts'); check('Grok is one of the words Whisper is told to know', APP_WORDS.includes('Grok') && /\bGrok\b/.test(withAppWords('Reindent'))); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
