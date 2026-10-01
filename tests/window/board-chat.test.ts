// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/board-chat/claude CODEX_HOME=__ROOT__/tmp/testrun/board-chat/codex MOCK_DELAY_MS=5
// A board's own chat (T-199, asked for 2026-09-28: a way to talk to a board, as to a Jev agent). Under the board: a session of its own, told
// on every message what the board is now (the stand-in quotes both ends of what it got: the board's context, then the words); the thread
// shows the words, never the context; the session is kept for the board, and the conversation is still there after a reload.
import { connect, sleep, check, done, V, useWork } from './lib.ts';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
await useWork(js); // a folder of this edition's own for workflows and boards (tmp/work)
const bdir = path.join(process.cwd(), 'tmp/work/boards'); rmSync(bdir, { recursive: true, force: true }); mkdirSync(bdir, { recursive: true });
writeFileSync(path.join(bdir, 'launch.md'), '<!-- boards: v1 -->\n# Launch\n\n## P0 — now\n\n- [ ] **T-01 · Write the plan** — first.\n');
const until = async (f: () => Promise<boolean>, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const chats = () => { try { return JSON.parse(readFileSync(path.join(process.env.CVC_DATA_DIR!, 'state.json'), 'utf8')).projects.find((p) => p.name === 'work')?.boardChats ?? {}; } catch { return {}; } };
const openBoard = async () => { await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await until(() => js("[...document.querySelectorAll('.row')].some((r) => r.querySelector('.row-title')?.textContent === 'Launch')")); await js("[...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-title')?.textContent === 'Launch').click()"); };
await openBoard();
check('a board shows its chat under it', await until(() => js(`${V}?.querySelector('.board-chat header b')?.textContent === 'Talk to this board' && !!${V}.querySelector('.board-view .board')`)), await js(`${V}?.textContent.slice(0, 200) ?? ''`));
await js(`(() => { const ta = ${V}.querySelector('.board-chat .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'Add a task for the launch video.'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
const answer = () => js(`[...${V}.querySelectorAll('.board-chat .assistant')].map((x) => x.textContent).join(' | ')`);
check('its agent answers, told what the board is (the context went first) and what was said', await until(async () => /You are the assistant of one board/.test(await answer()) && /launch video/.test(await answer())), await answer());
check('the thread shows the words, never the board sent along', await js(`[...${V}.querySelectorAll('.board-chat .user')].some((x) => x.textContent.includes('Add a task for the launch video')) && ![...${V}.querySelectorAll('.board-chat .user')].some((x) => /board-context|You are the assistant/.test(x.textContent))`));
check('its session is kept for the board, in the app\'s state', await until(async () => !!chats()['boards/launch.md']?.sessionId), JSON.stringify(chats()));
await js('location.reload()'); await sleep(4000); await openBoard();
check('after a reload the conversation is still there', await until(() => js(`[...(${V}?.querySelectorAll('.board-chat .user') ?? [])].some((x) => x.textContent.includes('Add a task for the launch video'))`)), await js(`${V}?.querySelector('.board-chat')?.textContent.slice(0, 200) ?? 'no chat'`));
rmSync(bdir, { recursive: true, force: true });
done(close);
