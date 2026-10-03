// The Jauvex agent's dashboard (T-276): on top of its chat, what you see first when you open it. Needs you (what the app knows waits on you,
// then what the Jauvex agent's DASHBOARD.md says waits on you), Today (the workflows' runs), Working now (your agents at work), Pinned (the
// agent's notes). Yours to arrange: one third of the view, half, or folded to a line, and the cards you keep; on this computer. The rules
// (the file read, the greeting, the saved way) are in shared/dashboard.ts.
import { useState } from 'react';
import { PanelTop, PanelTopClose, Rows2 } from 'lucide-react';
import { getLanguage, t } from '../../shared/i18n';
const greeting = (hour: number): string => t(hour < 12 ? 'dashboard.greeting.morning' : hour < 18 ? 'dashboard.greeting.afternoon' : 'dashboard.greeting.evening');
import { DASH_CARDS, dashPrefsFrom, itemsFor, type DashCard, type DashPrefs, type DashSize, type DashboardFile } from '../../shared/dashboard';

export type DashNeed = { kind: 'gate' | 'ask' | 'reply'; text: string; note?: string; open?: () => void };
export type DashEvent = { at: number; text: string; state: 'done' | 'failed' | 'running' | 'waiting'; open?: () => void };
export type DashWorker = { name: string; provider: string; open?: () => void };
export type DashboardProps = { onHide?: () => void /* T-279: turn the dashboard off (Settings, General, brings it back) */; file: DashboardFile | null; auto: DashNeed[]; today: DashEvent[]; working: DashWorker[] };

const STORE = 'cvc.dash';
// How much of the view it takes, as icons in the app's own line style, the folders' (the user, 2026-10-01: "I rather have them as SVGs ... like
// with the format that we have for the folders"): the top third of a panel, its top half, the panel folding up to one line.
const SIZES = [{ s: 'third', title: () => t('dashboard.size.third'), Icon: PanelTop }, { s: 'half', title: () => t('dashboard.size.half'), Icon: Rows2 }, { s: 'folded', title: () => t('dashboard.size.folded'), Icon: PanelTopClose }] as const;
const ME = 'You'; // the person's section of the file ("## You")
const CARD_NAME = (c: DashCard): string => ({ needs: t('dashboard.card.needs'), today: t('dashboard.card.today'), working: t('dashboard.card.working'), pinned: t('dashboard.card.pinned') })[c];
const hm = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
type Row = { kind: DashNeed['kind'] | 'file'; text: string; note?: string; open?: () => void };
const MARK: Record<Row['kind'], string> = { gate: 'W', ask: '?', reply: '↩', file: '•' };

