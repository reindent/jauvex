// A chat the app keeps its own copy of (the Jauvex agent's) reaches back past that copy into the agent's own session (T-272, from the other
// edition's fix; the user, 2026-10-01, of an agent there: "the workspace agent chat history is cut. There's not even a load earlier
// messages": saves that overlapped had left its copy with its last 12 messages, its session with the whole conversation). Here a plain
// Claude session of ten messages, read before the first of the ids a copy holds, a page at a time.
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'; import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const cfg = path.join(process.env.CVC_DATA_DIR!, 'before-claude'); const made = path.join(process.env.CVC_DATA_DIR!, 'before-folder'); rmSync(cfg, { recursive: true, force: true }); mkdirSync(made, { recursive: true });
const folder = realpathSync(made); const sub = path.join(cfg, 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-')); mkdirSync(sub, { recursive: true });
const id = '51111111-2222-4333-8444-555555555555'; const at = { sessionId: id, cwd: folder, timestamp: new Date().toISOString(), isSidechain: false };
const user = (uuid: string, parentUuid: string | null, text: string) => ({ type: 'user', uuid, parentUuid, ...at, message: { role: 'user', content: text } });
const said = (uuid: string, parentUuid: string, text: string) => ({ type: 'assistant', uuid, parentUuid, ...at, message: { role: 'assistant', content: [{ type: 'text', text }] } });
const lines: object[] = []; let parent: string | null = null; for (let i = 1; i <= 5; i++) { lines.push(user(`u${i}`, parent, `Question ${i}`), said(`a${i}`, `u${i}`, `Answer ${i}`)); parent = `a${i}`; }
writeFileSync(path.join(sub, `${id}.jsonl`), lines.map((e) => JSON.stringify(e)).join('\n') + '\n');
process.env.CLAUDE_CONFIG_DIR = cfg; // the SDK reads it once per process: set before it loads
const { backend } = await import('../electron/backend.ts');
const p = await backend.addProject(folder) as { id: string };
const ids = (ms: { uuid: string }[]) => ms.map((m) => m.uuid).join(' ');
const cut = await backend.sessionBefore(p.id, id, ['jx-1', 'a5', 'jx-2']); // a copy cut to its last messages: the person's words under the app's own ids, then a5
check("the session's messages before the first one a copy holds: all nine, none left", ids(cut.messages) === 'u1 a1 u2 a2 u3 a3 u4 a4 u5' && cut.left === 0, `${ids(cut.messages)} / ${cut.left}`);
const p1 = await backend.sessionBefore(p.id, id, ['a5'], 4); const p2 = await backend.sessionBefore(p.id, id, [p1.messages[0]!.uuid], 4); const p3 = await backend.sessionBefore(p.id, id, [p2.messages[0]!.uuid], 4);
check('a page at a time, from the copy\'s start back, each saying how many are left', ids(p1.messages) === 'a3 u4 a4 u5' && p1.left === 5 && ids(p2.messages) === 'a1 u2 a2 u3' && p2.left === 1 && ids(p3.messages) === 'u1' && p3.left === 0,
  JSON.stringify([ids(p1.messages), p1.left, ids(p2.messages), p2.left, ids(p3.messages), p3.left]));
const whole = await backend.sessionBefore(p.id, id, ['u1', 'a1']); const other = await backend.sessionBefore(p.id, id, ['jx-1', 'from-another-session']);
check("a copy that starts where the session starts has nothing before it; one with none of the session's ids gets nothing (nothing is guessed)", whole.messages.length === 0 && whole.left === 0 && other.messages.length === 0 && other.left === 0, `${ids(whole.messages)} / ${ids(other.messages)}`);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
