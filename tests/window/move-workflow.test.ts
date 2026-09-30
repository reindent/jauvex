// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/move-workflow/claude MOCK_DELAY_MS=5
// A workflow moved to another folder takes its chat along (T-217; the user, 2026-09-29, of a move on a server: "The workflows were actually
// moved But the sessions of the agents were not ... the chat sessions on Claude, Codex, Grok, or whatever provider ... also need to be moved
// so that when the chat is loaded, they appear ... on the new moved workflow"). Moved by hand, its files go and its chat's session stays
// filed under the old folder: the chat opens empty (the bug, reproduced first). `move-workflow` moves the session too: the conversation is
// there in the new folder, and goes on there. An agent's session moves with `move-session`.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, existsSync, realpathSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const ROOT = process.cwd(); const A = path.join(ROOT, 'tmp/scratch'), B = path.join(ROOT, 'tmp/scratch-b'); rmSync(B, { recursive: true, force: true }); mkdirSync(B, { recursive: true });
const CLAUDE = path.join(ROOT, 'tmp/testrun/move-workflow/claude/projects'); const group = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-');
const added = run('add-folder', B); check('a second folder, scratch-b', added.ok === true, JSON.stringify(added));
mkdirSync(path.join(A, 'workflows'), { recursive: true }); writeFileSync(path.join(A, 'workflows', 'move-flow.md'), '# Move flow\n\nA flow that moves.\n\nwhen: manual\n\n## 1. Your go → you\nthen: go → Done\n');
const openFlow = async (dir) => { await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(1500);
  await js(`[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('Move flow'))?.click()`);
  return until(() => js(`${V}?.getAttribute('data-base') === ${JSON.stringify(dir)} && !!${V}.querySelector('.wf-chat .composer textarea')`)); };
const say = (t) => js(`(() => { const ta = ${V}.querySelector('.wf-chat .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(t)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
const shows = (word, who = '.assistant') => js(`[...(${V}?.querySelectorAll('.wf-chat ${who}') ?? [])].some((x) => x.textContent.includes(${JSON.stringify(word)}))`);
const chatOf = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'workflows', 'move-flow', 'chat.json'), 'utf8')); } catch { return {}; } };

check('the workflow opens in scratch', await openFlow(A));
await say('Remember the word apricot.');
check('its chat answers, and the workflow keeps its session', await until(async () => !!chatOf(A).sessionId && (await shows('apricot'))), JSON.stringify(chatOf(A)));
const sid = chatOf(A).sessionId;
// the bug: by hand, the files go, the chat's session stays filed under the old folder
const byHand = (from, to) => { mkdirSync(path.join(to, 'workflows'), { recursive: true }); renameSync(path.join(from, 'workflows', 'move-flow.md'), path.join(to, 'workflows', 'move-flow.md')); renameSync(path.join(from, 'workflows', 'move-flow'), path.join(to, 'workflows', 'move-flow')); };
byHand(A, B);
check('moved by hand, it opens in scratch-b...', await openFlow(B));
await sleep(2500);
check('...with its chat empty: its session stayed under scratch (the bug)', !(await shows('apricot')) && existsSync(path.join(CLAUDE, group(realpathSync(A)), `${sid}.jsonl`)));
byHand(B, A); await openFlow(A);
// the fix: the order moves the chat's session with it
const moved = run('move-workflow', '--workflow', 'Move flow', '--folder', 'scratch', '--to', 'scratch-b');
check('move-workflow moves it, its chat\'s session with it', moved.ok === true && /moved with it/.test(moved.chat ?? ''), JSON.stringify(moved));
check('...the files are in scratch-b, none left in scratch', existsSync(path.join(B, 'workflows', 'move-flow.md')) && chatOf(B).sessionId === sid && !existsSync(path.join(A, 'workflows', 'move-flow.md')) && !existsSync(path.join(A, 'workflows', 'move-flow')));
check('...and the session is filed under scratch-b, where Claude Code looks for it', existsSync(path.join(CLAUDE, group(B), `${sid}.jsonl`)) && !existsSync(path.join(CLAUDE, group(realpathSync(A)), `${sid}.jsonl`)));
check('opened in scratch-b, its chat has its conversation', (await openFlow(B)) && await until(() => shows('apricot')));
await say('And a second word: banana.');
check('...and goes on there: the same session, in scratch-b', await until(() => shows('banana')) && readFileSync(path.join(CLAUDE, group(B), `${sid}.jsonl`), 'utf8').includes('banana') && chatOf(B).sessionId === sid, JSON.stringify(chatOf(B)));
check('a second move to where it is is refused', run('move-workflow', '--workflow', 'Move flow', '--folder', 'scratch-b', '--to', 'scratch-b').ok === false);
// an agent's own session, moved on its own
run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Mover', '--kickoff', 'Say hello.');
const folderOf = (name) => (run('list').folders ?? []).find((f) => (f.sessions ?? []).some((s) => s.name === name))?.name;
const mover = () => (run('list').folders ?? []).flatMap((f) => (f.sessions ?? []).map((s) => ({ ...s, folder: f.name }))).find((s) => s.name === 'Mover');
check('an agent, Mover, works in scratch', await until(() => mover()?.folder === 'scratch', 30000), JSON.stringify(run('list').folders?.map((f) => [f.name, (f.sessions ?? []).map((s) => s.name)])));
await until(() => mover()?.busy === false, 20000); // its first turn over: nothing moves under a turn
const ms = run('move-session', '--session', 'Mover', '--to', 'scratch-b');
check('move-session moves it to scratch-b, where it is listed', ms.ok === true && await until(() => folderOf('Mover') === 'scratch-b', 10000), JSON.stringify(ms));
done(close);
