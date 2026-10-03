import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Zap, Check, Plus } from 'lucide-react';
import { api } from './api';
import { parseWorkflow, stateFor, fmt, FINISHED, outcomes, parseTrigger, describeTrigger, GATE, stepFileOk, stepBefore, stepTitle, type Run, type Workflow, type WorkflowState } from '../../shared/workflow';
import { setStep, addStep, removeStep, setMeta, readStep, stepFileFor } from '../../shared/workflow-edit';
import { PROVIDER_LABEL, WORKFLOW_FORMAT, type Project, type Provider } from '../../shared/types';
import { Chat, Mark, type ChatEmbed } from './App';
import { t } from '../../shared/i18n';

// A workflow, drawn from its markdown file: one line, one row per step, its agent and the state of the current run; branches as
// quiet lines under their step. The runs (markdown records in the workflow's folder) give the live state, the history and the
// averages. The right pane shows a step, the definition (editable, the flow follows), all the runs, or one run's record.
// Everything is editable in place (T-167): the title and the line under it, a step's name, its agent from a list, its instructions, the
// trigger, what a run leaves; steps are added and removed. Each edit is a change to the files (shared/workflow-edit.ts), which stay the one
// source: the chat under the flow and a person's editor see the same. A step's instructions are a file of their own in the workflow's
// folder (T-168), which its heading links: written as they are typed, made (empty) with the step, renamed with it, removed with it.
export type ShowPane = (title: string, node: ReactNode, key?: string) => void;
/** The agents a step may be given: this folder's, then the app's own agent and the other folders' agents, each with its provider and folder. */
export type StepAgents = { here: { name: string; provider: string; folder: string }[]; elsewhere: { name: string; provider: string; folder: string }[] };
/** What the window does with a run: start one, stop or resume the live one, decide a gate (one of its outcomes, with a note). driven: this window's runner drives the live run. */
export type RunControl = { run: () => Promise<void>; resume: () => Promise<void>; resend: () => Promise<void>; stop: () => Promise<void>; decide: (step: number, outcome: string, note?: string) => Promise<boolean>; driven: () => boolean; waitingFor: () => string | null; asking: () => { agent: string; open: () => void } | null };
/** A chat inside a view, a workflow's (T-205): the window's message router hears its replies (its message-agent blocks go out, and an answer to
 *  a message it got goes back), and delivers to it there, never to a second copy of its session opened in the background. */
export type EmbeddedMail = {
  register: (projectId: string, sessionId: string, name: string, provider: Provider, deliver: (text: string, replyTo?: unknown) => Promise<void>) => () => void;
  reply: (projectId: string, sessionId: string, name: string, text: string, replyTo?: unknown) => void;
};
/** A translated sentence with elements in it: each {name} left in the string by t() is replaced by nodes[name]. */
const rich = (s: string, nodes: Record<string, ReactNode>): ReactNode => s.split(/\{(\w+)\}/).map((p, i) => (i % 2 ? <Fragment key={i}>{p in nodes ? nodes[p] : `{${p}}`}</Fragment> : p));
/** A step's name as the window shows it: stepTitle, with the placeholder for a step with neither name nor instructions in the window's language. */
const title = (s: { name: string; note: string }): string => (s.name.trim() || s.note.trim() ? stepTitle(s) : t('workflow.step.new'));
const Dot = ({ agent, gate, agents }: { agent: string; gate: boolean; agents: Record<string, string> }) => <i className={`dot ${gate ? 'gate' : agents[agent] ?? ''}`} />;

