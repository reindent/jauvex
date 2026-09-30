// A workflow edited in the window (T-167): the markdown file stays the one source, and every edit is a change to its text that the
// parser reads back. Only the part edited is rewritten: a step's section, the header, a `then:` line; the rest of the file, formatting
// included, stays as it was. Steps are numbered again after one is added or removed, and the outcomes that pointed at a step follow it:
// by number when it moves, by name when it is renamed, to the step that took its place when it is removed. A step's instructions live in
// a file of their own (T-168), which its heading links: the window writes that file, these functions only the link. Pure:
// tests/workflow-edit.test.ts.
import { parseWorkflow, resolveTarget, STEP_LINK, workflowBase, type Workflow } from './workflow.js';

const ARROW = /\s*(?:→|->)\s*/;
const HEAD = /^##\s+/;
const STEP_KEY = /^(in|out|then)\s*:\s*(.*)$/i;
const WF_KEY = /^(when|folder|on failure|done)\s*:/i;
const HEAD_KEY = /^(when|folder|on failure|done|tries)\s*:/i; // the workflow's own lines above its steps, kept when its description is edited (tries: T-197; under a step, a `tries:` line is that step's)
const NEXT = /^(next|next step|continue|on)$/i;
const NUM = /(^|step\s*)(\d+)\b/i;

