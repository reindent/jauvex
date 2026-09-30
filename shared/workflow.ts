// A workflow is a markdown file in a project folder (workflows/<name>.md) and a folder beside it (workflows/<name>/): one file there per
// step, its instructions (T-168), and the runs, markdown records (workflows/<name>/runs/NNN.md), never in the definition. Both are parsed
// here, for the window and the main process alike.
//
// The definition:   # Title, a paragraph, `when:` `folder:` `on failure:` lines, then one `## N. [Step](<name>/step.md) → Agent` per step,
//                   in order: its name, linked to the file of its instructions, and who does it; `→ you` makes a step a human-in-the-loop
//                   gate; `done:` ends it. That is all a step is (the user, 2026-09-27). Older files, still read: the instructions as free
//                   text under the heading, with `in:` `out:` lines; `then: done → Next · failed → stop, tell the user` names the outcomes (with
//                   none, the usual ones: outcomes() below), every part after the first a branch.
// Tries (T-197, the user, 2026-09-28): `tries: N` under `when:` is how many times a step may come round with no decision of the user's in
//                   between (DEFAULT_TRIES when there is none); a step's own `tries: N` line, in its instructions, overrides it for that step.
//                   A decision of the user's starts the count again: a loop that goes through them has no limit; one between agents alone does.
// A run record:     # Run N, `started:` `result:` `took:` lines, then `## N. Step` sections with `took:` `started:` `result:` `said:`.

/** file: the step's instructions file as its heading links it (relative to workflows/), '' for one written under its heading; prompt: its
 *  instructions, with their lines; note: the same on one line. */
export type WorkflowStep = { name: string; agent: string; gate: boolean; file: string; prompt: string; note: string; in: string; out: string; then: string; branches: string[]; tries: number | null /* a `tries:` line in its instructions (T-197) */ };
export type Workflow = { name: string; desc: string; when: string; folder: string; onFailure: string; done: string; tries: number | null /* its `tries:` line (T-197) */; steps: WorkflowStep[]; file?: string };
/** How many times a step may come round with no decision of the user's in between, when neither it nor its workflow says (T-197). */
export const DEFAULT_TRIES = 6;
/** A step's tries: its own line, else its workflow's, else the default. */
export const triesOf = (def: Workflow, n: number): number => def.steps[n - 1]?.tries ?? def.tries ?? DEFAULT_TRIES;
const triesIn = (v: string): number | null => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : null; };
/** asks: what the step's agent told the user to do at the step after it, theirs (its FOR YOU line: askOf). */
export type RunStep = { took: number | null; tookText?: string; started: string; result: string; said: string; asks?: string };
/** version: the workflow's version the run ran (T-169: workflows/<name>/versions/NNN.md, taken when a run starts and the workflow changed). */
export type Run = { n: number; started: string; ended: string; result: string; took: number | null; tookText?: string; version?: number; by?: string /* what started it when not a person: its schedule, another workflow (T-204) */; steps: Record<number, RunStep>; file: string };
export type StepState = [kind: 'ok' | 'run' | 'wait' | 'er' | '', text: string];
/** What the sidebar shows for a workflow; latest.waiting: its live run waits for a person at a step of theirs (marked yellow). */
export type WorkflowInfo = { file: string; name: string; when: string; steps: number; runs: number; latest: { n: number; result: string; took: number | null; started: string; waiting?: boolean } | null;
  modified?: number /* ms: the last change of its file or its steps' instructions (not its runs) */ };
/** The order of a folder's workflows in the sidebar (the user, 2026-09-29: "when it needs a human supervision, it should be on top, 100% ...
 *  when a workflow is running, that is considered as an update. It should move to the top ... then by those that were last modified, not
 *  created or last run"): the ones waiting for a person, then the ones running, then the rest by their last change, the newest first. */
export function sortWorkflows<T extends WorkflowInfo>(list: T[]): T[] {
  const live = (w: T) => !!w.latest && /^running/i.test(w.latest.result);
  const tier = (w: T) => (live(w) && w.latest!.waiting ? 0 : live(w) ? 1 : 2);
  return [...list].sort((a, b) => tier(a) - tier(b) || (b.modified ?? 0) - (a.modified ?? 0) || a.name.localeCompare(b.name));
}
export type WorkflowState = { runs: Run[]; latest: Run | null; live: boolean; st: Record<number, StepState>; last: Record<number, string>; said: Record<number, [string, string]>; avg: number | null; stepAvg: (number | null)[]; finished: number; text: string; sel: number };

