// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/board-chat-mail/claude MOCK_DELAY_MS=5
// A board's chat writes to the app's agents and hears back (T-205, as a workflow's): the router hears a chat under a view, knows it by name
// ("<board> board", in the roster while its view is open), and delivers to it there, never to a second copy of its session. (The stand-in
// answers a message ending in [[reply]] with the words after it: here, a message block.)
import { connect, sleep, check, done, V, useWork } from './lib.ts';
import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const run = (...args: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } };
const scratch = () => (run('list').folders ?? []).find((f: any) => f.name === 'work')?.sessions ?? [];
run('new-agent', '--provider', 'claude', '--folder', 'work', '--name', 'Helper', '--no-kickoff');
let helper: any; await until(() => (helper = scratch().find((s: any) => s.name === 'Helper')));
check('an agent to write to, Helper, has a session', !!helper, JSON.stringify(scratch().slice(0, 4)));
const bdir = path.join(process.cwd(), 'tmp/work/boards'); mkdirSync(bdir, { recursive: true });
writeFileSync(path.join(bdir, 'launch.md'), '<!-- boards: v1 -->\n# Launch\n\n## P0 — now\n\n- [ ] **T-01 · Write the plan** — first.\n');
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(1500);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.querySelector('.row-title')?.textContent === 'Launch')?.click()");
await until(() => js(`!!${V}?.querySelector('.board-chat .composer textarea')`));
const say = (t: string) => js(`(() => { const ta = ${V}.querySelector('.board-chat .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(t)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
const fromAgent = (who: string) => js(`[...(${V}?.querySelectorAll('.board-chat .bubble.agent-msg') ?? [])].filter((b) => b.querySelector('small')?.textContent === 'From ${who}').map((b) => b.textContent).join(' | ')`);
await say('Ask Helper for a word. [[reply]]Asking Helper.\n\n```message-agent Helper\nAnswer with the word pong.\n```');
check('the board\'s chat wrote to Helper, by its name', await until(() => /agent message: "Launch board" -> "Helper": Answer with the word pong/.test(log())), log().split('\n').filter((l) => /agent (message|router)/.test(l)).slice(-3).join(' | '));
check('Helper\'s answer came back into the board\'s chat', await until(async () => /Answer with the word pong/.test(await fromAgent('Helper'))), await fromAgent('Helper'));
// the other way: Helper writes first, to the board's chat by name (the roster has it while its view is open)
run('send', '--session', helper.id, '--text', 'Write to the board. [[reply]]```message-agent Launch board\nA second word: ping.\n```');
check('an agent reaches the board\'s chat by its name', await until(async () => /A second word: ping/.test(await fromAgent('Helper'))), log().split('\n').filter((l) => /agent (message|router)/.test(l)).slice(-3).join(' | '));
check('...there, not in a second copy of its session', (await js(`[...document.querySelectorAll('.chat-host')].filter((h) => [...h.querySelectorAll('.bubble.agent-msg')].some((b) => /A second word: ping/.test(b.textContent))).length`)) === 1);
check('...and its answer went back to Helper', await until(() => /agent reply: "Launch board" -> "Helper"/.test(log())), log().split('\n').filter((l) => /agent (reply|message)/.test(l)).slice(-3).join(' | '));
done(close);