const block = (text: string, name: string) => { const m = new RegExp('```' + name + '[ \\t]*\\n?([\\s\\S]*?)```').exec(text); return m ? m[1]!.trim() : null; };
/** defaultAgent: who a step goes to when nobody is named (the app's own agent). */
export function WorkflowView({ project, file, showPane, paneShows, paneOpen, openFile, openVersion: readVersion, agents, control, active, showMeta, chatProvider, defaultAgent, stepAgents, mail }: { project: Project; file: string; showPane: ShowPane; paneShows: (key: string) => boolean; paneOpen: () => boolean; openFile: (path: string) => void; openVersion?: (v: number) => void; agents: Record<string, string>; control: RunControl; active: boolean; showMeta: boolean; chatProvider: Provider; defaultAgent: string; stepAgents: () => StepAgents;
  mail?: EmbeddedMail /* its chat writes to other agents and hears back (T-205) */ }) {
  const [md, setMd] = useState(''); const [prompts, setPrompts] = useState<Record<string, string>>({}); const [runs, setRuns] = useState<Run[]>([]); const [versions, setVersions] = useState<Versions>({ versions: [], current: null }); const [sel, setSel] = useState(''); const [loaded, setLoaded] = useState(false); const [err, setErr] = useState(''); const [busyBtn, setBusyBtn] = useState(false);
  const act = async (f: () => Promise<unknown>) => { setBusyBtn(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusyBtn(false); void load(); } };
  const load = useCallback(async () => { try { const r = await api.workflow(project.id, file); setMd((cur) => (editing.current ? cur : r.md)); setPrompts((cur) => (editing.current ? cur : r.prompts ?? {})); setRuns(r.runs); setLoaded(true);
    if (!editing.current) setVersions(await api.workflowVersions(project.id, file).catch(() => ({ versions: [], current: null }))); } catch { /* gone */ } }, [project.id, file]);
  const editing = useRef(false);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 2000); return () => clearInterval(t); }, [load]); /* a run writes its record as it goes */
  const def: Workflow = useMemo(() => parseWorkflow(md, file, prompts), [md, file, prompts]); const st: WorkflowState = useMemo(() => stateFor(def, runs), [def, runs]);
  // The chat under the flow: a session of its own in the folder, told on every message what the workflow is now; it edits the file (the flow
  // follows), and runs, stops or passes a gate with a fenced block. Its session is kept in the workflow's reserved folder.
  const [chat, setChat] = useState<{ provider?: Provider; sessionId?: string | null } | null>(null);
  useEffect(() => { let gone = false; void api.workflowChat(project.id, file).then((c) => { if (!gone) setChat(c); }).catch(() => { if (!gone) setChat((cur) => cur ?? {}); }); return () => { gone = true; }; }, [project.id, file]);
  const live = useRef({ md, st, prompts, versions }); live.current = { md, st, prompts, versions }; const pickRef = useRef<(id: string) => void>(() => {}); const bridge = useRef<{ send?: (text: string) => void }>({});
  const provider: Provider = chat?.provider ?? chatProvider;
  const embed: ChatEmbed = useMemo(() => ({ provider, bridge: bridge.current,
    hint: t('workflow.chat.hint', { provider: PROVIDER_LABEL[provider] }),
    context: () => `<workflow-context>\nYou are the assistant of one workflow of this folder (${project.path}): the file ${file}. The user talks to you about it, by text or by voice: to write or change its steps, to run it, to follow or explain a run. Change the workflow by editing its files directly: the view draws the flow from them as you save. ${WORKFLOW_FORMAT}\n${(() => { const g = stepAgents(); return `Agents in this folder: ${g.here.map((a) => `"${a.name}"`).join(', ') || 'none yet'}; elsewhere: ${g.elsewhere.map((a) => `"${a.name}"${a.folder ? ` (${a.folder})` : ''}`).join(', ') || 'none'}. Give a step to one of them, this folder's first.`; })()} When the user names no agent for a step, address it to "${defaultAgent}", the app's own agent. To run the workflow, answer with a block \`\`\`workflow-run\`\`\` alone; to stop the live run, \`\`\`workflow-stop\`\`\`; to pass the gate the live run waits at, only when the user says so in this chat, \`\`\`workflow-decide\` with the outcome on its first line and their words as the note on the second, then \`\`\`.\nThe workflow file now:\n${live.current.md}\nThe steps' instructions now:\n${parseWorkflow(live.current.md, file, live.current.prompts).steps.map((s, i) => `${i + 1}. ${s.name || '(no title)'}, ${s.file ? `in workflows/${s.file}` : 'under its heading'}: ${s.prompt || '(none yet)'}`).join('\n') || '(no steps)'}\nRuns: ${live.current.st.text}\n</workflow-context>\n`,
    onReply: (text) => { void (async () => { try {
      if (block(text, 'workflow-stop') !== null) await control.stop();
      const d = block(text, 'workflow-decide'); if (d) { const [outcome = '', ...note] = d.split('\n'); const cur = Object.keys(live.current.st.st).map(Number).find((k) => live.current.st.st[k]![0] === 'wait'); const ok = cur ? await control.decide(cur, outcome.trim(), note.join(' ').trim()) : false; if (!ok) bridge.current.send?.(`(from the app) The gate was not passed: ${cur ? `"${outcome.trim()}" is not one of its outcomes` : 'no run waits at a gate'}.`); }
      if (block(text, 'workflow-run') !== null) await control.run();
    } catch (e) { bridge.current.send?.(`(from the app) That did not work: ${(e as Error).message}`); } })(); },
  }), [provider, project.path, file, defaultAgent]); // eslint-disable-line react-hooks/exhaustive-deps
  // Its chat writes to other agents (a message-agent block, the message tool) and hears back, as any chat (T-205): the window's router knows
  // it by its session, as "<name> workflow", and delivers to it here.
  const inView = useRef<((text: string, replyTo?: never) => Promise<void>) | null>(null); const chatSid = useRef<string | null>(null); chatSid.current = chat?.sessionId ?? null;
  const chatName = `${(def.name || file.replace(/^workflows\//, '').replace(/\.md$/, '')).replace(/\s+workflow$/i, '')} workflow`;
  useEffect(() => { const sid = chat?.sessionId; if (!mail || !sid) return;
    return mail.register(project.id, sid, chatName, provider, async (t, r) => { for (let i = 0; i < 40 && !inView.current; i++) await new Promise((res) => setTimeout(res, 100)); await inView.current?.(t, r as never); }); }, [mail, chat?.sessionId, project.id, chatName, provider]);
  useEffect(() => { if (loaded && !sel) setSel(String(st.sel)); }, [loaded, st.sel, sel]);
  // Opened, or brought back to the front, with nothing in the pane: the step the workflow is at shows there (the user, 2026-09-27: "when
  // clicking on a workflow item, when it opens, it should show the current step it's at, if not initiated then first step, if already
  // finished then last step"). A pane the user left open stays as it is.
  useEffect(() => { if (loaded && active && !paneOpen()) { editRef.current = null; pickRef.current(String(st.sel)); } }, [loaded, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const paneId = (id: string) => `${project.id}:${file}#${id}`;
  const pick = (id: string) => { setSel(id); showPane(paneTitle(id), detail(id), paneId(id)); }; pickRef.current = pick;
  /** A step opens to be read, its editor behind Edit (the user, 2026-09-27: "the default view, when you see a step, it's the edit mode. I
   *  think we should have a button to enable that"); a step just added opens in its editor. */
  const editRef = useRef<string | null>(null); const show = (id: string) => { editRef.current = null; pick(id); };
  // The pane follows the run (the user, 2026-09-27: "when I clicked approve ... the text was still open ... I had to go to the next step and
  // come back"): a step's pane is drawn once, when it is opened, so it is drawn again when its run moves on there (the run reaches it, you
  // decide, it ends), as long as this workflow is on screen and the pane still shows that step.
  const step = /^\d+$/.test(sel) ? Number(sel) : 0; const before = step ? stepBefore(st.latest, step) : 0;
  const sig = step ? JSON.stringify([st.live, st.latest?.n ?? 0, st.st[step] ?? null, st.said[step] ?? null, st.latest?.steps[before]?.asks ?? '']) : '';
  const shown = useRef({ sel: '', sig: '' });
  useEffect(() => { const was = shown.current; shown.current = { sel, sig }; if (sig && was.sel === sel && was.sig && was.sig !== sig && active && paneShows(paneId(sel))) pickRef.current(sel); }, [sel, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const paneTitle = (id: string) => (id === 'start' ? t('workflow.pane.start') : id === 'done' ? t('workflow.done') : t('workflow.step.n', { n: id })); /* its name is the pane's first line, edited in place */
  const detail = (id: string): ReactNode => {
    if (id === 'start') return <><WhenEditor when={def.when} onSave={(v) => { apply((m) => setMeta(m, { when: v })); reopen('start'); }} /><p>{rich(t('workflow.start.intro', { when: def.when || t('workflow.notSet') }), { code: <code>when:</code> })}</p><div className="kv"><b>{t('workflow.start.manual')}</b><span>{rich(t('workflow.start.manualText'), { code: <code>run --workflow</code> })}</span><b>{t('workflow.start.schedule')}</b><span>{rich(t('workflow.start.scheduleText'), { ex1: <code>every Monday 09:00</code>, ex2: <code>every weekday 8:30</code>, ex3: <code>every 2 hours</code> })}</span><b>{t('workflow.start.window')}</b><span>{rich(t('workflow.start.windowText'), { ex1: <code>anytime between 9 and 12 am</code>, ex2: <code>every weekday anytime between 14:00 and 16:30</code> })}</span><b>{t('workflow.start.event')}</b><span>{rich(t('workflow.start.eventText'), { ex: <code>after News video</code> })}</span></div><p className="pane-note">{t('workflow.start.thisOne', { what: describeTrigger(parseTrigger(def.when)) })}</p>{def.onFailure && <p>{t('workflow.start.onFailure', { what: def.onFailure })}</p>}</>;
    if (id === 'done') return <><div className="wf-ed"><label>{t('workflow.done.label')}<Field value={def.done} placeholder={t('workflow.done.placeholder')} onSave={(v) => { apply((m) => setMeta(m, { done: v })); reopen('done'); }} /></label></div><p className="pane-note">{t('workflow.done.note')}</p></>;
    const n = Number(id); const s = def.steps[n - 1]; if (!s) return null; const avg = st.stepAvg[n - 1]; const slowest = avg != null && avg === Math.max(...st.stepAvg.filter((x): x is number => x != null));
    const waiting = s.gate && st.live && /^waiting/i.test(st.latest?.steps[n]?.result ?? ''); const b = stepBefore(st.latest, n); const from = b ? st.latest?.steps[b] : undefined;
    // at a gate the run waits at: what to do first, from the step before it (its FOR YOU line), else from this step's own instructions
    const gate = s.gate && <Gate key="gate" n={n} live={waiting} driven={control.driven()} names={outcomes(s).map((o) => o.name)} onDecide={(o, note) => act(() => control.decide(n, o, note))} onResume={() => act(control.resume)}
      ask={from?.asks ? { label: t('workflow.gate.asks', { step: def.steps[b - 1] ? title(def.steps[b - 1]!) : t('workflow.step.n', { n: b }) }), text: from.asks } : s.note ? { label: t('workflow.gate.whatToDo'), text: s.note } : from?.said ? { label: t('workflow.gate.said', { step: def.steps[b - 1] ? title(def.steps[b - 1]!) : t('workflow.step.n', { n: b }) }), text: from.said } : null} />;
    return <>
      {waiting && gate}
      {editRef.current !== id ? <StepView key={`view:${file}:${n}`} n={n} s={s} where={s.file && stepFileOk(file, s.file) ? `workflows/${s.file}` : ''} runs={st.runs} avg={avg} slowest={slowest} onEdit={() => { editRef.current = id; pick(id); }} />
      : <StepEditor key={`ed:${file}:${n}:${s.name}:${s.agent}`} name={s.name} agent={s.agent} text={s.prompt} where={s.file && stepFileOk(file, s.file) ? `workflows/${s.file}` : ''} groups={stepAgents()} total={def.steps.length} onDone={() => { editRef.current = null; pick(id); }}
        onName={(v) => { renameStep(n, v); reopen(String(n)); }} onAgent={(v) => { apply((m) => setStep(m, n, { agent: v })); reopen(String(n)); }} onText={(v) => setInstructions(n, v)}
        onAdd={(before) => addAt(before ? n : n + 1)} onRemove={() => { removeAt(n); editRef.current = null; reopen(def.steps.length > 1 ? String(Math.min(n, def.steps.length - 1)) : 'done'); }} />}
      {!waiting && editRef.current !== id && gate}
    </>; };
  /** Every edit writes its file half a second after the last change (the workflow's, or a step's) and draws the flow from it at once; the
   *  files read every two seconds do not replace what is still being written. */
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); const queued = useRef<Record<string, () => Promise<unknown>>>({}); const inflight = useRef(0);
  const fire = async (key: string) => { const save = queued.current[key]; if (!save) return; delete queued.current[key]; clearTimeout(timers.current[key]); inflight.current++;
    try { await save(); } catch { /* the next read shows the file as it is */ } finally { inflight.current--; editing.current = Object.keys(queued.current).length > 0 || inflight.current > 0; } };
  const later = (key: string, save: () => Promise<unknown>, ms = 500) => { queued.current[key] = save; editing.current = true; clearTimeout(timers.current[key]); timers.current[key] = setTimeout(() => void fire(key), ms); };
  /** Every save still waiting, written now (before a version is restored: what was typed is part of what is kept). */
  const flush = () => Promise.all(Object.keys(queued.current).map(fire));
  const writeMd = (v: string) => { live.current = { ...live.current, md: v }; setMd(v); later('md', () => api.saveWorkflow(project.id, file, v)); };
  const writePrompt = (step: string, text: string, ms = 500) => { const next = { ...live.current.prompts, [step]: text }; live.current = { ...live.current, prompts: next }; setPrompts(next); later(`step:${step}`, () => api.saveWorkflowStep(project.id, file, step, text), ms); };
  /** A step's file, gone once the workflow no longer links it (after the saves in flight: a step's text left over beats a lost one). */
  const dropPrompt = (step: string) => setTimeout(() => { if (!parseWorkflow(live.current.md).steps.some((x) => x.file === step)) void api.removeWorkflowStep(project.id, file, step).catch(() => {}); }, 1500);
  const apply = (f: (m: string) => string) => writeMd(f(live.current.md));
  const reopen = (id: string) => setTimeout(() => pickRef.current(id), 60); /* the pane again, drawn from the file as it is now */
  const current = () => parseWorkflow(live.current.md, file, live.current.prompts); const files = (d: Workflow, but = '') => d.steps.map((x) => x.file).filter((f) => f && f !== but);
  /** A new step: its file made, empty, in the workflow's folder; the step for the app's own agent until another is picked. */
  const addAt = (pos: number) => { const f = stepFileFor(file, '', files(current())); writePrompt(f, '', 0); apply((m) => addStep(m, pos, { name: '', agent: defaultAgent, file: f })); editRef.current = String(pos); reopen(String(pos)); };
  const removeAt = (n: number) => { const s = current().steps[n - 1]; apply((m) => removeStep(m, n)); if (s?.file && stepFileOk(file, s.file)) dropPrompt(s.file); };
  /** The instructions typed: into the step's file; a step of an older file (its instructions under its heading) gets a file of its own. */
  const setInstructions = (n: number, text: string) => { const d = current(); const s = d.steps[n - 1]; if (!s) return;
    if (s.file && stepFileOk(file, s.file)) { writePrompt(s.file, text); if (readStep(live.current.md, n)?.text.trim()) apply((m) => setStep(m, n, { text: '' })); return; }
    const f = stepFileFor(file, s.name, files(d)); writePrompt(f, text, 0); apply((m) => setStep(m, n, { link: f, text: '' })); reopen(String(n)); }; /* the pane again: it says where they are now */
  /** A renamed step keeps its file, which takes the new name when it was named after the old one (new-step.md becomes script.md). */
  const renameStep = (n: number, name: string) => { const d = current(); const s = d.steps[n - 1]; if (!s || (!name.trim() && !s.file)) return; /* a title is optional: it can go when the step has a file */
    const was = !!name.trim() && s.file && stepFileOk(file, s.file) && s.file.replace(/(-\d+)?\.md$/, '') === stepFileFor(file, s.name, []).replace(/\.md$/, ''); /* a title cleared keeps the file's name */
    const to = was ? stepFileFor(file, name, files(d, s.file)) : s.file;
    if (!was || to === s.file) { apply((m) => setStep(m, n, { name })); return; }
    writePrompt(to, live.current.prompts[s.file] ?? s.prompt, 0); apply((m) => setStep(m, n, { name, link: to })); dropPrompt(s.file); };
  /** A + on the line between two steps (the user, 2026-09-27, from a quiz builder's screenshot: "the only thing ... is the plus sign ... in
   *  between there's a plus sign to add steps"): after the trigger and after each step, a step added at that place. */
  const plus = (at: number) => <button className="wf-plus" title={t('workflow.addHere')} aria-label={t('workflow.addHereAria', { n: at })} onClick={(e) => { e.stopPropagation(); addAt(at); }}><Plus size={11} strokeWidth={2.5} /></button>;
  const editDefinition = () => showPane(file, <DefinitionEditor md={md} onChange={writeMd} />);
  /** A version of the workflow (T-169), as a run ran it: its file in the workflow's folder, versions/NNN.md, in the pane. */
  const openVersion = (v: number) => (readVersion ? readVersion(v) : openFile(`${project.path}/${file.replace(/\.md$/, '')}/versions/${String(v).padStart(3, '0')}.md`));
  // the agent a live run waits for: this window's runner knows
  const waitingFor = (): string | null => control.waitingFor();
  /** The versions (the user, 2026-09-27: "where I'm supposed to see the versions ... how can I roll back to a previous version"): each with
   *  the runs that ran it, the one the workflow is now, and a way back to any other. */
  const openVersions = (notice = '') => showPane(t('workflow.pane.versions', { name: def.name }), <VersionsList v={live.current.versions} runs={live.current.st.runs} notice={notice} onOpen={openVersion} onRestore={(n) => void restore(n)} />, paneId('versions'));
  const restore = async (n: number) => { setErr(''); try { await flush(); const r = await api.restoreWorkflowVersion(project.id, file, n); editing.current = false; await load();
    setTimeout(() => openVersions(r.kept ? t('workflow.versions.restoredKept', { n, kept: r.kept }) : t('workflow.versions.restored', { n })), 60); } catch (e) { setErr((e as Error).message); } };
  const openRun = (n: number) => { const r = st.runs.find((x) => x.n === n); if (!r) return; showPane(t('workflow.pane.run', { n, file: r.file }), <RunRecord def={def} run={r} onBack={allRuns} onVersion={openVersion} />); };
  const allRuns = () => showPane(t('workflow.pane.allRuns', { name: def.name }), <RunsTable st={st} folder={file.replace(/\.md$/, '/runs/')} onOpen={openRun} />);
  const kindOf = (r: Run) => (FINISHED.test(r.result) ? 'ok' : /running/i.test(r.result) ? 'wn' : 'er');
  if (!loaded) return <div className="wf"><p className="pane-note" style={{ padding: 28 }}>{t('workflow.opening')}</p></div>;
  return (
    <div className="wf-wrap">
    <div className="wf">
      <div className="wf-head"><div><h1><Inline value={def.name} placeholder={file} onSave={(v) => apply((m) => setMeta(m, { name: v }))} /></h1><p><Inline value={def.desc} placeholder={t('workflow.head.descPlaceholder')} onSave={(v) => apply((m) => setMeta(m, { desc: v }))} /></p></div><span className="sp" />{st.live ? <>{!control.driven() && <button className="btn ghost" disabled={busyBtn} title={t('workflow.head.resumeTitle')} onClick={() => void act(control.resume)}>{t('workflow.head.resume')}</button>}{waitingFor() && <button className="btn ghost" disabled={busyBtn} title={t('workflow.head.resendTitle', { agent: waitingFor() ?? '' })} onClick={() => void act(control.resend)}>{t('workflow.head.resend')}</button>}<button className="btn ghost" disabled={busyBtn} title={t('workflow.head.stopTitle')} onClick={() => void act(control.stop)}>{t('workflow.head.stop')}</button></> : <button className="btn primary" disabled={busyBtn || !def.steps.length} title={t('workflow.head.runTitle')} onClick={() => void act(control.run)}>{t('workflow.head.run')}</button>}</div>
      {err && <p className="runline" style={{ color: 'var(--warn)' }}>{err}</p>}
      {(() => { const a = control.asking(); return a ? <p className="runline asking">{t('workflow.asking', { agent: a.agent })} <button className="btn ghost sm" onClick={a.open}>{t('workflow.asking.open', { agent: a.agent })}</button></p> : null; })()}
      <p className="runline"><i className={`wf-dot${st.live ? ' live' : ''}`} /> {st.line}</p>
      <ol className="steps">
        <li className={`st trigger${sel === 'start' ? ' sel' : ''}`} onClick={() => show('start')}>{plus(1)}<span className="mark-n"><Zap size={13} /></span><div className="body"><div className="line1"><b>{t('workflow.when')}</b><span className="who">{def.when || t('workflow.notSet')}{def.when && parseTrigger(def.when).kind !== 'manual' && <> · {describeTrigger(parseTrigger(def.when))}</>}</span></div></div></li>
        {def.steps.map((s, i) => { const n = i + 1; const state = s.gate ? (st.st[n] && (st.st[n]![0] === 'wait' || st.st[n]![0] === 'ok' || st.st[n]![0] === 'er') ? st.st[n] : (['wait', t('workflow.humanInTheLoop')] as const)) : st.st[n]; const cls = state ? ({ ok: 'done', run: 'run', wait: 'gate', er: 'fail', '': '' } as Record<string, string>)[state[0]] : '';
          return <li key={n} className={`st${cls ? ` ${cls}` : ''}${s.gate ? ' gate' : ''}${sel === String(n) ? ' sel' : ''}`} onClick={() => show(String(n))}>{plus(n + 1)}<span className="mark-n">{n}</span><div className="body">
            <div className="line1"><b className={s.name.trim() ? '' : 'wf-untitled'}>{title(s)}</b><span className="who"><Dot agent={s.agent} gate={s.gate} agents={agents} />{s.gate ? t('workflow.you') : s.agent || t('workflow.noAgentNamed')}</span>{state && <span className={`stat ${state[0]}`}>{state[0] === 'run' && <Mark busy />}{state[1]}</span>}</div>
            {st.last[n] && <div className="wf-last">{st.last[n]}</div>}{s.branches.map((b, j) => <div key={j} className="wf-branch">↳ {b}</div>)}</div></li>; })}
        <li className={`st end${sel === 'done' ? ' sel' : ''}`} onClick={() => show('done')}><span className="mark-n"><Check size={13} /></span><div className="body"><div className="line1"><b>{t('workflow.done')}</b><span className="who">{def.done}</span></div></div></li>
      </ol>
      <div className="foot">
        <div className="foot-head"><b>{t('workflow.foot.runs')}</b> · {st.runs.length}{st.avg != null && <> · {t('workflow.foot.average', { avg: fmt(st.avg), count: st.finished })}</>}<span className="sp" /><button className="btn ghost sm" onClick={allRuns}>{t('workflow.foot.allRuns', { count: st.runs.length })}</button><button className="btn ghost sm" title={t('workflow.foot.versionsTitle')} onClick={() => openVersions()}>{t('workflow.foot.versions', { count: versions.versions.length })}</button></div>
        {st.runs.slice(0, 3).map((r) => <div key={r.n} className="runs"><a href="#" onClick={(e) => { e.preventDefault(); openRun(r.n); }}><span className={kindOf(r)}>#{r.n}</span> {r.result}{r.took != null && <> · {fmt(r.took)}</>}</a> <small>{r.version ? `v${r.version} · ` : ''}{r.started}{r.by ? ` · ${t('workflow.foot.by', { who: r.by })}` : ''}</small></div>)}
        <div className="def-link">{rich(t('workflow.foot.defined'), { file: <a href="#" onClick={(e) => { e.preventDefault(); editDefinition(); }}>{file}</a> })}</div>
      </div>
    </div>
    {chat && <div className="jev-chat wf-chat"><header><b>{t('workflow.chat.title')}</b><span>{t('workflow.chat.sub', { provider: PROVIDER_LABEL[provider] })}</span></header>
      <Chat embed={embed} project={project} sessionId={chat.provider === provider ? chat.sessionId ?? null : null} active={active} info={null} showMeta={showMeta} onBusy={() => {}} onTurnEnd={() => {}} onNew={() => {}}
        onBridge={(b) => { inView.current = b ? (t, r) => b.deliver(t, r) : null; }} onReply={(text, replyTo) => { const sid = chatSid.current; if (sid && mail) mail.reply(project.id, sid, chatName, text, replyTo); }}
        onSession={(sid) => { const next = { provider, sessionId: sid }; setChat(next); void api.setWorkflowChat(project.id, file, next); }} /></div>}
    </div>
  );
}

/** A gate step in the pane: while the live run waits here, what to do (ask: the step before it tells the user, or the gate's own instructions),
 *  a note and one button per outcome, first in the pane; otherwise what the gate is. */
function Gate({ n, live, driven, names, ask, onDecide, onResume }: { n: number; live: boolean; driven: boolean; names: string[]; ask: { label: string; text: string } | null; onDecide: (outcome: string, note: string) => void; onResume: () => void }) {
  const [note, setNote] = useState('');
  if (!live) return <p className="pane-note">{t('workflow.gate.idle', { n, names: names.join(', ') })}</p>;
  const what = ask && <div className="wf-gate-ask"><i>{ask.label}</i><p>{ask.text}</p></div>;
  if (!driven) return <div className="wf-gate">{what}<div className="btns"><p className="pane-note">{t('workflow.gate.undriven')}</p><button className="btn ghost" onClick={onResume}>{t('workflow.gate.resume')}</button></div></div>;
  return <div className="wf-gate">{what}<textarea className="gate-note" placeholder={t('workflow.gate.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="btns">{names.map((o) => <button key={o} className={`btn ${o === names[0] ? 'primary' : 'ghost'}`} onClick={() => onDecide(o, note)}>{o}</button>)}</div></div>;
}
/** Text edited where it stands: a click makes it a field; Enter or leaving it saves, Escape puts it back. */
function Inline({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [on, setOn] = useState(false); const [v, setV] = useState(value);
  useEffect(() => { if (!on) setV(value); }, [value, on]);
  const end = (keep: boolean) => { setOn(false); if (keep && v.trim() && v.trim() !== value.trim()) onSave(v); else setV(value); };
  if (!on) return <span className={`wf-inline${value ? '' : ' empty'}`} title={t('workflow.inline.edit')} onClick={() => setOn(true)}>{value || placeholder}</span>;
  return <input autoFocus className="wf-inline-input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => end(true)} onKeyDown={(e) => { if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); }} />;
}
/** A field in the pane that saves when it is left or on Enter (a name, a trigger: a half-typed one must not rewrite the file). */
function Field({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value); const saved = useRef(value); const save = () => { if (v.trim() !== saved.current.trim()) { saved.current = v; onSave(v); } };
  return <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur(); } }} />;
}
/** A step in the pane: who does it, picked from the app's agents (or you, for an approval), and its instructions, typed. That is all a step
 *  is (the user, 2026-09-27, of a pane that also asked what a step takes, gives and where each outcome leads: "extremely over complicated";
 *  the steps run in order, a failed one stops the run, an approval's changes go back one step). Its name, above them, is edited in place;
 *  where its instructions are kept is said under them (a file of its own, T-168). */
function StepEditor({ name, agent, text: first, where, groups, total, onName, onAgent, onText, onAdd, onRemove, onDone }: { name: string; agent: string; text: string; where: string; groups: StepAgents; total: number;
  onName: (v: string) => void; onAgent: (v: string) => void; onText: (v: string) => void; onAdd: (before: boolean) => void; onRemove: () => void; onDone: () => void }) {
  const gate = GATE.test(agent); const [text, setText] = useState(first); const called = title({ name, note: text.replace(/\s+/g, ' ') }); /* named as typed */
  const label = (a: StepAgents['here'][number], folder: boolean) => [a.name, PROVIDER_LABEL[a.provider as Provider] ?? '', folder ? a.folder : ''].filter(Boolean).join(' · ');
  const seen = new Set<string>(); const once = (xs: StepAgents['here']) => xs.filter((a) => !GATE.test(a.name) && !seen.has(a.name) && (seen.add(a.name), true));
  const here = once([...groups.here].sort((a, b) => a.name.localeCompare(b.name))), elsewhere = once(groups.elsewhere); const unknown = !gate && agent && !seen.has(agent);
  return <div className="wf-ed">
    <div className="wf-ed-top"><h3 className="wf-ed-name">{called}</h3><button className="btn ghost sm wf-ed-done" title={t('workflow.editor.doneTitle')} onClick={onDone}>{t('workflow.editor.done')}</button></div>
    <label>{t('workflow.editor.who')}<select value={gate ? 'you' : agent} onChange={(e) => onAgent(e.target.value)}>
      {!agent && <option value="">{t('workflow.editor.pick')}</option>}
      <option value="you">{t('workflow.editor.you')}</option>
      <optgroup label={t('workflow.editor.here')}>{here.length ? here.map((a) => <option key={a.name} value={a.name}>{label(a, false)}</option>) : <option disabled value="-">{t('workflow.editor.noneYet')}</option>}</optgroup>
      <optgroup label={t('workflow.editor.elsewhere')}>{elsewhere.map((a) => <option key={a.name} value={a.name}>{label(a, true)}</option>)}</optgroup>
      {unknown && <option value={agent}>{t('workflow.editor.unknown', { agent })}</option>}
    </select></label>
    <label>{gate ? t('workflow.editor.whatYouDo') : t('workflow.editor.instructions')}<textarea value={text} placeholder={gate ? t('workflow.editor.whatYouDoPlaceholder') : t('workflow.editor.instructionsPlaceholder')} onChange={(e) => { setText(e.target.value); onText(e.target.value); }} />
      {where && <small className="wf-ed-where">{where}</small>}</label>
    <label>{t('workflow.editor.title')}<Field value={name} placeholder={name ? t('workflow.editor.titlePlaceholder') : t('workflow.editor.titleWithout', { called })} onSave={onName} />
      <small>{t('workflow.editor.titleNote')}</small></label>
    <div className="wf-ed-btns"><button className="btn ghost sm" onClick={() => onAdd(true)}>{t('workflow.editor.addBefore')}</button><button className="btn ghost sm" onClick={() => onAdd(false)}>{t('workflow.editor.addAfter')}</button>{total > 1 && <button className="btn ghost sm danger" onClick={onRemove}>{t('workflow.editor.remove')}</button>}</div>
  </div>;
}
/** A step to read: who does it, its instructions and where they are kept, how it went in the last runs; Edit opens the editor. */
function StepView({ n, s, where, runs, avg, slowest, onEdit }: { n: number; s: Workflow['steps'][number]; where: string; runs: Run[]; avg: number | null | undefined; slowest: boolean; onEdit: () => void }) {
  const mine = runs.filter((r) => r.steps[n]).slice(0, 5); const kind = (x: Run['steps'][number]) => (x.took != null ? 'ok' : /fail|stop/i.test(x.result) ? 'er' : 'wn');
  return <div className="wf-step">
    <div className="wf-step-head"><h3>{title(s)}</h3><button className="btn ghost sm wf-step-edit" onClick={onEdit}>{t('workflow.view.edit')}</button></div>
    <div className="wf-step-who">{s.gate ? t('workflow.editor.you') : s.agent || t('workflow.view.noAgent')}</div>
    {s.prompt ? <div className="wf-step-text">{s.prompt}</div> : <p className="pane-note">{t('workflow.view.noInstructions')}</p>}
    {where && <small className="wf-step-where">{where}</small>}
    <h4 className="wf-step-h">{t('workflow.view.lastRuns')}</h4>
    {mine.length ? mine.map((r) => { const x = r.steps[n]!; return <div key={r.n} className="wf-step-run"><b>#{r.n}</b><span className={kind(x)}>{x.result || (x.started ? t('workflow.view.running') : '')}{x.tookText ? ` · ${x.tookText}` : ''}</span>{x.said && <p>{x.said}</p>}</div>; })
      : <p className="pane-note">{t('workflow.view.notReached')}</p>}
    {avg != null && <p className="pane-note">{t(slowest ? 'workflow.view.averageSlowest' : 'workflow.view.average', { avg: fmt(avg) })}</p>}
  </div>;
}
type Versions = { versions: { n: number; taken: string }[]; current: number | null };
/** The versions, newest first: when each was taken, the runs that ran it, the one the workflow is now; any other can be opened or restored. */
function VersionsList({ v, runs, notice, onOpen, onRestore }: { v: Versions; runs: Run[]; notice: string; onOpen: (n: number) => void; onRestore: (n: number) => void }) {
  const list = [...v.versions].reverse(); const last = list[0]?.n;
  return <div className="wf-versions">
    {notice && <p className="wf-versions-notice">{notice}</p>}
    <p className="pane-note">{v.current != null ? t('workflow.versions.is', { n: v.current }) : last ? t('workflow.versions.edited', { n: last }) : t('workflow.versions.none')} {t('workflow.versions.how')}</p>
    {list.map((x) => { const ran = runs.filter((r) => r.version === x.n).map((r) => `#${r.n}`).reverse();
      return <div key={x.n} className={`wf-version-row${x.n === v.current ? ' current' : ''}`}><div><b>{t('workflow.versions.version', { n: x.n })}</b>{x.n === v.current && <span className="wf-version-now">{t('workflow.versions.now')}</span>}<small>{t('workflow.versions.taken', { when: x.taken })}</small><small>{ran.length ? t('workflow.versions.ran', { runs: ran.join(', ') }) : t('workflow.versions.noRun')}</small></div>
        <span className="sp" /><button className="btn ghost sm" onClick={() => onOpen(x.n)}>{t('common.open')}</button>{x.n !== v.current && <button className="btn ghost sm wf-version-restore" title={t('workflow.versions.restoreTitle', { n: x.n })} onClick={() => onRestore(x.n)}>{t('workflow.versions.restore')}</button>}</div>; })}
  </div>;
}
/** The trigger: typed, or picked from the usual ones; what it means shows as it is typed. */
function WhenEditor({ when, onSave }: { when: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(when || 'manual');
  return <div className="wf-ed"><label>{t('workflow.whenEditor.label')}<input value={v} placeholder="manual" onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== when.trim()) onSave(v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    <small>{describeTrigger(parseTrigger(v))}</small></label>
    <div className="wf-ed-btns">{['manual', 'every weekday 9:00', 'every Monday 09:00', 'every 2 hours'].map((x) => <button key={x} className="btn ghost sm" onClick={() => { setV(x); onSave(x); }}>{x}</button>)}</div></div>;
}
function DefinitionEditor({ md, onChange }: { md: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(md);
  return <><textarea className="md-edit" spellCheck={false} value={v} onChange={(e) => { setV(e.target.value); onChange(e.target.value); }} /><p className="pane-note">{t('workflow.definition.note')}</p></>;
}
function RunsTable({ st, folder, onOpen }: { st: WorkflowState; folder: string; onOpen: (n: number) => void }) {
  const kindOf = (r: Run) => (FINISHED.test(r.result) ? 'ok' : /running/i.test(r.result) ? 'wn' : 'er');
  return <><p className="pane-note">{st.avg != null ? t('workflow.runs.summaryAverage', { runs: t('workflow.runs.count', { count: st.runs.length }), folder, avg: fmt(st.avg), finished: st.finished }) : t('workflow.runs.summary', { runs: t('workflow.runs.count', { count: st.runs.length }), folder })}</p>
    <table className="runs-table"><thead><tr><th>{t('workflow.runs.col.run')}</th><th>{t('workflow.runs.col.version')}</th><th>{t('workflow.runs.col.started')}</th><th>{t('workflow.runs.col.result')}</th><th>{t('workflow.runs.col.took')}</th></tr></thead><tbody>{st.runs.map((r) => <tr key={r.n} className="run-row" onClick={() => onOpen(r.n)}><td className={kindOf(r)}>#{r.n}</td><td>{r.version ? `v${r.version}` : ''}</td><td>{r.started}{r.by ? ` · ${t('workflow.foot.by', { who: r.by })}` : ''}</td><td>{r.result}</td><td>{r.took != null ? fmt(r.took) : ''}</td></tr>)}</tbody></table></>;
}
function RunRecord({ def, run, onBack, onVersion }: { def: Workflow; run: Run; onBack: () => void; onVersion: (v: number) => void }) {
  return <><div className="kv"><b>{t('workflow.runs.col.started')}</b><span>{run.started}</span><b>{t('workflow.runs.col.result')}</b><span>{run.result}</span>{run.took != null && <><b>{t('workflow.runs.col.took')}</b><span>{fmt(run.took)}</span></>}
    {run.version != null && <><b>{t('workflow.runs.col.version')}</b><span>{rich(t('workflow.record.versionText'), { link: <a href="#" className="wf-version" onClick={(e) => { e.preventDefault(); onVersion(run.version!); }}>{t('workflow.record.versionLink', { n: run.version })}</a> })}</span></>}<b>{t('workflow.record.files')}</b><span>{run.file.replace(/\.md$/, '/')}</span></div>
    <table className="runs-table"><tbody>{def.steps.map((s, i) => { const x = run.steps[i + 1]; const cls = x ? (x.took != null ? 'ok' : /fail/i.test(x.result) ? 'er' : x.started ? 'wn' : 'er') : 'faint';
      return <tr key={i}><td className="n">{i + 1}</td><td>{title(s)}</td><td className={cls}>{x ? (x.took != null ? fmt(x.took) : x.result || (x.started ? t('workflow.view.running') : '')) : t('workflow.record.notReached')}{x?.said && <div className="said-cell">{x.said}</div>}</td></tr>; })}</tbody></table>
    <p className="pane-note"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>{t('workflow.record.allRuns')}</a></p></>;
}
