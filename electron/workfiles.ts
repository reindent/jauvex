// The files a project keeps beside its code, read and written by the app: boards (PROJECT.md, MARKETING.md, BOARD.md, ROADMAP.md,
// boards/*.md) and their done files (<NAME>-DONE.md), plain markdown to-do lists that agents keep and the window draws (T-171, T-174).
// The folder is the truth.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BOARD_FORMAT, BOARD_MARK, boardVersion, canWrite, doneFileOf, isDoneFile, localDay, looksLikeBoard, markDone, parseBoard, reopen, setItemStatus, taskLine, toV1, type BoardInfo } from '../shared/board.js';
import type { FolderFiles } from '../shared/types.js';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** For the briefing: what a folder holds, in a line each. */
export async function folderFiles(dir: string): Promise<FolderFiles> { const boards = await listBoards(dir).catch(() => []); return { boards: boards.map((b) => ({ file: b.file, title: b.title })) }; }
const BOARD_ROOTS = ['PROJECT.md', 'MARKETING.md', 'BOARD.md', 'ROADMAP.md'];
const MARKED = /^\s*<!--\s*boards:\s*v\d+\s*-->/;
export async function listBoards(dir: string): Promise<BoardInfo[]> {
  const files: string[] = []; for (const f of BOARD_ROOTS) if (await exists(path.join(dir, f))) files.push(f);
  try { for (const f of (await fs.readdir(path.join(dir, 'boards'))).filter((f) => f.endsWith('.md') && !isDoneFile(f)).sort()) files.push(`boards/${f}`); } catch { /* no boards folder */ }
  const out: BoardInfo[] = [];
  for (const f of files) { const md = await fs.readFile(path.join(dir, f), 'utf8').catch(() => ''); const done = await fs.readFile(path.join(dir, doneFileOf(f)), 'utf8').catch(() => '');
    const b = parseBoard(md); const items = b.sections.flatMap((s) => s.items); const shipped = parseBoard(done).sections.flatMap((s) => s.items);
    if (!looksLikeBoard(md) && !MARKED.test(md) && !shipped.length) continue; // a board whose tasks are all done is still a board
    out.push({ file: f, title: b.title, total: items.length + shipped.length, done: items.filter((i) => i.status === 'done').length + shipped.length, doing: items.filter((i) => i.status === 'doing').length }); }
  return out;
}
const boardPath = (dir: string, file: string) => { if (!/^(boards\/[^/]+\.md|[A-Z]+\.md)$/.test(file) || isDoneFile(file)) throw new Error('not a board file'); return path.join(dir, file); };
export async function readBoard(dir: string, file: string): Promise<string> { return fs.readFile(boardPath(dir, file), 'utf8'); }
/** A board and its done file ('' when it has none). */
export async function readBoardFiles(dir: string, file: string): Promise<{ md: string; done: string }> { const md = await readBoard(dir, file); const done = await fs.readFile(path.join(dir, doneFileOf(file)), 'utf8').catch(() => ''); return { md, done }; }
/** One task's status, set by rewriting the files (boards format v1): to do or doing in place; done moves it to the top of the done file with
 *  the day; a done one (where: 'done', its line in the done file) reopened goes to the top of the board's first section. The board is
 *  brought to v1 on the way; one of a newer version is refused, both files left as they were. */
export async function setBoardStatus(dir: string, file: string, line: number, status: 'todo' | 'doing' | 'done', where: 'board' | 'done' = 'board', id = ''): Promise<{ md: string; done: string }> {
  const { md, done } = await readBoardFiles(dir, file);
  for (const t of [md, done]) if (!canWrite(t)) throw new Error(`This board uses boards format v${boardVersion(t)}, newer than this app knows (v${BOARD_FORMAT}): update Jauvex to change it here.`);
  // the task the click meant, found again by its id: the view reads the files every few seconds, and an agent may have moved lines since
  const at = taskLine(where === 'done' ? done : md, line, id); if (at < 0) throw new Error(`${id} is not where it was: the board changed since it was shown. Try again.`);
  const wasDone = parseBoard(md).sections.flatMap((s) => s.items).find((i) => i.line === at)?.status === 'done'; // an [x] still on a board from before v1
  const next = where === 'done' ? (status === 'done' ? toV1(md, done) : reopen(md, done, at, 'done'))
    : status === 'done' ? markDone(md, done, at, localDay()) : wasDone && status === 'todo' ? reopen(md, done, at, 'board') : toV1(setItemStatus(md, at, status), done);
  await fs.writeFile(boardPath(dir, file), next.md); if (next.done !== done) await fs.writeFile(path.join(dir, doneFileOf(file)), next.done);
  return next;
}
/** A board deleted, with its done file (the window asks first); nothing but a board: a done file or any other path is refused. */
export async function deleteBoard(dir: string, file: string): Promise<void> { const f = boardPath(dir, file); await fs.rm(path.join(dir, doneFileOf(file)), { force: true }); await fs.rm(f, { force: true }); }
/** A new board from the app's template: the format every board follows, so every board looks and works the same. */
export async function newBoard(dir: string, name: string): Promise<string> {
  const s = slug(name); await fs.mkdir(path.join(dir, 'boards'), { recursive: true }); const file = path.join(dir, 'boards', `${s}.md`); if (await exists(file)) return `boards/${s}.md`;
  await fs.writeFile(file, `${BOARD_MARK}\n# ${name}\n\nThe single source of truth for this board: the markdown is the database, git is the history.\nFormat (boards v1): \`## <Section>\` headings; items as \`- [ ] **T-01 · Title** — body\`. Glyphs: \`[ ]\` to do, \`[~]\` doing.\nA done task leaves this file for the top of ${s}-DONE.md beside it, "— shipped <date> (<commit>)", in the same commit. Ids are stable, never renumber.\n\n## P0 — now\n\n- [ ] **T-01 · The first thing** — what it is and why it matters.\n\n## P1 — next\n\n## P2 — later\n`);
  return `boards/${s}.md`;
}
