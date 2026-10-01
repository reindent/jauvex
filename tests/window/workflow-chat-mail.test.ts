// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/workflow-chat-mail/claude MOCK_DELAY_MS=5
// A workflow's chat writes to the app's agents and hears back (T-205; the user, 2026-09-29: "the agent inside of Workflows try to contact
// you when he couldn't"). Only the sidebar's chats were heard: a message-agent block in a workflow's chat went nowhere, and its message tool
// found no session. The router now hears a chat under a view, knows it by name ("<workflow> workflow", in the roster while its view is
// open), and delivers to it there, never to a second copy of its session. (The stand-in answers a message ending in [[reply]] with the
// words after it: here, a message block.)
import { connect, sleep, check, done, V, useWork } from './lib.ts';
import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } };
const scratch = () => (run('list').folders ?? []).find((f) => f.name === 'work')?.sessions ?? [];
run('new-agent', '--provider', 'claude', '--folder', 'work', '--name', 'Helper', '--no-kickoff');
let helper; await until(() => (helper = scratch().find((s) => s.name === 'Helper')));
check('an agent to write to, Helper, has a session', !!helper, JSON.stringify(scratch().slice(0, 4)));
const wdir = path.join(process.cwd(), 'tmp/work/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
writeFileSync(path.join(wdir, 'mail-flow.md'), '# Mail flow\n\nAsks Helper.\n\nwhen: manual\n\n## 1. Your go → you\nthen: go → Done\n');
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(1500);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Mail flow'))?.click()");
await until(() => js(`!!${V}?.querySelector('.wf-chat .composer textarea')`));
const say = (t) => js(`(() => { const ta = ${V}.querySelector('.wf-chat .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(t)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
const fromAgent = (who) => js(`[...(${V}?.querySelectorAll('.wf-chat .bubble.agent-msg') ?? [])].filter((b) => b.querySelector('small')?.textContent === 'From ${who}').map((b) => b.textContent).join(' | ')`);
await say('Ask Helper for a word. [[reply]]Asking Helper.\n\n```message-agent Helper\nAnswer with the word pong.\n```');
check('the workflow\'s chat wrote to Helper, by its name', await until(() => /agent message: "Mail flow workflow" -> "Helper": Answer with the word pong/.test(log())), log().split('\n').filter((l) => /agent (message|router)/.test(l)).slice(-3).join(' | '));
check('Helper\'s answer came back into the workflow\'s chat', await until(async () => /Answer with the word pong/.test(await fromAgent('Helper'))), await fromAgent('Helper'));
// the other way: Helper writes first, to the workflow's chat by name (the roster has it while its view is open)
run('send', '--session', helper.id, '--text', 'Write to the workflow. [[reply]]```message-agent Mail flow workflow\nA second word: ping.\n```');
check('an agent reaches the workflow\'s chat by its name', await until(async () => /A second word: ping/.test(await fromAgent('Helper'))), log().split('\n').filter((l) => /agent (message|router)/.test(l)).slice(-3).join(' | '));
check('...there, not in a second copy of its session', (await js(`[...document.querySelectorAll('.chat-host')].filter((h) => [...h.querySelectorAll('.bubble.agent-msg')].some((b) => /A second word: ping/.test(b.textContent))).length`)) === 1);
check('...and its answer went back to Helper', await until(() => /agent reply: "Mail flow workflow" -> "Helper"/.test(log())), log().split('\n').filter((l) => /agent (reply|message)/.test(l)).slice(-3).join(' | '));
done(close);
