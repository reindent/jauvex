// A board is a markdown file (PROJECT.md, MARKETING.md, BOARD.md, ROADMAP.md, boards/*.md) in a project folder: `## Section` headings, items as
// `- [ ] **T-01 · Title** — body` (glyph: [ ] to do, [~] doing), continuation lines indented. Parsed here for the window and the main
// process; the file stays the only source of truth. Boards format v1 (T-173, T-174): the version line first; a done item leaves the board
// for the top of its done file, <NAME>-DONE.md beside it, with the day it shipped; a reopened one goes back to the top of the first section.

export type BoardItem = { status: 'todo' | 'doing' | 'done'; id: string; title: string; body: string; line: number };
export type BoardSection = { title: string; note: string; items: BoardItem[] };
export type Board = { title: string; sections: BoardSection[]; version: number };
// The boards format has a version (T-173): a board's first line says which, `<!-- boards: v1 -->` (hidden when the markdown is shown, and
// intro prose to any parser). A board without it is v1, what every board was before the line existed, and gets it when the app writes it.
// A board of a newer version than this code knows is shown but never rewritten: an older copy must not damage a newer board.
export const BOARD_FORMAT = 1;
export const BOARD_MARK = `<!-- boards: v${BOARD_FORMAT} -->`;
const MARK = /^<!--\s*boards:\s*v(\d+)\s*-->\s*$/;
/** The format version a board declares on its first line (blank lines before it allowed); 1 when it declares none. */
export function boardVersion(md: string): number { const first = md.split('\n').find((l) => l.trim()); const m = first ? MARK.exec(first.trim()) : null; return m ? Number(m[1]) : 1; }
/** This code may rewrite the board: its version is one it knows. */
export const canWrite = (md: string): boolean => boardVersion(md) <= BOARD_FORMAT;
/** The board with its version line first, added when it has none. */
export const withMark = (md: string): string => (MARK.test((md.split('\n').find((l) => l.trim()) ?? '').trim()) ? md : `${BOARD_MARK}\n${md}`);
/** What the sidebar shows for a board. */
export type BoardInfo = { file: string; title: string; total: number; done: number; doing: number };

const ITEM = /^- \[( |~|x)\]\s+(?:\*\*(?:([A-Z]+-\d+)\s*·\s*)?(.*?)\*\*)?\s*(?:—\s*)?(.*)$/;

export function parseBoard(md: string): Board {
  const lines = md.split('\n'); let title = 'Board'; const sections: BoardSection[] = []; let cur: BoardSection | null = null; let item: BoardItem | null = null;
  lines.forEach((line, i) => {
    const h1 = /^#\s+(.*)/.exec(line); if (h1 && !cur) { title = h1[1]!.trim(); return; }
    const h2 = /^##\s+(.*)/.exec(line); if (h2) { cur = { title: h2[1]!.trim(), note: '', items: [] }; sections.push(cur); item = null; return; }
    if (!cur) return;
    const it = ITEM.exec(line);
    if (it) { item = { status: it[1] === 'x' ? 'done' : it[1] === '~' ? 'doing' : 'todo', id: it[2] ?? '', title: (it[3] ?? '').trim() || it[4]!.trim(), body: it[3] ? it[4]!.trim() : '', line: i }; cur.items.push(item); return; }
    if (/^\s+\S/.test(line) && item) { item.body = `${item.body} ${line.trim()}`.trim(); return; }
    if (!line.trim()) { item = null; return; }
    if (!cur.items.length && !item) cur.note = `${cur.note} ${line.trim()}`.trim();
  });
  return { title, sections, version: boardVersion(md) };
}

/** Does this markdown look like a board at all (a section with at least one checkbox item)? */
export const looksLikeBoard = (md: string): boolean => parseBoard(md).sections.some((s) => s.items.length > 0);

/** The same markdown with one item's glyph changed: the file stays the truth, this is how a status is set from the window. */
export function setItemStatus(md: string, line: number, status: BoardItem['status']): string {
  const lines = md.split('\n'); const glyph = status === 'done' ? 'x' : status === 'doing' ? '~' : ' ';
  if (lines[line] && ITEM.test(lines[line]!)) lines[line] = lines[line]!.replace(/^- \[( |~|x)\]/, `- [${glyph}]`);
  return lines.join('\n');
}

/** The board's own numbering: the next free id with the same prefix as the others (T-12 after T-11), across the board and its done file. */
export function nextId(board: Board, prefix = 'T', done?: Board): string { const nums = [board, ...(done ? [done] : [])].flatMap((b) => b.sections.flatMap((s) => s.items.map((i) => Number((new RegExp(`^${prefix}-(\\d+)$`).exec(i.id) ?? [])[1] ?? 0)))); return `${prefix}-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`; }

/** The line of the task a click meant: the line it was shown at when the id still matches there, else the line that task has now (an agent
 *  may have edited the board since it was drawn); -1 when it is gone. No id (an item without one): the line as given. */
