import { useEffect, useRef, useState } from 'react';
import { PROVIDERS, PROVIDER_LABEL, type Provider, type ProviderUsage, type UsageWindow } from '../../shared/types';
import { ProviderIcon } from './ProviderIcon';
import { planName, resetText, usageLevel, windowWords } from '../../shared/usage';
import { t } from '../../shared/i18n';

// How much of the provider's plan is left, as a small battery next to the composer. It shows the tightest window (the one
// with the least left) that counts for the model in use. A click opens the whole picture (T-98): one tab per provider signed in,
// this chat's provider selected, each tab with what is left of it at a glance (the user, 2026-09-24: with a third provider the
// list "looks so bad"; tabs, "and obviously, the selected tab is the selected provider"); in a tab, every window, how much is left
// of each and when it resets, the plan, extra usage or credits; a
// model's own window (Claude's Fable week, a Codex model's extra limit) counts only while that model is in use. Refreshed every
// minute while the window is visible, when a turn ends (`tick`), and with the panel's Refresh.
const REFRESH_MS = 60_000;
const clock = (at: number, far: boolean): string => new Date(at).toLocaleString([], far ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
const counts = (w: UsageWindow, model: string): boolean => !w.model || model.toLowerCase().includes(w.model);
/** What is left of a plan, as the battery shows it: the tightest window that counts for the model in use (all of them when none does). */
const leftOf = (u: ProviderUsage, model: string): number | null => { if (!u.available || !u.windows.length) return null; const mine = u.windows.filter((w) => counts(w, model)); const counted = mine.length ? mine : u.windows; return Math.round(100 - counted.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a)).usedPercent); };

export function UsageBattery({ provider, model, tick, others = [] }: { provider: Provider; model: string; tick: number; others?: Provider[] }) {
  const [u, setU] = useState<ProviderUsage | null>(null);
  const [open, setOpen] = useState(false); const [more, setMore] = useState<Partial<Record<Provider, ProviderUsage>>>({}); const [busy, setBusy] = useState(false); const box = useRef<HTMLSpanElement>(null);
  const [tab, setTab] = useState<Provider>(provider); // the tab on show: this chat's provider whenever the panel opens
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
  const name = PROVIDER_LABEL[provider]; const toggle = () => { setTab(provider); setOpen((x) => !x); };
  const tabs = PROVIDERS.filter((p) => p === provider || others.includes(p)); const shown = tab === provider ? u : more[tab] ?? null;
  let button;
  if (!u) button = <button className="battery unknown" title={t('misc.usage.checkingTitle', { name })} aria-label={t('misc.usage.checkingAria', { name })} onClick={toggle}><span className="battery-body" /><span className="battery-cap" /></button>;
  else if (!u.available) button = <button className="battery off" title={t('misc.usage.unavailableTitle', { name, error: u.error ?? t('misc.usage.noInfo') })} aria-label={t('misc.usage.unavailableAria', { name })} onClick={toggle}><span className="battery-body" /><span className="battery-cap" /><span className="battery-pct">{t('misc.usage.na')}</span></button>;
  else {
    // A window that belongs to one model only counts when that is the model in use (known once it is picked, or reported by the first turn).
    const mine = u.windows.filter((w) => counts(w, model)); const counted = mine.length ? mine : u.windows;
    const tight = counted.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a)); const left = Math.round(100 - tight.usedPercent);
    button = (
      <button className={`battery ${usageLevel(left)}`} title={t('misc.usage.title', { name, left, window: windowWords(tight.label) })} aria-label={t('misc.usage.aria', { name, left })} aria-expanded={open} onClick={toggle}>
        <span className="battery-body"><span className="battery-fill" style={{ width: `${Math.max(left, 4)}%` }} /></span><span className="battery-cap" /><span className="battery-pct">{left}%</span>
      </button>
    );
  }
  return (
    <span className="use-wrap" ref={box}>
      {button}
      {open && (
        <div className="use-pop" role="dialog" aria-label={t('misc.usage.heading')}>
          <div className="ctx-head"><strong>{t('misc.usage.heading')}</strong><button className="use-refresh" disabled={busy} onClick={() => void refresh()}>{busy ? t('misc.usage.refreshing') : t('misc.usage.refresh')}</button></div>
          {tabs.length > 1 && <div className="use-tabs" role="tablist">{tabs.map((p) => { const x = p === provider ? u : more[p]; const left = x ? leftOf(x, p === provider ? model : '') : null; return (
            <button key={p} role="tab" aria-selected={tab === p} className={`use-tab${tab === p ? ' on' : ''}`} title={left !== null ? t(p === provider ? 'misc.usage.tabThisChatLeft' : 'misc.usage.tabLeft', { name: PROVIDER_LABEL[p], left }) : p === provider ? t('misc.usage.tabThisChat', { name: PROVIDER_LABEL[p] }) : PROVIDER_LABEL[p]} onClick={() => setTab(p)}>
              <ProviderIcon provider={p} size={11} />{PROVIDER_LABEL[p]}{left !== null && <em>{left}%</em>}</button>); })}</div>}
          <UsageSection usage={shown} provider={tab} model={tab === provider ? model : ''} here={tab === provider} />
          <p className="ctx-foot">{t('misc.usage.foot')}</p>
        </div>
      )}
    </span>
  );
}

function UsageSection({ usage, provider, model, here = false }: { usage: ProviderUsage | null; provider: Provider; model: string; here?: boolean }) {
  return (
    <section className="use-sec">
      <div className="use-name">{PROVIDER_LABEL[provider]}{usage?.plan ? ` · ${t('misc.usage.plan', { plan: planName(usage.plan) })}` : ''}{here && <em>{t('misc.usage.thisChat')}</em>}</div>
      {!usage ? <p className="ctx-note">{t('misc.usage.checking')}</p>
        : !usage.available ? <p className="ctx-note">{t('misc.usage.notAvailable', { error: usage.error ?? t('misc.usage.noInfo') })}</p>
        : usage.windows.map((w) => { const left = Math.round(100 - w.usedPercent); const other = here && !counts(w, model); return (
          <div key={w.label} className={`use-row${other ? ' other' : ''}`}>
            <div className="use-top"><span>{windowWords(w.label)}</span><b>{t('misc.usage.left', { left })}</b></div>
            <div className={`use-bar ${usageLevel(left)}`}><span style={{ width: `${Math.max(left, 1)}%` }} /></div>
            <div className="use-sub">{t('misc.usage.used', { used: Math.round(w.usedPercent) })}{w.resetsAt ? ` · ${resetText(w.resetsAt, Date.now(), clock)}` : ''}{other ? ` · ${t('misc.usage.otherModel')}` : ''}</div>
          </div>); })}
      {usage?.notes?.map((n) => <p key={n} className="ctx-note">{n}</p>)}
    </section>
  );
}
