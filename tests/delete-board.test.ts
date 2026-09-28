// Deleting a board (T-179, asked for 2026-09-27, "with confirmation"; the window asks first, tests/window/boards.test.ts): a board goes with
// its done file; nothing else in the folder, and nothing but a board. No app: a folder under the check's data folder.
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'; import path from 'node:path';
import { deleteBoard, listBoards } from '../electron/workfiles.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const dir = path.join(process.env.CVC_DATA_DIR ?? path.resolve('tmp/testdata'), 'delete-board'); rmSync(dir, { recursive: true, force: true });
const put = (f: string, text: string) => { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), text); };
const has = (f: string) => existsSync(path.join(dir, f));
put('boards/old-board.md', '<!-- boards: v1 -->\n# Old board\n\n## P0 — now\n\n- [ ] **T-02 · Left** — to do.\n'); put('boards/old-board-DONE.md', '<!-- boards: v1 -->\n# Old board · Done\n\n## Done\n\n- [x] **T-01 · Gone** — shipped 2026-09-27\n');
put('boards/keep.md', '# Keep\n\n## P0 — now\n\n- [ ] **T-01 · Stays** — another board.\n');
put('PROJECT.md', '# Main\n\n## P0 — now\n\n- [ ] **T-01 · Stays** — the folder\'s own board.\n'); put('PROJECT-DONE.md', '# Main · Done\n\n## Done\n\n- [x] **T-00 · Old** — shipped 2026-09-20\n'); put('src/app.md', 'code\n');
await deleteBoard(dir, 'boards/old-board.md');
check('a board goes with its done file', !has('boards/old-board.md') && !has('boards/old-board-DONE.md'));
check('...and nothing else: another board, the folder\'s own and its done file', has('boards/keep.md') && has('PROJECT.md') && has('PROJECT-DONE.md') && (await listBoards(dir)).map((b) => b.file).join() === 'PROJECT.md,boards/keep.md', (await listBoards(dir)).map((b) => b.file).join());
let fine = true; await deleteBoard(dir, 'boards/never-had-one.md').catch(() => { fine = false; }); check('a board with no done file, or none at all, is no error', fine);
const refused: string[] = [];
for (const f of ['PROJECT-DONE.md', 'boards/keep-DONE.md', 'src/app.md', '../PROJECT.md', 'boards/../PROJECT.md', 'boards/sub/x.md']) { try { await deleteBoard(dir, f); } catch { refused.push(f); } }
check('nothing but a board is deleted: a done file and other paths are refused', refused.length === 6 && has('PROJECT-DONE.md') && has('src/app.md') && has('PROJECT.md'), refused.join(', '));
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