const split = (md: string): string[] => md.replace(/\r\n/g, '\n').split('\n');
const join = (lines: string[]): string => `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
const heads = (lines: string[]): number[] => lines.flatMap((l, i) => (HEAD.test(l.trim()) ? [i] : []));
const oneLine = (v: string): string => v.replace(/\s*\n\s*/g, ' ').trim();
/** What a person typed as a step's instructions, as lines of the file: nothing in it may start a heading of its own. */
const textLines = (v: string): string[] => { const out = v.replace(/\r/g, '').split('\n').map((l) => l.replace(/^\s*#+\s*/, '')); while (out.length && !out[out.length - 1]!.trim()) out.pop(); while (out.length && !out[0]!.trim()) out.shift(); return out; };

type Section = { name: string; agent: string; link: string; text: string[]; in: string; out: string; then: string; wlines: string[] };
function readSection(lines: string[], start: number, end: number): Section {
  const [heading = '', ...body] = lines.slice(start, end); const h = heading.trim().replace(HEAD, ''); const a = ARROW.exec(h);
  const head = (a ? h.slice(0, a.index) : h).replace(/^\d+\.\s*/, '').trim(); const l = STEP_LINK.exec(head);
  const s: Section = { name: l ? l[1]!.trim() : head, agent: a ? h.slice(a.index + a[0].length).trim() : '', link: l ? l[2]! : '', text: [], in: '', out: '', then: '', wlines: [] };
  for (const raw of body) { const t = raw.trim(); const m = STEP_KEY.exec(t);
    if (m) { const k = m[1]!.toLowerCase() as 'in' | 'out' | 'then'; s[k] = m[2]!.trim(); continue; }
    if (WF_KEY.test(t)) { s.wlines.push(t); continue; }
    s.text.push(raw); }
  while (s.text.length && !s.text[s.text.length - 1]!.trim()) s.text.pop(); while (s.text.length && !s.text[0]!.trim()) s.text.shift();
  return s;
}
const heading = (num: string | null, name: string, agent: string, link = ''): string => `## ${[num ? `${num}.` : '', link ? `[${name.replace(/[[\]]/g, '')}](${link})` : name, agent ? `→ ${agent}` : ''].filter(Boolean).join(' ')}`;
const numberOf = (line: string): string | null => /^##\s+(\d+)\./.exec(line.trim())?.[1] ?? null;
function buildSection(num: string | null, s: Section, keepWorkflowLines = true): string[] {
  const out = [heading(num, s.name, s.agent, s.link), ...s.text];
  if (s.in) out.push(`in: ${s.in}`); if (s.out) out.push(`out: ${s.out}`); if (s.then) out.push(`then: ${s.then}`);
  out.push(''); if (keepWorkflowLines && s.wlines.length) out.push(...s.wlines, '');
  return out;
}
/** Every step's `then:` line rewritten outcome by outcome: fn gets the step's number, the outcome and where it leads, and says where it leads now. */
function mapThen(lines: string[], fn: (step: number, name: string, to: string) => string): string[] {
  const hs = heads(lines); const out = [...lines];
  hs.forEach((start, k) => { const end = hs[k + 1] ?? lines.length;
    for (let i = start + 1; i < end; i++) { const m = /^(\s*then\s*:\s*)(.*)$/i.exec(lines[i]!); if (!m) continue;
      out[i] = m[1] + m[2]!.split('·').map((x) => x.trim()).filter(Boolean).map((x) => { const a = ARROW.exec(x); if (!a) return x; const name = x.slice(0, a.index).trim(), to = x.slice(a.index + a[0].length).trim(); return `${name} → ${fn(k + 1, name, to)}`; }).join(' · '); } });
  return out;
}
const shift = (to: string, f: (n: number) => number): string => to.replace(NUM, (_m, p: string, d: string) => `${p}${f(Number(d))}`);
const byName = (to: string): boolean => !NEXT.test(to.trim()) && !/^(done|finish|finished|end|the end|stop|abort|halt|fail|cancel)\b/i.test(to.trim()) && !NUM.test(to);
function renumber(lines: string[]): string[] { let n = 0; return lines.map((l) => (HEAD.test(l.trim()) ? (n++, l.replace(/^(\s*##\s+)\d+\./, `$1${n}.`)) : l)); }

/** A step as the file writes it, for the editor: the file its heading links (its instructions), or its instructions with their own lines
 *  under the heading, in an older file. Null: no such step. */
export function readStep(md: string, n: number): { name: string; agent: string; link: string; text: string; in: string; out: string; then: string } | null {
  const lines = split(md); const hs = heads(lines); const start = hs[n - 1]; if (start == null) return null;
  const s = readSection(lines, start, hs[n] ?? lines.length); return { name: s.name, agent: s.agent, link: s.link, text: s.text.join('\n'), in: s.in, out: s.out, then: s.then };
}

export type StepPatch = Partial<{ name: string; agent: string; link: string; text: string; in: string; out: string; then: string }>;
/** One step changed: its name, its agent (`you` for a person's approval), the file of its instructions (link; '' for none), the instructions
 *  under its heading, what it takes, what it gives, where each outcome leads. A renamed step keeps the outcomes that named it. */
export function setStep(md: string, n: number, patch: StepPatch): string {
  const lines = split(md); const hs = heads(lines); const start = hs[n - 1]; if (start == null) return md; const end = hs[n] ?? lines.length;
  const cur = readSection(lines, start, end); const old: Workflow = parseWorkflow(md);
  const next: Section = { ...cur,
    ...(patch.name != null && (patch.name.trim() || cur.link) ? { name: oneLine(patch.name) } : {}), /* a title is optional (it can go when the step has a file: its heading still has the link) */ ...(patch.agent != null ? { agent: oneLine(patch.agent) } : {}), ...(patch.link != null ? { link: patch.link.trim() } : {}),
    ...(patch.text != null ? { text: textLines(patch.text) } : {}), ...(patch.in != null ? { in: oneLine(patch.in) } : {}),
    ...(patch.out != null ? { out: oneLine(patch.out) } : {}), ...(patch.then != null ? { then: oneLine(patch.then) } : {}) };
  let out = [...lines.slice(0, start), ...buildSection(numberOf(lines[start]!), next), ...lines.slice(end)];
  if (next.name !== cur.name) out = mapThen(out, (i, _name, to) => { if (!byName(to)) return to; const t = resolveTarget(old, i, to); if (t.kind !== 'step' || t.n !== n) return to;
    const now = next.name || `step ${n}`; const at = to.toLowerCase().indexOf(cur.name.toLowerCase()); return at >= 0 ? to.slice(0, at) + now + to.slice(at + cur.name.length) : now; });
  return join(out);
}

/** A step added at position `at` (1 for the first; one past the last to end with it), spliced into the flow: what led from the step before
 *  to the step that was there (or to Done, at the end) now leads to the new one, which goes on to the next; numbers after it move up by one. */
export function addStep(md: string, at: number, step: { name: string; agent: string; text?: string; file?: string }): string {
  const old = parseWorkflow(md); const count = old.steps.length; const pos = Math.max(1, Math.min(at, count + 1)); const name = oneLine(step.name) || (step.file ? '' : 'New step'); /* no title: its instructions name it */
  let lines = mapThen(split(md), (i, _n, to) => { if (i === pos - 1 && !NEXT.test(to.trim())) { const t = resolveTarget(old, i, to); if (pos <= count ? t.kind === 'step' && t.n === pos : t.kind === 'done') return name || `step ${pos}`; }
    return shift(to, (k) => (k >= pos ? k + 1 : k)); });
  const hs = heads(lines); const section = buildSection(String(pos), { name, agent: oneLine(step.agent), link: step.file ?? '', text: textLines(step.text ?? ''), in: '', out: '', then: '', wlines: [] });
  let where: number;
  if (pos <= count) where = hs[pos - 1]!;
  else { const last = hs[hs.length - 1]; where = lines.length; if (last != null) for (let i = last + 1; i < lines.length; i++) if (WF_KEY.test(lines[i]!.trim())) { where = i; break; } }
  if (where > 0 && lines[where - 1]!.trim()) section.unshift('');
  lines = [...lines.slice(0, where), ...section, ...lines.slice(where)];
  return join(renumber(lines));
}

/** A step taken out: what led to it now leads to the step that followed it (or to Done, when it was the last); numbers after it move down. */
export function removeStep(md: string, n: number): string {
  const old = parseWorkflow(md); const count = old.steps.length; if (n < 1 || n > count) return md;
  const following = n < count ? old.steps[n]!.name || `step ${n}` : 'Done';
  let lines = mapThen(split(md), (i, _n, to) => { if (i === n) return to; if (!NEXT.test(to.trim())) { const t = resolveTarget(old, i, to); if (t.kind === 'step' && t.n === n) return following; }
    return shift(to, (k) => (k > n ? k - 1 : k)); });
  const hs = heads(lines); const start = hs[n - 1]!, end = hs[n] ?? lines.length; const sec = readSection(lines, start, end);
  lines = [...lines.slice(0, start), ...(sec.wlines.length ? [...sec.wlines, ''] : []), ...lines.slice(end)];
  return join(renumber(lines));
}

/** The file for a new step's instructions, or a renamed one's: `<workflow>/<its name>.md` in the workflow's own folder, `-2`, `-3` after
 *  it while that name is taken (by another step, or the folder's README). */
export function stepFileFor(workflowFile: string, name: string, taken: string[]): string {
  const base = workflowBase(workflowFile); const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') || 'step';
  const used = new Set(taken.map((t) => t.toLowerCase())); used.add(`${base}/readme.md`.toLowerCase());
  for (let i = 1; ; i++) { const f = `${base}/${stem}${i > 1 ? `-${i}` : ''}.md`; if (!used.has(f.toLowerCase())) return f; }
}

export type MetaPatch = Partial<{ name: string; desc: string; when: string; done: string }>;
/** The workflow's own lines: its title, the line on what it does, when it runs, what a run leaves behind. */
export function setMeta(md: string, patch: MetaPatch): string {
  let lines = split(md); const first = heads(lines)[0] ?? lines.length;
  const set = (key: 'when' | 'done', v: string, where: () => number) => { const re = new RegExp(`^\\s*${key}\\s*:`, 'i'); const i = lines.findIndex((l) => re.test(l)); const line = `${key}: ${oneLine(v)}`;
    if (!oneLine(v)) { if (i >= 0) lines.splice(i, 1); return; } if (i >= 0) lines[i] = line; else { const w = where(); lines.splice(w, 0, line, ''); } };
  if (patch.name != null && oneLine(patch.name)) { const i = lines.findIndex((l, k) => k < first && /^#\s+/.test(l.trim())); if (i >= 0) lines[i] = `# ${oneLine(patch.name)}`; else lines.unshift(`# ${oneLine(patch.name)}`, ''); }
  if (patch.desc != null) { const top = heads(lines)[0] ?? lines.length; const title = lines.findIndex((l, k) => k < top && /^#\s+/.test(l.trim()));
    const keep = lines.slice(0, top).filter((l, k) => k === title || HEAD_KEY.test(l.trim())); const keys = keep.filter((l) => HEAD_KEY.test(l.trim()));
    const header = [...(title >= 0 ? [lines[title]!, ''] : []), ...(oneLine(patch.desc) ? [oneLine(patch.desc), ''] : []), ...(keys.length ? [...keys, ''] : [])];
    lines = [...header, ...lines.slice(top)]; }
  if (patch.when != null) set('when', patch.when, () => { const top = heads(lines)[0] ?? lines.length; return top; });
  if (patch.done != null) set('done', patch.done, () => lines.length);
  return join(lines);
}