const ARROW = /\s*(?:→|->)\s*/;
/** A step's name in its heading, linked to the file of its instructions: `[Script](news-video/script.md)`. */
export const STEP_LINK = /^\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)$/;
export const GATE = /^(you|me|the user|a human|human|user|operator)$/i; // "→ you" is the word; a person's name still works for old files
/** What a step is called: its title when it has one, else its instructions, cut short (the user, 2026-09-27: "the title of a workflow
 *  step should go after description and should be editable and optional ... if it's not set, then just use the description with
 *  ellipses"); a step with neither is a new step. */
export const stepTitle = (s: { name: string; note: string }): string => { if (s.name.trim()) return s.name.trim(); const t = s.note.trim(); if (!t) return 'New step';
  return t.length <= 48 ? t : `${t.slice(0, 48).replace(/\s+\S*$/, '').replace(/[\s,;:.]+$/, '')}…`; };
/** The workflow's own folder, as a step's link starts with it: `news-video` for workflows/news-video.md. */
export const workflowBase = (workflowFile: string): string => /(?:^|\/)([^/]+)\.md$/.exec(workflowFile)?.[1] ?? '';
/** A step's instructions file as a heading may link it (relative to workflows/): a markdown file directly in the workflow's own folder, never
 *  its README, its runs or anything outside it. What the app reads and writes for a step, and nothing else. */
export const stepFileOk = (workflowFile: string, stepFile: string): boolean => { const base = workflowBase(workflowFile); const m = /^([^/\\]+)\/([^/\\]+\.md)$/.exec(stepFile);
  return !!base && !!m && m[1] === base && !/^readme\.md$/i.test(m[2]!) && !m[2]!.startsWith('.'); };

/** prompts: the steps' instructions files as read (by the path their heading links, relative to workflows/); a linked step whose file is not
 *  among them keeps what is written under its heading, if anything. */
