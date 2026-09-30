// env: CVC_CODEX_BIN=__ROOT__/tests/mock/codex
// A session moved to another folder, where its provider files it (T-217; the user, 2026-09-29, of a workflow moved from one folder to
// another on a server: "The workflows were actually moved But the sessions of the agents were not ... the chat sessions on Claude, Codex,
// Grok, or whatever provider ... also need to be moved so that when the chat is loaded, they appear ... on the new moved workflow").
// Claude Code's files, read back by its own SDK; Grok's, named as Grok 1.0.44 named a folder in a probe; a Codex thread through the
// stand-in, which records a resume's folder as Codex 0.155.1 did in a probe (a thread_settings_applied line, read back in the new folder).
import path from 'node:path'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
const T = path.join(process.env.CVC_DATA_DIR, 'move'); fs.rmSync(T, { recursive: true, force: true });
process.env.CLAUDE_CONFIG_DIR = path.join(T, 'claude'); process.env.GROK_HOME = path.join(T, 'grok'); process.env.CODEX_HOME = path.join(T, 'codex');
const A = path.join(T, 'folder a'), B = path.join(T, 'folder-b'); for (const d of [A, B]) fs.mkdirSync(d, { recursive: true });
const { claudeGroup, grokGroup, movedLines, moveClaudeSession, moveGrokSession } = await import('../electron/move.ts');
const { listSessions, getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const threw = async (f: () => Promise<unknown>) => { try { await f(); return ''; } catch (e) { return (e as Error).message; } };

// Claude Code: <config>/projects/<the folder, dashed>/<id>.jsonl, a folder beside it, the working folder on every line
const sid = randomUUID(); const projects = path.join(T, 'claude', 'projects'); const inA = path.join(projects, claudeGroup(A)); fs.mkdirSync(path.join(inA, sid, 'subagents'), { recursive: true });
const at = (cwd: string) => ({ sessionId: sid, cwd, timestamp: new Date().toISOString(), isSidechain: false, userType: 'external', version: 'test' });
fs.writeFileSync(path.join(inA, `${sid}.jsonl`), [{ type: 'user', uuid: 'u1', parentUuid: null, ...at(A), message: { role: 'user', content: 'Run the flow, please.' } },
  { type: 'assistant', uuid: 'a1', parentUuid: 'u1', ...at(path.join(A, 'sub')), message: { role: 'assistant', content: [{ type: 'text', text: 'Done: it ran.' }] } }].map((e) => JSON.stringify(e)).join('\n') + '\n');
fs.writeFileSync(path.join(inA, sid, 'subagents', 'agent-1.jsonl'), `${JSON.stringify({ type: 'user', uuid: 's1', parentUuid: null, ...at(A), isSidechain: true, message: { role: 'user', content: 'look' } })}\n`);
const old = new Date('2026-09-01T10:00:00Z'); fs.utimesSync(path.join(inA, `${sid}.jsonl`), old, old);
const listed = async (dir: string) => (await listSessions({ dir })).some((s) => s.sessionId === sid);
check('Claude Code lists the session in its folder', await listed(A));
await moveClaudeSession(sid, A, B);
check('...moved, Claude Code lists it in the new folder, with its conversation', await listed(B) && (await getSessionMessages(sid, { dir: B })).length === 2, JSON.stringify(await getSessionMessages(sid, { dir: B }).catch((e: Error) => e.message)).slice(0, 200));
check('...and no longer in the old one', !(await listed(A)) && !fs.existsSync(path.join(inA, `${sid}.jsonl`)));
const lines = fs.readFileSync(path.join(projects, claudeGroup(B), `${sid}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { cwd: string });
check('its lines name the new folder, a folder inside the old one the same folder inside the new one', lines[0]!.cwd === B && lines[1]!.cwd === path.join(B, 'sub'), lines.map((l) => l.cwd).join(' | '));
const side = path.join(projects, claudeGroup(B), sid, 'subagents', 'agent-1.jsonl');
check('what Claude Code keeps beside it (its subagents) moved with it, naming the new folder', fs.existsSync(side) && (JSON.parse(fs.readFileSync(side, 'utf8')) as { cwd: string }).cwd === B && !fs.existsSync(path.join(inA, sid)));
check('it keeps its time: it stays where it was among the folder\'s sessions', fs.statSync(path.join(projects, claudeGroup(B), `${sid}.jsonl`)).mtimeMs === old.getTime());
// a folder reached through a symlink (T-235): Claude Code files its sessions under the real path; the move finds them there, and files them
// where the new folder's real path says
{ const real = path.join(T, 'real folder'); fs.mkdirSync(real, { recursive: true }); const link = path.join(T, 'linked'); fs.symlinkSync(real, link);
  const lid = randomUUID(); const rdir = path.join(T, 'claude', 'projects', claudeGroup(fs.realpathSync(real))); fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, `${lid}.jsonl`), JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, sessionId: lid, cwd: fs.realpathSync(real), timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello from a linked folder' } }) + '\n');
  let err = ''; await moveClaudeSession(lid, link, B).catch((e: Error) => { err = e.message; });
  const moved = path.join(T, 'claude', 'projects', claudeGroup(fs.realpathSync(B)), `${lid}.jsonl`);
  check('a session of a folder reached through a symlink moves: found under the real path, filed under the new one\'s', !err && fs.existsSync(moved) && !fs.existsSync(path.join(rdir, `${lid}.jsonl`)) && fs.readFileSync(moved, 'utf8').includes(`"cwd":${JSON.stringify(fs.realpathSync(B))}`), err); }
check('a move made already is no error; a session that is nowhere is one', (await threw(() => moveClaudeSession(sid, A, B))) === '' && /no session/.test(await threw(() => moveClaudeSession(randomUUID(), A, B))));
check('a line that is not JSON, or that names another folder, stays as it was', movedLines(`not json\n{"cwd":"/elsewhere","x":1}\n{"cwd":"${A}x"}`, A, B) === `not json\n{"cwd":"/elsewhere","x":1}\n{"cwd":"${A}x"}`);

// Grok: <GROK_HOME>/sessions/<the folder, URL-encoded>/<id>/, or a group with a .cwd file for a long path
check('Grok\'s name for a folder, as Grok 1.0.44 named one', grokGroup('/Users/someone/Code/acme/grok-move/a') === '%2FUsers%2Fsomeone%2FCode%2Facme%2Fgrok-move%2Fa' && grokGroup('/x/folder a') === '%2Fx%2Ffolder%20a');
const gid = randomUUID(); const sessions = path.join(T, 'grok', 'sessions'); fs.mkdirSync(path.join(sessions, grokGroup(A), gid), { recursive: true });
fs.writeFileSync(path.join(sessions, grokGroup(A), gid, 'summary.json'), '{"title":"a chat"}'); fs.writeFileSync(path.join(sessions, grokGroup(A), gid, 'updates.jsonl'), '{}\n');
await moveGrokSession(gid, A, B);
check('a Grok session moves to the new folder\'s place, all its files', fs.existsSync(path.join(sessions, grokGroup(B), gid, 'updates.jsonl')) && !fs.existsSync(path.join(sessions, grokGroup(A), gid)));
const long = path.join(T, 'x'.repeat(260)); const slug = 'long-folder-1a2b3c'; fs.mkdirSync(path.join(sessions, slug, gid + '0'), { recursive: true }); fs.writeFileSync(path.join(sessions, slug, '.cwd'), long);
await moveGrokSession(gid + '0', long, B);
check('...found by its .cwd when Grok named the folder a slug (a path past 255 bytes)', fs.existsSync(path.join(sessions, grokGroup(B), gid + '0')));
check('...and a move to a folder that long with no place of its own yet is refused, nothing moved', /cannot be moved/.test(await threw(() => moveGrokSession(gid, B, path.join(T, 'y'.repeat(260))))) && fs.existsSync(path.join(sessions, grokGroup(B), gid)));

// Codex: the thread resumed in the new folder, then listed there
const codex = await import('../electron/codex.ts');
const tid = randomUUID(); const now = Math.floor(Date.now() / 1000); fs.mkdirSync(path.join(T, 'codex', 'mock-threads'), { recursive: true });
fs.writeFileSync(path.join(T, 'codex', 'mock-threads', `${tid}.json`), JSON.stringify({ thread: { id: tid, preview: 'hello', name: 'Flow chat', createdAt: now, updatedAt: now, cwd: A, gitInfo: null, modelProvider: 'mock' },
  items: [{ turnId: 't1', item: { type: 'userMessage', id: 'i1', content: [{ type: 'text', text: 'hello' }] } }], approvalPolicy: 'untrusted', sandbox: { type: 'readOnly', networkAccess: false } }));
const inCodex = async (dir: string) => (await codex.listSessions(dir)).some((s) => s.sessionId === tid);
check('Codex lists the thread in its folder', await inCodex(A));
await codex.moveThread(tid, B);
check('...moved, in the new folder and no longer in the old one', (await inCodex(B)) && !(await inCodex(A)));
codex.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
