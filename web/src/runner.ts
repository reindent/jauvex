// Runs one workflow: one message per step to the agent it names, through the channel the agents already use; the reply's OUTCOME line
// picks the branch; a step addressed to the user waits for their decision; the run's record (markdown, in the workflow's folder) is
// rewritten at every change, so the view, the history and the averages follow. Pure apart from the two things it is given: how to
// deliver a message to an agent and how to save the record (tests hand it fakes).
import { askOf, saidOf, stepReplyText, formatRun, matchOutcome, outcomes, resolveTarget, stepMessage, stepTitle, stamp, took, mins, triesOf, type Run, type Workflow } from '../../shared/workflow';

export type Delivered = { ok: true } | { ok: false; note: string };
export type RunnerDeps = { deliver: (agent: string, text: string, step: number) => Promise<Delivered>; save: (md: string) => Promise<void>; log?: (text: string) => void;
  saveStep?: (step: number, reply: string) => Promise<void>; /* the step's full reply, kept in the run's folder for the gate after it */
  onGate?: (step: number, name: string, asks?: string) => void; /* the run waits for the user */ onFinish?: (result: string) => void; /* done, stopped or failed */ };

export class Runner {
  current = 0; waiting: 'agent' | 'user' | null = null; over = false;
  private retried = false; private first = ''; /* the reply that had no OUTCOME line: its words and its FOR YOU line still count */ private startedAt: Record<number, number> = {}; private runStart: number; private visits: Record<number, number> = {};
  root = ''; // the workflow's folder, absolute: step messages name files by their full path
  constructor(public def: Workflow, public run: Run, public folder: string, private deps: RunnerDeps) { const d = Date.parse(run.started.replace(' ', 'T')); this.runStart = Number.isFinite(d) ? d : Date.now(); }
  private log(t: string) { this.deps.log?.(`workflow "${this.def.name}" run ${this.run.n}: ${t}`); }
  private save() { return this.deps.save(formatRun(this.run, this.def)); }

