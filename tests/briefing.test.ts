// What every agent is told about the Jauvex agent (clientBriefing in shared/types.ts). A Codex agent made a development agent of the app
// must not refuse to read the app's code: an older briefing said anything about the app, developing it included, goes to the Jauvex agent
// "rather than acting on the app yourself", and Codex keeps its briefing above the user's words. The Jauvex agent runs the app and may develop it; any agent with the source in its folder may develop it too.
import { clientBriefing } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };

const b = clientBriefing(false); const jx = b.split('\n').find((l) => l.startsWith('The Jauvex agent.')) ?? '';
check('the briefing has its paragraph about the Jauvex agent', !!jx);
// After an agent reads a big picture, Claude Code adds its own user-role note "[Image: original WxH, displayed at wxh. Multiply
// coordinates by ...]" (hidden in the app: the stream marks it synthetic), and an agent may answer it as if the user had sent pictures.
// Every agent is told what that note is.
check('the note Claude Code adds after a picture is read is not the user\'s: never answered as one', /\[Image: original .*displayed at .*\]: that is not a message, a screenshot or an attachment from the user/.test(b) && /never tell the user you cannot see pictures they did not send/.test(b));
check('nothing about the app is the Jauvex agent\'s alone', !/Anything about the app goes to it|rather than acting on the app yourself|developing it\)/.test(b));
check('the app\'s code is the work of whoever the user asks, when its source is in their folder', /Work the user gives you is yours, the app's code included/.test(jx));
check('work goes to another agent only when the user says so, or when it is out of reach', /only when the user says so, or when it is out of your reach/.test(jx));
check('running the app still goes to the Jauvex agent', /send a message-agent to "Jauvex"/.test(jx));
check('a restart is the agent\'s own, as the restart paragraph says: the two agree', /a restart you do yourself/.test(jx) && !/restarting or updating it/.test(jx) && /Restarting the app\. When the user asks you to restart/.test(b));
// "a coding agent", dictated, can come out as "a Codex agent", and the Jauvex agent would make a Codex agent. Agents are told
// the two sound alike, and to ask when that word decides what they do.
{ const v = clientBriefing(true); check('a voice turn is told that Codex and "coding" sound alike, and to ask when it matters', /Codex and "coding" sound alike/.test(v) && /which kind of agent to make/.test(v)); }
{ const v = clientBriefing(true); check('a voice turn is told that Claude comes out as "cloud" and gets swapped with Codex, and to ask', /Claude comes out as "cloud"/.test(v) && /Claude and Codex get swapped/.test(v)); }
// T-126: a dictated "the Acme coding agent that runs on Claude" can come out as "the Acme code engine that runs on Cloud"; an agent
// that sends the task to the Codex "Coding Agent" and corrects itself further down the same reply sends both: the wrong agent starts the work. Agents are told to ask when two agents fit a spoken name, and that every block is delivered.
{ const v = clientBriefing(true); check('a voice turn is told to ask which agent when two fit the name, before sending', /names that contain one another, such as "Coding Agent" and "Acme Coding Agent"/.test(v) && /ask which one, naming each with its provider, before you send anything/.test(v)); }
{ const t = clientBriefing(false); check('every agent is told that each block in its reply is delivered, a corrected one too', /Every message-agent block in your reply is delivered/.test(t) && /goes out all the same/.test(t)); }
// T-128: a new order passed on by another agent lands in a running turn on other work; read as "new information, not a new task", it
// would wait until the other work is finished. New work comes first; a wait on the user is never filled with other work.
{ const t = clientBriefing(false); check('a new request that arrives mid-turn is told apart from a detail of the work in hand, and comes first', /About the work in hand \(a correction, a detail, an answer, more of the same task\) it is new information/.test(t) && /A new piece of work that is not part of what you are doing \(a different request from the user, or one another agent passes on from the user\) comes first/.test(t)); }
{ const t = clientBriefing(false); check('a request that waits on the user is not filled with other work', /keep doing every part of it that does not need the answer; never fill the wait with other or older work/.test(t)); }
// Grok is one of the app's own words: Whisper gets it in its vocabulary, so "Grok" is heard as Grok, not "grog".
{ const { APP_WORDS, withAppWords } = await import('../shared/types.ts'); check('Grok is one of the words Whisper is told to know', APP_WORDS.includes('Grok') && /\bGrok\b/.test(withAppWords('Acme'))); }
// Boards (T-171): an agent is told the boards of the folder it runs in, and how to keep them; a folder with none says nothing about them.
{ const withBoards = clientBriefing(false, '', false, '/app', { boards: [{ file: 'PROJECT.md', title: 'Launch' }], workflows: [] }); const without = clientBriefing(false, '', false, '/app', { boards: [], workflows: [] });
  check('an agent is told its folder\'s boards and how to keep them', /Boards in this folder: PROJECT\.md \("Launch"\)/.test(withBoards) && /turning its glyph to \[~\]/.test(withBoards) && !/Boards in this folder/.test(without));
  // Workflows (T-210): an agent is told the folder's workflows, that a step of its own ends with an OUTCOME line, and nothing when there are none
  const withFlows = clientBriefing(false, '', false, '/app', { boards: [], workflows: [{ file: 'workflows/recipe-letter.md', name: 'Recipe letter' }] });
  check('an agent is told its folder\'s workflows and how a step of its own ends', /Workflows in this folder: workflows\/recipe-letter\.md \("Recipe letter"\)/.test(withFlows) && /OUTCOME: <one of the outcomes/.test(withFlows) && !/Workflows in this folder/.test(withBoards)); }
// Keep everything organized, the first rule after security: every agent is told it near the top, with the
// twelve points, quoting nobody, and nothing of the developer's own folders
{ const paras = b.split('\n\n'); const at = paras.findIndex((p) => p.startsWith('Keep everything organized')); const p = paras[at] ?? '';
  check('every agent is told to keep everything organized, the first rule after security, near the top', at > 0 && at <= 2 && p.includes('it is the first rule after security') && !/"|\bI\b|\bme\b/.test(p.split('\n')[0]!), String(at));
  check('...with all twelve points, files to memory', ['1. Files and folders', '2. Temporary work', '3. Code', '4. Versions', '5. Tasks', '6. Decisions', '7. Instructions', '8. Agents and sessions', '9. Workflows', '10. Messages', '11. Secrets', '12. Memory'].every((x) => p.includes(`\n${x}`)));
  check('...written for any user\'s computer: no paths of the developer\'s own', !/Reindent|CONVENTIONS|SECRETS\.md/.test(p)); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
