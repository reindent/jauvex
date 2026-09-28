// A session whose first message starts with a tag is left out by Claude Code: its listing and getSessionInfo do not see it, though its
// messages read as any other's. A Jev trainer's chat is such a session (the app's context goes first: <jev-agent-context>), and its history
// was lost at a reload: "Session not found for this folder" (T-182). The app reads it anyway, stamped by the file's own time.
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'; import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const data = process.env.CVC_DATA_DIR ?? path.resolve('tmp/testdata');
const cfg = path.join(data, 'tagged-claude'); const made = path.join(data, 'tagged-folder'); rmSync(cfg, { recursive: true, force: true }); mkdirSync(made, { recursive: true });
const folder = realpathSync(made); const sub = path.join(cfg, 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-')); mkdirSync(sub, { recursive: true });
const id = '21111111-2222-4333-8444-555555555555'; const now = new Date().toISOString();
writeFileSync(path.join(sub, `${id}.jsonl`), [
  JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, sessionId: id, cwd: folder, timestamp: now, message: { role: 'user', content: '<jev-agent-context>\nYou train one Jev agent.\n</jev-agent-context>\nMake it stricter, please.' } }),
  JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', sessionId: id, cwd: folder, timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'Tightened the question.' }] } }),
].join('\n') + '\n');
process.env.CLAUDE_CONFIG_DIR = cfg; // the SDK reads it once per process: set before it loads
const { getSessionInfo } = await import('@anthropic-ai/claude-agent-sdk');
check('Claude Code does not see a session whose first message starts with a tag (the cause)', (await getSessionInfo(id, { dir: folder })) == null);
const { backend } = await import('../electron/backend.ts');
const p = await backend.addProject(folder) as { id: string };
const page = await backend.messages(p.id, id).catch((e: Error) => ({ messages: [] as any[], error: e.message }));
const text = page.messages.map((m) => m.blocks.map((b: any) => (b.type === 'text' ? b.text : '')).join('')).join(' | ');
check('the app reads its messages anyway: the words and the answer', page.messages.length === 2 && /Make it stricter/.test(text) && /Tightened the question/.test(text), JSON.stringify(page).slice(0, 300));
const gone = await backend.messages(p.id, '31111111-2222-4333-8444-555555555555').then(() => '', (e: Error) => e.message);
check('a session that is not there at all is still "not found"', /Session not found for this folder/.test(gone), gone);
rmSync(cfg, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
