// The Jauvex agent's dashboard (T-276): on top of its chat, what you see first when you open it. Needs you (what the app knows waits on you,
// then what the Jauvex agent's DASHBOARD.md says waits on you), Today (the workflows' runs), Working now (your agents at work), Pinned (the
// agent's notes). Yours to arrange: one third of the view, half, or folded to a line, and the cards you keep; on this computer. The rules
// (the file read, the greeting, the saved way) are in shared/dashboard.ts.
import { useState } from 'react';
import { PanelTop, PanelTopClose, Rows2 } from 'lucide-react';
import { DASH_CARDS, dashPrefsFrom, greetingFor, itemsFor, type DashCard, type DashPrefs, type DashSize, type DashboardFile } from '../../shared/dashboard';

export type DashNeed = { kind: 'gate' | 'ask' | 'reply'; text: string; note?: string; open?: () => void };
export type DashEvent = { at: number; text: string; state: 'done' | 'failed' | 'running' | 'waiting'; open?: () => void };
export type DashWorker = { name: string; provider: string; open?: () => void };
export type DashboardProps = { onHide?: () => void /* T-279: turn the dashboard off (Settings, General, brings it back) */; file: DashboardFile | null; auto: DashNeed[]; today: DashEvent[]; working: DashWorker[] };

const STORE = 'cvc.dash';
// How much of the view it takes, as icons in the app's own line style, the folders' (the user, 2026-10-01: "I rather have them as SVGs ... like
// with the format that we have for the folders"): the top third of a panel, its top half, the panel folding up to one line.
const SIZES = [{ s: 'third', title: 'One third of the view', Icon: PanelTop }, { s: 'half', title: 'Half of the view', Icon: Rows2 }, { s: 'folded', title: 'Folded to one line', Icon: PanelTopClose }] as const;
const ME = 'You'; // the person's section of the file ("## You")
const CARD_NAME: Record<DashCard, string> = { needs: 'Needs you', today: 'Today', working: 'Working now', pinned: 'Pinned' };
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
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const summary = [day, `${rows.length} ${rows.length === 1 ? 'thing needs' : 'things need'} you`, `${working.length} working`, ...(failed ? [`${failed} ${failed === 1 ? 'run' : 'runs'} failed`] : [])].join(' · ');
  const cols = cards.map((c) => (c === 'needs' ? '1.45fr' : '1fr')).join(' ');
  return <div className={`dash dash-${prefs.size}`} data-testid="dashboard">
    <div className="dash-top">
      {prefs.size === 'folded'
        ? <span className="dash-fold"><b>{rows.length}</b> {rows.length === 1 ? 'needs' : 'need'} you{rows[0] ? `: ${rows[0].text}` : ''}<span className="dash-k">·</span>{working.length} working<button className="dash-link" onClick={() => size('third')}>Show</button></span>
        : <><b className="dash-title">{greetingFor(new Date().getHours(), '')}</b><span className="dash-day">{summary}</span></>}
      <span className="dash-grow" />
      <span className="dash-seg dash-sizes" title="How much of the view it takes">{SIZES.map(({ s, title, Icon }) => <button key={s} className={prefs.size === s ? 'on' : ''} title={title} aria-label={title} onClick={() => size(s)}><Icon size={14} /></button>)}</span>
      <span className="dash-menu-at"><button className="dash-more" title="Customize: the cards you keep" onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && <span className="dash-menu" onMouseLeave={() => setMenu(false)}>{DASH_CARDS.map((c) => <label key={c}><input type="checkbox" checked={!prefs.hide.includes(c)} onChange={(e) => setPrefs({ ...prefs, hide: e.target.checked ? prefs.hide.filter((x) => x !== c) : [...prefs.hide, c] })} />{CARD_NAME[c]}</label>)}{onHide && <button className="dash-off" title="Settings, General, Dashboard brings it back" onClick={() => { setMenu(false); onHide(); }}>Turn the dashboard off</button>}</span>}</span>
    </div>
    {prefs.size !== 'folded' && cards.length > 0 && <div className="dash-cards" style={{ gridTemplateColumns: cols }}>
      {cards.map((c) => c === 'needs'
        ? <div key={c} className="dash-card"><h5>Needs you <span className="dash-n">{rows.length}</span></h5>
            {rows.length ? rows.map((r, i) => <div key={i} className={`dash-need ${r.kind}`}>
              <span className="dash-ic">{MARK[r.kind]}</span>
              <div className="dash-body"><div className="dash-q" title={r.text}>{r.text}</div>{(r.note || r.open) && <div className="dash-meta"><span className="dash-note" title={r.note}>{r.note}</span>{r.open && <button className="dash-btn" onClick={r.open}>Open</button>}</div>}</div></div>)
              : <p className="dash-empty">Nothing waits on you.</p>}</div>
        : c === 'today'
        ? <div key={c} className="dash-card"><h5>Today</h5>
            {today.length ? today.map((e, i) => <div key={i} className={`dash-ev ${e.state}`} onClick={e.open} role={e.open ? 'button' : undefined}><span className="dash-tm">{hm(e.at)}</span><span className="dash-t" title={e.text}>{e.text}</span></div>)
              : <p className="dash-empty">Nothing yet today.</p>}</div>
        : c === 'working'
        ? <div key={c} className="dash-card"><h5>Working now <span className="dash-n">{working.length}</span></h5>
            {working.length ? working.map((w, i) => <div key={i} className="dash-ev" onClick={w.open} role={w.open ? 'button' : undefined}><span className={`dash-mark ${w.provider}`} /><span className="dash-t">{w.name}</span></div>)
              : <p className="dash-empty">No agent is working right now.</p>}</div>
        : <div key={c} className="dash-card"><h5>Pinned</h5>
            {f.pinned.length ? f.pinned.map((p, i) => <div key={i} className="dash-pin">{p}</div>) : <p className="dash-empty">Nothing pinned yet: ask this agent to pin a note.</p>}</div>)}
    </div>}
  </div>;
}