export function taskLine(md: string, line: number, id = ''): number {
  if (!id) return line; const items = parseBoard(md).sections.flatMap((s) => s.items);
  return items.some((i) => i.line === line && i.id === id) ? line : (items.find((i) => i.id === id)?.line ?? -1);
}
/** The day on this computer, YYYY-MM-DD (not UTC's, which is tomorrow in the evening west of Greenwich). */
export const localDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- done items (boards format v1, T-174): the file beside the board, newest first; the board keeps only what is not done.
/** A board's done file: PROJECT.md → PROJECT-DONE.md, boards/x.md → boards/x-DONE.md (the name such archives already had). Never a board. */
export const doneFileOf = (file: string): string => file.replace(/\.md$/, '-DONE.md');
export const isDoneFile = (file: string): boolean => /-DONE\.md$/.test(file);
const DATE_TAIL = /\s*(?:—|–|-)\s*(?:shipped\s+)?\d{4}-\d{2}-\d{2}(?:\s*\([^)]*\))?\s*$/;
const emptyDone = (title: string) => `${BOARD_MARK}\n# ${title} · Done\n\nArchive of the board's finished tasks, newest first.\n\n## Done\n`;
/** An item's lines: its own and its indented continuation lines, [start, end). */
const blockAt = (lines: string[], line: number): [number, number] => { let e = line + 1; while (e < lines.length && /^\s+\S/.test(lines[e]!)) e++; return [line, e]; };
const isItem = (l: string) => ITEM.test(l);
/** Lines put at the top of the section whose heading is at h: before its first item, or under its heading and note. */
function putTop(lines: string[], h: number, block: string[]): void {
  let j = h + 1; while (j < lines.length && !/^##\s/.test(lines[j]!) && !isItem(lines[j]!)) j++;
  if (j < lines.length && isItem(lines[j]!)) { lines.splice(j, 0, ...block); return; }
  let k = h + 1; while (k < lines.length && !/^##\s/.test(lines[k]!) && lines[k]!.trim()) k++; // past the note
  lines.splice(k, 0, '', ...block);
}
/** Items put at the top of a done file (made when there is none). */
function toDoneTop(done: string, title: string, blocks: string[][]): string {
  if (!blocks.length) return done; const lines = withMark(done.trim() ? done : emptyDone(title)).split('\n');
  let h = lines.findIndex((l) => /^##\s/.test(l)); if (h < 0) { lines.push('', '## Done'); h = lines.length - 1; }
  putTop(lines, h, blocks.flat()); return lines.join('\n');
}
/** A board brought to v1 with its done file: the version line first, and every [x] item on it (a Done section's, or any other) moved as it
 *  is, in its order, to the top of the done file; a section left with nothing but done items goes, heading and all, when it is a Done one. */
export function toV1(md: string, done: string): { md: string; done: string } {
  const title = parseBoard(md).title; const lines = md.split('\n'); const moved: string[][] = [];
  for (let i = 0; i < lines.length; i++) { const m = /^- \[x\]/.exec(lines[i]!); if (!m) continue; const [a, b] = blockAt(lines, i); moved.push(lines.splice(a, b - a)); i = a - 1; }
  for (let i = lines.length - 1; i >= 0; i--) { if (!/^##\s+Done\b/i.test(lines[i]!)) continue; let e = i + 1; while (e < lines.length && !/^##\s/.test(lines[e]!)) e++; if (!lines.slice(i + 1, e).some(isItem)) { lines.splice(i, e - i); while (i > 0 && i <= lines.length && !lines[i - 1]!.trim() && !(lines[i] ?? '').trim()) lines.splice(i - 1, 1); } }
  return { md: withMark(lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n')), done: toDoneTop(done, title, moved) };
}
/** The item at `line` of the board, done: out of the board, at the top of the done file, "— shipped <date>" (the board brought to v1 on the way). */
export function markDone(md: string, done: string, line: number, date: string): { md: string; done: string } {
  const lines = md.split('\n'); if (!isItem(lines[line] ?? '')) return toV1(md, done);
  const [a, b] = blockAt(lines, line); const block = lines.splice(a, b - a);
  block[0] = block[0]!.replace(/^- \[( |~|x)\]/, '- [x]'); if (!DATE_TAIL.test(block[block.length - 1]!)) block[block.length - 1] = `${block[block.length - 1]!.replace(/\s+$/, '')} — shipped ${date}`;
  const v1 = toV1(lines.join('\n'), done); return { md: v1.md, done: toDoneTop(v1.done, parseBoard(md).title, [block]) };
}
/** A done task reopened: out of the done file (or, on a board from before v1, out of its Done section: where 'board'), at the top of the
 *  board's first section as to do, without its date. */
export function reopen(md: string, done: string, line: number, where: 'board' | 'done' = 'done'): { md: string; done: string } {
  const src = (where === 'done' ? done : md).split('\n'); if (!isItem(src[line] ?? '')) return toV1(md, done);
  const [a, b] = blockAt(src, line); const block = src.splice(a, b - a);
  block[0] = block[0]!.replace(/^- \[( |~|x)\]/, '- [ ]'); block[block.length - 1] = block[block.length - 1]!.replace(DATE_TAIL, '');
  const v1 = where === 'done' ? toV1(md, src.join('\n')) : toV1(src.join('\n'), done); const lines = v1.md.split('\n'); const h = lines.findIndex((l) => /^##\s/.test(l));
  if (h < 0) lines.push('', '## To do', '', ...block); else putTop(lines, h, block);
  return { md: lines.join('\n'), done: v1.done };
}
