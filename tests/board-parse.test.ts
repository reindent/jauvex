// A board is markdown: sections, items with their glyph, id, title and body; a status change rewrites just that line (T-171).
const { parseBoard, setItemStatus, looksLikeBoard, nextId, boardVersion, canWrite, withMark, BOARD_MARK, doneFileOf, isDoneFile, toV1, markDone, reopen, taskLine, localDay } = await import('../shared/board.ts');
const { setBoardStatus, newBoard, listBoards } = await import('../electron/workfiles.ts');
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'; import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const md = `# Launch board

Intro prose before the first section is not part of any section.

## P0 — this week

What must ship first.

- [ ] **T-01 · A natural voice** — the spoken voice sounds like a person,
      not a robot: tried with three voices.
- [~] **T-02 · Push to talk** — hold a key to talk.

## Later

- [ ] Unnumbered idea without an id

## Done

- [x] **T-03 · The install command** — one line in Terminal — 2026-09-24 (abc1234)
`;
const b = parseBoard(md);
check('a board parses: its title and its sections, in order', b.title === 'Launch board' && b.sections.map((s) => s.title).join(' | ') === 'P0 — this week | Later | Done', b.sections.map((s) => s.title).join(' | '));
const all = b.sections.flatMap((s) => s.items); const t01 = all.find((i) => i.id === 'T-01');
check('items carry id, title, status, and a body joined across its lines', !!t01 && t01.title === 'A natural voice' && t01.status === 'todo' && /like a person, not a robot/.test(t01.body) && all.find((i) => i.id === 'T-02')?.status === 'doing' && all.find((i) => i.id === 'T-03')?.status === 'done', JSON.stringify(t01));
check('an item with no id or bold title is still an item', b.sections[1]!.items[0]?.title === 'Unnumbered idea without an id' && b.sections[1]!.items[0]?.id === '');
check('a section note is kept apart from its items', b.sections[0]!.note === 'What must ship first.' && b.sections.every((s) => !s.items.some((i) => /^\*\*/.test(i.title))));
const flipped = setItemStatus(md, t01!.line, 'doing'); const b2 = parseBoard(flipped);
check('a status change rewrites only that line', b2.sections.flatMap((s) => s.items).find((i) => i.id === 'T-01')!.status === 'doing' && flipped.split('\n').length === md.split('\n').length && flipped.split('\n').filter((l, i) => l !== md.split('\n')[i]).length === 1);
check('the next id follows the highest', nextId(b) === 'T-04', nextId(b));
check('plain markdown is not a board', !looksLikeBoard('# Notes\n\nJust text.\n') && looksLikeBoard(md));
// The format's version (T-173): the first line names it; none is v1; a newer one is never rewritten.
check('the version line is read, and a board without one is v1', boardVersion(`${BOARD_MARK}\n${md}`) === 1 && boardVersion(md) === 1 && boardVersion('\n<!-- boards: v2 -->\n# X') === 2 && parseBoard(`${BOARD_MARK}\n${md}`).title === 'Launch board');
check('a newer version cannot be written; v1 can', !canWrite('<!-- boards: v2 -->\n# X') && canWrite(md) && canWrite(`${BOARD_MARK}\n${md}`));
check('the version line is added once', withMark(md).startsWith(`${BOARD_MARK}\n# Launch board`) && withMark(withMark(md)) === withMark(md));
{ const dir = path.join(process.env.CVC_DATA_DIR ?? path.resolve('tmp/testdata'), 'board-files'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'PROJECT.md'), md); const t = parseBoard(md).sections[0]!.items[0]!;
  const after = (await setBoardStatus(dir, 'PROJECT.md', t.line, 'doing')).md; const b3 = parseBoard(after);
  check('a status change on a board without the line adds it, and changes the item meant', after.startsWith(`${BOARD_MARK}\n`) && b3.sections[0]!.items[0]!.status === 'doing' && b3.sections[0]!.items[1]!.status === 'doing' && readFileSync(path.join(dir, 'PROJECT.md'), 'utf8') === after);
  check('...and, bringing it to v1, its done task goes to PROJECT-DONE.md', !/\[x\]/.test(after) && !/^## Done/m.test(after) && /^- \[x\] \*\*T-03 · The install command\*\* — one line in Terminal — 2026-09-24 \(abc1234\)$/m.test(readFileSync(path.join(dir, 'PROJECT-DONE.md'), 'utf8')));
  const newer = `<!-- boards: v2 -->\n${md}`; writeFileSync(path.join(dir, 'ROADMAP.md'), newer);
  const refused = await setBoardStatus(dir, 'ROADMAP.md', 5, 'done').then(() => '', (e: Error) => e.message);
  check('a board of a newer version is refused, and left as it was', /boards format v2, newer than this app knows/.test(refused) && readFileSync(path.join(dir, 'ROADMAP.md'), 'utf8') === newer, refused);
  const nb = await newBoard(dir, 'Launch'); check('a new board starts with the version line, and has no Done section', readFileSync(path.join(dir, nb), 'utf8').startsWith(`${BOARD_MARK}\n# Launch\n`) && !/^## Done/m.test(readFileSync(path.join(dir, nb), 'utf8')));
  writeFileSync(path.join(dir, 'boards', 'all-done.md'), `${BOARD_MARK}\n# All done\n\n## P0 — now\n`); writeFileSync(path.join(dir, 'boards', 'all-done-DONE.md'), `${BOARD_MARK}\n# All done · Done\n\n## Done\n\n- [x] **T-01 · It shipped** — shipped 2026-09-27\n`);
  const listed = await listBoards(dir); check('done files are never boards, and a board whose tasks are all done still is', !listed.some((b) => /-DONE\.md$/.test(b.file)) && listed.some((b) => b.file === 'boards/all-done.md' && b.done === 1 && b.total === 1), JSON.stringify(listed.map((b) => [b.file, b.done, b.total])));
  rmSync(dir, { recursive: true, force: true }); }
// Done tasks (boards format v1, T-174): off the board, to the top of <NAME>-DONE.md with the day; reopened, back to the top of the first section.
check('the done file sits beside the board, and is known by its name', doneFileOf('PROJECT.md') === 'PROJECT-DONE.md' && doneFileOf('boards/launch.md') === 'boards/launch-DONE.md' && isDoneFile('boards/launch-DONE.md') && !isDoneFile('boards/launch.md') && !isDoneFile('boards/launch-done.md'));
{ const v1 = toV1(md, ''); check('an older board brought to v1: the version line, its done tasks moved as they are, its Done section gone', v1.md.startsWith(`${BOARD_MARK}\n# Launch board`) && !/^## Done/m.test(v1.md) && !/\[x\]/.test(v1.md) && v1.done.startsWith(`${BOARD_MARK}\n# Launch board · Done\n\nArchive of the board's finished tasks, newest first.\n\n## Done\n\n- [x] **T-03 · The install command** — one line in Terminal — 2026-09-24 (abc1234)`), v1.done);
  const t01 = parseBoard(md).sections[0]!.items[0]!; const d = markDone(md, '', t01.line, '2026-09-27'); const dItems = parseBoard(d.done).sections.flatMap((s) => s.items);
  check('a task done leaves the board, whole, for the top of the done file, "— shipped <day>"', !/T-01/.test(d.md) && !/not a robot/.test(d.md) && dItems[0]?.id === 'T-01' && dItems[0]?.status === 'done' && /tried with three voices\. — shipped 2026-09-27$/.test(d.done.split('\n').find((l) => /tried with three voices/.test(l)) ?? '') && dItems[1]?.id === 'T-03', d.done);
  check('the next id reads the board and its done file', nextId(parseBoard(d.md), 'T', parseBoard(d.done)) === 'T-04' && nextId(parseBoard(d.md)) === 'T-03');
  const back = reopen(d.md, d.done, dItems[0]!.line); const first = parseBoard(back.md).sections[0]!;
  check('a task reopened goes to the top of the first section as to do, without its date', first.items[0]?.id === 'T-01' && first.items[0]?.status === 'todo' && !/shipped/.test(back.md) && /not a robot: tried with three voices\.$/.test(first.items[0]!.body) && !parseBoard(back.done).sections.flatMap((s) => s.items).some((i) => i.id === 'T-01'), JSON.stringify(first.items[0])); }
// Three fixes to the above: the day is this computer's, an old board's done task reopens out of its Done section, a click finds its task by id.
check('the shipped day is the local one, not UTC\'s', localDay(new Date(2026, 8, 27, 23, 30)) === '2026-09-27' && localDay(new Date(2026, 0, 5, 0, 1)) === '2026-01-05');
{ const dir = path.join(process.env.CVC_DATA_DIR ?? path.resolve('tmp/testdata'), 'board-fixes'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'PROJECT.md'), md); const t03 = parseBoard(md).sections.flatMap((s) => s.items).find((i) => i.id === 'T-03')!;
  const r = await setBoardStatus(dir, 'PROJECT.md', t03.line, 'todo', 'board', 'T-03'); const first = parseBoard(r.md).sections[0]!;
  check('a done task still on a board from before v1, reopened, goes to the top of the first section and its Done section goes', first.items[0]?.id === 'T-03' && first.items[0]?.status === 'todo' && !/shipped|2026-09-24/.test(first.items[0]!.body) && !/^## Done/m.test(r.md) && !/T-03/.test(r.done), r.md);
  writeFileSync(path.join(dir, 'PROJECT.md'), md); const t02 = parseBoard(md).sections[0]!.items.find((i) => i.id === 'T-02')!;
  const moved = md.replace('## P0 — this week\n\nWhat must ship first.\n\n', '## P0 — this week\n\nWhat must ship first.\n\n- [ ] **T-09 · Added by an agent meanwhile** — the lines moved.\n'); writeFileSync(path.join(dir, 'PROJECT.md'), moved);
  check('taskLine finds a task that moved, and nothing for one that is gone', taskLine(moved, t02.line, 'T-02') === t02.line + 1 && taskLine(moved, t02.line, 'T-77') === -1 && taskLine(moved, 3, '') === 3);
  const d = await setBoardStatus(dir, 'PROJECT.md', t02.line, 'done', 'board', 'T-02');
  check('a click on a board an agent changed since it was drawn moves the task it meant', !/T-02/.test(d.md) && /T-09/.test(d.md) && parseBoard(d.done).sections[0]!.items[0]?.id === 'T-02', d.md);
  const gone = await setBoardStatus(dir, 'PROJECT.md', 5, 'done', 'board', 'T-77').then(() => '', (e: Error) => e.message);
  check('...and one on a task that is gone is refused', /T-77 is not where it was/.test(gone), gone);
  rmSync(dir, { recursive: true, force: true }); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
