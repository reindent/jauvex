import { useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { PROVIDER_LABEL, type JevAgent, type JevAnswer, type JevRun, type Project, type Provider } from '../../shared/types';
import { api } from './api';
import { Chat, type ChatEmbed } from './App';
import { t } from '../../shared/i18n';

/**
 * A Jev agent is not a chat. Left, split in two: the state on top (text or JSON), the questions below (JSON, Jev's own
 * shape). Right: the output of the evaluation. Cmd+Enter evaluates. Edits save themselves.
 *
 * Optionally coupled with a trainer, a Claude or Codex session in a panel underneath, by text or by voice. Jev cannot be
 * talked to, the trainer can: it sees the pad with every message and changes it by answering with fenced blocks
 * (jev-state, jev-questions, jev-evaluate), which are applied here. After an evaluation it is shown the result once, so it can adjust.
 */
const TRAINER = `You are the trainer of a Jev agent inside the Jauvex app. Jev is TypeSafe's System One model: it does not chat and does not write text. It takes a STATE (text or JSON) and a map of typed QUESTIONS, and returns typed answers with probabilities. The agent is a reusable classifier: the questions stay, the state changes.
Question types (JSON): {"type":"noul","instructions":"...","criteria":{"true":"...","false":"..."}} for yes/no; {"type":"choice","instructions":"...","criteria":{"option_id":"what this option means", ...}} (up to 255 options); {"type":"score","instructions":"...","criteria":["lowest level", ..., "highest level"]} (2 to 10 ordered levels). Question names are short snake_case ids. Instructions can point at fields of a JSON state with backticks.
You change the agent ONLY by including fenced blocks in your reply, and the app applies them:
\`\`\`jev-questions
{ ...the complete new questions object... }
\`\`\`
\`\`\`jev-state
...the complete new state, text or JSON...
\`\`\`
\`\`\`jev-evaluate
\`\`\`
Always give a block in full (it replaces what is there); leave a block out to keep that part as it is. Add jev-evaluate when a run would help; you will be shown the result. Outside the blocks, talk to the user in one to three short sentences: what you changed and why. Do not use tools or touch files for this.`;
const block = (text: string, name: string): string | null => { const m = new RegExp('```' + name + '[^\\n]*\\n([\\s\\S]*?)```').exec(text); return m ? m[1]!.trim() : null; };
const brief = (run: JevRun | undefined): string => (!run ? 'none yet' : run.ok ? JSON.stringify(run.answers) : `failed: ${run.error}`);
const pct = (p: number) => `${Math.round(p * 100)}%`;
function jsonProblem(text: string): string { try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? '' : t('jev.questions.notObject'); } catch (e) { return (e as Error).message; } }