export function Dashboard({ file, auto, today, working, onHide }: DashboardProps) {
  const [prefs, setPrefsRaw] = useState<DashPrefs>(() => { try { return dashPrefsFrom(localStorage.getItem(STORE)); } catch { return dashPrefsFrom(null); } });
  const setPrefs = (p: DashPrefs) => { setPrefsRaw(p); try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* kept for this window only */ } };
  const size = (s: DashSize) => setPrefs({ ...prefs, size: s });
  const [menu, setMenu] = useState(false);
  const f = file ?? { people: [], team: [], pinned: [] };
  const rows: Row[] = [...auto, ...itemsFor(f, ME).map((l) => ({ kind: 'file' as const, text: l.text, note: l.note }))];
  const cards = DASH_CARDS.filter((c) => !prefs.hide.includes(c));
  const failed = today.filter((e) => e.state === 'failed').length;
  const day = new Date().toLocaleDateString(getLanguage() === 'en' ? 'en-US' : getLanguage(), { weekday: 'long', month: 'long', day: 'numeric' });
  const summary = [day, t('dashboard.summary.needs', { count: rows.length }), t('dashboard.summary.working', { count: working.length }), ...(failed ? [t('dashboard.summary.failed', { count: failed })] : [])].join(' · ');
  const cols = cards.map((c) => (c === 'needs' ? '1.45fr' : '1fr')).join(' ');
  return <div className={`dash dash-${prefs.size}`} data-testid="dashboard">
    <div className="dash-top">
      {prefs.size === 'folded'
        ? <span className="dash-fold"><b>{rows.length}</b> {t('dashboard.folded.needYou', { count: rows.length })}{rows[0] ? `: ${rows[0].text}` : ''}<span className="dash-k">·</span>{t('dashboard.summary.working', { count: working.length })}<button className="dash-link" onClick={() => size('third')}>{t('dashboard.folded.show')}</button></span>
        : <><b className="dash-title">{greeting(new Date().getHours())}</b><span className="dash-day">{summary}</span></>}
      <span className="dash-grow" />
      <span className="dash-seg dash-sizes" title={t('dashboard.size.title')}>{SIZES.map(({ s, title, Icon }) => <button key={s} className={prefs.size === s ? 'on' : ''} title={title()} aria-label={title()} onClick={() => size(s)}><Icon size={14} /></button>)}</span>
      <span className="dash-menu-at"><button className="dash-more" title={t('dashboard.menu.title')} onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && <span className="dash-menu" onMouseLeave={() => setMenu(false)}>{DASH_CARDS.map((c) => <label key={c}><input type="checkbox" checked={!prefs.hide.includes(c)} onChange={(e) => setPrefs({ ...prefs, hide: e.target.checked ? prefs.hide.filter((x) => x !== c) : [...prefs.hide, c] })} />{CARD_NAME(c)}</label>)}{onHide && <button className="dash-off" title={t('dashboard.menu.offTitle')} onClick={() => { setMenu(false); onHide(); }}>{t('dashboard.menu.off')}</button>}</span>}</span>
    </div>
    {prefs.size !== 'folded' && cards.length > 0 && <div className="dash-cards" style={{ gridTemplateColumns: cols }}>
      {cards.map((c) => c === 'needs'
        ? <div key={c} className="dash-card"><h5>{t('dashboard.card.needs')} <span className="dash-n">{rows.length}</span></h5>
            {rows.length ? rows.map((r, i) => <div key={i} className={`dash-need ${r.kind}`}>
              <span className="dash-ic">{MARK[r.kind]}</span>
              <div className="dash-body"><div className="dash-q" title={r.text}>{r.text}</div>{(r.note || r.open) && <div className="dash-meta"><span className="dash-note" title={r.note}>{r.note}</span>{r.open && <button className="dash-btn" onClick={r.open}>{t('dashboard.open')}</button>}</div>}</div></div>)
              : <p className="dash-empty">{t('dashboard.empty.needs')}</p>}</div>
        : c === 'today'
        ? <div key={c} className="dash-card"><h5>{t('dashboard.card.today')}</h5>
            {today.length ? today.map((e, i) => <div key={i} className={`dash-ev ${e.state}`} onClick={e.open} role={e.open ? 'button' : undefined}><span className="dash-tm">{hm(e.at)}</span><span className="dash-t" title={e.text}>{e.text}</span></div>)
              : <p className="dash-empty">{t('dashboard.empty.today')}</p>}</div>
        : c === 'working'
        ? <div key={c} className="dash-card"><h5>{t('dashboard.card.working')} <span className="dash-n">{working.length}</span></h5>
            {working.length ? working.map((w, i) => <div key={i} className="dash-ev" onClick={w.open} role={w.open ? 'button' : undefined}><span className={`dash-mark ${w.provider}`} /><span className="dash-t">{w.name}</span></div>)
              : <p className="dash-empty">{t('dashboard.empty.working')}</p>}</div>
        : <div key={c} className="dash-card"><h5>{t('dashboard.card.pinned')}</h5>
            {f.pinned.length ? f.pinned.map((p, i) => <div key={i} className="dash-pin">{p}</div>) : <p className="dash-empty">{t('dashboard.empty.pinned')}</p>}</div>)}
    </div>}
  </div>;
}