export function parseWorkflow(md: string, file?: string, prompts?: Record<string, string>): Workflow {
  const w: Workflow = { name: '', desc: '', when: '', folder: '', onFailure: '', done: '', tries: null, steps: [], ...(file ? { file } : {}) }; const desc: string[] = []; let step: (WorkflowStep & { lines: string[] }) | null = null; let m: RegExpExecArray | null;
  const steps: (WorkflowStep & { lines: string[] })[] = [];
  for (const raw of md.split('\n')) { const line = raw.trim();
    if ((m = /^#\s+(.+)$/.exec(line))) { w.name = m[1]!.trim(); continue; }
    if ((m = /^##\s+(.+)$/.exec(line))) { const h = m[1]!; const a = ARROW.exec(h); const head = (a ? h.slice(0, a.index) : h).replace(/^\d+\.\s*/, '').trim(); const agent = a ? h.slice(a.index + a[0].length).trim() : '';
      const link = STEP_LINK.exec(head); step = { name: link ? link[1]!.trim() : head, agent, gate: GATE.test(agent), file: link ? link[2]! : '', prompt: '', note: '', in: '', out: '', then: '', branches: [], tries: null, lines: [] }; steps.push(step); continue; }
    if ((m = /^(when|folder|on failure|done|in|out|then|tries)\s*:\s*(.+)$/i.exec(line))) { const k = m[1]!.toLowerCase(), v = m[2]!.trim();
      if (k === 'tries') { if (step) step.tries = triesIn(v); else w.tries = triesIn(v); continue; }
      if (step && (k === 'in' || k === 'out' || k === 'then')) step[k] = v; else if (k === 'when') w.when = v; else if (k === 'folder') w.folder = v; else if (k === 'on failure') w.onFailure = v; else if (k === 'done') w.done = v; continue; }
    if (!line) continue; if (step) step.lines.push(line); else desc.push(line); }
  w.desc = desc.join(' ');
  for (const st of steps) { const { lines, ...rest } = st; const own = rest.file ? prompts?.[rest.file] : undefined;
    rest.prompt = own != null ? own.replace(/\r/g, '').trim() : lines.join('\n'); if (rest.tries == null) { const t = /^\s*tries\s*:\s*(\d+)/im.exec(rest.prompt); if (t) rest.tries = triesIn(t[1]!); } /* a step's own tries, in its instructions (T-197) */ rest.note = rest.prompt.split('\n').map((x) => x.trim()).filter(Boolean).join(' '); const parts = rest.then.split('·').map((x) => x.trim()).filter(Boolean);
    rest.branches = parts.filter((x) => !/^(done|approved|continue|green|ok)?\s*(→|->)/.test(x)).map((x) => { const a = ARROW.exec(x); return a ? `${x.slice(0, a.index)}: ${x.slice(a.index + a[0].length)}` : x; }); w.steps.push(rest); }
  return w;
}

/** "1 h 48", "14 m", "2 h", "9 min" as minutes; null when there is none. */
export const mins = (t: string | null | undefined): number | null => { if (!t) return null; const h = /(\d+)\s*h(?:\s*(\d+))?/.exec(t); if (h) return Number(h[1]) * 60 + (h[2] ? Number(h[2]) : 0); const mm = /(\d+)\s*m/.exec(t); if (mm) return Number(mm[1]); const ss = /(\d+)\s*s/.exec(t); return ss ? Number(ss[1]) / 60 : null; };
export const fmt = (n: number | null | undefined): string => n == null ? '' : n >= 60 ? `${Math.floor(n / 60)} h ${String(Math.round(n % 60)).padStart(2, '0')}` : n < 1 ? `${Math.round(n * 60)} s` : `${Math.round(n)} m`;
/** Minutes between two times as the record writes them: "1 h 48", "14 m", "40 s". */
export const took = (fromMs: number, toMs = Date.now()): string => { const s = Math.max(0, Math.round((toMs - fromMs) / 1000)); if (s < 60) return `${s} s`; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} m`; };
export const stamp = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function parseRun(md: string, file = ''): Run {
  const r: Run = { n: 0, started: '', ended: '', result: '', took: null, steps: {}, file }; let cur: RunStep | null = null; let m: RegExpExecArray | null;
  for (const raw of md.split('\n')) { const line = raw.trim();
    if ((m = /^#\s+Run\s+(\d+)/i.exec(line))) { r.n = Number(m[1]); continue; }
    if ((m = /^##\s+(\d+)\./.exec(line))) { cur = r.steps[Number(m[1])] = { took: null, started: '', result: '', said: '' }; continue; }
    if ((m = /^(started|ended|result|took|said|asks|version|by)\s*:\s*(.+)$/i.exec(line))) { const k = m[1]!.toLowerCase(), v = m[2]!.trim();
      if (k === 'version') { if (!cur && /^\d+$/.test(v)) r.version = Number(v); continue; }
      if (k === 'by') { if (!cur) r.by = v; continue; }
      if (k === 'took') { if (cur) { cur.took = mins(v); cur.tookText = v; } else { r.took = mins(v); r.tookText = v; } } else if (cur) { if (k === 'started' || k === 'result' || k === 'said' || k === 'asks') cur[k] = v; } else if (k === 'started' || k === 'ended' || k === 'result') r[k] = v; } }
  return r;
}

export const FINISHED = /^(published|sent|released|submitted|done|finished|ok)/i;

/** What the runs say about a workflow: the live run's state per step, the history, the averages (the workflow's, and each step's). */
export function stateFor(def: Workflow, runsIn: Run[]): WorkflowState {
  const runs = [...runsIn].sort((a, b) => b.n - a.n); const latest = runs[0] ?? null; const total = def.steps.length; const st: Record<number, StepState> = {}, last: Record<number, string> = {}, said: Record<number, [string, string]> = {};
  const finished = runs.filter((r) => r.took != null); const avg = finished.length ? Math.round(finished.reduce((a, r) => a + (r.took ?? 0), 0) / finished.length) : null;
  const stepAvg = def.steps.map((_, i) => { const xs = runs.map((r) => r.steps[i + 1]?.took).filter((x): x is number => x != null); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; });
  const live = !!latest && /^running/i.test(latest.result);
  if (latest) for (let i = 1; i <= total; i++) { const x = latest.steps[i]; if (x?.said) said[i] = [x.started || latest.started.slice(-5), x.said];
    if (!x) { if (live && st[i - 1] && st[i - 1]![0] === 'run') st[i] = ['', 'next']; continue; }
    if (x.took != null) { if (live) st[i] = ['ok', `done · ${fmt(x.took)}`]; } else if (/^waiting/i.test(x.result)) { if (live) st[i] = ['wait', x.result]; } else if (/fail/i.test(x.result)) st[i] = ['er', 'failed']; else if (x.result) st[i] = ['er', x.result]; else if (x.started) { st[i] = ['run', 'running']; last[i] = x.said; } }
  if (!live) for (let i = 1; i <= total; i++) if (!st[i] && stepAvg[i - 1] != null) st[i] = ['', `avg ${fmt(stepAvg[i - 1])}`];
  const k = live ? Number(Object.keys(st).find((i) => st[Number(i)]![0] === 'run' || st[Number(i)]![0] === 'wait') ?? 0) : 0;
  const text = !latest ? 'Never run' : live ? `Run #${latest.n} · step ${k || '?'} of ${total} · started ${latest.started.slice(-5)}` : `${FINISHED.test(latest.result) ? 'Idle' : 'Stopped'} · last run #${latest.n}: ${latest.result}${latest.took != null ? ` · ${fmt(latest.took)}` : ''}${avg != null ? ` · average ${fmt(avg)} over ${finished.length} run${finished.length > 1 ? 's' : ''}` : ''}`;
  // the step the workflow is at (the user, 2026-09-27: "the current step it's at, if not initiated then first step, if already finished then last
  // step"): the live run's, else the last one the latest run reached, else the first
  const reached = latest ? Math.max(0, ...Object.keys(latest.steps).map(Number).filter((i) => i >= 1 && i <= total)) : 0;
  return { runs, latest, live, st, last, said, avg, stepAvg, finished: finished.length, text, sel: k || reached || 1 };
}

/** A run record as markdown, the shape parseRun reads: the runner rewrites the whole file at every change. */
export function formatRun(run: Run, def: Workflow): string {
  const lines = [`# Run ${run.n}`, `started: ${run.started}`]; if (run.by) lines.push(`by: ${run.by}`); if (run.ended) lines.push(`ended: ${run.ended}`); lines.push(`result: ${run.result}`); if (run.tookText ?? run.took != null) lines.push(`took: ${run.tookText ?? fmt(run.took)}`); if (run.version) lines.push(`version: ${run.version}`);
  for (const k of Object.keys(run.steps).map(Number).sort((a, b) => a - b)) { const x = run.steps[k]!; lines.push('', `## ${k}. ${def.steps[k - 1] ? stepTitle(def.steps[k - 1]!) : `Step ${k}`}`); if (x.started) lines.push(`started: ${x.started}`); if (x.tookText ?? x.took != null) lines.push(`took: ${x.tookText ?? fmt(x.took)}`); if (x.result) lines.push(`result: ${x.result}`); if (x.said) lines.push(`said: ${x.said.replace(/\s+/g, ' ').trim()}`); if (x.asks) lines.push(`asks: ${x.asks.replace(/\s+/g, ' ').trim()}`); }
  return lines.join('\n') + '\n';
}

// ---- running: the outcomes of a step, the one a reply names, and where each leads
export type Outcome = { name: string; to: string };
export type Target = { kind: 'step'; n: number } | { kind: 'done' } | { kind: 'stop'; note: string };
/** The `then:` line as outcomes: `done → Next · failed → stop, tell the user`. A step is an agent and its instructions (the user, 2026-09-27:
 *  "a step is just an agent and instructions ... that's all"): with no then line it has the usual outcomes, an agent's step done (on to the
 *  next) or failed (the run stops), a step of yours continue (on to the next: the user, 2026-09-27, "the approved button is misleading.
 *  The agent is asking me a question that is not necessarily something to approve") or changes (back to the step before, with the notes). */
export const outcomes = (step: WorkflowStep): Outcome[] => { const parts = step.then.split('·').map((x) => x.trim()).filter(Boolean).map((x) => { const a = ARROW.exec(x); return a ? { name: x.slice(0, a.index).trim(), to: x.slice(a.index + a[0].length).trim() } : { name: x, to: 'next' }; });
  return parts.length ? parts : step.gate ? [{ name: 'continue', to: 'next' }, { name: 'changes', to: 'back to the step before with your notes' }] : [{ name: 'done', to: 'next' }, { name: 'failed', to: 'stop, tell the user' }]; };
const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The outcome a reply names on its OUTCOME line (the last one wins), matched to the step's outcomes without case or punctuation, exact
 * before contained; with one outcome only, or none written (done, then), a reply without the line still counts. Null: the runner asks once
 * more, then stops the run. */
export function matchOutcome(step: WorkflowStep, reply: string): Outcome | null {
  const all = outcomes(step); const lines = [...reply.matchAll(/^\s*\**\s*OUTCOME\s*[:：]\s*\**\s*(.+?)\s*\**\s*$/gim)].map((m) => m[1]!.trim()); const named = lines[lines.length - 1];
  if (!named) return all.length === 1 || !step.then.trim() ? all[0]! : null;
  const want = squash(named); return all.find((o) => squash(o.name) === want) ?? all.find((o) => want.includes(squash(o.name)) || squash(o.name).includes(want)) ?? null;
}
/** What a step's agent tells the user to do at the step after it, theirs: its reply's FOR YOU line (the last one wins), '' when there is none.
 *  The user, 2026-09-27, at a number-guessing workflow's approval: "there's no instruction or anything ... the previous step ... should have
 *  asked ... make it generic". */
export const askOf = (reply: string): string => { const all = [...reply.matchAll(/^\s*\**\s*FOR YOU\s*[:：]\s*\**\s*(.+?)\s*\**\s*$/gim)]; return all.length ? all[all.length - 1]![1]!.trim() : ''; };
/** The step a gate's user is answering: the one before it with words in this run (the last one that spoke, when none before it did). */
export const stepBefore = (run: Run | null | undefined, n: number): number => { if (!run) return 0; const ks = Object.keys(run.steps).map(Number).filter((k) => k !== n && run.steps[k]?.said).sort((a, b) => b - a); return ks.find((k) => k < n) ?? ks[0] ?? 0; };
/** Where an outcome leads: the next step, a step by number or name ("back to step 1 with your notes", "Assets"), the end ("Done"), or a stop. */
export function resolveTarget(def: Workflow, from: number, to: string): Target {
  const t = to.trim(); const low = t.toLowerCase();
  if (/^(next|next step|continue|on)$/.test(low)) return from >= def.steps.length ? { kind: 'done' } : { kind: 'step', n: from + 1 };
  if (/^(done|finish|finished|end|the end)\b/.test(low)) return { kind: 'done' };
  if (/^(stop|abort|halt|fail|cancel)\b/.test(low)) return { kind: 'stop', note: t };
  const num = /(?:^|step\s*)(\d+)\b/.exec(low); if (num) { const n = Number(num[1]); if (n >= 1 && n <= def.steps.length) return { kind: 'step', n }; }
  if (/^back$|^back\b.*\b(step before|previous step|previous one)\b/.test(low)) return from > 1 ? { kind: 'step', n: from - 1 } : { kind: 'stop', note: t };
  const byName = def.steps.findIndex((s) => squash(s.name) === squash(t) || squash(t).includes(squash(s.name)) && squash(s.name).length > 3); if (byName >= 0) return { kind: 'step', n: byName + 1 };
  return { kind: 'stop', note: t };
}
/** The message a step sends to its agent: where it sits, what came before, what to produce, and how to end the reply. */
export function stepMessage(def: Workflow, n: number, run: Run, runFolder: string, root = ''): string {
  const abs = (x: string) => (root && !x.startsWith('/') ? `${root.replace(/\/$/, '')}/${x}` : x);
  const s = def.steps[n - 1]!; const total = def.steps.length; const prev = Object.keys(run.steps).map(Number).filter((k) => k !== n && run.steps[k]?.said).sort((a, b) => b - a)[0];
  const names = outcomes(s).map((o) => o.name);
  // the step after it is the user's (its happy path leads to a gate): the user reads this reply there, so it ends by telling them what to do
  const t = resolveTarget(def, n, outcomes(s)[0]?.to ?? 'next'); const g = t.kind === 'step' ? def.steps[t.n - 1] : undefined;
  const forYou = g?.gate ? `The next step, "${stepTitle(g)}", is the user's, and they read your reply there${g.note ? `; it says: "${g.note}"` : ''}. Just before the OUTCOME line, add one line that starts with FOR YOU: and tells them plainly what to do now (what to answer, check or decide).` : '';
  return [`(from the app) Workflow "${def.name}", run ${run.n}, step ${n} of ${total}: "${stepTitle(s)}" is yours.`, s.prompt, s.in ? `In: ${s.in}` : '', s.out ? `Out: ${s.out}` : '',
    prev ? `Step ${prev} ("${def.steps[prev - 1] ? stepTitle(def.steps[prev - 1]!) : ''}") ended with: ${run.steps[prev]!.said}` : '', `The workflow's folder is ${root || 'the current folder'}. Files of this run go in ${abs(runFolder)} (it exists; use this full path, you may be running in another folder). The workflow file is ${def.file ? abs(def.file) : 'in the workflows folder'}; read it if you need the whole picture.`,
    forYou, `Do the step, then end your reply with one line: OUTCOME: ${names.length > 1 ? `one of ${names.map((x) => `"${x}"`).join(', ')}` : `"${names[0]}"`}. Nothing else after that line.`].filter(Boolean).join('\n');
}

// ---- triggers: the `when:` line. manual (the Run button, a command, a word to an agent); a schedule ("every Monday 09:00",
// "every weekday 8:30", "every day at 7pm", "every 2 hours", "every 30 minutes"); an event ("after News video", a workflow of the same
// folder finishing done). Schedules fire while the app is open: a slot is waited for ten minutes; one missed while the app was closed is
// the setting's (missedSlot: run it when the app opens, ask the user, or nothing).
export type Trigger = { kind: 'manual' } | { kind: 'every'; minutes: number } | { kind: 'at'; days: number[] /* 0 Sunday .. 6; empty: every day */; h: number; m: number } | { kind: 'after'; workflow: string }
  | { kind: 'window'; days: number[]; from: number; to: number /* minutes of the day: once, at a random time between them (T-204) */ };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function parseTrigger(when: string): Trigger {
  const w = when.toLowerCase().trim().replace(/\ba\.\s?m\.?/g, 'am').replace(/\bp\.\s?m\.?/g, 'pm'); let m: RegExpExecArray | null;
  // A window (the user, 2026-09-29: "anytime between 9 and 12 a.m."): "every weekday between 9am and 12pm", "anytime between 9 and 12".
  if (!/^(?:after|when)\s/.test(w) && (m = /\bbetween\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(w))) {
    const h1 = Number(m[1]), m1 = Number(m[2] ?? 0), h2 = Number(m[4]), m2 = Number(m[5] ?? 0); const s2 = m[6]; const s1 = m[3] ?? (s2 === 'pm' ? (h1 < h2 || h1 === 12 ? 'pm' : 'am') : s2);
    const at = (h: number, s: string | undefined) => (s === 'pm' ? (h % 12) + 12 : s === 'am' ? h % 12 : h);
    const from = at(h1, s1) * 60 + m1; let to = at(h2, s2) * 60 + m2;
    if (to <= from && s2 === 'am' && h2 === 12) to = 12 * 60 + m2; // "between 9 and 12 am": the morning, up to noon
    if (to > from && to <= 24 * 60 && m1 < 60 && m2 < 60) return { kind: 'window', days: daysIn(w), from, to };
    return { kind: 'manual' };
  }
  if ((m = /^(?:after|when)\s+(.+?)(?:\s+(?:finishes|is done|ends|completes|succeeds))?\s*$/.exec(w)) && !/^(?:after|when)\s+(?:every|each)\b/.test(w)) return { kind: 'after', workflow: m[1]!.replace(/^["'“]|["'”]$/g, '') };
  if ((m = /\b(?:every|each)\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/.exec(w))) { const n = Number(m[1]); return { kind: 'every', minutes: /^h/.test(m[2]!) ? n * 60 : n }; }
  if (/\b(?:every|each)\s+hour\b|\bhourly\b/.test(w)) return { kind: 'every', minutes: 60 };
  const t = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?!\s*(?:minutes?|hours?|mins?|hrs?))/.exec(w.replace(/\b(\d+)\s*(?:minutes?|hours?)\b/g, ''));
  let h = 9, mm = 0; if (t && (t[2] || t[3])) { h = Number(t[1]) % 24; mm = Number(t[2] ?? 0); if (t[3] === 'pm' && h < 12) h += 12; if (t[3] === 'am' && h === 12) h = 0; }
  const days = daysIn(w);
  if (/\b(?:every|each|daily|weekly|on)\b/.test(w) && (days.length || /\b(?:day|daily|morning|evening|night)\b/.test(w) || (t && (t[2] || t[3])))) return { kind: 'at', days, h, m: mm };
  return { kind: 'manual' };
}
/** The days a schedule names: weekdays, weekends, named days; none named is every day. */
function daysIn(w: string): number[] { return /\bweekdays?\b/.test(w) ? [1, 2, 3, 4, 5] : /\bweekends?\b/.test(w) ? [0, 6] : DAYS.map((d, i) => (new RegExp(`\\b${d}[a-z]*\\b`).test(w) ? i : -1)).filter((i) => i >= 0); }
/** How often the app looks at the schedules. A window's chance per look is worked out from it, so a change here keeps the draw even. */
export const SCHEDULE_TICK_MS = 15_000;
/** A window's run, looked at once per tick: the window's start when it should start now, else null. Each tick of the window gets the same
 *  chance of being the one: with R ticks left, this one's is 1/R, so the last tick of the window runs it for sure; a window missed by at
 *  most ten minutes (the app was closed at its end) runs at once; once it ran in a window, not again until the next. */
export function windowDue(tr: Trigger, lastStarted: string | null | undefined, now = new Date(), tickMs = SCHEDULE_TICK_MS, random: () => number = Math.random): Date | null {
  if (tr.kind !== 'window') return null;
  const day = new Date(now); day.setHours(0, 0, 0, 0); if (tr.days.length && !tr.days.includes(day.getDay())) return null;
  const start = new Date(day.getTime() + tr.from * 60_000), end = new Date(day.getTime() + tr.to * 60_000);
  if (now.getTime() < start.getTime() || now.getTime() - end.getTime() > 10 * 60_000) return null;
  const started = lastStarted ? new Date(lastStarted.replace(' ', 'T')) : null; if (started && !Number.isNaN(started.getTime()) && started.getTime() >= start.getTime()) return null;
  if (now.getTime() >= end.getTime()) return start;
  const left = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / tickMs));
  return random() < 1 / left ? start : null;
}
/** The latest slot of a schedule at or before now; null for a trigger that is not a schedule. */
export function lastSlot(tr: Trigger, now = new Date()): Date | null {
  if (tr.kind === 'every') { const step = Math.max(1, tr.minutes) * 60_000; const d = new Date(now); d.setSeconds(0, 0); const base = new Date(d); base.setHours(0, 0, 0, 0); return new Date(base.getTime() + Math.floor((d.getTime() - base.getTime()) / step) * step); }
  if (tr.kind === 'window') return lastSlot({ kind: 'at', days: tr.days, h: Math.floor(tr.from / 60), m: tr.from % 60 }, now);
  if (tr.kind !== 'at') return null;
  for (let back = 0; back <= 7; back++) { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(tr.h, tr.m, 0, 0); if (d.getTime() <= now.getTime() && (!tr.days.length || tr.days.includes(d.getDay()))) return d; }
  return null;
}
/** The next slot after now, for the view. */
export function nextSlot(tr: Trigger, now = new Date()): Date | null {
  if (tr.kind === 'every') { const last = lastSlot(tr, now)!; return new Date(last.getTime() + Math.max(1, tr.minutes) * 60_000); }
  if (tr.kind === 'window') return nextSlot({ kind: 'at', days: tr.days, h: Math.floor(tr.from / 60), m: tr.from % 60 }, now);
  if (tr.kind !== 'at') return null;
  for (let ahead = 0; ahead <= 7; ahead++) { const d = new Date(now); d.setDate(d.getDate() + ahead); d.setHours(tr.h, tr.m, 0, 0); if (d.getTime() > now.getTime() && (!tr.days.length || tr.days.includes(d.getDay()))) return d; }
  return null;
}
/** A schedule is due when its latest slot is under ten minutes old and no run started at or after it. */
export function isDue(tr: Trigger, lastStarted: string | null | undefined, now = new Date()): Date | null {
  if (tr.kind === 'window') return null; // a window draws its time: windowDue
  const slot = lastSlot(tr, now); if (!slot || now.getTime() - slot.getTime() > 10 * 60_000) return null;
  const started = lastStarted ? new Date(lastStarted.replace(' ', 'T')) : null; if (started && !Number.isNaN(started.getTime()) && started.getTime() >= slot.getTime()) return null;
  return slot;
}
/** What the app does with a schedule it missed while it was closed (T-208; the user, 2026-09-29: "if a workflow was missed because the app
 *  was closed, it should at least be prompted"): run it as soon as the app opens, tell the user and ask (the default), or nothing. In the
 *  settings' order: the first option runs it. */
export type MissedPolicy = 'run' | 'alert' | 'nothing';
export const MISSED_DEFAULT: MissedPolicy = 'alert';
export const MISSED_OPTIONS: readonly (readonly [MissedPolicy, string])[] = [['run', 'Run it as soon as the app opens'], ['alert', 'Tell me, and ask whether to run it'], ['nothing', 'Do nothing']];
/** The latest slot of a schedule that passed while the app was not looking at it (after `lookedAt`, the app's last look at the folder's
 *  schedules: it was closed, or the computer asleep), that the schedule itself will not run any more (over ten minutes ago; for a window,
 *  over ten minutes after its end), with no run started since. Only the latest: a day of missed hourly slots is one. Null when there is
 *  none, and when the last look is not known (a first start, a folder new to this computer). */
export function missedSlot(tr: Trigger, lastStarted: string | null | undefined, lookedAt: number | null | undefined, now = new Date()): Date | null {
  if (lookedAt == null || !Number.isFinite(lookedAt) || (tr.kind !== 'every' && tr.kind !== 'at' && tr.kind !== 'window')) return null;
  const slot = lastSlot(tr, now); if (!slot) return null;
  const end = slot.getTime() + (tr.kind === 'window' ? (tr.to - tr.from) * 60_000 : 0); // a window can run up to its end
  if (now.getTime() - end <= 10 * 60_000 || end <= lookedAt) return null; // the schedule still has it, or the app was open when it came
  const started = lastStarted ? new Date(lastStarted.replace(' ', 'T')) : null; if (started && !Number.isNaN(started.getTime()) && started.getTime() >= slot.getTime()) return null;
  return slot;
}
const clock = (d: Date, now: Date) => `${d.toDateString() === now.toDateString() ? 'today' : DAYS[d.getDay()]!.replace(/^./, (c) => c.toUpperCase())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** A missed run started when the app opens: its record's `by:` line. */
export const missedBy = (when: string, slot: Date, now = new Date()): string => `its schedule (${when}), missed ${clock(slot, now)} while the app was closed`;
export type Missed = { name: string; file: string; folder: string; when: string; slot: Date };
/** What the app's own agent (Jauvex) is told of the workflows missed while the app was closed, when the setting says to ask: it asks the
 *  user in words, and runs them on a yes (the app's `run` order); nothing runs by itself. */
export const missedNote = (items: Missed[], now = new Date()): string => {
  const many = items.length > 1;
  return `(from the app) While the app was closed (or this computer asleep), ${many ? 'these workflows' : 'this workflow'} missed ${many ? 'their' : 'its'} schedule: ` +
    `${items.map((m) => `"${m.name}" in the folder ${m.folder} (${m.when}; due ${clock(m.slot, now)})`).join('; ')}. The setting for missed workflows says to ask the user: ` +
    `tell them in one short line and ask whether to run ${many ? 'them' : 'it'} now. On a yes, run ${many ? 'each one' : 'it'} with the app's run order ` +
    `(${items.map((m) => `\`run --folder "${m.folder}" --workflow "${m.file}"\``).join(', ')}); on a no, leave ${many ? 'them' : 'it'}: the schedule goes on at the next slot. ` +
    'The user can change what the app does with a missed workflow in the settings (Workflows), or you can with `settings --workflow-missed run|alert|nothing` on their word.';
};
/** An event trigger that names this workflow (by its title or its file name, case and punctuation aside). */
export const firesAfter = (tr: Trigger, def: { name: string; file?: string }): boolean => { if (tr.kind !== 'after') return false; const sq = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ''); const want = sq(tr.workflow); return !!want && (want === sq(def.name) || want === sq((def.file ?? '').replace(/^workflows\//, '').replace(/\.md$/, ''))); };
export const describeTrigger = (tr: Trigger, now = new Date()): string => { const n = nextSlot(tr, now); const at = (d: Date) => `${d.toDateString() === now.toDateString() ? 'today' : DAYS[d.getDay()]!.replace(/^./, (c) => c.toUpperCase())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const hm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  if (tr.kind === 'window') return `once, at a random time between ${hm(tr.from)} and ${hm(tr.to)}${n ? ` · next window ${at(n).replace(/ \d\d:\d\d$/, '')}` : ''}`;
  return tr.kind === 'manual' ? 'by hand' : tr.kind === 'after' ? `after "${tr.workflow}" finishes` : n ? `next ${at(n)}` : ''; };
