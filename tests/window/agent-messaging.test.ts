// llm
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
// Agents reach each other only through the app's message-agent block, in both directions. A Claude agent told to "talk to" a Codex
// agent writes the block (not its harness's own agent tools, not a chat skill), the app delivers it and the answer comes back; the
// same from a Codex agent to a Claude one. (An agent once set up a file-based chat protocol instead.)
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
const pick = async (provider, preferred) => js(`(() => { const rs = ${rows}.filter((r) => r.querySelector('.provider-icon.${provider}')); const r = rs.find((x) => x.querySelector('.row-title')?.textContent === ${JSON.stringify(preferred)}) ?? rs[0]; if (!r) return null; r.click(); return r.querySelector('.row-title')?.textContent ?? ''; })()`);
const type = (text) => js(`(() => { const ta = ${V}.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } }; // the recorder file appears with its first line
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const waitFor = async (re, secs = 150) => { for (let i = 0; i < secs; i++) { await sleep(1000); if (re.test(log())) return true; } return false; };
const codexName = await pick('codex', 'Codex Agent'); await sleep(500); const claudeName = await pick('claude', 'Notes agent code word'); await sleep(1500);
check('a Claude and a Codex session are open', !!codexName && !!claudeName, `${claudeName} / ${codexName}`);
await type(`Talk to the Codex agent "${codexName}" in this app and ask it to answer with the single word pong. Then tell me what it answered.`);
check('Claude to Codex: the Claude agent wrote a message-agent block and the app delivered it', await waitFor(new RegExp(`agent message: "${esc(claudeName)}" -> "${esc(codexName)}"`)));
check('and the Codex agent\'s answer came back to it', await waitFor(new RegExp(`agent reply: "${esc(codexName)}" -> "${esc(claudeName)}"`)));
await pick('codex', 'Codex Agent'); await sleep(1500);
await type(`Talk to the Claude agent "${claudeName}" in this app and ask it to answer with the single word ping. Then tell me what it answered.`);
check('Codex to Claude: the Codex agent wrote a message-agent block and the app delivered it', await waitFor(new RegExp(`agent message: "${esc(codexName)}" -> "${esc(claudeName)}"`)));
check('and the Claude agent\'s answer reached it (as the automatic reply, or as a block of its own)', await waitFor(new RegExp(`agent (reply|message): "${esc(claudeName)}" -> "${esc(codexName)}": (?!.*pong)`)));
// The same channel as a tool, for a Claude session that looks for one: the message goes through the router and is marked so.
await pick('claude', 'Notes agent code word'); await sleep(1500);
await type(`Use your Jauvex tool to ask the Codex agent "${codexName}" for the single word pong once more, then tell me what it answered.`);
check('by tool: the Claude agent used message_agent and the app delivered it', await waitFor(new RegExp(`agent message: "${esc(claudeName)}" -> "${esc(codexName)}": .*\\[by tool\\]`)));
done(close);
