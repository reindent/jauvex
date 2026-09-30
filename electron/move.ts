// A session moved to another folder, where its provider files it (T-217; the user, 2026-09-29, of a workflow moved from one folder to
// another on a server: "The workflows were actually moved But the sessions of the agents were not ... the chat sessions on Claude,
// Codex, Grok, or whatever provider ... also need to be moved so that when the chat is loaded, they appear ... on the new moved
// workflow"). Every provider keeps a session under the folder it works in, each its own way:
//   Claude Code  <CLAUDE_CONFIG_DIR or ~/.claude>/projects/<the folder, every character but a letter or a digit a dash>/<id>.jsonl, and
//                a folder <id>/ beside it (its subagents' transcripts, long tool results); every line names its working folder (cwd).
//   Grok         <GROK_HOME or ~/.grok>/sessions/<the folder, URL-encoded>/<id>/ (Grok's own guide, "Storage Layout" in 17-sessions.md;
//                a name past 255 bytes is a slug and a hash with the folder in a .cwd file).
//   Codex        the thread's settings: a resume in the new folder records it there (codex.ts, moveThread).
// Nothing is copied twice: the files move, their working folder rewritten, and a move already made is not an error.
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const claudeRoot = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
const grokRoot = () => path.join(process.env.GROK_HOME || path.join(os.homedir(), '.grok'), 'sessions');
/** Claude Code's name for a folder's sessions (past 200 characters it adds a hash of its own: such a folder is refused). */
export const claudeGroup = (dir: string): string => dir.replace(/[^a-zA-Z0-9]/g, '-');
/** Grok's name for a folder's sessions: the path URL-encoded, letters, digits and -_.~ kept. */
export const grokGroup = (dir: string): string => [...Buffer.from(dir, 'utf8')].map((b) => { const c = String.fromCharCode(b); return /[A-Za-z0-9\-_.~]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`; }).join('');

/** A path in the old folder, as it is in the new one; any other path as it is. */
const within = (p: string, from: string, to: string): string => (p === from ? to : p.startsWith(from + path.sep) ? to + p.slice(from.length) : p);
/** A Claude Code transcript with its working folder moved: each line that names it (a line that is not JSON stays as it is). */
export const movedLines = (text: string, from: string, to: string): string => text.split('\n').map((line) => {
  if (!line.includes('"cwd"')) return line;
  try { const o = JSON.parse(line) as { cwd?: unknown }; if (typeof o.cwd !== 'string') return line; const cwd = within(o.cwd, from, to); return cwd === o.cwd ? line : JSON.stringify({ ...o, cwd }); } catch { return line; }
}).join('\n');
const files = async (dir: string): Promise<string[]> => { const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...(await files(p))); else out.push(p); } return out; };
/** A transcript rewritten in place of another, its time kept (the session keeps its place among the folder's). */
async function rewrite(src: string, dst: string, from: string, to: string): Promise<void> {
  const st = await fs.stat(src); const tmp = `${dst}.moving`; await fs.writeFile(tmp, movedLines(await fs.readFile(src, 'utf8'), from, to)); await fs.rename(tmp, dst);
  await fs.utimes(dst, st.atime, st.mtime).catch(() => { /* a new time only reorders the list */ });
}

export async function moveClaudeSession(sessionId: string, from: string, to: string): Promise<void> {
  if (!/^[\w-]{8,}$/.test(sessionId)) throw new Error('not a Claude session id');
  // Claude Code files a session by the folder's real path, and names that path on its lines: a folder reached through a symlink is its
  // target's (T-235: a move from a symlinked folder found no session). The folder as given is still looked in first.
  const rf = await fs.realpath(from).catch(() => from), rt = await fs.realpath(to).catch(() => to); const root = claudeRoot();
  const a = existsSync(path.join(root, claudeGroup(from), `${sessionId}.jsonl`)) ? claudeGroup(from) : claudeGroup(rf), b = claudeGroup(rt);
  if (a.length > 200 || b.length > 200) throw new Error('Claude Code names a folder with a path this long its own way: this session cannot be moved');
  const src = path.join(root, a, `${sessionId}.jsonl`), dst = path.join(root, b, `${sessionId}.jsonl`);
  if (!existsSync(src)) { if (existsSync(dst)) return; throw new Error(`Claude Code has no session ${sessionId} in ${from}`); }
  if (existsSync(dst)) throw new Error(`Claude Code already has a session ${sessionId} in ${to}`);
  await fs.mkdir(path.dirname(dst), { recursive: true }); await rewrite(src, dst, rf, rt); await fs.rm(src, { force: true });
  const side = path.join(root, a, sessionId), there = path.join(root, b, sessionId); // its subagents' transcripts and long tool results
  if (existsSync(side) && !existsSync(there)) { await fs.rename(side, there); for (const f of await files(there)) if (f.endsWith('.jsonl')) await rewrite(f, f, rf, rt); }
}

export async function moveGrokSession(sessionId: string, from: string, to: string): Promise<void> {
  if (!/^[\w-]{8,}$/.test(sessionId)) throw new Error('not a Grok session id');
  const root = grokRoot(); const groups = await fs.readdir(root).catch(() => [] as string[]);
  const folderOf = async (g: string): Promise<string> => { try { return (await fs.readFile(path.join(root, g, '.cwd'), 'utf8')).trim(); } catch { try { return decodeURIComponent(g); } catch { return ''; } } };
  const named = async (dir: string) => { for (const g of groups) if ((await folderOf(g)) === dir) return g; return null; };
  const a = await named(from); const src = a ? path.join(root, a, sessionId) : '';
  let b = await named(to);
  if (!src || !existsSync(src)) { if (b && existsSync(path.join(root, b, sessionId))) return; throw new Error(`Grok has no session ${sessionId} in ${from}`); }
  if (!b) { b = grokGroup(to); if (Buffer.byteLength(b) > 255) throw new Error('Grok names a folder with a path this long its own way: this session cannot be moved'); }
  const dst = path.join(root, b, sessionId); if (existsSync(dst)) throw new Error(`Grok already has a session ${sessionId} in ${to}`);
  await fs.mkdir(path.join(root, b), { recursive: true }); await fs.rename(src, dst);
}
