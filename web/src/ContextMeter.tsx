import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABEL, type Provider } from '../../shared/types';
import { contextLevel, contextPercent, tokens, type ContextUsage } from '../../shared/context';

// How full this agent's context is (T-74): sheets piling up in a small tray as the conversation grows, one sheet per fifth of the window
// (an empty tray at 0 %; no outline for a sheet that is not there), white, then yellow from half full, red from 80 %, with the percentage. A click opens the numbers and a Compact button: nothing is
// compacted by the click itself. The sheets pulse while the provider compacts, whoever asked for it.
const SHEETS = [12, 9.75, 7.5, 5.25, 3]; // each sheet's top, bottom to top: flat and lined up, rising out of a small tray that holds
// about the lowest fifth of the stack (the user, 2026-09-23: no rotation; a tray, the sheets coming out of it)

export type LastCompact = { at: number; before?: number; after?: number; ok: boolean };

export function ContextMeter({ usage, provider, compacting, running, autoPct, hasSession, last, onCompact }: { usage: ContextUsage | null; provider: Provider; compacting: boolean; running: boolean; autoPct: number; hasSession: boolean; last: LastCompact | null; onCompact: () => void }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', off); window.addEventListener('keydown', off); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', off); }; }, [open]);
  const pct = contextPercent(usage); const lit = pct === null ? 0 : pct <= 0 ? 0 : Math.min(5, Math.ceil(pct / 20));
  const level = pct === null ? 'unknown' : contextLevel(pct); const name = PROVIDER_LABEL[provider];
  const nums = pct !== null && usage ? `${tokens(usage.used)} of ${tokens(usage.window)} tokens (${pct} %)` : usage ? `${tokens(usage.used)} tokens; the window's size comes with the end of the turn` : 'Nothing measured yet: the numbers come with the next answer';
  const auto = autoPct > 0 ? `Compacts by itself at ${autoPct} % (Jauvex settings).` : `Compaction is left to ${name}: it compacts near the limit.`;
  const canCompact = hasSession && !running && !compacting;
  return (
    <span className="ctx-wrap" ref={box}>
      <button className={`ctx ${level}${compacting ? ' busy' : ''}`} onClick={() => setOpen((x) => !x)} aria-label={`Context: ${pct === null ? 'not measured yet' : `${pct}% full`}`} aria-expanded={open}
        title={compacting ? `${name} is compacting the conversation…` : `Context: ${nums}.\n${auto}\nClick for details and to compact now.`}>
        <svg className="ctx-pile" viewBox="0 0 18 16" width="18" height="16" aria-hidden="true">
          <path className="ctx-tray" d="M1.6 11.4V14.6H16.4V11.4" />
          {SHEETS.slice(0, lit).map((y, i) => <rect key={i} className="ctx-sheet" style={{ animationDelay: `${i * 120}ms` }} x="3.4" y={y} width="11.2" height="1.7" rx="0.6" />)}
        </svg>
        <span className="ctx-pct">{compacting ? '…' : pct === null ? '–' : `${pct}%`}</span>
      </button>
      {open && (
        <div className="ctx-pop" role="dialog" aria-label="Context">
          <div className="ctx-head"><strong>Context</strong><span>{usage?.model || name}</span></div>
          <div className={`ctx-bar ${level}`}><span style={{ width: `${pct ?? 0}%` }} />{autoPct > 0 && autoPct < 100 && <i style={{ left: `${autoPct}%` }} title={`Compacts by itself at ${autoPct} %`} />}</div>
          <p>{nums}.</p>
          <p className="ctx-note">{auto}</p>
          {last && <p className="ctx-note">{last.ok ? `Last compacted at ${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${last.before ? `: ${tokens(last.before)}${last.after !== undefined ? ` → ${tokens(last.after)}` : ''} tokens` : ''}.` : `The last compaction failed (${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`}</p>}
          <div className="ctx-actions"><button className="btn" disabled={!canCompact} title={!hasSession ? 'Nothing to compact yet' : running && !compacting ? 'After this turn' : undefined} onClick={() => { setOpen(false); onCompact(); }}>{compacting ? 'Compacting…' : 'Compact now'}</button></div>
          <p className="ctx-foot">Compacting replaces the conversation so far with a summary written by the model: the agent keeps the gist, not every word. It takes a minute or two on a full context.</p>
        </div>
      )}
    </span>
  );
}
