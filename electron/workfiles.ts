// The files a project keeps beside its code, read and written by the app: workflows (workflows/<name>.md, one file per step in
// workflows/<name>/, and the runs in workflows/<name>/runs/) and boards (PROJECT.md, MARKETING.md, BOARD.md, ROADMAP.md, boards/*.md) with
// their done files (<NAME>-DONE.md), plain markdown that agents keep and the window draws (T-171, T-174). The folder is the truth.
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_TRIES, parseWorkflow, parseRun, sortWorkflows, stamp, stepFileOk, workflowBase, type Run, type WorkflowInfo, isWorkflow } from '../shared/workflow.js';
import { BOARD_FORMAT, BOARD_MARK, boardVersion, canWrite, doneFileOf, isDoneFile, localDay, looksLikeBoard, markDone, parseBoard, reopen, setItemStatus, taskLine, toV1, type BoardInfo } from '../shared/board.js';
import type { FolderFiles } from '../shared/types.js';

const slug = (name: string, none: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || none;
const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** When a workflow was last changed: its file, and its steps' instructions in the folder beside it (never its runs, versions or chat). */
async function modifiedOf(wdir: string, f: string): Promise<number> {
  const base = f.replace(/\.md$/, ''); let t = (await fs.stat(path.join(wdir, f)).catch(() => null))?.mtimeMs ?? 0;
  for (const e of await fs.readdir(path.join(wdir, base), { withFileTypes: true }).catch(() => [])) if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') t = Math.max(t, (await fs.stat(path.join(wdir, base, e.name)).catch(() => null))?.mtimeMs ?? 0);
  return Math.round(t);
}
/** What a live run asks its person at the step it waits at: the FOR YOU line of the step before (the dashboard and the notification say it). */
const askedOf = (run: Run): { asks?: string } => { const ks = Object.keys(run.steps).map(Number).sort((a, b) => a - b); const w = ks.find((k) => /^waiting/i.test(run.steps[k]!.result)); const a = w ? ks.filter((k) => k < w).reverse().map((k) => run.steps[k]!.asks).find(Boolean) : undefined; return a ? { asks: a } : {}; };
export async function listWorkflows(dir: string): Promise<WorkflowInfo[]> {
  const wdir = path.join(dir, 'workflows'); let names: string[] = []; try { names = (await fs.readdir(wdir)).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  const out: WorkflowInfo[] = [];
  for (const f of names) { const md = await fs.readFile(path.join(wdir, f), 'utf8').catch(() => ''); const def = parseWorkflow(md); if (!isWorkflow(def)) continue; /* notes or rules kept beside the workflows (T-251) */ const runs = await listRuns(dir, f);
    const latest = runs[0]; out.push({ file: `workflows/${f}`, name: def.name || f.replace(/\.md$/, ''), when: def.when, steps: def.steps.length, runs: runs.length, modified: await modifiedOf(wdir, f), latest: latest ? { n: latest.n, result: latest.result, took: latest.took, started: latest.started, waiting: /^running/i.test(latest.result) && Object.values(latest.steps).some((x) => /^waiting/i.test(x.result)), ...askedOf(latest) } : null }); }
  return sortWorkflows(out);
}
export async function listRuns(dir: string, file: string): Promise<Run[]> {
  const base = path.basename(file, '.md'); const rdir = path.join(dir, 'workflows', base, 'runs'); let names: string[] = []; try { names = (await fs.readdir(rdir)).filter((f) => f.endsWith('.md')); } catch { return []; }
  const runs = await Promise.all(names.map(async (f) => parseRun(await fs.readFile(path.join(rdir, f), 'utf8'), `workflows/${base}/runs/${f}`)));
  return runs.sort((a, b) => b.n - a.n);
}
/** A workflow: its file, its runs, and its steps' instructions, the files their headings link in the workflow's own folder (T-168), by the
 *  path the link gives (relative to workflows/). A file that is not there yet is left out: the step has no instructions so far. */
export async function readWorkflow(dir: string, file: string): Promise<{ md: string; runs: Run[]; prompts: Record<string, string> }> {
  const md = await fs.readFile(path.join(dir, file), 'utf8'); const prompts: Record<string, string> = {};
  for (const s of parseWorkflow(md).steps) if (s.file && !(s.file in prompts) && stepFileOk(file, s.file)) { const t = await fs.readFile(path.join(dir, 'workflows', s.file), 'utf8').catch(() => null); if (t != null) prompts[s.file] = t; }
  return { md, runs: await listRuns(dir, file), prompts };
}
export async function saveWorkflow(dir: string, file: string, md: string): Promise<void> { if (!/^workflows\/[^/]+\.md$/.test(file)) throw new Error('not a workflow file'); await fs.writeFile(path.join(dir, file), md); }
const stepPath = (dir: string, file: string, step: string) => { if (!/^workflows\/[^/]+\.md$/.test(file) || !stepFileOk(file, step)) throw new Error('not a step file of this workflow'); return path.join(dir, 'workflows', step); };
/** A step's instructions, written to its file in the workflow's own folder (only there: stepFileOk). */
export async function saveWorkflowStep(dir: string, file: string, step: string, text: string): Promise<void> { const f = stepPath(dir, file, step); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, text); }
/** A step's file, gone with the step. */
export async function removeWorkflowStep(dir: string, file: string, step: string): Promise<void> { await fs.rm(stepPath(dir, file, step), { force: true }); }
/** A new run: the next number in the workflow's runs folder, the record started, its own folder for files. */
export async function newRun(dir: string, file: string): Promise<{ n: number; file: string; folder: string; version: number }> {
  if (!/^workflows\/[^/]+\.md$/.test(file)) throw new Error('not a workflow file'); const base = path.basename(file, '.md'); const rdir = path.join(dir, 'workflows', base, 'runs'); await fs.mkdir(rdir, { recursive: true });
  const n = (await listRuns(dir, file)).reduce((m, r) => Math.max(m, r.n), 0) + 1; const name = String(n).padStart(3, '0'); await fs.mkdir(path.join(rdir, name), { recursive: true });
  const version = await versionFor(dir, file, n);
  const rec = `workflows/${base}/runs/${name}.md`; await fs.writeFile(path.join(dir, rec), `# Run ${n}\nstarted: ${stamp()}\nresult: running\nversion: ${version}\n`); return { n, file: rec, folder: `workflows/${base}/runs/${name}/`, version };
}
/** The workflow as it is now, for a version: its file and each step's instructions (step order, each file once), by their path in the
 *  folder, as text with one final newline (what a restore writes back hashes the same), and their hash. */
async function snapshot(dir: string, file: string): Promise<{ name: string; files: [string, string][]; hash: string }> {
  const { md, prompts } = await readWorkflow(dir, file); const def = parseWorkflow(md, file, prompts);
  const one = (t: string) => `${t.replace(/\r\n/g, '\n').replace(/\n*$/, '')}\n`; const files: [string, string][] = [[file, one(md)]];
  for (const s of def.steps) if (s.file && prompts[s.file] != null && !files.some(([f]) => f === `workflows/${s.file}`)) files.push([`workflows/${s.file}`, one(prompts[s.file]!)]);
  return { name: def.name || workflowBase(file), files, hash: createHash('sha256').update(files.flat().join('\u0000')).digest('hex') };
}
const versionsDir = (dir: string, file: string) => path.join(dir, 'workflows', workflowBase(file), 'versions');
const versionPath = (dir: string, file: string, v: number) => path.join(versionsDir(dir, file), `${String(v).padStart(3, '0')}.md`);
/** A workflow's versions, oldest first: their number, when and why each was taken, and its hash. */
async function listVersions(dir: string, file: string): Promise<{ n: number; taken: string; hash: string }[]> {
  let names: string[] = []; try { names = (await fs.readdir(versionsDir(dir, file))).filter((f) => /^\d+\.md$/.test(f)); } catch { return []; }
  const out = await Promise.all(names.map(async (f) => { const t = await fs.readFile(path.join(versionsDir(dir, file), f), 'utf8').catch(() => '');
    return { n: Number(f.slice(0, -3)), taken: /^taken: (.*)$/m.exec(t)?.[1] ?? '', hash: /^hash: ([0-9a-f]{64})$/m.exec(t)?.[1] ?? '' }; }));
  return out.sort((a, b) => a.n - b.n);
}
/** A new version: versions/NNN.md, the workflow file and each step's instructions as they are, whole, with their hash. */
async function takeVersion(dir: string, file: string, snap: Awaited<ReturnType<typeof snapshot>>, why: string): Promise<number> {
  const all = await listVersions(dir, file); const n = (all[all.length - 1]?.n ?? 0) + 1; await fs.mkdir(versionsDir(dir, file), { recursive: true });
  const fenced = (t: string) => { const f = '`'.repeat(Math.max(3, ...[...t.matchAll(/`{3,}/g)].map((m) => m[0].length + 1))); return `${f}markdown\n${t.replace(/\n$/, '')}\n${f}`; };
  await fs.writeFile(versionPath(dir, file, n), `# ${snap.name} · version ${n}\n\ntaken: ${stamp()}, ${why}\nhash: ${snap.hash}\n\nThe workflow file as it was, then each step's instructions.\n${snap.files.map(([f, t]) => `\n## ${f}\n\n${fenced(t)}\n`).join('')}`);
  return n;
}
/** The version a run runs (T-169; the user, 2026-09-27: "versioned each time they are run and they change. Not before. If you modify one
 *  thing, I don't think we should version them. But it's per run"): the version the workflow is, to the byte, when there is one (the latest
 *  such: a workflow restored to an older version runs as that version), else a new one. */
export async function versionFor(dir: string, file: string, run: number): Promise<number> {
  const snap = await snapshot(dir, file); const same = (await listVersions(dir, file)).filter((v) => v.hash === snap.hash).pop();
  return same ? same.n : takeVersion(dir, file, snap, `when run ${run} started`);
}
/** The versions, for the view: each with when it was taken and why, and the one the workflow is now (null: edited since, or never run). */
export async function workflowVersions(dir: string, file: string): Promise<{ versions: { n: number; taken: string }[]; current: number | null }> {
  if (!/^workflows\/[^/]+\.md$/.test(file)) throw new Error('not a workflow file');
  const [snap, all] = await Promise.all([snapshot(dir, file), listVersions(dir, file)]);
  return { versions: all.map(({ n, taken }) => ({ n, taken })), current: all.filter((v) => v.hash === snap.hash).pop()?.n ?? null };
}
/** A workflow back to an older version (the user, 2026-09-27: "how can I roll back to a previous version ... of our workflow?"): its file
 *  and each step's instructions as they were. What it is now is kept first as a version of its own when it is none (nothing is lost, and
 *  the restore can be undone the same way); a step's file the restored workflow no longer links goes. Only the workflow's file and files
 *  in its own folder are written. */
/** One version's text, as it was kept (T-180: a connected app reads it here, since the host's disk is not its own). */
export async function readVersion(dir: string, file: string, v: number): Promise<string> { if (!/^workflows\/[^/]+\.md$/.test(file) || !Number.isInteger(v) || v < 1) throw new Error('not a version'); return fs.readFile(versionPath(dir, file, v), 'utf8'); }
export async function restoreVersion(dir: string, file: string, v: number): Promise<{ restored: number; kept: number | null }> {
  if (!/^workflows\/[^/]+\.md$/.test(file) || !Number.isInteger(v) || v < 1) throw new Error('not a version of a workflow');
  const text = await fs.readFile(versionPath(dir, file, v), 'utf8').catch(() => null); if (text == null) throw new Error(`there is no version ${v}`);
  const files = [...text.matchAll(/^## (\S[^\n]*)\n\n(`{3,})markdown\n([\s\S]*?)\n?\2$/gm)].map((m) => [m[1]!.trim(), `${m[3]}\n`] as [string, string]);
  if (files[0]?.[0] !== file) throw new Error(`version ${v} is not a version of ${file}`);
  for (const [f] of files.slice(1)) if (!f.startsWith('workflows/') || !stepFileOk(file, f.slice('workflows/'.length))) throw new Error(`version ${v} names a file outside the workflow's folder: ${f}`);
  const now = await snapshot(dir, file); const kept = (await listVersions(dir, file)).some((x) => x.hash === now.hash) ? null : await takeVersion(dir, file, now, `before version ${v} was restored`);
  for (const [f, t] of files) { await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true }); await fs.writeFile(path.join(dir, f), t); }
  const linked = new Set(files.map(([f]) => f)); for (const [f] of now.files.slice(1)) if (!linked.has(f)) await fs.rm(path.join(dir, f), { force: true });
  return { restored: v, kept };
}
export async function saveRun(dir: string, file: string, md: string): Promise<void> { if (!/^workflows\/[^/]+\/runs\/[^/]+\.md$/.test(file)) throw new Error('not a run record'); await fs.writeFile(path.join(dir, file), md); }
/** A run's own folder (workflows/<name>/runs/NNN/, beside its record): the full reply of each agent step (step-N.md, the gate shows the one
 *  before it: the user, 2026-10-03, "when it asks me to choose something, it doesn't tell me what to choose") and what the steps wrote there. */
const runDirOf = (dir: string, file: string): string => { if (!/^workflows\/[^/]+\/runs\/[^/]+\.md$/.test(file) || file.includes('..')) throw new Error('not a run record'); return path.join(dir, file.replace(/\.md$/, '')); };
export async function saveRunStep(dir: string, file: string, n: number, text: string): Promise<void> { if (!Number.isInteger(n) || n < 1) throw new Error('not a step'); const d = runDirOf(dir, file); await fs.mkdir(d, { recursive: true }); await fs.writeFile(path.join(d, `step-${n}.md`), text.slice(0, 200_000)); }
export async function runStepReply(dir: string, file: string, n: number): Promise<string | null> { if (!Number.isInteger(n) || n < 1) return null; try { return await fs.readFile(path.join(runDirOf(dir, file), `step-${n}.md`), 'utf8'); } catch { return null; } }
export async function runFiles(dir: string, file: string): Promise<{ name: string; path: string; size: number; at: number }[]> {
  const d = runDirOf(dir, file); const out: { name: string; path: string; size: number; at: number }[] = [];
  for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) { if (!e.isFile() || e.name.startsWith('.')) continue; const st = await fs.stat(path.join(d, e.name)).catch(() => null); if (st) out.push({ name: e.name, path: `${file.replace(/\.md$/, '')}/${e.name}`, size: st.size, at: st.mtimeMs }); }
  return out.sort((a, b) => a.at - b.at);
}
export async function readRun(dir: string, file: string): Promise<string> { if (!/^workflows\/[^/]+\/runs\/[^/]+\.md$/.test(file)) throw new Error('not a run record'); return fs.readFile(path.join(dir, file), 'utf8'); }
/** A new workflow: the file from a small template, its folder with one file per step (T-168) and a README, all at once. */
export async function newWorkflow(dir: string, name: string, agent = 'Jauvex', tries = DEFAULT_TRIES): Promise<string> { // tries: the app's setting for a new workflow (T-197)
  const s = slug(name, 'workflow'); const wdir = path.join(dir, 'workflows'); await fs.mkdir(path.join(wdir, s, 'runs'), { recursive: true });
  const file = path.join(wdir, `${s}.md`); if (await exists(file)) return `workflows/${s}.md`;
  // A working hello world, so a new workflow runs as it is: the Jauvex agent says hello, the user approves, the agent writes it down.
  // The workflow file lists the steps and who does each; each step's instructions are its own file (what the agent is sent, nothing else).
  const steps: [string, string, string][] = [['Say hello', agent, 'Say your name and greet the user in one short sentence.'], ['Your approval', 'you', 'Read the greeting. Approve it, or send it back with a note.'],
    ['Write it down', agent, 'Write the approved greeting into hello.md in this run\'s folder, and say where it is.']];
  const link = (n: string) => `${s}/${slug(n, 'step')}.md`;
  await fs.writeFile(file, `# ${name}\n\nA first workflow that runs as it is: an agent says hello, you approve, it writes the greeting down. Replace the steps with your own, here or by asking in the chat below the flow.\n\nwhen: manual\ntries: ${tries}\n\n${steps.map(([n, a], i) => `## ${i + 1}. [${n}](${link(n)}) → ${a}\n`).join('\n')}\ndone: hello.md in the run's folder\n`);
  for (const [n, , text] of steps) await fs.writeFile(path.join(wdir, link(n)), `${text}\n`);
  await fs.writeFile(path.join(wdir, s, 'README.md'), `# ${s}/\n\nThis folder belongs to the workflow defined in \`../${s}.md\`, which lists its steps in order and who does each.\nEach step's instructions are a file here, the one its line in \`../${s}.md\` links: yours to edit, here or in the app.\nThe app keeps the rest: \`runs/NNN.md\`, one record per run, and \`runs/NNN/\`, that run's files and logs; \`versions/NNN.md\`, the workflow as a run ran it, a new one when it had changed.\n`);
  return `workflows/${s}.md`;
}
/** The chat under a workflow: its session, kept in the workflow's reserved folder (workflows/<name>/chat.json). */
export type WorkflowChat = { provider?: string; sessionId?: string | null };
const chatFile = (dir: string, file: string) => { if (!/^workflows\/[^/]+\.md$/.test(file)) throw new Error('not a workflow file'); return path.join(dir, 'workflows', path.basename(file, '.md'), 'chat.json'); };
export async function workflowChat(dir: string, file: string): Promise<WorkflowChat> { try { return JSON.parse(await fs.readFile(chatFile(dir, file), 'utf8')) as WorkflowChat; } catch { return {}; } }
export async function setWorkflowChat(dir: string, file: string, c: WorkflowChat): Promise<void> { const f = chatFile(dir, file); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, JSON.stringify(c, null, 2)); }
/** A workflow deleted (the user, 2026-09-27: "I wanna be able to delete workflows and boards (with confirmation)"; the window asks first): its
 *  file and its folder beside it, the steps' instructions, the runs, the versions and its chat with them. Nothing else in the folder. */
export async function deleteWorkflow(dir: string, file: string): Promise<void> {
  if (!/^workflows\/[^/]+\.md$/.test(file) || !workflowBase(file) || workflowBase(file).startsWith('.')) throw new Error('not a workflow file');
  await fs.rm(path.join(dir, 'workflows', workflowBase(file)), { recursive: true, force: true }); await fs.rm(path.join(dir, file), { force: true });
}

/** A workflow moved to another folder (T-217): its file and its folder beside it (the steps' instructions, the runs, the versions, its
 *  chat's record), never over one of the same name there. The chat's session is the caller's to move (backend, moveWorkflow). */
export async function moveWorkflow(from: string, file: string, to: string): Promise<void> {
  if (!/^workflows\/[^/]+\.md$/.test(file) || !workflowBase(file) || workflowBase(file).startsWith('.')) throw new Error('not a workflow file');
  const base = workflowBase(file); const src = path.join(from, file), dst = path.join(to, file), srcDir = path.join(from, 'workflows', base), dstDir = path.join(to, 'workflows', base);
  if (!(await exists(src))) throw new Error(`no ${file} in ${from}`);
  if ((await exists(dst)) || (await exists(dstDir))) throw new Error(`${to} already has a workflow ${file}`);
  const mv = async (a: string, b: string) => { try { await fs.rename(a, b); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e; await fs.cp(a, b, { recursive: true }); await fs.rm(a, { recursive: true, force: true }); } }; // EXDEV: another disk
  await fs.mkdir(path.join(to, 'workflows'), { recursive: true }); await mv(src, dst); if (await exists(srcDir)) await mv(srcDir, dstDir);
}

/** For the briefing: what a folder holds, in a line each. */
export async function folderFiles(dir: string): Promise<FolderFiles> { const [workflows, boards] = await Promise.all([listWorkflows(dir).catch(() => []), listBoards(dir).catch(() => [])]); return { boards: boards.map((b) => ({ file: b.file, title: b.title })), workflows: workflows.map((w) => ({ file: w.file, name: w.name })) }; }
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
/** When each board of a folder last changed, its done file counted with it (a task finished writes both): for the dashboard's refresh (T-279). */
export async function boardTimes(dir: string): Promise<{ file: string; at: number }[]> {
  const files: string[] = []; for (const f of BOARD_ROOTS) if (await exists(path.join(dir, f))) files.push(f);
  try { for (const f of (await fs.readdir(path.join(dir, 'boards'))).filter((f) => f.endsWith('.md') && !isDoneFile(f))) files.push(`boards/${f}`); } catch { /* no boards folder */ }
  return Promise.all(files.map(async (f) => { const t = await Promise.all([f, doneFileOf(f)].map((x) => fs.stat(path.join(dir, x)).then((st) => st.mtimeMs, () => 0))); return { file: f, at: Math.max(...t) }; }));
}
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
  const s = slug(name, 'board'); await fs.mkdir(path.join(dir, 'boards'), { recursive: true }); const file = path.join(dir, 'boards', `${s}.md`); if (await exists(file)) return `boards/${s}.md`;
  await fs.writeFile(file, `${BOARD_MARK}\n# ${name}\n\nThe single source of truth for this board: the markdown is the database, git is the history.\nFormat (boards v1): \`## <Section>\` headings; items as \`- [ ] **T-01 · Title** — body\`. Glyphs: \`[ ]\` to do, \`[~]\` doing.\nA done task leaves this file for the top of ${s}-DONE.md beside it, "— shipped <date> (<commit>)", in the same commit. Ids are stable, never renumber.\n\n## P0 — now\n\n- [ ] **T-01 · The first thing** — what it is and why it matters.\n\n## P1 — next\n\n## P2 — later\n`);
  return `boards/${s}.md`;
}