export function JevPad({ project, agent, active, showMeta, onChanged }: { project: Project; agent: JevAgent; active: boolean; showMeta: boolean; onChanged: () => void }) {
  const [state, setState] = useState(agent.state); const [questions, setQuestions] = useState(agent.questions);
  const [runs, setRuns] = useState<JevRun[]>(agent.runs); const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [raw, setRaw] = useState(false);
  const problem = useMemo(() => jsonProblem(questions), [questions]);
  const stateKind = useMemo(() => { const s = state.trim(); if (!(s.startsWith('{') || s.startsWith('['))) return t('jev.state.kind.text'); try { JSON.parse(s); return t('jev.state.kind.json'); } catch { return t('jev.state.kind.badJson'); } }, [state]);
  // edits save themselves, a moment after the last keystroke
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } const t = setTimeout(() => { void api.jevSave(project.id, agent.id, { state, questions }).then(onChanged).catch(() => { /* the next edit tries again */ }); }, 700); return () => clearTimeout(t); }, [state, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const evaluate = async (st = state, qs = questions): Promise<JevRun | null> => {
    if (busy || jsonProblem(qs)) return null; setBusy(true); setError('');
    try { const run = await api.jevEvaluate(project.id, agent.id, st, qs); setRuns((r) => [run, ...r].slice(0, 20)); setShown(0); onChanged(); return run; }
    catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void evaluate(); } };
  const run = runs[shown];

  // ---- the trainer
  const [llm, setLlm] = useState<Provider | null>(agent.llm ?? null);
  const live = useRef({ state, questions, runs }); live.current = { state, questions, runs };
  const bridge = useRef<{ send?: (text: string) => void }>({}); const followUps = useRef(0);
  const couple = (next: Provider | null) => { setLlm(next); void api.jevSave(project.id, agent.id, { llm: next }).then(onChanged); };
  const embed: ChatEmbed | null = useMemo(() => (llm ? {
    provider: llm, bridge: bridge.current,
    context: () => `<jev-agent-context>\n${TRAINER}\n\nThe agent "${agent.name}" right now.\nSTATE:\n${live.current.state}\n\nQUESTIONS:\n${live.current.questions}\n\nLAST OUTPUT: ${brief(live.current.runs[0])}\n</jev-agent-context>\n`,
    onReply: (text) => { void (async () => {
      const qs = block(text, 'jev-questions'), st = block(text, 'jev-state'), wantsRun = block(text, 'jev-evaluate') !== null;
      if (qs && !jsonProblem(qs)) setQuestions(JSON.stringify(JSON.parse(qs), null, 2)); if (st !== null && st !== '') setState(st);
      if (!wantsRun) { followUps.current = 0; return; }
      const done = await evaluate(st !== null && st !== '' ? st : live.current.state, qs && !jsonProblem(qs) ? qs : live.current.questions);
      if (done && followUps.current < 2) { followUps.current++; bridge.current.send?.(`(from the app) Result of the evaluation you asked for: ${brief(done)}. If it is what the user wants, say so in a sentence; if not, adjust.`); } else followUps.current = 0;
    })(); },
  } : null), [llm, agent.name]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`jev-wrap${llm ? ' coupled' : ''}`}>
    <div className="jev" onKeyDown={onKey}>
      <div className="jev-left">
        <section className="jev-pane"><header><b>{t('jev.state.title')}</b><span>{t('jev.state.sub', { kind: stateKind })}</span></header>
          <textarea spellCheck={false} value={state} onChange={(e) => setState(e.target.value)} placeholder={t('jev.state.placeholder')} /></section>
        <section className="jev-pane"><header><b>{t('jev.questions.title')}</b><span className={problem ? 'bad' : ''}>{problem ? t('jev.questions.invalid', { problem }) : t('jev.questions.sub')}</span></header>
          <textarea spellCheck={false} value={questions} onChange={(e) => setQuestions(e.target.value)} /></section>
        <footer><button className="btn" disabled={busy || Boolean(problem)} onClick={() => void evaluate()}><Play size={13} fill="currentColor" />{busy ? t('jev.evaluating') : t('jev.evaluate')}</button><span>⌘ Enter</span><span className="grow" /><label className="jev-couple" title={t('jev.trainer.tooltip')}>{t('jev.trainer.title')}<select className="model" value={llm ?? ''} onChange={(e) => couple((e.target.value || null) as Provider | null)}><option value="">{t('jev.trainer.none')}</option><option value="claude">Claude</option><option value="codex">Codex</option><option value="grok">Grok</option></select></label></footer>
      </div>
      <div className="jev-right">
        <header><b>{t('jev.output.title')}</b>{run && <span>{run.ok ? t('jev.output.stats', { model: run.model ?? 'jev', ms: run.ms, input: run.usage?.input_tokens ?? '?', output: run.usage?.output_tokens ?? '?' }) : t('jev.output.failedAfter', { ms: run.ms })}</span>}
          <span className="grow" />{run?.ok && <button className="link" onClick={() => setRaw((v) => !v)}>{raw ? t('jev.output.readable') : t('jev.output.raw')}</button>}</header>
        <div className="jev-out">
          {error && <p className="jev-error">{error}</p>}
          {!run && !error && <p className="jev-empty">{t('jev.output.empty')}</p>}
          {run && !run.ok && <p className="jev-error">{run.error}</p>}
          {run?.ok && raw && <pre>{JSON.stringify({ model: run.model, answers: run.answers, usage: run.usage }, null, 2)}</pre>}
          {run?.ok && !raw && Object.entries(run.answers ?? {}).map(([name, a]) => <Answer key={name} name={name} a={a} />)}
        </div>
        {runs.length > 1 && <footer className="jev-runs"><span>{t('jev.runs')}</span>{runs.map((r, i) => <button key={r.at} className={`${i === shown ? 'on' : ''}${r.ok ? '' : ' bad'}`} title={new Date(r.at).toLocaleString()} onClick={() => setShown(i)}>{new Date(r.at).toLocaleTimeString([], { hour12: false })} · {r.ms} ms</button>)}</footer>}
      </div>
    </div>
    {llm && embed && <div className="jev-chat" key={llm}><header><b>{t('jev.trainer.title')}</b><span>{t('jev.trainer.sub', { provider: PROVIDER_LABEL[llm] })}</span></header>
      <Chat embed={embed} project={project} sessionId={agent.llm === llm ? agent.sessionId ?? null : null} active={active} info={null} showMeta={showMeta} onBusy={() => {}} onTurnEnd={() => {}} onNew={() => {}}
        onSession={(sid) => { void api.jevSave(project.id, agent.id, { sessionId: sid }).then(onChanged); }} /></div>}
    </div>
  );
}

function Bars({ rows }: { rows: [string, number, boolean][] }) {
  return <div className="jev-bars">{rows.map(([label, p, top]) => <div key={label} className={top ? 'top' : ''}><span>{label}</span><i><b style={{ width: pct(p) }} /></i><em>{pct(p)}</em></div>)}</div>;
}
function Answer({ name, a }: { name: string; a: JevAnswer }) {
  const probs = Object.entries(a.probabilities ?? {});
  return (
    <article className="jev-answer">
      <header><b>{name}</b><i>{a.type === 'noul' ? t('jev.answer.yesNo') : a.type}</i>{a.confidence != null && <span>{t('jev.answer.confidence', { pct: pct(a.confidence) })}</span>}</header>
      {a.type === 'noul' && a.noul != null && <><p className="jev-verdict">{a.noul >= 0.5 ? t('jev.answer.yes') : t('jev.answer.no')}</p><Bars rows={[[t('jev.answer.barYes'), a.noul, a.noul >= 0.5], [t('jev.answer.barNo'), 1 - a.noul, a.noul < 0.5]]} /></>}
      {a.type === 'choice' && <><p className="jev-verdict">{a.choice}</p><Bars rows={probs.sort((x, y) => y[1] - x[1]).map(([k, p]) => [k, p, k === a.choice])} /></>}
      {a.type === 'score' && <><p className="jev-verdict">{a.score?.toFixed(2)} <small>{a.legend?.[String(Math.round(a.score ?? 0))] ?? ''}</small></p><Bars rows={probs.map(([k, p]) => [a.legend?.[k] ?? k, p, Number(k) === Math.round(a.score ?? 0)])} /></>}
    </article>
  );
}
