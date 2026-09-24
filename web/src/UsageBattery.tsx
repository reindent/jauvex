import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABEL, type Provider, type ProviderUsage, type UsageWindow } from '../../shared/types';
import { planName, resetText, usageLevel, windowWords } from '../../shared/usage';

// How much of the provider's plan is left, as a small battery next to the composer. It shows the tightest window (the one
// with the least left) that counts for the model in use. A click opens the whole picture (T-98): every window of this chat's
// provider and of the other one signed in, how much is left of each and when it resets, the plan, extra usage or credits; a
// model's own window (Claude's Fable week, a Codex model's extra limit) counts only while that model is in use. Refreshed every
// minute while the window is visible, when a turn ends (`tick`), and with the panel's Refresh.
const REFRESH_MS = 60_000;
const clock = (at: number, far: boolean): string => new Date(at).toLocaleString([], far ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
const counts = (w: UsageWindow, model: string): boolean => !w.model || model.toLowerCase().includes(w.model);

export function UsageBattery({ provider, model, tick, others = [] }: { provider: Provider; model: string; tick: number; others?: Provider[] }) {
  const [u, setU] = useState<ProviderUsage | null>(null);
  const [open, setOpen] = useState(false); const [more, setMore] = useState<Partial<Record<Provider, ProviderUsage>>>({}); const [busy, setBusy] = useState(false); const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let alive = true; const load = (force = false) => { if (document.hidden && !force) return; void window.desktop.usage(provider, force).then((x) => { if (alive) setU(x); }).catch(() => {}); };
    setU((cur) => (cur && cur.provider === provider ? cur : null)); load(tick > 0); const timer = setInterval(load, REFRESH_MS); /* a refresh keeps what is shown until the answer is in: no flicker back to "checking" */ const seen = () => { if (!document.hidden) load(); }; document.addEventListener('visibilitychange', seen);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', seen); };
  }, [provider, tick]);
  useEffect(() => { if (!open) return; // the panel: the other provider's numbers too, and it closes on a click elsewhere or Escape
    for (const p of others) void window.desktop.usage(p).then((x) => setMore((m) => ({ ...m, [p]: x }))).catch(() => {});
    const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', off); window.addEventListener('keydown', off); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', off); }; }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { setBusy(true); try { const [mine, ...rest] = await Promise.all([provider, ...others].map((p) => window.desktop.usage(p, true))); if (mine) setU(mine); setMore(Object.fromEntries(others.map((p, i) => [p, rest[i]]))); } catch { /* what is shown stays */ } finally { setBusy(false); } };
  const name = PROVIDER_LABEL[provider]; const toggle = () => setOpen((x) => !x);
  let button;
  if (!u) button = <button className="battery unknown" title={`Checking how much ${name} usage is left…`} aria-label={`${name} usage: checking`} onClick={toggle}><span className="battery-body" /><span className="battery-cap" /></button>;
  else if (!u.available) button = <button className="battery off" title={`${name} usage is not available here: ${u.error ?? 'no usage information for this account'}.`} aria-label={`${name} usage not available`} onClick={toggle}><span className="battery-body" /><span className="battery-cap" /><span className="battery-pct">n/a</span></button>;
  else {
    // A window that belongs to one model only counts when that is the model in use (known once it is picked, or reported by the first turn).
    const mine = u.windows.filter((w) => counts(w, model)); const counted = mine.length ? mine : u.windows;
    const tight = counted.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a)); const left = Math.round(100 - tight.usedPercent);
    button = (
      <button className={`battery ${usageLevel(left)}`} title={`${name} usage: ${left}% left (${windowWords(tight.label)}).\nClick for every window and when it resets.`} aria-label={`${name} usage: ${left}% left`} aria-expanded={open} onClick={toggle}>
        <span className="battery-body"><span className="battery-fill" style={{ width: `${Math.max(left, 4)}%` }} /></span><span className="battery-cap" /><span className="battery-pct">{left}%</span>
      </button>
    );
  }
  return (
    <span className="use-wrap" ref={box}>
      {button}
      {open && (
        <div className="use-pop" role="dialog" aria-label="Usage">
          <div className="ctx-head"><strong>Usage</strong><button className="use-refresh" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh'}</button></div>
          <UsageSection usage={u} provider={provider} model={model} here />
          {others.map((p) => <UsageSection key={p} usage={more[p] ?? null} provider={p} model="" />)}
          <p className="ctx-foot">How much of each plan is left, window by window. Refreshed every minute and after each turn.</p>
        </div>
      )}
    </span>
  );
}

function UsageSection({ usage, provider, model, here = false }: { usage: ProviderUsage | null; provider: Provider; model: string; here?: boolean }) {
  return (
    <section className="use-sec">
      <div className="use-name">{PROVIDER_LABEL[provider]}{usage?.plan ? ` · ${planName(usage.plan)} plan` : ''}{here && <em>this chat</em>}</div>
      {!usage ? <p className="ctx-note">Checking…</p>
        : !usage.available ? <p className="ctx-note">Not available: {usage.error ?? 'no usage information for this account'}.</p>
        : usage.windows.map((w) => { const left = Math.round(100 - w.usedPercent); const other = here && !counts(w, model); return (
          <div key={w.label} className={`use-row${other ? ' other' : ''}`}>
            <div className="use-top"><span>{windowWords(w.label)}</span><b>{left} % left</b></div>
            <div className={`use-bar ${usageLevel(left)}`}><span style={{ width: `${Math.max(left, 1)}%` }} /></div>
            <div className="use-sub">{Math.round(w.usedPercent)} % used{w.resetsAt ? ` · ${resetText(w.resetsAt, Date.now(), clock)}` : ''}{other ? ' · another model: not counted in this chat' : ''}</div>
          </div>); })}
      {usage?.notes?.map((n) => <p key={n} className="ctx-note">{n}</p>)}
    </section>
  );
}