  /** A fresh run: the first step. */
  async start(): Promise<void> { await this.goto(1); }
  /** A run found running in its record with nobody driving it (the window was reloaded, the app restarted): the step it was on, again. */
  async resume(): Promise<void> {
    const open = Object.keys(this.run.steps).map(Number).filter((k) => this.run.steps[k]!.started && this.run.steps[k]!.took == null).sort((a, b) => b - a)[0];
    if (!open) { await this.finish('stopped: nothing left to resume'); return; }
    this.log(`resumed at step ${open}`); await this.enter(open, true);
  }
  /** A live run found in its record when the window loads (after a reload or a restart): take it over without sending anything. A gate
   * waits for the user again; an agent step waits for that agent's reply, its OUTCOME line (resend() sends the step again if none comes). */
  attach(): boolean {
    const open = Object.keys(this.run.steps).map(Number).filter((k) => this.run.steps[k]!.took == null && !/^stopped/.test(this.run.steps[k]!.result)).sort((a, b) => b - a)[0];
    if (!open || !this.def.steps[open - 1]) return false; const x = this.run.steps[open]!; this.current = open; this.waiting = this.def.steps[open - 1]!.gate ? 'user' : 'agent';
    const day = this.run.started.slice(0, 10); const at = Date.parse(`${day}T${x.started || '00:00'}`); this.startedAt[open] = Number.isFinite(at) && at <= Date.now() ? at : Date.now(); this.visits[open] = 1;
    this.log(`taken over at step ${open} (${this.waiting === 'user' ? 'waits for the user' : `waits for "${this.def.steps[open - 1]!.agent}"`})`); return true;
  }
  /** The current agent step, sent again (its agent never answered: the app restarted mid-turn, or the reply had no OUTCOME line). */
  async resend(): Promise<void> { if (this.over || this.waiting !== 'agent') return; const n = this.current; const keep = this.startedAt[n]; await this.enter(n, true); if (keep) this.startedAt[n] = keep; }
  /** The agent this run waits for, if it waits for one. */
  get waitingFor(): string | null { return !this.over && this.waiting === 'agent' ? this.def.steps[this.current - 1]?.agent ?? null : null; }
  private async goto(n: number): Promise<void> {
    if (this.over) return; if (n < 1 || n > this.def.steps.length) { await this.finish('done'); return; }
    // A step coming round more times than its tries with no decision of the user's in between is a loop between agents: the run stops. A
    // decision of theirs starts the count again (decide below), so a loop through them has no limit (T-197; the user, 2026-09-28: "agents
    // should not do it more than six times ... but for humans, I wouldn't add that, definitely not").
    const tries = triesOf(this.def, n); this.visits[n] = (this.visits[n] ?? 0) + 1;
    if (this.visits[n]! > tries) { await this.finish(`stopped: step ${n} (${stepTitle(this.def.steps[n - 1]!)}) came round ${tries + 1} times with no decision of yours, more than its ${tries} ${tries === 1 ? 'try' : 'tries'}`); return; }
    this.run.steps[n] = { started: stamp().slice(-5), took: null, result: '', said: '' }; await this.enter(n, false);
  }
  private async enter(n: number, resumed: boolean): Promise<void> {
    const s = this.def.steps[n - 1]!; this.current = n; this.retried = false; this.first = ''; this.startedAt[n] = Date.now(); const x = this.run.steps[n]!;
    if (s.gate) { this.waiting = 'user'; x.result = 'waiting for you'; await this.save(); this.log(`step ${n} "${stepTitle(s)}" waits for the user`); this.deps.onGate?.(n, stepTitle(s), Object.keys(this.run.steps).map(Number).filter((k) => k < n).sort((a, b) => b - a).map((k) => this.run.steps[k]!.asks).find(Boolean)); return; }
    x.result = ''; await this.save();
    const text = stepMessage(this.def, n, this.run, this.folder, this.root) + (resumed ? '\n(This step was already sent once; the app resumed the run. If you did the work, just answer with the OUTCOME line.)' : '');
    const r = await this.deps.deliver(s.agent, text, n);
    if (!r.ok) { x.result = r.note; await this.finish(`failed: step ${n} (${stepTitle(s)}): ${r.note}`); return; }
    this.waiting = 'agent'; await this.save(); this.log(`step ${n} "${stepTitle(s)}" sent to "${s.agent}"`);
  }
  /** The agent's reply to a step: the outcome named on its OUTCOME line picks the branch; no line, one more ask, then the run stops. */
  async onReply(step: number, text: string): Promise<void> {
    if (this.over || step !== this.current || this.waiting !== 'agent') return; const s = this.def.steps[step - 1]!; const o = matchOutcome(s, text);
    if (!o) {
      if (!this.retried) { this.retried = true; this.first = text; this.log(`step ${step}: no outcome in the reply, asking once more`); const r = await this.deps.deliver(s.agent, `(from the app) Your reply to step ${step} ("${s.name}") of workflow "${this.def.name}" did not end with an OUTCOME line. Reply with that one line only: OUTCOME: one of ${outcomes(s).map((x) => `"${x.name}"`).join(', ')}.`, step); if (r.ok) return; }
      this.run.steps[step]!.said = said(text); this.run.steps[step]!.result = 'no outcome named'; await this.finish(`failed: step ${step} (${stepTitle(s)}) ended without an outcome`); return; }
    const full = this.first && !said(text) ? `${this.first}\n\n${text}` : text; await this.deps.saveStep?.(step, stepReplyText(full)).catch(() => {});
    await this.complete(step, o.name, o.to, said(text) || said(this.first), askOf(text) || askOf(this.first));
  }
  /** The user's decision at a gate (a button, a command, a word by voice): one of the step's outcomes, with a note if they left one. */
  async decide(step: number, outcome: string, note = ''): Promise<boolean> {
    if (this.over || step !== this.current || this.waiting !== 'user') return false; const s = this.def.steps[step - 1]!; const want = squash(outcome);
    const o = outcomes(s).find((x) => squash(x.name) === want) ?? outcomes(s).find((x) => squash(x.name).includes(want) || want.includes(squash(x.name)))
      ?? (GO_ON.test(outcome.trim()) ? outcomes(s).find((x) => x.name === 'continue') : undefined); if (!o) return false;
    this.visits = {}; // a decision of the user's: every step's tries start again (T-197)
    await this.complete(step, o.name, o.to, `you: ${o.name}${note.trim() ? ` — ${note.trim()}` : ''}`); return true;
  }
  private async complete(n: number, outcome: string, to: string, what: string, asks = ''): Promise<void> {
    const x = this.run.steps[n]!; x.tookText = took(this.startedAt[n] ?? Date.now()); x.took = mins(x.tookText); x.result = outcome; x.said = what; if (asks) x.asks = asks; else delete x.asks; this.waiting = null; await this.save();
    const t = resolveTarget(this.def, n, to); this.log(`step ${n}: ${outcome} → ${t.kind === 'step' ? `step ${t.n}` : t.kind}`);
    if (t.kind === 'step') await this.goto(t.n); else if (t.kind === 'done') await this.finish('done'); else await this.finish(`stopped: ${t.note}`);
  }
  async stop(note = 'stopped by you'): Promise<void> { if (this.over) return; const x = this.run.steps[this.current]; if (x && x.took == null) x.result = 'stopped'; await this.finish(`stopped: ${note}`); }
  private async finish(result: string): Promise<void> { this.over = true; this.waiting = null; this.run.result = result; this.run.ended = stamp(); this.run.tookText = took(this.runStart); this.run.took = mins(this.run.tookText); await this.save(); this.log(result); this.deps.onFinish?.(result); }
}
const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The words an agent relaying the user may still use for continue, a step of yours' usual way on (it was called approved until 2026-09-27). */
const GO_ON = /^(approved?|yes|ok(ay)?|go( on)?|next|done|accept(ed)?|proceed)$/i;
/** What a step "said", for the record: the reply without its OUTCOME line and fenced blocks, on one line, cut short. */
export const said = (text: string): string => saidOf(text); // its last paragraph, where the result is (shared/workflow.ts)
