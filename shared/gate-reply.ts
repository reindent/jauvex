// What a step's agent found, for the person at the gate after it (2026-10-03; the user, on a real run: the gate showed only "Pick a topic and
// angle…" and the record only the first 240 characters of the reply, its opening narration, while six candidates sat in runs/004/candidates.md).
// Pure, and identical in Jauvex Personal and Jauvex Pro (tests/workflow-gate-reply.test.ts): the runner keeps a step's whole reply in its run
// folder (stepFile, stepReplyText), the record's `said:` is the reply's result (saidOf), and the gate shows the question (questionOf), the
// choices the agent offered (choicesOf: `CHOICE: <label> — <one line>`, up to six) and the run's files the reply names (linkedFiles).
// Lines the app reads: `OUTCOME: <name>` (where the run goes), `FOR YOU: <what the person decides>` (the last one counts), `CHOICE: ...`.

const MARK = (word: string) => new RegExp(`^\\s*(?:[-*]\\s+)?\\**\\s*${word}\\s*\\**\\s*[:：]`, 'i');
const OUTCOME = MARK('OUTCOME'), FOR_YOU = MARK('FOR YOU'), CHOICE = MARK('CHOICE');
const MAX_FILE = 200 * 1024;
const MAX_SAID = 240;

/** The file a step's whole reply is kept in, inside its run folder (runs/NNN/). */
export const stepFile = (n: number): string => `step-${n}.md`;

/** The reply as it is kept in the run folder: without its OUTCOME and FOR YOU lines (the record has them), its CHOICE lines kept; at most
 *  200 KB, cut at a line, with a note when it was cut. */
export function stepReplyText(reply: string): string {
  const text = reply.split('\n').filter((l) => !OUTCOME.test(l) && !FOR_YOU.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (new TextEncoder().encode(text).length <= MAX_FILE) return text;
  let cut = text.slice(0, MAX_FILE); while (new TextEncoder().encode(cut).length > MAX_FILE) cut = cut.slice(0, -1024);
  const at = cut.lastIndexOf('\n') > MAX_FILE / 2 ? cut.lastIndexOf('\n') : cut.lastIndexOf(' '); // a line, else a word (one huge line)
  return `${cut.slice(0, Math.max(0, at)).trimEnd()}\n\n[… cut here: the reply was longer than 200 KB]`;
}

/** The reply's paragraphs of prose: code blocks and the app's own lines (OUTCOME, FOR YOU, CHOICE) taken out. */
const paragraphs = (reply: string): string[] => reply.replace(/```[\s\S]*?```/g, '\n\n').split('\n').filter((l) => !OUTCOME.test(l) && !FOR_YOU.test(l) && !CHOICE.test(l)).join('\n')
  .split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p && !/^#+\s/.test(p) && !/^[-*_]{3,}$/.test(p));
const cutAt = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s);

/** The reply's result in one short line, for the run record's `said:`: its last paragraph (where an agent says what it found, after it said
 *  what it would do), cut at about 240 characters on a word. '' for an empty reply. */
export const saidOf = (reply: string): string => cutAt(paragraphs(reply).at(-1) ?? '', MAX_SAID);

/** The question for the person at the gate: the reply's FOR YOU line (the last one), else its last paragraph. */
export function questionOf(reply: string): string {
  const fy = reply.split('\n').filter((l) => FOR_YOU.test(l)).map((l) => l.replace(FOR_YOU, '').replace(/^\s*\**\s*|\s*\**\s*$/g, '').trim()).filter(Boolean);
  return fy.at(-1) ?? saidOf(reply);
}

export type Choice = { label: string; detail: string };
/** The choices the agent offered: `CHOICE: <label> — <one line>` (a dash, an en or em dash, or a colon between them; bold and list marks
 *  allowed), in order, without repeats, at most six. */
export function choicesOf(reply: string): Choice[] {
  const out: Choice[] = [];
  for (const line of reply.split('\n')) {
    if (!CHOICE.test(line)) continue;
    const body = line.replace(CHOICE, '').replace(/\*\*/g, '').trim(); if (!body) continue;
    const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(body) ?? /^([^:]{1,80}):\s+(.+)$/.exec(body);
    const label = (m ? m[1]! : body).trim(), detail = (m ? m[2]! : '').trim();
    if (label && !out.some((c) => c.label.toLowerCase() === label.toLowerCase())) out.push({ label, detail });
    if (out.length === 6) break;
  }
  return out;
}

/** A path made plain: forward slashes, no `.` or `..` segments, no trailing slash. */
const norm = (p: string): string => { const abs = p.startsWith('/'); const parts: string[] = []; for (const s of p.replace(/\\/g, '/').split('/')) { if (!s || s === '.') continue; if (s === '..' && parts.length && parts.at(-1) !== '..') parts.pop(); else parts.push(s); } return (abs ? '/' : '') + parts.join('/'); };
/** The files of a run folder the reply names: in markdown links or as paths in the text (absolute, from the project, from the workflow folder
 *  or from the run folder itself), as paths inside the run folder ('candidates.md', 'notes/a.md'), in the order the reply names them.
 *  runDir is the run folder's absolute path (…/workflows/<name>/runs/004). Web links and paths elsewhere are left out. A bare file name
 *  ('candidates.md') is taken as the run folder's: the caller keeps only the names that exist there. */
export function linkedFiles(reply: string, runDir: string): string[] {
  const dir = norm(runDir); const tail = dir.split('/').slice(-2).join('/'); // 'runs/004'
  const found: string[] = [];
  const add = (raw: string) => {
    let p = raw.trim().replace(/^<|>$/g, '').replace(/[#?].*$/, ''); try { p = decodeURIComponent(p); } catch { /* as written */ }
    if (!p || /^[a-z][\w+.-]*:/i.test(p) || !/\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{2,8}$/.test(p)) return; // a web link, or no file name ("e.g.", "1.5")
    const n = norm(p); let rel = '';
    if (n.startsWith(`${dir}/`)) rel = n.slice(dir.length + 1);
    else if (!n.startsWith('/')) { const i = n.indexOf(`${tail}/`); rel = i === 0 || (i > 0 && n[i - 1] === '/') ? n.slice(i + tail.length + 1) : n.includes('/') ? '' : n; }
    if (rel && !rel.startsWith('..') && !found.includes(rel)) found.push(rel);
  };
  for (const m of reply.matchAll(/\]\(\s*(<[^>]+>|[^)\s]+)\s*\)/g)) add(m[1]!);
  for (const m of reply.matchAll(/(?:^|[\s(`'"])((?:\/|\.{1,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s)`'".,;:!?])/gm)) add(m[1]!);
  return found;
}
