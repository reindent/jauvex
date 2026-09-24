import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickTranscript, suspicious, wordsOf } from '../../shared/transcript';
import { ProviderIcon } from './ProviderIcon';
import { UsageBattery } from './UsageBattery';
import { ContextMeter, type LastCompact } from './ContextMeter';
import { AUTO_COMPACT_CHOICES, AUTO_COMPACT_DEFAULT, autoCompactPct, shouldCompact, tokens, type ContextUsage } from '../../shared/context';
import { Accounts } from './Accounts';
import { Welcome } from './Welcome';
import typesafeMark from '../../assets/typesafe.png'; // TypeSafe's mark, on Jev agent rows: whose agent it is, like the provider marks
import { Copy, EyeOff as HideIcon, Pencil, Bug, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Paperclip, Settings, Move, Keyboard, ChevronRight, Eye, EyeOff, FolderPlus, Folder, FolderOpen, Laptop, Mic, PanelLeft, Plus, RotateCw, Search, SlidersHorizontal, Settings2, Square, SquarePen, Trash2, MicOff, Volume2, VolumeX, AudioLines, Wrench, Brain, X, Check, ShieldQuestion } from 'lucide-react';
import { md } from './md';
import { Pane, type PaneTarget } from './Pane';
import { findAgents, shortIds, shortTitle } from '../../shared/roster';
import { answerIs, stopSaysMore } from '../../shared/orders';
import { DICTATED_TAG, JAUVEX_HELLO, SIGN_IN_IN_APP, type AgentRequestEvent, type JauvexEntry, type UiState, type AgentCommand, type AgentResult, type Attachment, PROVIDERS, PROVIDER_LABEL, VOICE_DEFAULTS, kickoffMessage, type CommandDetails, providerOf, type VoiceCommand, type AppCommand, type Block, type BusyTriage, type DebugEvent, type ChatEvent, type ChatMessage, type ModelOption, type PermissionDecision, type Project, type Permissions, type Provider, type SessionInfo, type SessionPrefs, type VoiceSettings, type VoiceStatus } from '../../shared/types';
import { ago, api, pickFolder, size } from './api';
import { VoiceEngine, clean, type VoicePhase } from './voice';
import { Orb } from './Orb';
import { JevPad } from './JevPad';


// One mounted chat, as the app's agent router sees it: it can be handed a message (steered into a running turn, or sent as a new one).
type ChatBridge = { deliver: (text: string, replyTo?: Sel) => Promise<void> }; // replyTo: the reply to this message goes back to that agent by itself
type SideVoice = { muteIn?: number | null; phase: VoicePhase; level: React.RefObject<number>; micMuted: boolean; speakerOff: boolean; hush: () => void; toggleMic: () => void; toggleSpeaker: () => void; end: () => void };
type QueueItem = { text: string; images: Attachment[]; spoken?: boolean; shown?: boolean }; // shown: already in the thread (a stop's words, a message handed to a turn that never read it): sent without a second bubble // one queued message: its text, the images pasted with it, and whether it was dictated (it goes out tagged)
type Sel = { projectId: string; sessionId: string | null; key: string; kind?: 'jev'; voice?: boolean; name?: string; kickoff?: string; purpose?: string; detailsId?: string; adopt?: string }; // adopt: a turn already running in the main process (the window was reloaded); its chat id // detailsId: the model is still reading the order; name and kickoff may still change // kickoff: the first message of an agent opened by an order to the app, sent by itself // name: given by a spoken command ("... named X"), applied once the session exists // voice: opened by a spoken command, so voice mode carries on there // kind jev: sessionId is a Jev agent's id, and the view is its pad, not a chat
type Spoken = { text: string; audio: ArrayBuffer | null };
// "Stop" must stop at once: a short utterance with a stop word is acted on from the transcript itself, without asking any model.
// Spanish "para" and "alto" are also everyday words ("for", "high"), so they only count when they are the whole utterance, give or take "ya" or "eso".
const STOP_WORD = /\b(stop|cancel|abort|halt)\b/i;
/** The first sentences of an answer, up to about 260 characters: what gets said when the voice model has nothing in time. */
const opening = (plain: string): string => { const parts = plain.match(/[^.!?]+[.!?]+/g) ?? [plain]; let out = ''; for (const s of parts) { if (out && (out + s).length > 260) break; out += s; } return (out || plain).slice(0, 320).trim(); };
const CONTEXT_TAG = /<jev-agent-context>[\s\S]*?<\/jev-agent-context>\s*|^\[voice transcript\] /g; // what the app sends along with the user's words (a Jev agent's trainer context, the dictation tag): never shown
const HOLD_MS = 2500; // how long a half-finished thought waits for its second half before it is sent as it is
const isStopCommand = (text: string): boolean => text.trim().split(/\s+/).length <= 10 && STOP_WORD.test(text);
const CLAUDE_MODELS: ModelOption[] = [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }, { id: 'claude-fable-5-1', label: 'Fable 5.1' }, { id: 'claude-opus-5', label: 'Opus 5' }, { id: 'claude-sonnet-5', label: 'Sonnet 5' }, { id: 'claude-haiku-4-5', label: 'Haiku 4.5' }]; // the ids the CLI knows (0.3.280 added Opus 5.5); 'Default model' in the selector is the CLI's own default
const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5'; // a new Claude session with no model picked runs on this, not on the CLI's default
const modelKey = (p: Provider) => (p === 'claude' ? 'cvc.model' : `cvc.model.${p}`);
const effortKey = (p: Provider) => (p === 'claude' ? 'cvc.effort' : `cvc.effort.${p}`);
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_LABEL: Record<string, string> = { minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra' };

/** Jauvex's own mark: two strands that cross, one over the other (two providers, one app). The strands flow while a turn runs. */
function Mark({ busy = false }: { busy?: boolean }) {
  return (
    <svg className={`mark${busy ? ' busy' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <mask id="mark-under"><rect width="24" height="24" fill="#fff" /><path d="M4 6.5C11 6.5 13 17.5 20 17.5" stroke="#000" strokeWidth="6.4" /></mask>
      <path className="strand under" pathLength={20} mask="url(#mark-under)" d="M4 17.5C11 17.5 13 6.5 20 6.5" />
      <path className="strand over" pathLength={20} d="M4 6.5C11 6.5 13 17.5 20 17.5" />
    </svg>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [autoCompact, setAutoCompact] = useState(AUTO_COMPACT_DEFAULT); // compact an agent's conversation when its context is this full (T-74); every open chat is told
  const changeAutoCompact = (pct: number) => { setAutoCompact(pct); void api.setUi({ autoCompact: pct }); window.dispatchEvent(new CustomEvent('cvc-auto-compact', { detail: pct })); };
  // Who is signed in: only a signed-in provider can be chosen for a new session, a move or the default (checked at start and after every sign-in or sign-out).
  const [signedIn, setSignedIn] = useState<Record<Provider, boolean>>({ claude: true, codex: true });
  useEffect(() => { const check = () => void Promise.all(PROVIDERS.map((p) => window.desktop.accountStatus(p).then((st) => [p, st.signedIn] as const).catch(() => [p, true] as const))).then((all) => setSignedIn(Object.fromEntries(all) as Record<Provider, boolean>)); check(); return window.desktop.onAccountEvent((e) => { if (e.type === 'done') setTimeout(check, 500); }); }, []);
  const [jauvex, setJauvex] = useState<Project | null>(null); const [jauvexSession, setJauvexSession] = useState<string | null>(null); const [jauvexProvider, setJauvexProvider] = useState<Provider | null>(null); const [jauvexMove, setJauvexMove] = useState<'unified' | 'handoff'>('unified'); const [showJauvex, setShowJauvex] = useState(true); const [defaultProvider, setDefaultProvider] = useState<Provider | null>(null); // the Jauvex agent (the app's own folder as a project) and the default agent
  const [infos, setInfos] = useState<Record<string, SessionInfo[]>>({});
  const [sel, setSel] = useState<Sel | null>(null);
  const [history, setHistory] = useState<Sel[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [sidebar, setSidebar] = useState(true);
  const [picker, setPicker] = useState<Project | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameAt, setRenameAt] = useState<'title' | 'row'>('row'); // one input at a time: in the title bar or in the sidebar row
  const [renaming, setRenaming] = useState<string | null>(null); // `${projectId}:${sessionId}` of the session whose name is being typed
  const rename = async (projectId: string, sessionId: string, title: string) => { setRenaming(null); const name = title.trim(); if (!name) return;
    try { if (projects.find((p) => p.id === projectId)?.jev?.some((a) => a.id === sessionId)) await api.jevSave(projectId, sessionId, { name }); else await api.rename(projectId, sessionId, name); await refresh(); } catch (e) { setError((e as Error).message); } };
  // Taking a session out of the sidebar deletes nothing: it stays with its provider and can be added back with +.
  const hideSession = async (p: Project, sessionId: string) => {
    try { await api.setSessions(p.id, p.sessions.filter((x) => x !== sessionId), p.providers ?? {}); if (sel?.projectId === p.id && sel.sessionId === sessionId) setSel(null);
      setOpened((o) => o.filter((x) => !(x.projectId === p.id && x.sessionId === sessionId) || busyRef.current[x.key])); await refresh(); } catch (e) { setError((e as Error).message); } };
  // Jev agents: offered when a TypeSafe key is on this Mac. Picking "Jev" for a new session turns it into an agent's pad.
  const [jevKey, setJevKey] = useState(false);
  useEffect(() => { void api.jevAvailable().then(setJevKey).catch(() => setJevKey(false)); }, []);
  const openJev = (projectId: string, agentId: string) => open({ projectId, sessionId: agentId, key: `${projectId}:jev:${agentId}`, kind: 'jev' });
  const newJev = async (projectId: string, replaceKey?: string, name?: string) => {
    try { const agent = await api.jevCreate(projectId); if (name) await api.jevSave(projectId, agent.id, { name }); await refresh(); if (replaceKey) setOpened((o) => o.filter((x) => x.key !== replaceKey)); openJev(projectId, agent.id); } catch (e) { setError((e as Error).message); } };
  const deleteJev = async (projectId: string, agentId: string) => {
    if (!window.confirm('Delete this Jev agent and its runs? This cannot be undone.')) return;
    try { await api.jevDelete(projectId, agentId); setOpened((o) => o.filter((x) => x.sessionId !== agentId)); if (sel?.sessionId === agentId) setSel(null); await refresh(); } catch (e) { setError((e as Error).message); } };
  // Spoken to the app itself: "create a new Codex agent in the homepage project". The voice has already said what it is doing.
  const runCommand = (cmd: AppCommand, fromProjectId: string, fallback: Provider) => {
    if (cmd.type === 'restart-app') { void window.desktop.appRestart(); return; }
    if (cmd.type === 'reload-ui') { setTimeout(() => void window.desktop.appReload(), 1500); return; } // after the voice has said so
    if (cmd.type === 'goodbye' || cmd.type === 'hold' || cmd.type === 'confirm') return; // the chat that heard it handles these itself (a question is asked there)
    const projectId = cmd.projectId && projects.some((p) => p.id === cmd.projectId) ? cmd.projectId : projects.find((p) => p.id === fromProjectId && !p.builtin) ? fromProjectId : projects.find((p) => !p.builtin)?.id ?? fromProjectId; /* never the app's own folder unless asked for it */
    if (cmd.provider === 'jev') { void newJev(projectId, undefined, cmd.name); return; }
    const folder = projects.find((p) => p.id === projectId);
    // The microphone stays where the order was given (one voice in the app); the new agent gets a first message so it exists and knows why it was opened.
    localStorage.setItem('cvc.provider', cmd.provider ?? fallback); open({ projectId, sessionId: null, key: `${projectId}:new:${Date.now()}`, ...(cmd.name ? { name: cmd.name } : {}), ...(cmd.purpose ? { purpose: cmd.purpose } : {}), ...(cmd.detailsId ? { detailsId: cmd.detailsId } : { kickoff: cmd.kickoff ?? kickoffMessage(folder?.name ?? 'this folder', folder?.path ?? '', cmd.name, cmd.purpose) }) });
  };
  const [accountsOpen, setAccountsOpen] = useState(false);
  // Every action in the app, for an agent: a request file in data/commands (scripts/jauvex.ts) reaches this, the result goes back the same way.
  const findFolder = (ref?: string): Project | null => { if (!ref) return projects.find((p) => p.id === sel?.projectId && !p.builtin) ?? projects.find((p) => !p.builtin) ?? null; const n = ref.trim().toLowerCase(); return projects.find((p) => p.id === ref) ?? projects.find((p) => p.path === ref || p.path.toLowerCase() === n) ?? projects.find((p) => p.name.toLowerCase() === n) ?? null; };
  const findSession = (folder: Project | null, ref: string): { projectId: string; sessionId: string } | null => { const n = ref.trim().toLowerCase(); const pool = folder ? [folder] : projects; for (const p of pool) { const list = infos[p.id] ?? []; const hit = list.find((i) => i.sessionId === ref) ?? list.find((i) => i.sessionId.startsWith(ref)) ?? list.find((i) => (i.customTitle ?? '').toLowerCase() === n) ?? list.find((i) => i.summary.toLowerCase() === n); if (hit) return { projectId: p.id, sessionId: hit.sessionId }; const o = opened.find((x) => x.projectId === p.id && x.name?.toLowerCase() === n && x.sessionId); if (o?.sessionId) return { projectId: p.id, sessionId: o.sessionId }; } return null; };
  const runAgentCommand = async (c: AgentCommand): Promise<AgentResult> => {
    try {
      switch (c.type) {
        case 'list': return { ok: true, defaultProvider, folders: projects.filter((p) => !p.builtin).map((p) => ({ id: p.id, name: p.name, path: p.path, sessions: roster().filter((a) => a.projectId === p.id).map(({ sessionId, name, provider, busy }) => ({ id: sessionId, name, provider, busy })) })), jauvex: jauvex ? { id: jauvex.id, path: jauvex.path, session: jauvexSession } : null };
        case 'add-folder': { const p = await api.addProject(c.path); await refresh(); return { ok: true, folder: { id: p.id, name: p.name, path: p.path } }; }
        case 'pick-folder': { const dir = await pickFolder(); if (!dir) return { ok: false, error: 'the user chose no folder' }; const p = await api.addProject(dir); await refresh(); return { ok: true, folder: { id: p.id, name: p.name, path: p.path } }; }
        case 'new-agent': { const folder = findFolder(c.folder); if (!folder) return { ok: false, error: c.folder ? `no folder "${c.folder}"` : 'no folder yet: add-folder first' };
          const provider = c.provider ?? jauvexProvider ?? defaultProvider ?? 'claude'; /* unnamed: the Jauvex agent's own provider, the creator's configuration */ const kickoff = c.kickoff?.trim() ? c.kickoff : kickoffMessage(folder.name, folder.path, c.name, c.purpose); /* always a first message: an agent exists once it has had one, and an empty chat vanished (2026-09-24) */
          if (provider === 'jev') { await newJev(folder.id, undefined, c.name); return { ok: true, folder: folder.name, provider }; }
          localStorage.setItem('cvc.provider', provider); const key = `${folder.id}:new:${Date.now()}`; open({ projectId: folder.id, sessionId: null, key, ...(c.name ? { name: c.name } : {}), ...(c.purpose ? { purpose: c.purpose } : {}), kickoff }); return { ok: true, folder: folder.name, provider, key, started: true }; }
        case 'open': { if (!c.session) { if (!jauvex) return { ok: false, error: 'no Jauvex agent' }; const key = `${jauvex.id}:jauvex`; open({ projectId: jauvex.id, sessionId: jauvexSession, key, name: 'Jauvex' }); return { ok: true, opened: 'Jauvex' }; }
          const hit = findSession(c.folder ? findFolder(c.folder) : null, c.session) /* no folder named: every folder */; if (!hit) return { ok: false, error: `no session "${c.session}"` }; open({ projectId: hit.projectId, sessionId: hit.sessionId, key: `${hit.projectId}:${hit.sessionId}` }); return { ok: true, opened: hit.sessionId }; }
        case 'send': { const hit = findSession(c.folder ? findFolder(c.folder) : null, c.session) /* no folder named: every folder */; if (!hit) return { ok: false, error: `no session "${c.session}"` }; const ok = await deliverTo(hit.projectId, hit.sessionId, c.text); return ok ? { ok: true, sent: hit.sessionId } : { ok: false, error: 'the session could not take the message' }; }
        case 'rename': { const hit = findSession(c.folder ? findFolder(c.folder) : null, c.session) /* no folder named: every folder */; if (!hit) return { ok: false, error: `no session "${c.session}"` }; await api.rename(hit.projectId, hit.sessionId, c.title); await refresh(); return { ok: true }; }
        case 'settings': { const ui: Partial<UiState> = {}; if (c.jauvexMove) { setJauvexMove(c.jauvexMove); ui.jauvexMove = c.jauvexMove; } if (c.defaultProvider) { setDefaultProvider(c.defaultProvider); localStorage.setItem('cvc.provider', c.defaultProvider); ui.defaultProvider = c.defaultProvider; } if (typeof c.showJauvex === 'boolean') { setShowJauvex(c.showJauvex); ui.showJauvex = c.showJauvex; } if (typeof c.welcomeNext === 'boolean') { setWelcomeNext(c.welcomeNext); ui.welcomed = !c.welcomeNext; } if (typeof c.autoCompact === 'number') { if (!(c.autoCompact >= 0 && c.autoCompact <= 100)) return { ok: false, error: '--auto-compact takes a percentage from 1 to 99, or provider (the provider decides)' }; const n = Math.round(c.autoCompact); setAutoCompact(n); window.dispatchEvent(new CustomEvent('cvc-auto-compact', { detail: n })); ui.autoCompact = n; } if (Object.keys(ui).length) await api.setUi(ui); return { ok: true, ...ui }; }
        case 'welcome': setWelcomeOpen(true); return { ok: true };
        case 'reload-ui': setTimeout(() => void window.desktop.appReload(), 500); return { ok: true };
        case 'restart-app': setTimeout(() => void window.desktop.appRestart(), 500); return { ok: true };
        default: return { ok: false, error: `unknown command "${(c as { type?: string }).type ?? ''}"` };
      }
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  };
  const agentCmd = useRef(runAgentCommand); agentCmd.current = runAgentCommand;
  useEffect(() => window.desktop.onAppCommand(({ id, command }) => { void agentCmd.current(command).then((r) => window.desktop.appCommandDone(id, r)); }), []);
  const [settingsOpen, setSettingsOpen] = useState(false); const [welcomeNext, setWelcomeNext] = useState(false); // the app's own settings (the wheel in the footer); welcomeNext: show the welcome again on the next start
  // The right pane: a file or a link an agent shows opens there, never in the window itself. Links are caught on the way up from any chat.
  // The right pane belongs to the session it was opened in: each keeps its own, and looking at another session
  // shows that one's pane, or none. It was one pane for the whole window and stayed open over every session.
  const [panes, setPanes] = useState<Record<string, PaneTarget>>({});
  const paneKey = sel?.key ?? ''; const pane = panes[paneKey] ?? null;
  const setPane = (t: PaneTarget | null) => setPanes((all) => { const next = { ...all }; if (t) next[paneKey] = t; else delete next[paneKey]; return next; });
  const openLink = (href: string, base: string) => { const h = href.trim(); if (!h || h.startsWith('#')) return;
    if (/^https?:\/\//i.test(h)) { setPane({ kind: 'url', url: h }); return; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(h) && !/^file:/i.test(h)) { void window.desktop.openExternal(h); return; } /* mailto and the like: the Mac */
    let p = /^file:/i.test(h) ? decodeURI(h.replace(/^file:\/\/(localhost)?/i, '')) : h; if (!p.startsWith('/') && !p.startsWith('~')) p = `${base.replace(/\/$/, '')}/${p.replace(/^\.\//, '')}`;
    setPane({ kind: 'file', path: p.replace(/[?#].*$/, '') }); };
  const openLinkRef = useRef(openLink); openLinkRef.current = openLink;
  useEffect(() => window.desktop.onPaneOpen((url) => openLinkRef.current(url, '')), []); /* the window was asked to navigate away (a link the app did not catch): the pane takes it */
  useEffect(() => { const w = Number(localStorage.getItem('cvc.pane.w')); if (w >= 320) document.documentElement.style.setProperty('--pane-w', `${w}px`); }, []);
  useEffect(() => { const w = Number(localStorage.getItem('cvc.side.w')); if (w >= 220) document.documentElement.style.setProperty('--side-w', `${w}px`); }, []);
  // The sidebar is resized from its right edge, like the right pane from its left one; the width is kept across reloads.
  // A drag ends on pointerup, pointercancel or a lost capture, and any move with no button held ends it too: a missed pointerup
  // used to leave the move listener on the grip, and hovering it then shrank the sidebar to the pointer.
  const onSideGrip = (e: React.PointerEvent<HTMLDivElement>) => { if (e.button !== 0) return; const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const stop = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop); el.removeEventListener('lostpointercapture', stop); };
    const move = (ev: PointerEvent) => { if (!(ev.buttons & 1)) return stop(); const side = el.parentElement; if (!side) return stop(); const w = Math.round(Math.max(220, Math.min(560, ev.clientX - side.getBoundingClientRect().left))); document.documentElement.style.setProperty('--side-w', `${w}px`); localStorage.setItem('cvc.side.w', String(w)); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('lostpointercapture', stop); };
  const catchLinks = (e: React.MouseEvent) => { const a = (e.target as HTMLElement).closest?.('a[href]'); if (!a) return; const href = a.getAttribute('href') ?? ''; if (!href || href.startsWith('#')) return; e.preventDefault(); e.stopPropagation(); const host = a.closest('.chat-host') as HTMLElement | null; openLink(href, host?.dataset.base ?? ''); };
  const [welcomeOpen, setWelcomeOpen] = useState(false); // the first-run screen: opens by itself the first time the app runs (over the main window), and from the sidebar's footer after
  // The session's model read the order: the name it settled on and the first message it wrote reach the agent that already opened.
  useEffect(() => window.desktop.onCommandDetails((d: CommandDetails) => {
    const fix = <T extends Sel>(o: T): T => { if (o.detailsId !== d.id) return o; const folder = projects.find((p) => p.id === o.projectId); const name = d.name ?? o.name; const purpose = d.purpose ?? o.purpose;
      return { ...o, name, purpose, detailsId: undefined, kickoff: d.kickoff ?? kickoffMessage(folder?.name ?? 'this folder', folder?.path ?? '', name, purpose) }; };
    setOpened((all) => all.map(fix)); setSel((cur) => (cur ? fix(cur) : cur)); setHistory((h) => h.map(fix));
  }), [projects]);
  const [debugOpen, setDebugOpen] = useState(() => localStorage.getItem('cvc.debug') === '1');

  const loadInfos = useCallback(async (p: Project) => {
    try { const sessions = await api.sessions(p.id); setInfos((m) => ({ ...m, [p.id]: sessions })); } catch (e) { setError((e as Error).message); }
  }, []);
  const refresh = useCallback(async () => {
    try { const s = await api.state(); setProjects(s.projects); s.projects.forEach((p) => void loadInfos(p)); } catch (e) { setError((e as Error).message); }
  }, [loadInfos]);
  // First load: restore the folders, the picked sessions, and the session that was open last time.
  const restored = useRef(false);
  useEffect(() => { void (async () => {
    await refresh();
    if (restored.current) return; restored.current = true;
    try { const s = await api.state(); const u = s.ui; if (u?.sidebar === false) setSidebar(false); if (u?.showMeta) setShowMeta(true); setAutoCompact(autoCompactPct(u)); if (!u?.welcomed) setWelcomeOpen(true); setWelcomeNext(!u?.welcomed); setJauvexSession(u?.jauvexSession ?? null); setJauvexProvider(u?.jauvexProvider ?? null); setJauvexMove(u?.jauvexMove ?? 'unified'); setShowJauvex(u?.showJauvex !== false); if (u?.defaultProvider) { setDefaultProvider(u.defaultProvider); localStorage.setItem('cvc.provider', u.defaultProvider); }
      void api.jauvexProject().then((j) => { setJauvex(j); setProjects((ps) => (ps.some((x) => x.id === j.id) ? ps : [...ps, j])); }).catch(() => {}); // the first time it is created after the state was loaded: the chat needs it in the list
      const p = u?.sel && s.projects.find((x) => x.id === u.sel!.projectId);
      // Turns still running in the main process (the window was reloaded, not the app): their sessions are mounted with the running
      // chat's id, so the events of that turn land here. Decided before anything is mounted: a chat takes its id at mount and never after.
      const live = await window.desktop.chatLive().catch(() => []); const back = live.filter((l) => l.sessionId && s.projects.some((x) => x.id === l.projectId)).map((l): Sel => ({ projectId: l.projectId, sessionId: l.sessionId, key: `${l.projectId}:${l.sessionId}`, adopt: l.chatId }));
      let first: Sel | null = p && u?.sel ? { projectId: p.id, sessionId: u.sel.sessionId, key: `${p.id}:${u.sel.sessionId}` } : null;
      if (first) first = back.find((b) => b.key === first!.key) ?? first;
      const all = [...(first ? [first] : []), ...back.filter((b) => b.key !== first?.key)]; const sel0 = first ?? back[0] ?? null;
      if (sel0) { setSel(sel0); setOpened(all); setHistory([sel0]); setCursor(0); }
    } catch { /* first run */ }
  })(); }, [refresh]);
  useEffect(() => { if (restored.current) void api.setUi({ sel: sel?.sessionId ? { projectId: sel.projectId, sessionId: sel.sessionId } : null, sidebar, showMeta }); }, [sel, sidebar, showMeta]);

  // Every chat that was opened stays mounted (hidden) so that leaving a session never stops or loses its running turn.
  const [opened, setOpened] = useState<Sel[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});   // by chat key: a turn is running there
  const [listening, setListening] = useState<string | null>(null); // the one chat whose microphone is on: it keeps listening while other sessions are looked at or typed into
  const [voiceUi, setVoiceUi] = useState<SideVoice | null>(null);
  // ---------- agents talking to agents. An agent writes a ```message-agent <name>``` block; when its turn ends the app delivers the text
  // to that session (steered in if it is working, sent otherwise), tagged with the sender's name. No provider tool, no protocol:
  // the app already sees every reply and can reach every session. Relays are capped so two agents cannot ping-pong forever.
  const bridges = useRef(new Map<string, ChatBridge>()); // by chat key
  const relays = useRef<number[]>([]);
  const nameOf = (o: Sel): string => { const i = o.sessionId ? infos[o.projectId]?.find((x) => x.sessionId === o.sessionId) : undefined; return i?.customTitle || o.name || i?.summary || (o.sessionId ? `Session ${o.sessionId.slice(0, 6)}` : 'New session'); };
  // The roster is the app's own world: the sessions added to each folder in the sidebar (plus ones opened in this run), never
  // every conversation the providers keep on disk for that folder.
  // The Jauvex agent is one agent: its current session only, never its past ones (one per move between providers), or "Jauvex" matches many.
  type Agent = { projectId: string; sessionId: string; id: string; name: string; provider: Provider; folder: string; busy: boolean };
  const roster = (): Agent[] => { const rows = projects.flatMap((p) => {
    const row = (sid: string, name?: string): Agent => { const i = infos[p.id]?.find((x) => x.sessionId === sid); const o = opened.find((x) => x.sessionId === sid); return { projectId: p.id, sessionId: sid, id: '', name: name || i?.customTitle || o?.name || shortTitle(i?.summary ?? '') || `Session ${sid.slice(0, 6)}`, provider: i?.provider ?? providerOf(p, sid), folder: p.name, busy: !!o && !!busy[o.key] }; };
    if (p.builtin === 'jauvex') { const o = opened.find((x) => x.key === `${p.id}:jauvex`); return o?.sessionId ? [row(o.sessionId, 'Jauvex')] : []; }
    const ids = new Set([...p.sessions, ...opened.filter((o) => o.projectId === p.id && o.sessionId && o.kind !== 'jev').map((o) => o.sessionId!)]);
    return [...ids].map((sid) => row(sid));
  }); const short = shortIds(rows.map((r) => r.sessionId)); return rows.map((r) => ({ ...r, id: short.get(r.sessionId) ?? r.sessionId.slice(0, 6) })); };
  const idOf = (sid: string) => roster().find((a) => a.sessionId === sid)?.id ?? sid.slice(0, 6); // the short id, as long as it needs to be unique in the roster
  const rosterText = () => roster().map((a) => `- "${a.name}" [${a.id}] (${PROVIDER_LABEL[a.provider]}, folder ${a.folder}, ${a.busy ? 'working' : 'idle'})`).join('\n') || '(no other sessions yet)';
  const deliverTo = async (projectId: string, sessionId: string, text: string, replyTo?: Sel): Promise<boolean> => {
    let o = opened.find((x) => x.sessionId === sessionId); const key = o?.key ?? `${projectId}:${sessionId}`;
    if (!o) { o = { projectId, sessionId, key }; const mounted = o; setOpened((all) => (all.some((x) => x.key === key) ? all : [...all, mounted])); } // mounted in the background, not shown
    for (let i = 0; i < 60 && !bridges.current.get(key); i++) await new Promise((r) => setTimeout(r, 150));
    const b = bridges.current.get(key); if (!b) return false; await b.deliver(text, replyTo); return true;
  };
  const returnReply = async (from: Sel, to: Sel, reply: string) => {
    if (!to.sessionId || !from.sessionId) return; const me = nameOf(from);
    if (new RegExp(`\\x60\\x60\\x60(?:message-agent|to-agent)[ \\t]+"?(?:${nameOf(to).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\[?${to.sessionId.slice(0, 6)}[0-9a-f]*\\]?)`, 'i').test(reply)) return; // they wrote to them explicitly: that block is delivered by the router, not twice
    // Blocks addressed to other agents (and roster requests) are the router's: they reached their addressee. The reply that goes back to
    // the sender leaves them out and names who else was written to; otherwise a request meant for a third agent read as one for the sender.
    const others = [...reply.matchAll(/```(?:message-agent|to-agent)[ \t]+"?([^\n"`]+?)"?[ \t]*\n[\s\S]*?```/g)].map((m) => m[1]!.trim());
    const text = reply.replace(/```(?:message-agent|to-agent)[ \t]+[^\n]*\n[\s\S]*?```/g, '').replace(/```\s*list-agents\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) { window.desktop.debugPush('note', `agent reply: "${me}" wrote only to ${others.map((o) => `"${o}"`).join(', ') || 'nobody'}: nothing goes back to "${nameOf(to)}"`); return; }
    const now = Date.now(); relays.current = relays.current.filter((t) => now - t < 600_000); if (relays.current.length >= 30) return; relays.current.push(now);
    window.desktop.debugPush('note', `agent reply: "${me}" -> "${nameOf(to)}": ${text.slice(0, 120)}${others.length ? ` (its message to ${others.join(', ')} left out)` : ''}`);
    await deliverTo(to.projectId, to.sessionId, `(from agent "${me}" [${idOf(from.sessionId)}]) ${text}${others.length ? `\n\n(It also wrote to ${others.map((o) => `"${o}"`).join(', ')}; that message went to them, not to you.)` : ''}`);
  };
  const routeAgentBlocks = async (from: Sel, reply: string) => {
    const blocks = [...reply.matchAll(/```(?:message-agent|to-agent)[ \t]+"?([^\n"`]+?)"?[ \t]*\n([\s\S]*?)```/g)].map((m) => ({ to: m[1]!.trim(), text: m[2]!.trim() })).filter((b) => b.text);
    const wantsList = /```\s*list-agents\s*```/.test(reply); if (!blocks.length && !wantsList) return;
    window.desktop.debugPush('note', `agent router: ${blocks.length} message block(s)${wantsList ? ' and a roster request' : ''} in a reply from "${nameOf(from)}"`);
    const answer = async (text: string) => { if (!from.sessionId) return; await deliverTo(from.projectId, from.sessionId, `(from the app) ${text}`); };
    if (wantsList) await answer(`Agents in this app:\n${rosterText()}`);
    for (const b of blocks) { const r = await sendAgentMessage(from, b.to, b.text, 'block'); if (!r.sent) { await answer(r.note); if (r.stop) return; } }
  };
  // One message from one agent to another, by name or short id, from a fenced block or from the message_agent tool of a Claude session:
  // the same router. Names are matched without case, spaces or punctuation ("CodexAgent" finds "Codex agent"); the short id always wins
  // (findAgents in shared/roster.ts). An explicit message is a question: whatever the other agent replies with comes back to the sender
  // by itself. That answer does not bounce back again: to carry on, the sender writes again. So two agents cannot ping-pong on their own.
  const sendAgentMessage = async (from: Sel, to: string, text: string, by: 'block' | 'tool'): Promise<{ sent: boolean; note: string; stop?: boolean }> => {
    const me = nameOf(from); const now = Date.now(); relays.current = relays.current.filter((t) => now - t < 600_000);
    if (relays.current.length >= 30) { window.desktop.debugPush('note', `agent relay cap reached: "${me}" -> "${to}"`); return { sent: false, stop: true, note: `Not delivered to "${to}": 30 agent-to-agent messages in ten minutes, the app stopped relaying until the user says something.` }; }
    const loose = findAgents(roster(), to, from.sessionId ?? undefined);
    if (loose.length !== 1) { window.desktop.debugPush('note', `agent message from "${me}" to "${to}": ${loose.length ? `${loose.length} agents match` : 'no such agent'}, the roster goes back instead`); return { sent: false, note: `${loose.length ? `"${to}" matches several agents: write the id in brackets instead, as in [${loose[0]!.id}]` : `No agent named "${to}"`}. Agents in this app:\n${rosterText()}` }; }
    const target = loose[0]!; relays.current.push(now); window.desktop.debugPush('note', `agent message: "${me}" -> "${target.name}": ${text.slice(0, 120)}${by === 'tool' ? ' [by tool]' : ''}`);
    const ok = await deliverTo(target.projectId, target.sessionId, `(from agent "${me}" [${from.sessionId ? idOf(from.sessionId) : ''}]) ${text}`, from);
    if (!ok) { window.desktop.debugPush('note', `agent message: "${target.name}" could not be reached (no chat took it in 9 s)`); return { sent: false, note: `Could not reach "${target.name}" right now.` }; }
    return { sent: true, note: `Delivered to "${target.name}" [${target.id}]. Their reply comes back to you by itself, later, as a message that starts with (from agent "${target.name}" [${target.id}]); end your turn and go on when it comes.` };
  };
  // The message_agent and list_agents tools of a Claude session, answered here: the window owns the roster and the router.
  const answerAgentRequest = async (r: AgentRequestEvent): Promise<string> => {
    if (r.req.type === 'list') return `Agents in this app:\n${rosterText()}`;
    const from = opened.find((o) => o.projectId === r.projectId && !!o.sessionId && o.sessionId === r.sessionId) ?? (r.sessionId ? undefined : opened.find((o) => o.projectId === r.projectId && !o.sessionId && o.kind !== 'jev'));
    if (!from) return 'This session is not open in the app window, or has no id yet: end this turn and try again.';
    return (await sendAgentMessage(from, r.req.to, r.req.text, 'tool')).note;
  };
  const agentReq = useRef(answerAgentRequest); agentReq.current = answerAgentRequest;
  useEffect(() => window.desktop.onAgentRequest((r) => { void agentReq.current(r).then((t) => window.desktop.agentRequestDone(r.id, t)); }), []);  // that chat's orb state, drawn at the bottom of the sidebar while another session is on screen
  const busyRef = useRef(busy); busyRef.current = busy;
  // A session already open under another key (a new agent keeps its "new" key once its session exists) is opened as that same chat:
  // a second copy under the session's own key made two chats for one session, and a message from another agent went to the hidden
  // one while the one on screen showed nothing until the window was reloaded.
  const openedRef = useRef(opened); openedRef.current = opened;
  const open = useCallback((wanted: Sel, push = true) => {
    const same = wanted.sessionId ? openedRef.current.find((x) => x.key !== wanted.key && x.sessionId === wanted.sessionId && x.projectId === wanted.projectId && x.kind === wanted.kind) : undefined;
    const next = same ? { ...same, ...(wanted.voice ? { voice: true } : {}) } : wanted;
    setSel(next);
    setOpened((o) => { if (o.some((x) => x.key === next.key)) return o; const all = [...o, next];
      while (all.length > 8) { const i = all.findIndex((x) => x.key !== next.key && !busyRef.current[x.key]); if (i < 0) break; all.splice(i, 1); } // idle ones make room, a working one never does
      return all; });
    if (push) { setHistory((h) => [...h.slice(0, cursor + 1), next]); setCursor((c) => c + 1); }
  }, [cursor]);
  const go = (d: -1 | 1) => { const i = cursor + d; const t = history[i]; if (t) { setCursor(i); open(t, false); } };

  const addFolder = async () => {
    const dir = await pickFolder(); if (!dir) return;
    try { const project = await api.addProject(dir); await refresh(); setPicker(project); } catch (e) { setError((e as Error).message); }
  };
  const removeProject = async (p: Project) => {
    if (!window.confirm(`Remove "${p.name}" from the sidebar? Nothing is deleted on disk.`)) return;
    await api.removeProject(p.id); if (sel?.projectId === p.id) setSel(null); setOpened((o) => o.filter((x) => x.projectId !== p.id)); await refresh();
  };

  const project = projects.find((p) => p.id === sel?.projectId) ?? null;
  const selAgent = sel?.kind === 'jev' ? project?.jev?.find((a) => a.id === sel.sessionId) ?? null : null;
  const info = selAgent ? ({ provider: 'claude', sessionId: selAgent.id, summary: selAgent.name, customTitle: selAgent.name, lastModified: selAgent.updatedAt } as SessionInfo)
    : sel ? infos[sel.projectId]?.find((s) => s.sessionId === sel.sessionId) ?? null : null;

  return (
    <div className={`app${sidebar ? '' : ' no-sidebar'}${debugOpen ? ' with-debug' : ''}${pane ? ' with-pane' : ''}`}>
      <header className="titlebar">
        <div className="tb-left">
          <button className="icon-btn" title="Toggle sidebar" onClick={() => setSidebar((v) => !v)}><PanelLeft size={17} /></button>
          <button className="icon-btn" title="Back" disabled={cursor <= 0} onClick={() => go(-1)}><ArrowLeft size={17} /></button>
          <button className="icon-btn" title="Forward" disabled={cursor >= history.length - 1} onClick={() => go(1)}><ArrowRight size={17} /></button>
        </div>
        <div className="tb-title">
          {sel && <><Laptop size={17} />{sel.sessionId && renameAt === 'title' && renaming === `${sel.projectId}:${sel.sessionId}`
            ? <RenameInput initial={info?.customTitle || info?.summary || ''} onDone={(t) => void rename(sel.projectId, sel.sessionId!, t)} onCancel={() => setRenaming(null)} />
            : <><span className="tb-name" title={sel.sessionId ? 'Double-click to rename' : undefined} onDoubleClick={() => { if (sel.sessionId) { setRenameAt('title'); setRenaming(`${sel.projectId}:${sel.sessionId}`); } }}>{info?.customTitle || sel.name || info?.summary || (sel.sessionId ? 'Session' : 'New session')}</span>
              {sel.sessionId && <button className="icon-btn sm tb-rename" title="Rename this session" onClick={() => { setRenameAt('title'); setRenaming(`${sel.projectId}:${sel.sessionId}`); }}><Pencil size={13} /></button>}</>}<span className="chip">{project?.name}</span>{project && sel.sessionId && <span className="chip">{selAgent ? 'Jev' : PROVIDER_LABEL[info?.provider ?? providerOf(project, sel.sessionId)]}</span>}</>}
        </div>
        <div className="tb-right">
          <button className="icon-btn" title={showMeta ? 'Hide system events' : 'Show system events'} onClick={() => setShowMeta((v) => !v)}>{showMeta ? <Eye size={17} /> : <EyeOff size={17} />}</button>
          <button className={`icon-btn${debugOpen ? ' lit' : ''}`} title="Debugger: Voice (what was heard, who decided what, how long it took) and Model (every exchange with Jev and the models)" onClick={() => setDebugOpen((v) => { localStorage.setItem('cvc.debug', v ? '0' : '1'); return !v; })}><Bug size={16} /></button>
          <button className="icon-btn" title="Refresh" onClick={() => void refresh()}><RotateCw size={16} /></button>
        </div>
      </header>

      {sidebar && (
        <aside className="sidebar">
          <div className="side-grip" title="Drag to resize" onPointerDown={onSideGrip} />
          <nav className="side-nav">
            <button className="nav-item" onClick={() => void addFolder()}><span className="nav-ico"><FolderPlus size={16} /></span>Add folder</button>
          </nav>
          <div className="side-scroll">
            {jauvex && showJauvex && (() => { const key = `${jauvex.id}:jauvex`; const on = sel?.key === key; return (
              <button className={`row jauvex-row${on ? ' on' : ''}${jauvexSession && busy[key] ? ' working' : ''}`} title="The Jauvex agent: the entry point for everything about this app (restart, update, install, agents, folders, how it works, developing it)" onClick={() => open({ projectId: jauvex.id, sessionId: jauvexSession, key, name: 'Jauvex' })}>
                <Mark /><span className="row-title">Jauvex</span><small>agent</small></button>); })()}
            {projects.filter((p) => !p.builtin).length === 0 && <p className="side-empty">Add a folder to see the Claude and Codex sessions that exist for it.</p>}
            {projects.filter((p) => !p.builtin).map((p) => (
              <ProjectGroup key={p.id} project={p} infos={infos[p.id]} sel={sel} renaming={renameAt === 'row' && renaming?.startsWith(`${p.id}:`) ? renaming.slice(p.id.length + 1) : null} onRenaming={(sid) => { setRenameAt('row'); setRenaming(sid ? `${p.id}:${sid}` : null); }} onRename={(sid, t) => void rename(p.id, sid, t)} onHide={(sid) => void hideSession(p, sid)} onOpenJev={(aid) => openJev(p.id, aid)} onDeleteJev={(aid) => void deleteJev(p.id, aid)} working={new Set(opened.filter((o) => o.projectId === p.id && busy[o.key] && o.sessionId).map((o) => o.sessionId!))} listening={opened.find((o) => o.key === listening && o.projectId === p.id)?.sessionId ?? null} onOpen={(sid) => open({ projectId: p.id, sessionId: sid, key: `${p.id}:${sid}` })} onNew={() => open({ projectId: p.id, sessionId: null, key: `${p.id}:new:${Date.now()}` })} onAdd={() => setPicker(p)} onRemove={() => void removeProject(p)} />
            ))}
          </div>
          {voiceUi && listening && sel?.key !== listening && (() => { const o = opened.find((x) => x.key === listening); const name = o?.sessionId ? infos[o.projectId]?.find((i) => i.sessionId === o.sessionId)?.customTitle || infos[o.projectId]?.find((i) => i.sessionId === o.sessionId)?.summary || 'Session' : o?.name || 'New session'; return (
            <div className="side-voice" title="Voice is on in this session. Click the name to go back to it.">
              <button className="side-orb" title="Tap to make it stop talking" onClick={voiceUi.hush}><Orb size={54} level={voiceUi.level} phase={voiceUi.phase} mute={voiceUi.micMuted} silent={voiceUi.speakerOff} /></button>
              <div className="side-voice-text"><button className="side-voice-name" onClick={() => { if (o) open(o); }}>{name}</button><span className="side-voice-phase">{voiceUi.micMuted ? 'Muted' : PHASE_LABEL[voiceUi.phase]}</span></div>
              <div className="side-voice-btns"><button className={`${voiceUi.micMuted ? 'muted' : ''}${voiceUi.muteIn != null ? ' counting' : ''}`} title={voiceUi.muteIn != null ? `Muting in ${voiceUi.muteIn} s` : voiceUi.micMuted ? 'Unmute microphone' : 'Mute microphone'} onClick={voiceUi.toggleMic}>{voiceUi.micMuted ? <MicOff size={15} /> : <Mic size={15} />}{voiceUi.muteIn != null && <span className="mute-count" key={voiceUi.muteIn}>{voiceUi.muteIn}</span>}</button><button className={voiceUi.speakerOff ? 'muted' : ''} title={voiceUi.speakerOff ? 'Turn the voice back on' : 'Silence the voice'} onClick={voiceUi.toggleSpeaker}>{voiceUi.speakerOff ? <VolumeX size={15} /> : <Volume2 size={15} />}</button><button title="End voice chat" onClick={voiceUi.end}><X size={15} /></button></div>
            </div>); })()}
          <footer className="side-foot"><button className="foot-btn" title={SIGN_IN_IN_APP ? 'Accounts: who each provider is signed in as; sign out, sign in, switch' : 'Accounts: who each provider is signed in as, and how to sign in with its own command line'} onClick={() => setAccountsOpen(true)}>Jauvex <em>{__APP_VERSION__}</em></button><button className="icon-btn sm" title="Jauvex settings" onClick={() => setSettingsOpen(true)}><Settings size={14} /></button><Mark /></footer>
          {settingsOpen && <SettingsPanel autoCompact={autoCompact} onAutoCompact={changeAutoCompact} signedIn={signedIn} welcomeNext={welcomeNext} onWelcomeNext={(on) => { setWelcomeNext(on); void api.setUi({ welcomed: !on }); }} onOpenWelcome={() => { setSettingsOpen(false); setWelcomeOpen(true); }} defaultProvider={defaultProvider} onDefaultProvider={(p) => { setDefaultProvider(p); localStorage.setItem('cvc.provider', p); void api.setUi({ defaultProvider: p }); }} showJauvex={showJauvex} onShowJauvex={(on) => { setShowJauvex(on); void api.setUi({ showJauvex: on }); }} jauvexMove={jauvexMove} onJauvexMove={(m) => { setJauvexMove(m); void api.setUi({ jauvexMove: m }); }} onClose={() => setSettingsOpen(false)} />}
          {accountsOpen && <Accounts onClose={() => setAccountsOpen(false)} />}
          {welcomeOpen && <Welcome jauvexMove={jauvexMove} onJauvexMove={(m) => { setJauvexMove(m); void api.setUi({ jauvexMove: m }); }} defaultProvider={defaultProvider} onDefault={(p) => { setDefaultProvider(p); localStorage.setItem('cvc.provider', p); void api.setUi({ defaultProvider: p }); }} onDone={(start) => { setWelcomeOpen(false); setWelcomeNext(false); void api.setUi({ welcomed: true });
            if (start && jauvex) { const key = `${jauvex.id}:jauvex`; open({ projectId: jauvex.id, sessionId: jauvexSession, key, name: 'Jauvex', voice: true, ...(jauvexSession ? {} : { kickoff: JAUVEX_HELLO }) }); } /* Start: the first conversation is with the Jauvex agent, voice on; the very first time it introduces itself */ }} />}
        </aside>
      )}

      <main className="main" onClickCapture={catchLinks}>
        {error && <div className="toast" onClick={() => setError(null)}>{error}<X size={14} /></div>}
        {opened.map((o) => { const proj = projects.find((x) => x.id === o.projectId); if (!proj) return null; const active = o.key === sel?.key;
          if (o.kind === 'jev') { const agent = proj.jev?.find((a) => a.id === o.sessionId); return agent ? <div key={o.key} className="chat-host" style={{ display: active ? 'contents' : 'none' }}><JevPad project={proj} agent={agent} active={active} showMeta={showMeta} onChanged={() => void refresh()} /></div> : null; }
          return <div key={o.key} className="chat-host" data-base={proj.path} style={{ display: active ? 'contents' : 'none' }}>
            <Chat storeKey={o.key} signedIn={signedIn} jev={jevKey && !o.sessionId ? () => void newJev(proj.id, o.key) : undefined} startVoice={o.voice} kickoff={o.kickoff} nameOnStart={o.name} adopt={o.adopt} onNamed={() => void refresh()} folders={projects.map((x) => ({ id: x.id, name: x.name, path: x.path }))} onCommand={(cmd, fallback) => runCommand(cmd, proj.id, fallback)} project={proj} sessionId={o.sessionId} active={active} info={infos[o.projectId]?.find((x) => x.sessionId === o.sessionId) ?? null} showMeta={showMeta}
              onBusy={(on) => setBusy((b) => (Boolean(b[o.key]) === on ? b : { ...b, [o.key]: on }))} onListening={(on) => setListening((cur) => (on ? o.key : cur === o.key ? null : cur))} onVoiceUi={(st) => setVoiceUi(st)} mic={listening === null ? 'none' : listening === o.key ? 'here' : 'elsewhere'}
              onSession={(sid, prov) => { const named = <T extends Sel>(x: T): T => (x.key === o.key ? { ...x, sessionId: sid } : x); setSel((cur) => (cur ? named(cur) : cur)); setOpened((all) => all.map(named)); setHistory((h) => h.map(named)); if (proj.builtin === 'jauvex') { setJauvexSession(sid); setJauvexProvider(prov ?? null); void api.setUi({ jauvexSession: sid, ...(prov ? { jauvexProvider: prov } : {}) }); } void refresh(); }}
              hybrid={proj.builtin === 'jauvex' ? { provider: jauvexProvider ?? defaultProvider ?? 'claude', mode: jauvexMove, onProvider: (p) => { setJauvexProvider(p); setJauvexSession(null); void api.setUi({ jauvexProvider: p, jauvexSession: null }); const unbind = <T extends Sel>(x: T): T => (x.key === o.key ? { ...x, sessionId: null } : x); setOpened((all) => all.map(unbind)); setSel((cur) => (cur ? unbind(cur) : cur)); setHistory((h) => h.map(unbind)); },
                onLost: () => { setJauvexSession(null); void api.setUi({ jauvexSession: null }); const unbind = <T extends Sel>(x: T): T => (x.key === o.key ? { ...x, sessionId: null } : x); setOpened((all) => all.map(unbind)); setSel((cur) => (cur ? unbind(cur) : cur)); setHistory((h) => h.map(unbind)); } } : undefined}
              onTurnEnd={() => void refresh()} onReply={(text, replyTo) => { void routeAgentBlocks(o, text); if (replyTo) void returnReply(o, replyTo, text); }} onBridge={(b) => { if (b) bridges.current.set(o.key, b); else bridges.current.delete(o.key); }} onNew={() => open({ projectId: proj.id, sessionId: null, key: `${proj.id}:new:${Date.now()}` })} /></div>; })}
        {sel && project ? null
          : <div className="empty"><Mark /><h2>Pick a session</h2><p>Add a folder, choose which of its Claude and Codex sessions to keep in the sidebar, then open one and keep talking, or start a new one with either.</p></div>}
      </main>
      {pane && <Pane target={pane} onClose={() => setPane(null)} />}

      {debugOpen && <DebugPanel onClose={() => { localStorage.setItem('cvc.debug', '0'); setDebugOpen(false); }} />}
      {picker && <SessionPicker project={picker} all={infos[picker.id]} onClose={() => setPicker(null)} onSave={async (ids) => { const byId = new Map((infos[picker.id] ?? []).map((s) => [s.sessionId, s.provider])); await api.setSessions(picker.id, ids, Object.fromEntries(ids.filter((id) => byId.has(id)).map((id) => [id, byId.get(id)!]))); setPicker(null); await refresh(); }} />}
    </div>
  );
}

/** The voice channel's flight recorder: every transcript and decision, who made it (Jev, the voice model, a rule) and how long it took. */
function DebugPanel({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [tab, setTab] = useState<'voice' | 'model'>(() => (localStorage.getItem('cvc.debug.tab') === 'model' ? 'model' : 'voice')); const [open, setOpen] = useState<number | null>(null);
  const shown = events.filter((e) => (tab === 'model' ? e.kind === 'model' : e.kind !== 'model'));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { void window.desktop.debugList().then(setEvents); return window.desktop.onDebug((e) => setEvents((all) => [...all.slice(-299), e])); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [events]);
  const jev = events.filter((e) => e.by === 'jev' && e.ms != null && e.kind !== 'jev'); const model = events.filter((e) => e.by === 'voice model' && e.ms != null);
  const avg = (xs: DebugEvent[]) => (xs.length ? `${Math.round(xs.reduce((a, e) => a + (e.ms ?? 0), 0) / xs.length)} ms` : 'none yet');
  return (
    <aside className="debug">
      <header><b>Debugger</b><nav className="debug-tabs"><button className={tab === 'voice' ? 'on' : ''} onClick={() => { setTab('voice'); localStorage.setItem('cvc.debug.tab', 'voice'); }}>Voice</button><button className={tab === 'model' ? 'on' : ''} onClick={() => { setTab('model'); localStorage.setItem('cvc.debug.tab', 'model'); }}>Model</button></nav><span>{tab === 'voice' ? `Jev: ${jev.length} decisions, avg ${avg(jev)} · voice model: ${model.length}, avg ${avg(model)}` : 'Every exchange with Jev and the models: what was sent, what came back. Click a line for the whole of it.'}</span>
        <button className="icon-btn sm" title="Clear" onClick={() => { void window.desktop.debugClear(); setEvents([]); }}><Trash2 size={14} /></button><button className="icon-btn sm" title="Close" onClick={onClose}><X size={15} /></button></header>
      <div className="debug-list">
        {shown.length === 0 && <p className="debug-empty">{tab === 'voice' ? 'Nothing yet. Turn voice mode on and talk: every transcript and decision shows up here.' : 'Nothing yet. Every question to Jev and every message to a model will show up here, with the answer.'}</p>}
        {shown.map((e, i) => <div key={i} className={`debug-row k-${e.kind}${e.detail ? ' has-detail' : ''}`} onClick={() => { if (e.detail) setOpen(open === i ? null : i); }}><time>{new Date(e.at).toLocaleTimeString([], { hour12: false })}</time><i>{e.kind === 'model' ? (e.by === 'jev' ? 'jev' : 'llm') : e.kind}</i><em className={e.by === 'jev' ? 'by-jev' : ''}>{e.by ?? ''}</em><span className="ms">{e.ms != null ? `${e.ms} ms` : ''}</span><p>{e.text}</p>{open === i && e.detail && <pre className="debug-detail">{e.detail}</pre>}</div>)}
        <div ref={end} />
      </div>
    </aside>
  );
}

function RenameInput({ initial, onDone, onCancel }: { initial: string; onDone: (title: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial); const done = useRef(false);
  const finish = (save: boolean) => { if (done.current) return; done.current = true; if (save && text.trim() && text.trim() !== initial) onDone(text); else onCancel(); };
  return <input className="rename" autoFocus value={text} maxLength={120} onFocus={(e) => e.target.select()} onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); }} />;
}

function ProjectGroup({ project, infos, sel, working, listening, renaming, onRenaming, onRename, onHide, onOpenJev, onDeleteJev, onOpen, onNew, onAdd, onRemove }: { project: Project; infos?: SessionInfo[]; sel: Sel | null; working: Set<string>; listening: string | null; renaming: string | null; onRenaming: (sid: string | null) => void; onRename: (sid: string, title: string) => void; onHide: (sid: string) => void; onOpenJev: (agentId: string) => void; onDeleteJev: (agentId: string) => void; onOpen: (sid: string) => void; onNew: () => void; onAdd: () => void; onRemove: () => void }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // A folder folds from its name, and stays folded across reloads.
  const [folded, setFolded] = useState(() => localStorage.getItem(`cvc.folder.${project.id}`) === '0');
  const fold = () => setFolded((v) => { localStorage.setItem(`cvc.folder.${project.id}`, v ? '1' : '0'); return !v; });
  // Secondary click on a session: what can be done with it.
  const [ctx, setCtx] = useState<{ sid: string; x: number; y: number; jev?: boolean } | null>(null);
  useEffect(() => { if (!ctx) return; const close = () => setCtx(null); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close); window.addEventListener('contextmenu', close); window.addEventListener('blur', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); window.removeEventListener('blur', close); window.removeEventListener('keydown', key); }; }, [ctx]);
  const rows = useMemo(() => {
    const byId = new Map((infos ?? []).map((s) => [s.sessionId, s]));
    const list = project.sessions.map((id) => byId.get(id) ?? { provider: providerOf(project, id), sessionId: id, summary: id.slice(0, 8), lastModified: 0 } as SessionInfo);
    list.sort((a, b) => b.lastModified - a.lastModified);
    const q = filter?.trim().toLowerCase();
    return q ? list.filter((s) => `${s.customTitle ?? ''} ${s.summary}`.toLowerCase().includes(q)) : list;
  }, [infos, project.sessions, filter]);
  return (
    <section className={`group${folded ? ' folded' : ''}`}>
      <div className="group-head" title={project.path}>
        <button className="group-name" title={`${project.path} · click to ${folded ? 'unfold' : 'fold'}`} onClick={fold}>{folded ? <Folder size={15} /> : <FolderOpen size={15} />}<span className="group-label">{project.name}</span></button>
        <button className="icon-btn sm" title="New session" onClick={onNew}><SquarePen size={15} /></button>
        <button className="icon-btn sm" title="Add sessions" onClick={onAdd}><Plus size={16} /></button>
        <button className="icon-btn sm" title="Filter" onClick={() => setFilter((f) => (f === null ? '' : null))}><Search size={15} /></button>
        <button className="icon-btn sm" title="Folder options" onClick={() => setMenu((v) => !v)}><SlidersHorizontal size={15} /></button>
        {menu && <div className="menu" onMouseLeave={() => setMenu(false)}><div className="menu-path">{project.path}</div><button onClick={() => { setMenu(false); onRemove(); }}><Trash2 size={14} />Remove folder</button></div>}
      </div>
      {!folded && <>
      {filter !== null && <input className="group-filter" autoFocus placeholder="Filter sessions" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {rows.length === 0 && <button className="row ghost" onClick={onAdd}><span className="dot" />{project.sessions.length ? 'No match' : 'Add sessions…'}</button>}
      {rows.map((s) => (
        <button key={s.sessionId} className={`row${sel?.projectId === project.id && sel.sessionId === s.sessionId ? ' on' : ''}`} onClick={() => onOpen(s.sessionId)} onDoubleClick={() => onRenaming(s.sessionId)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ sid: s.sessionId, x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - 150) }); }} title={`${PROVIDER_LABEL[s.provider]} · ${s.firstPrompt || s.summary} · double-click to rename`}>
          <ProviderIcon provider={s.provider} />{renaming === s.sessionId ? <RenameInput initial={s.customTitle || s.summary} onDone={(t) => onRename(s.sessionId, t)} onCancel={() => onRenaming(null)} /> : <span className="row-title">{s.customTitle || s.summary}</span>}{listening === s.sessionId && <span className="row-listening" title="Listening: the microphone is on in this session"><AudioLines size={13} /></span>}{working.has(s.sessionId) ? <span className="row-working" title="Working"><Mark busy /></span> : <span className="row-time">{s.lastModified ? ago(s.lastModified) : ''}</span>}
        </button>
      ))}
      {(project.jev ?? []).filter((a) => !filter?.trim() || a.name.toLowerCase().includes(filter.trim().toLowerCase())).map((a) => (
        <button key={a.id} className={`row${sel?.projectId === project.id && sel.sessionId === a.id ? ' on' : ''}`} onClick={() => onOpenJev(a.id)} onDoubleClick={() => onRenaming(a.id)} title={`Jev agent · ${a.runs.length} runs · double-click to rename`}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ sid: a.id, jev: true, x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - 150) }); }}>
          <img className="provider-icon jev" src={typesafeMark} alt="" aria-label="Jev (TypeSafe)" width={12} height={12} />{renaming === a.id ? <RenameInput initial={a.name} onDone={(t) => onRename(a.id, t)} onCancel={() => onRenaming(null)} /> : <span className="row-title">{a.name}</span>}<span className="row-time">{ago(a.updatedAt)}</span>
        </button>
      ))}
      </>}
      {ctx && <div className="menu ctx" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        <button onClick={() => { const sid = ctx.sid; setCtx(null); onRenaming(sid); }}><Pencil size={14} />Rename</button>
        {!ctx.jev && <button onClick={() => { void navigator.clipboard.writeText(ctx.sid); setCtx(null); }}><Copy size={14} />Copy session ID</button>}
        {!ctx.jev && <button className="danger" onClick={() => { const sid = ctx.sid; setCtx(null); onHide(sid); }}><HideIcon size={14} />Remove from sidebar</button>}
        {ctx.jev && <button className="danger" onClick={() => { const sid = ctx.sid; setCtx(null); onDeleteJev(sid); }}><Trash2 size={14} />Delete agent</button>}
      </div>}
    </section>
  );
}

function SessionPicker({ project, all, onClose, onSave }: { project: Project; all?: SessionInfo[]; onClose: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [q, setQ] = useState('');
  const [who, setWho] = useState<Provider | 'all'>('all'); // whose sessions: the list holds both providers' sessions for the folder
  const [picked, setPicked] = useState<Set<string>>(new Set(project.sessions));
  const [saving, setSaving] = useState(false);
  const counts = useMemo(() => ({ claude: (all ?? []).filter((s) => s.provider === 'claude').length, codex: (all ?? []).filter((s) => s.provider === 'codex').length }), [all]);
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return (all ?? []).filter((s) => (who === 'all' || s.provider === who) && (!n || `${s.customTitle ?? ''} ${s.summary} ${s.firstPrompt ?? ''}`.toLowerCase().includes(n))); }, [all, q, who]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Add sessions">
        <div className="modal-head"><div><h3>Sessions in {project.name}</h3><p>{project.path}</p></div><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-search"><Search size={15} /><input autoFocus placeholder="Search sessions" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="who">{([['all', 'All', counts.claude + counts.codex], ['claude', 'Claude', counts.claude], ['codex', 'Codex', counts.codex]] as const).map(([k, label, n]) => <button key={k} className={who === k ? 'on' : ''} title={k === 'all' ? 'Sessions of both providers' : `${label} sessions only`} onClick={() => setWho(k)}>{k !== 'all' && <ProviderIcon provider={k} size={11} />}{label}{all ? <em>{n}</em> : null}</button>)}</span></div>
        <div className="modal-list">
          {!all && <p className="modal-empty">Loading…</p>}
          {all && list.length === 0 && <p className="modal-empty">{q.trim() ? 'No session matches.' : who === 'all' ? 'Neither Claude nor Codex has sessions for this folder yet.' : `${PROVIDER_LABEL[who]} has no sessions for this folder yet.`}</p>}
          {list.map((s) => (
            <button key={s.sessionId} className={`pick${picked.has(s.sessionId) ? ' on' : ''}`} onClick={() => toggle(s.sessionId)}>
              <span className="box">{picked.has(s.sessionId) && <Check size={12} strokeWidth={3} />}</span>
              <ProviderIcon provider={s.provider} size={13} /><span className="pick-main"><b>{s.customTitle || s.summary}</b>{s.firstPrompt && s.firstPrompt !== s.summary && <small>{s.firstPrompt}</small>}</span>
              <span className="pick-meta">{ago(s.lastModified)}<small>{[PROVIDER_LABEL[s.provider], s.gitBranch, size(s.fileSize)].filter(Boolean).join(' · ')}</small></span>
            </button>
          ))}
        </div>
        <div className="modal-foot"><span>{picked.size} selected</span><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={saving} onClick={async () => { setSaving(true); await onSave([...picked]); }}>{saving ? 'Saving…' : 'Done'}</button></div>
      </div>
    </div>
  );
}

/** embed: the chat lives inside something else (a Jev agent's trainer panel): fixed provider, context sent along with every message, replies handed back. */
export type ChatEmbed = { provider: Provider; context: () => string; onReply: (text: string) => void; bridge: { send?: (text: string) => void } };
export function Chat({ embed, jev, startVoice, kickoff, nameOnStart, onNamed, onListening, onVoiceUi, mic, onReply, onBridge, adopt, folders, onCommand, project, sessionId, active, info, showMeta, onBusy, onSession, onTurnEnd, onNew, hybrid, signedIn, storeKey }: { storeKey?: string; signedIn?: Record<Provider, boolean>; hybrid?: { provider: Provider; mode: 'unified' | 'handoff'; onProvider: (p: Provider) => void ; onLost?: () => void }; /* the Jauvex agent: the app keeps its transcript, the session moves between providers with it */ embed?: ChatEmbed; jev?: () => void; startVoice?: boolean; kickoff?: string; nameOnStart?: string; onNamed?: () => void; onListening?: (on: boolean) => void; onVoiceUi?: (st: SideVoice | null) => void; mic?: 'none' | 'here' | 'elsewhere'; onReply?: (text: string, replyTo?: Sel) => void; onBridge?: (b: ChatBridge | null) => void; adopt?: string; folders?: { id: string; name: string; path?: string }[]; onCommand?: (cmd: AppCommand, fallback: Provider) => void; project: Project; sessionId: string | null; active: boolean; info: SessionInfo | null; showMeta: boolean; onBusy: (running: boolean) => void; onSession: (sid: string, provider?: Provider) => void; onTurnEnd: () => void; onNew: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // The provider's own failure text, when it arrives as if it were an answer (an organisation that disabled subscription access, an allowance run out, a network error).
  const looksLikeFailure = (t: string) => t.length < 700 && /\b(api error|organization has disabled|organisation has disabled|has disabled claude|usage limit|rate limit|out of credits|insufficient credits|not authorized|unauthorized|permission denied|invalid api key|authentication|401|403|429|5\d\d)\b/i.test(t) && !/```/.test(t);
  // The last of the conversation, for the voice to acknowledge like someone who has been following: the last two things the user
  // said and the last answer, trimmed. Read from a ref so the speculative acknowledgment (made during a pause) sees it too.
  const recentRef = useRef(''); recentRef.current = (() => { const plain = (m: ChatMessage) => m.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ').replace(CONTEXT_TAG, '').replace(/\s+/g, ' ').trim(); const tail = messages.filter((m) => !m.meta && !m.voice).slice(-6); const users = tail.filter((m) => m.role === 'user').slice(-2).map((m) => `User said: ${plain(m).slice(0, 240)}`); const last = [...tail].reverse().find((m) => m.role === 'assistant'); return [...users, ...(last ? [`Assistant answered: ${plain(last).slice(0, 320)}`] : [])].join(' | '); })();
  const [start, setStart] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(sessionId || hybrid ? 'loading' : 'ready');
  useEffect(() => { if (!stored.length) return; const t = setTimeout(() => { if (!v.current.running) { window.desktop.debugPush('queue', `restored after a reload: ${queue.current.length} message(s) waiting`); flushQueue('restored after a reload, no turn running'); } }, adopt ? 4000 : 1500); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The hybrid chat records what is said (text only) and, after a move to another provider, replays it as the first message's prelude.
  const migrate = useRef(false); const hybridRef = useRef(hybrid); hybridRef.current = hybrid;
  // An order the app handled itself (a restart, a new agent...): the words and the app's reply are kept (a restart wiped them): in the
  // agent's own transcript when it has one, else next to the session, after the message they followed.
  const msgsRef = useRef<ChatMessage[]>([]); msgsRef.current = messages;
  const keepNotes = async (ms: ChatMessage[]) => { const plain = (m: ChatMessage) => m.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
    if (hybrid) { for (const m of ms) record('user', plain(m)); return; } if (!sid.current) return;
    const after = [...msgsRef.current].reverse().find((m) => !m.uuid.startsWith('local-') && !m.uuid.startsWith('note-'))?.uuid ?? '';
    await api.noteAppend(sid.current, ms.map((m) => ({ after, message: { ...m, uuid: `note-${m.uuid}` } }))).catch(() => {}); };
  const record = (role: 'user' | 'assistant', text: string, extra: Partial<ChatMessage> = {}) => { if (!hybrid || !text.trim()) return; void api.jauvexAppend({ message: { uuid: `jx-${crypto.randomUUID()}`, role, blocks: [{ type: 'text', text }], meta: false, ...extra }, provider, at: Date.now() }).catch(() => {}); };
  // Every message of the provider's turn goes to the transcript as it is (tool calls and results too, results trimmed), so the thread shows the work after a reload.
  const recordMessage = (m: ChatMessage) => { if (!hybrid) return; if (provider === 'codex' && m.blocks.some((b) => b.type === 'tool_use') && !m.blocks.some((b) => b.type === 'tool_result')) return; /* a Codex call that only started: its completed twin comes with the result */ const blocks = m.blocks.map((b) => (b.type === 'tool_result' && b.text.length > 4000 ? { ...b, text: `${b.text.slice(0, 4000)}\n… (trimmed)` } : b)); if (!blocks.length) return; void api.jauvexAppend({ message: { ...m, blocks }, provider, at: Date.now() }).catch(() => {}); };
  const handover = useRef<{ to: Provider; note: string } | null>(null); const pendingMove = useRef<Provider | null>(null);
  const replayPrelude = (from: Provider): string => { const lines: string[] = []; let size = 0; const plain = (m: ChatMessage) => m.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').replace(CONTEXT_TAG, '').trim();
    for (const m of [...messages].reverse()) { if (m.voice || m.meta || (m.role !== 'user' && m.role !== 'assistant')) continue; const t = plain(m); if (!t) continue; const line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${t}`; if (size + line.length > 60_000) { lines.push('(earlier turns omitted)'); break; } lines.push(line); size += line.length; }
    if (handover.current && handover.current.to === provider) { const note = handover.current.note; handover.current = null; return `You are the Jauvex agent, continuing a conversation that began on ${PROVIDER_LABEL[from]}; you are now running on ${PROVIDER_LABEL[provider]}. The assistant that was there before you wrote this handover note for you (also saved as data/jauvex-handover.md in this folder):\n\n<handover>\n${note}\n</handover>\n\nContinue from there as the same assistant. Do not mention the move unless asked. The user's new message:\n\n`; }
    return `You are the Jauvex agent, continuing a conversation that began on ${PROVIDER_LABEL[from]}; you are now running on ${PROVIDER_LABEL[provider]}. The app kept the transcript. Here it is, oldest first:\n\n<transcript>\n${lines.reverse().join('\n\n')}\n</transcript>\n\nContinue as the same assistant, with everything above as your memory. Do not mention the move unless asked. The user's new message:\n\n`; };
  const switchProvider = (p: Provider) => { if (!hybrid || p === provider || running) return;
    if (hybrid.mode === 'handoff' && sid.current) { pendingMove.current = p; setMessages((m) => [...m, { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: `(from the app) Moving to ${PROVIDER_LABEL[p]} by handover: ${PROVIDER_LABEL[provider]} writes its handover note first.` }], meta: false }]); toBottom();
      void send(`You are being moved to ${PROVIDER_LABEL[p]}: another assistant takes over this conversation from your note. Write the handover note now, in under 400 words: what the user is doing and wants, the state of the work (files, decisions, what was tried), open items, and anything they told you to remember. Plain text, no tools.`, false); return; }
    doSwitch(p); };
  const doSwitch = (p: Provider) => { const from = provider; const voiceWasOn = !!v.current.engine; if (voiceWasOn) void commands.current.toggleVoice(); /* a move ends voice mode: the engine and its voice model belong to the provider it started with */ pickProvider(p); sid.current = null; migrate.current = true; pendingName.current = 'Jauvex';
    const note = `(from the app) Moved from ${PROVIDER_LABEL[from]} to ${PROVIDER_LABEL[p]}. The conversation so far goes along.${voiceWasOn ? ' Voice mode ended; start it again when you like.' : ''}`; setMessages((m) => [...m, { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: note }], meta: false }]); toBottom();
    void api.jauvexAppend({ message: { uuid: `jx-${crypto.randomUUID()}`, role: 'user', blocks: [{ type: 'text', text: note }], meta: false }, provider: p, at: Date.now() }).catch(() => {}); prevProvider.current = from; hybrid?.onProvider(p); };
  const prevProvider = useRef<Provider | null>(null);
  const [err, setErr] = useState('');
  const [running, setRunning] = useState(!!adopt);
  const [liveText, setLiveText] = useState('');
  const [asks, setAsks] = useState<{ requestId: string; toolName: string; input: unknown }[]>([]);
  const [note, setNote] = useState('');
  // How full this session's context is (T-74): the numbers kept for it, then every request's. It is compacted by the meter's button or a typed
  // /compact, between turns once it passes the auto-compact setting, and at once when a message did not fit (that message then goes again).
  const [ctx, setCtx] = useState<ContextUsage | null>(() => (sessionId ? project.context?.[sessionId] ?? null : null)); const ctxRef = useRef(ctx);
  const [compacting, setCompacting] = useState(false); const [lastCompact, setLastCompact] = useState<LastCompact | null>(null);
  const compactTurn = useRef<'manual' | 'auto' | 'too-long' | null>(null); // the turn running now only compacts: its end is not an answer
  const [autoPct, setAutoPct] = useState(AUTO_COMPACT_DEFAULT); const autoPctRef = useRef(autoPct); autoPctRef.current = autoPct;
  const lastVoiced = useRef(false); // a compaction goes out with the last turn's settings, so the provider's cached prompt still applies
  // Said or typed while the main thread is busy: it keeps working, and this goes in as the next message when the turn ends.
  // Each queued message keeps its own images: an image pasted with a text goes out with that text, never with whichever text leaves next.
  const qKey = storeKey ? `cvc.queue.${storeKey}` : ''; const stored: QueueItem[] = (() => { try { if (!qKey) return []; const raw = JSON.parse(localStorage.getItem(qKey) || 'null') as { items?: QueueItem[]; texts?: string[]; images?: Attachment[] } | null; if (!raw) return []; if (raw.items) return raw.items;
    const items = (raw.texts ?? []).map((text): QueueItem => ({ text, images: [] })); if (raw.images?.length) { if (items.length) items[0]!.images = raw.images; else items.push({ text: '', images: raw.images }); } return items; /* the older shape, texts and images apart */ } catch { return []; } })();
  const [queued, setQueued] = useState<QueueItem[]>(stored);
  const pendingName = useRef(sessionId ? '' : nameOnStart ?? ''); const bornFromOrder = useRef(!!kickoff);
  useEffect(() => { if (!sessionId && !sid.current) pendingName.current = nameOnStart ?? ''; if (kickoff) bornFromOrder.current = true; }, [nameOnStart, kickoff]); // eslint-disable-line react-hooks/exhaustive-deps
  const kicked = useRef(false);
  const byeAfter = useRef(''); // a goodbye said in the same breath as a task: said once that turn is over, then voice mode ends
  const pendingOrder = useRef<{ cmd: AppCommand; text: string; at: number } | null>(null); // an order the app asked about (shared/orders.ts): the next words answer it
  const onNamedRef = useRef(onNamed); onNamedRef.current = onNamed;
  const onReplyRef = useRef(onReply); onReplyRef.current = onReply;
  // A message from another agent (or from the app) lands here: into the running turn if there is one, as a new turn otherwise.
  const onBridgeRef = useRef(onBridge); onBridgeRef.current = onBridge; const pendingReplyTo = useRef<Sel | undefined>(undefined);
  useEffect(() => { onBridgeRef.current?.({ deliver: async (text, replyTo) => { if (replyTo) pendingReplyTo.current = replyTo; if (v.current.running) { const ok = !compactTurn.current && await window.desktop.chatSteer(chatId.current, embed ? `${embed.context()}${text}` : text).catch(() => false); if (ok) { turnSteers.current.push({ text, images: [], shown: true }); setMessages((m) => [...m, { uuid: `local-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text }], meta: false, steered: true }]); toBottom(); return; } enqueueForMain(text); return; } await sendRef.current(text, false); } }); return () => onBridgeRef.current?.(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [turns, setTurns] = useState(0); // a finished turn has used some of the plan: the battery looks again
  const mountedAt = useRef(Date.now()); const ownWrite = useRef(0); // the session file's writes that are this chat's own (its turns) are not "another window"
  const emptyInterims = useRef(0); // live-word passes in a row that found no words in the sound being heard
  // What waits in the queue is kept on disk (localStorage, per chat) so a reload of the window, or a restart, never loses a message.
  const queue = useRef<QueueItem[]>(stored);
  const persistQueue = () => { if (!qKey) return; const items = queue.current; try { if (!items.length) localStorage.removeItem(qKey); else localStorage.setItem(qKey, JSON.stringify({ items })); } catch { /* too big to keep: the images stay in memory only */ try { localStorage.setItem(qKey, JSON.stringify({ items: items.map((q) => ({ ...q, images: [] })) })); } catch { /* nothing */ } } };
  // A pause in the middle of a thought: the words so far are held, the next utterance is joined to them, and the whole goes out as one message.
  const thought = useRef({ text: '', parts: 0, done: false, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const flushHeldRef = useRef<() => Promise<void>>(async () => {}); // the held half of a thought goes out: on mute, on voice off, before a typed message, or when nothing follows it for too long
  const HOLD_STUCK_MS = 60_000; // a segment that began after the held words but never ended (its sound was cut off): the words go out anyway
  const cmdRef = useRef({ onCommand, folders: folders ?? [] }); cmdRef.current = { onCommand, folders: folders ?? [] };
  const turnText = useRef(''); const embedRef = useRef(embed); embedRef.current = embed;
  const lastSent = useRef<{ text: string; images?: Attachment[]; at: number; resent: boolean; dictated?: boolean } | null>(null); // the last message sent, to send again once if its turn is swallowed
  const sendRef = useRef<(text: string, spoken?: boolean, preparedAck?: Promise<Spoken | null>, fromQueue?: boolean, images?: Attachment[], resend?: boolean, dictated?: boolean) => Promise<void>>(async () => {});
  // A session belongs to one provider for life. Only a new, still empty session lets you choose.
  const [provider, setProvider] = useState<Provider>(() => (embed ? embed.provider : hybrid ? hybrid.provider : sessionId ? info?.provider ?? providerOf(project, sessionId) : signedIn && signedIn.claude !== signedIn.codex ? (signedIn.claude ? 'claude' : 'codex') : localStorage.getItem('cvc.provider') === 'codex' ? 'codex' : 'claude'));
  // Model, effort and permissions belong to the session: what was picked here comes back with it. A new session starts from the last choices made anywhere.
  const kept = sessionId ? project.prefs?.[sessionId] : undefined;
  const [model, setModel] = useState(() => kept?.model ?? localStorage.getItem(modelKey(provider)) ?? (provider === 'claude' ? CLAUDE_DEFAULT_MODEL : ''));
  const [codexModels, setCodexModels] = useState<ModelOption[]>([]);
  useEffect(() => { if (provider === 'codex') void api.models('codex').then(setCodexModels).catch(() => { /* the picker keeps "Default model" */ }); }, [provider]);
  // How hard the main model thinks, per provider. Codex says which levels each model takes; Claude's are fixed.
  const [permissions, setPermissions] = useState<Permissions>(() => kept?.permissions ?? (localStorage.getItem('cvc.permissions') === 'auto' ? 'auto' : 'ask'));
  const [effort, setEffort] = useState(() => kept?.effort ?? localStorage.getItem(effortKey(provider)) ?? '');
  const prefs = useRef({ model, effort, permissions }); prefs.current = { model, effort, permissions };
  const keep = (patch: Partial<SessionPrefs>) => { prefs.current = { ...prefs.current, ...patch }; if (sid.current) void api.setPrefs(project.id, sid.current, prefs.current).catch(() => { /* kept for this window at least */ }); };
  const efforts = provider === 'codex' ? (codexModels.find((m) => (model ? m.id === model : m.isDefault))?.efforts ?? []) : CLAUDE_EFFORTS;
  const pickProvider = (p: Provider) => { setProvider(p); localStorage.setItem('cvc.provider', p); setModel(localStorage.getItem(modelKey(p)) ?? ''); setEffort(localStorage.getItem(effortKey(p)) ?? ''); };
  const chatId = useRef(adopt ?? crypto.randomUUID()); // a reloaded window takes a running turn back under its old id
  const sid = useRef<string | null>(sessionId);
  // Who the voice speaks for: the main thread's provider and the model it reported (the picker's choice until then).
  const mainModel = useRef('');
  const main = useRef(''); main.current = `${PROVIDER_LABEL[provider]}, model ${mainModel.current || model || 'not reported yet (the provider default)'}`;
  // The voice comes from the session's own provider: a small Claude model for Claude sessions, a small Codex model for Codex ones.
  const speaker = useRef({ provider, model: '' });
  // ---- voice mode
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => { if (!kickoff || kicked.current || state !== 'ready' || sessionId || messages.length || running || (startVoice && !voiceOn)) return; let tries = 0; const go = () => { if (kicked.current) return; if (startVoice && !v.current.engine && tries++ < 40) { setTimeout(go, 250); return; } kicked.current = true; void sendRef.current(kickoff, false); }; go(); }, [kickoff, state, voiceOn]); /* with voice meant to be on, the first message waits for the engine itself (voiceOn flips before it has started), so the answer is spoken */ // eslint-disable-line react-hooks/exhaustive-deps
  const [phase, setPhase] = useState<VoicePhase>('off');
  // What is being heard shows up in the thread right away, as a draft bubble on the user's side, and turns into the real
  // message (sent, queued or handed over mid-turn) once the thought is finished. null = nothing is being heard.
  const [draft, setDraftState] = useState<string | null>(null); const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bestPass = useRef(new Map<number, string>()); // stretch of speech -> the fullest text a pass of it heard (T-79)
  const interimBusy = useRef(false); const sttBusy = useRef(0); const lastTop = useRef(0);
  const setDraft = (text: string | null) => { clearTimeout(draftTimer.current); setDraftState(text); if (text !== null) toBottom(); };
  const [vstatus, setVstatus] = useState<VoiceStatus | null>(null);
  const [cfg, setCfg] = useState<VoiceSettings>(VOICE_DEFAULTS);
  const ears = useRef(storeKey || `chat-${Math.random().toString(36).slice(2, 8)}`); /* this chat's name as a listener, for the window's mute */
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const level = useRef(0);       // what the orb breathes with: your voice while you talk, Claude's while it talks
  const micLevel = useRef(0);
  const v = useRef({ engine: null as VoiceEngine | null, gen: 0, starts: 0 /* speech segments begun, so the end of one never clears hearing once the next has started */, asked: '', answer: '', mainStarted: false, speakTurn: false, chain: Promise.resolve(), spec: null as { id: number; p: Promise<{ text: string; ms: number; dropped?: string }>; ackAudio: Promise<Spoken | null>; busy: boolean; triage: Promise<BusyTriage | null> | null } | null, running: !!adopt, stopped: false, speakerOff: false, hearing: false, wording: false, lastHeard: 0, pendingSummary: null as { words: Promise<string> } | null, playing: null as { id: number; label: string; text: string; at: number; ms: number } | null, playId: 0, bridges: new Map<string, ArrayBuffer | null>(), cfg: VOICE_DEFAULTS });
  v.current.cfg = cfg; speaker.current = { provider, model: provider === 'codex' ? cfg.codexAckModel : cfg.ackModel };
  useEffect(() => { void api.state().then((st) => { const saved = { ...VOICE_DEFAULTS, ...(st.ui?.voice ?? {}) }; if (/\bClaudex\b/.test(saved.vocabulary)) saved.vocabulary = saved.vocabulary.replace(/\bClaudex\b/g, 'Jauvex'); /* the old name in a saved vocabulary would keep biasing Whisper */ setCfg(saved.voice === 'Samantha' ? { ...saved, voice: '' } : saved); }); }, []);
  const stt = (c: VoiceSettings) => ({ model: c.sttModel, vocabulary: [c.vocabulary, project.name].filter(Boolean).join(', ') }); // the folder's name is a word it should know too
  const applyFromElsewhere = useRef<(next: VoiceSettings) => void>(() => {});
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent<{ cfg: VoiceSettings; from: string }>).detail; if (d && d.from !== chatId.current) applyFromElsewhere.current(d.cfg); }; window.addEventListener('cvc-voice-settings', h); return () => window.removeEventListener('cvc-voice-settings', h); }, []);
  const saveCfg = (next: VoiceSettings, tell = true) => { const was = stt(cfg), now = stt(next); setCfg(next); if (v.current.engine) { v.current.engine.pauseMs = next.pauseMs; v.current.engine.wake = next.wakeOn !== false && !!(next.wakePhrase ?? '').trim(); if ((next.output ?? '') !== (cfg.output ?? '')) void v.current.engine.setOutput(next.output ?? ''); if (next.decisions !== cfg.decisions) void window.desktop.decisions(next.decisions === 'jev').then(setVstatus);
      if (was.model !== now.model || was.vocabulary !== now.vocabulary) void window.desktop.sttConfig(now.model, now.vocabulary).then(() => window.desktop.voiceStatus()).then(setVstatus); } if (tell) { void api.setUi({ voice: next }); window.dispatchEvent(new CustomEvent('cvc-voice-settings', { detail: { cfg: next, from: chatId.current } })); } };
  applyFromElsewhere.current = (next) => saveCfg(next, false);
  useEffect(() => { void api.state().then((st) => { setAutoPct(autoCompactPct(st.ui)); const kept = sid.current ? st.projects.find((x) => x.id === project.id)?.context?.[sid.current] : undefined; if (kept && !ctxRef.current) { ctxRef.current = kept; setCtx(kept); } }).catch(() => {});
    const h = (e: Event) => { const n = (e as CustomEvent<number>).detail; if (typeof n === 'number') setAutoPct(n); }; window.addEventListener('cvc-auto-compact', h); return () => window.removeEventListener('cvc-auto-compact', h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const toBottom = () => requestAnimationFrame(() => { const el = scroller.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; });
  // Pinned to the bottom means it stays there whatever grows: streamed text, a voice line being typed out, a rendered table,
  // the draft of what is being heard, the orb appearing under the thread. Only the user scrolling up lets go of the bottom.
  useEffect(() => { const el = scroller.current; const inner = el?.firstElementChild; if (!el || !inner) return; const ro = new ResizeObserver(() => { if (pinned.current) el.scrollTop = el.scrollHeight; }); ro.observe(inner); ro.observe(el); return () => ro.disconnect(); }, [state]);

  useEffect(() => {
    if (hybrid) { let alive = true;
      // Its session gone from where the agent now lives (its folder moved, or the provider lost it): a new session starts, and its first
      // message carries the conversation so far, the way a move to the other provider does. The conversation never disappears.
      if (sessionId) void api.sessionExists(project.id, sessionId).then((ok) => { if (ok || !alive) return; migrate.current = true; prevProvider.current = provider; window.desktop.debugPush('note', `the Jauvex agent's session ${sessionId.slice(0, 8)} was not found in ${project.path}: a new one starts there with the conversation so far`); record('user', '(from the app) This conversation\'s session was not found where the agent now lives (its folder moved). A new session starts; the conversation so far goes along.'); hybridRef.current?.onLost?.(); }).catch(() => {});
      api.jauvexTranscript().then((all) => { if (!alive) return; setMessages(all.map((e) => e.message)); setStart(0); setState('ready'); toBottom(); }).catch((e: Error) => { if (alive) { setErr(e.message); setState('error'); } }); return () => { alive = false; }; }
    if (!sessionId) return; let alive = true;
    api.messages(project.id, sessionId).then(async (p) => { if (!alive) return; const notes = await api.notes(sessionId).catch(() => []); if (!alive) return;
      const list = [...p.messages]; for (const n of notes) { if (list.some((m) => m.uuid === n.message.uuid)) continue; const i = n.after ? list.findIndex((m) => m.uuid === n.after) : -1; if (i >= 0) { let j = i + 1; while (j < list.length && list[j]!.uuid.startsWith('note-')) j++; list.splice(j, 0, n.message); } } /* each note after the message it followed; one whose message is off this page waits for it */
      setMessages(list); setStart(p.start); setState('ready'); toBottom(); })
      .catch((e: Error) => { if (alive) { setErr(e.message); setState('error'); } });
    return () => { alive = false; };
    // history loads once per mounted chat; later turns arrive as events
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => window.desktop.onChatEvent((ev: ChatEvent) => {
    if (ev.chatId !== chatId.current) return;
    if (ev.type === 'init') { if (ev.model) mainModel.current = ev.model; if (!sid.current) { sid.current = ev.sessionId; void api.setPrefs(project.id, ev.sessionId, prefs.current).catch(() => {}); onSession(ev.sessionId, provider); } }
    else if (ev.type === 'delta') { setLiveText((t) => t + ev.text); toBottom(); }
    else if (ev.type === 'message') { if (ev.message.role === 'assistant') { turnText.current += `${ev.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')}\n`; setLiveText(''); if (v.current.speakTurn) v.current.answer += `${ev.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')}\n`; } const atext = ev.message.role === 'assistant' ? ev.message.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim() : ''; const failed = !!atext && looksLikeFailure(atext); const shown = failed ? { ...ev.message, error: true } : ev.message; if (failed) { v.current.answer = ''; window.desktop.debugPush('note', `the answer looks like the provider's own failure, shown as an error: ${atext.slice(0, 120)}`); } recordMessage(shown); setMessages((m) => (m.some((x) => x.uuid === shown.uuid) ? m.map((x) => (x.uuid === shown.uuid ? shown : x)) : [...m, shown])); toBottom(); } /* same uuid again: a tool call that started and now has its result */
    else if (ev.type === 'permission') { setAsks((a) => [...a, { requestId: ev.requestId, toolName: ev.toolName, input: ev.input }]); toBottom(); }
    else if (ev.type === 'context') { ctxRef.current = ev.usage; setCtx(ev.usage); }
    else if (ev.type === 'compact') compactEventRef.current(ev);
    else if (ev.type === 'done') { if (compactTurn.current) { endCompactRef.current(ev); return; } setTurns((n) => n + 1); ownWrite.current = Date.now();
      // Handed to the turn but never read (stopped, or ended, before the model took it up): it goes again, first, before anything queued after it.
      // A stopped (or replaced) turn sends again everything handed to it: Claude Code drops what it had not taken up yet, and twice is better than never.
      { const lost = v.current.stopped ? turnSteers.current : ev.unsent ? turnSteers.current.slice(-ev.unsent) : []; if (lost.length) { queue.current.unshift(...lost); setQueued([...queue.current]); persistQueue(); window.desktop.debugPush('queue', `${lost.length} message(s) handed to the turn were never read (the turn ${v.current.stopped ? 'was stopped' : 'ended'} first): sent again: ${lost.map(qLabel).join(' | ')}`); } } turnSteers.current = [];
      // A name given when the agent was ordered ("... named X") is written once its first turn is over: by then the provider has the session on disk.
      if (sid.current && (pendingName.current || bornFromOrder.current)) { const name = pendingName.current || `${PROVIDER_LABEL[provider]} agent`; pendingName.current = ''; bornFromOrder.current = false; void api.rename(project.id, sid.current, name).then(() => onNamedRef.current?.()).catch(() => {}); } /* an agent born from an order never keeps its first message as its title */
      const reply = turnText.current; turnText.current = ''; if (pendingMove.current) { const to = pendingMove.current; pendingMove.current = null; handover.current = { to, note: reply.trim() }; void api.jauvexHandover(reply.trim(), provider, to).catch(() => {}); setTimeout(() => doSwitch(to), 50); } /* the note is also a file the next agent can read: data/jauvex-handover.md */ const replyTo = pendingReplyTo.current; pendingReplyTo.current = undefined; v.current.running = false; /* over before the reply is routed: what it triggers starts its own turn instead of steering a turn that is gone */
      // A Claude turn that ends at once with no answer was swallowed: when an agent left a background job running (a shell command in the
      // background, a monitor), the next turn first gets the job's "stopped" notice and the CLI answers only that, in under a second. The
      // message was never read. It goes again, once, with its reply address (an agent's message still gets its answer back).
      const ls = lastSent.current; const swallowed = ev.ok && provider === 'claude' && !reply.trim() && (ev.durationMs ?? 1e9) < 2500 && !!ls && !ls.resent && Date.now() - ls.at < 60_000 && !v.current.stopped;
      if (swallowed && ls) { ls.resent = true; pendingReplyTo.current = replyTo; window.desktop.debugPush('note', `a turn ended in ${ev.durationMs} ms with no answer (the provider answered a stopped background job, not the message): sending the message again`); setRunning(false); setTimeout(() => void sendRef.current(ls.text, false, undefined, true, ls.images, true, !!ls.dictated), 150); return; }
      // A message that did not fit the context: compacted at once, then sent again (once). Past the auto-compact setting: compacted before the next message.
      const recover = !ev.ok && !!ev.tooLong && !v.current.stopped && !!ls && !ls.resent && !!sid.current; const due = ev.ok && !v.current.stopped && shouldCompact(ctxRef.current, autoPctRef.current);
      if (ev.ok && reply.trim()) { embedRef.current?.onReply(reply); onReplyRef.current?.(reply, replyTo); } if (v.current.speakTurn) { v.current.speakTurn = false; if (ev.ok && !v.current.stopped) sayWhatHappened(); else settle(); } setRunning(false); setCompacting(false); setLiveText(''); setAsks([]); setNote(v.current.stopped ? 'Interrupted' : ev.ok ? (ev.durationMs ? `${(ev.durationMs / 1000).toFixed(1)} s` : '') : `Stopped: ${ev.error ?? 'error'}`); if (!ev.ok && !v.current.stopped && !recover) { const why = ev.error ?? 'The turn failed.'; setMessages((m) => [...m, { uuid: `local-err-${Date.now()}`, role: 'system', blocks: [{ type: 'text', text: why }], meta: false, error: true }]); toBottom(); if (v.current.engine && v.current.cfg.ack && !v.current.speakerOff) enqueue(say(`${PROVIDER_LABEL[provider]} could not answer: ${why.replace(/\s+/g, ' ').slice(0, 140)}`), v.current.gen); } /* a failure is a red card in the thread and one spoken line, never a summary */ v.current.stopped = false; onTurnEnd();
      if (recover) startCompactRef.current('too-long'); else if (due && startCompactRef.current('auto')) { /* the queue goes out when the compaction is over */ } else if (flushQueue('turn ended')) { /* the next queued message is on its way */ }
      else if (byeAfter.current) { const bye = byeAfter.current; byeAfter.current = ''; const gen = v.current.gen; enqueue(say(bye), gen); v.current.chain = v.current.chain.then(() => { if (v.current.engine && gen === v.current.gen) void commands.current.toggleVoice(); }); } }
  }), [onSession, onTurnEnd]);

  // Speak: rendering starts immediately (pieces render in parallel), playback stays in order.
  // What the voice says also appears in the thread as its own kind of bubble, typed out along with the speech.
  // The user is never interrupted. A response (to what they just said) starts only once the sound has ended; anything spontaneous
  // (the summary of an answer that lands on its own) also waits while a thought is being held and for a moment of quiet after they
  // spoke. There is no cap: a line waits as long as they talk, and is dropped or deferred (see quiet) if they say something new.
  const userTalking = (kind: 'response' | 'spontaneous') => v.current.hearing || (kind === 'spontaneous' && (!!thought.current.text || Date.now() - v.current.lastHeard < 1500));
  const enqueue = (line: Promise<Spoken | null>, gen: number, unless?: () => boolean, kind: 'response' | 'spontaneous' = 'response', onSaid?: () => void, label = '') => {
    v.current.chain = v.current.chain.then(async () => { const l = await line.catch(() => null);
      let waited = 0; while (userTalking(kind) && gen === v.current.gen) { await new Promise((r) => setTimeout(r, 150)); waited += 150; }
      if (waited >= 600) window.desktop.debugPush('speech', `held ${(waited / 1000).toFixed(1)} s while the user was talking: "${(l?.text ?? '').slice(0, 60)}"`);
      const e = v.current.engine;
      // Every line that was meant to be spoken leaves a trace: said, or why not. A silent voice must be explainable.
      const why = !l ? 'no words came back in time' : !l.audio ? 'the speech could not be rendered' : !e ? 'voice mode is off' : gen !== v.current.gen ? 'the user started talking (or a sound was taken for that) after it was prepared' : v.current.speakerOff ? 'the speaker is muted' : unless?.() ? 'the main answer got there first' : '';
      v.current.wording = false;
      if (why || !l?.audio || !e) { window.desktop.debugPush('speech', `NOT said (${why}): "${l?.text ?? ''}"`); settle(); return; }
      setPhase('speaking');
      const id = ++v.current.playId; const t = await e.play(l.audio, () => { if (v.current.playing?.id === id) v.current.playing = null; settle(); }); if (!t) { window.desktop.debugPush('speech', `NOT said (playback refused): "${l.text}"`); return; }
      v.current.playing = { id, label, text: l.text, at: Date.now() + t.inMs, ms: t.ms }; window.desktop.debugPush('speech', `said: "${l.text}"`); onSaid?.();
      setTimeout(() => { if (gen !== v.current.gen) return; setMessages((m) => [...m, { uuid: `voice-${crypto.randomUUID()}`, role: 'assistant', blocks: [{ type: 'text', text: l.text }], meta: false, voice: { ms: t.ms } }]); toBottom(); }, Math.max(0, t.inMs)); });
  };
  const say = (text: Promise<string> | string): Promise<Spoken | null> => Promise.resolve(text).then(async (t) => (t ? { text: t, audio: await window.desktop.speak(t, v.current.cfg.voice, v.current.cfg.rate) } : null));
  // When the answer lands while the understanding (stage two) is still being said: if most of it is out, it finishes; otherwise it
  // is cut at the next sentence end (estimated from the text), faded over a quarter second, and a short bridge ("Oh, it is done
  // already.") leads into the summary. The bridges are rendered ahead so the cut is not followed by a silent wait.
  const BRIDGES = ['Oh, it is done already.', 'Ah, here it is.', 'Right, it came back already.'];
  const warmBridges = () => { for (const b of BRIDGES) if (!v.current.bridges.has(b)) { v.current.bridges.set(b, null); void window.desktop.speak(b, v.current.cfg.voice, v.current.cfg.rate).then((a) => v.current.bridges.set(b, a)).catch(() => v.current.bridges.delete(b)); } };
  const lastBridge = useRef('');
  const steerStageTwo = async (): Promise<Spoken | null> => {
    const pl = v.current.playing; const e = v.current.engine; if (!pl || !e || pl.label !== 'understanding') return null;
    const elapsed = Date.now() - pl.at; const progress = elapsed / pl.ms; if (progress >= 0.6) { window.desktop.debugPush('speech', `the answer landed with the understanding ${Math.round(progress * 100)}% said: it finishes`); return null; }
    const len = pl.text.length; let cutAt = -1; for (const m of pl.text.matchAll(/[.!?](?=\s|$)/g)) { const t = ((m.index! + 1) / len) * pl.ms; if (t > elapsed + 150) { cutAt = t; break; } }
    const wait = cutAt > 0 && cutAt - elapsed <= 1200 ? cutAt - elapsed : 0; if (wait) await new Promise((r) => setTimeout(r, wait));
    if (v.current.playing?.id !== pl.id) return null; // it ended on its own meanwhile
    e.silence(250); v.current.playing = null; setMessages((m) => m.map((x) => (x.voice && !x.voice.cut ? { ...x, voice: { ...x.voice, cut: true } } : x)));
    window.desktop.debugPush('speech', `the answer landed with the understanding ${Math.round(progress * 100)}% said: cut ${wait ? 'at the end of the sentence' : 'now'}, faded, a bridge leads into the summary`);
    const pool = BRIDGES.filter((b) => b !== lastBridge.current); const b = pool[Math.floor(Math.random() * pool.length)]!; lastBridge.current = b; const audio = v.current.bridges.get(b) ?? await window.desktop.speak(b, v.current.cfg.voice, v.current.cfg.rate).catch(() => null);
    return audio ? { text: b, audio } : null;
  };
  // The big model's answer is on screen in full and is never read aloud. The small model says what happened;
  // a short plain answer ("Four.") is simply spoken as it is.
  const sayWhatHappened = () => { void (async () => {
    const c = v.current.cfg; const gen = v.current.gen; const answer = v.current.answer.trim(); v.current.mainStarted = true; // the acknowledgment is pointless from here on
    if (!answer || v.current.speakerOff) { settle(); return; }
    const bridge = await steerStageTwo(); if (gen !== v.current.gen) return; if (bridge) enqueue(Promise.resolve(bridge), gen, undefined, 'response', undefined, 'bridge');
    v.current.wording = true; setPhase('wording'); // the answer is on screen; the voice is now wording and rendering what it will say
    const plain = clean(answer); const short = answer.length <= 160 && !/```|^\s*[-*#|>]|\d+\.\s/m.test(answer);
    window.desktop.debugPush('summary', short ? `short answer (${answer.length} chars): spoken word for word, no model: "${plain}"` : `long answer (${answer.length} chars): the voice model sums it up`);
    const words = short ? Promise.resolve(plain) : window.desktop.summarize(v.current.asked, answer, speaker.current.provider, speaker.current.model, main.current).then((t) => t || opening(plain)); // no summary in time: the answer's own opening lines, which carry the conclusion, rather than a line that says nothing
    v.current.pendingSummary = { words }; enqueue(say(words), gen, undefined, 'spontaneous', () => { v.current.pendingSummary = null; }, 'summary');
    v.current.chain = v.current.chain.then(settle);
  })(); };
  // A summary that was waiting when the user spoke: it is not lost, it follows the answer to what they said, as an aside.
  const sayDeferred = (gen: number) => { const ps = v.current.pendingSummary; if (!ps || v.current.speakerOff) return; v.current.pendingSummary = null; window.desktop.debugPush('speech', 'the summary that was held while the user talked comes after the answer to what they said, as "by the way"'); enqueue(say(ps.words.then((t) => (t ? `By the way, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : ''))), gen, undefined, 'response', undefined); };
  // After a piece of speech ends: still working -> Thinking, otherwise back to Listening. Never overrides the user talking.
  const settle = () => { const e = v.current.engine; if (!e || e.speaking || v.current.hearing) return; setPhase(v.current.wording ? 'wording' : v.current.running || v.current.speakTurn ? 'thinking' : 'listening'); };
  // Stop talking now: fade out, drop everything queued, kill renders, and forget the rest of the interrupted answer.
  const hush = () => { setMessages((m) => (m.some((x) => x.voice && !x.voice.cut) ? m.map((x) => (x.voice ? { ...x, voice: { ...x.voice, cut: true } } : x)) : m)); v.current.gen++; v.current.chain = Promise.resolve(); v.current.speakTurn = false; v.current.wording = false; v.current.answer = ''; v.current.pendingSummary = null; v.current.engine?.silence(); void window.desktop.cancelSpeech(); };

  // Barge-in. Two channels: the user talking silences the voice, and only the voice. The main thread keeps working, and
  // its answer is still summed up when it lands. (Stop is the button that interrupts the main thread.)
  const quiet = () => { setMessages((m) => (m.some((x) => x.voice && !x.voice.cut) ? m.map((x) => (x.voice ? { ...x, voice: { ...x.voice, cut: true } } : x)) : m)); v.current.gen++; v.current.chain = Promise.resolve(); v.current.engine?.silence(); void window.desktop.cancelSpeech(); };
  // The moment a sound starts, only the audio playing is faded (the user must never be talked over). What is queued, and what is
  // being rendered, is only dropped once the sound proves to be speech (in `end`): a click, a cough or a ghost must not silence the voice.
  const hushPlaying = () => { v.current.engine?.silence(); };
  // What was said as a stop shows in the thread, marked; when it says more than the stop ("list them first, stop"), those words go to the
  // agent once the turn has stopped (they are in its transcript then); a bare stop is kept with the session's notes instead.
  const showStop = (text: string) => { const said: ChatMessage = { uuid: `local-stop-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text }], meta: false, stopped: true }; setMessages((m) => [...m, said]); toBottom();
    if (!stopSaysMore(text)) { void keepNotes([said]); return; }
    queue.current.unshift({ text, images: [], spoken: true, shown: true }); setQueued([...queue.current]); persistQueue(); window.desktop.debugPush('queue', `the stop said more than stop: once the turn has stopped, its words go to the agent: ${text}`); };
  const turnSteers = useRef<QueueItem[]>([]); // what was handed to the running turn, in order: its end says how many of the last ones were never read
  const stopNow = () => { if (!v.current.running || v.current.stopped) return; window.desktop.debugPush('stop', 'stop command heard: main thread interrupted at once (rule, no model asked)'); v.current.stopped = true; void window.desktop.chatStop(chatId.current); };
  // Steering: the running turn gets this now, at its next step, and keeps working. If the turn cannot take it (it just ended, or it has not started), it waits in the queue like everything else.
  const steer = async (text: string, images?: Attachment[], dictated = false) => {
    const said = dictated ? `${DICTATED_TAG}${text}` : text; /* the model is told, every time, which words were dictated (T-76) */
    const ok = v.current.running && !compactTurn.current && await window.desktop.chatSteer(chatId.current, embed ? `${embed.context()}${said}` : said, images).catch(() => false); // a compaction takes nothing in: it waits in the queue if (ok) record('user', text + (images?.length ? ` [${images.length} image${images.length > 1 ? 's' : ''} attached]` : ''), { steered: true });
    if (!ok) { enqueueForMain(text, undefined, dictated); if (v.current.running && !(await window.desktop.chatRunning(chatId.current).catch(() => true))) staleTurnEnded(); return false; }
    setDraft(null);
    turnSteers.current.push({ text, images: images ?? [], ...(dictated ? { spoken: true } : {}), shown: true });
    window.desktop.debugPush('queue', `steered: handed to the running turn without interrupting it: ${text}${images?.length ? ` (+${images.length} image${images.length > 1 ? 's' : ''})` : ''}`);
    setMessages((m) => [...m, { uuid: `local-${Date.now()}`, role: 'user', blocks: [...(text ? [{ type: 'text', text } as Block] : []), ...(images ?? []).map((i): Block => ({ type: 'image', src: `data:${i.mediaType};base64,${i.data}`, name: i.name }))], meta: false, steered: true }]); toBottom(); return true;
  };
  // The window believed a turn was running but the main process has none (its end was never heard): end it here, so what was
  // queued goes out instead of waiting for ever.
  const staleTurnEnded = () => { window.desktop.debugPush('note', 'the turn had ended without the window hearing it: ending it now and sending what was queued'); v.current.running = false; v.current.speakTurn = false; compactTurn.current = null; setRunning(false); setCompacting(false); setLiveText(''); setAsks([]); setNote('');
    if (!flushQueue('the turn had ended')) settle(); };
  // ---- compaction (T-74): a turn of its own, Claude Code's /compact or Codex's thread/compact/start, with the last turn's settings
  const startCompact = (why: 'manual' | 'auto' | 'too-long', text = '/compact'): boolean => {
    if (v.current.running || !sid.current) return false;
    compactTurn.current = why; v.current.running = true; v.current.stopped = false; setRunning(true); setCompacting(true); setLiveText('');
    setNote(why === 'manual' ? 'Compacting the conversation…' : why === 'auto' ? `Compacting: the context passed ${autoPctRef.current} %…` : 'The context was full: compacting, then your message goes again…');
    const c = ctxRef.current; window.desktop.debugPush('note', `compacting ${why === 'manual' ? 'as asked' : why === 'auto' ? `(auto-compact at ${autoPctRef.current} %)` : '(a message did not fit the context)'}${c ? `: ${tokens(c.used)} of ${c.window ? tokens(c.window) : 'an unknown window'} tokens` : ''}`);
    void window.desktop.chatStart({ chatId: chatId.current, projectId: project.id, sessionId: sid.current, provider, permissions, ...(embed ? { hidden: true } : {}), ...(project.builtin === 'jauvex' ? { steward: true } : {}), text, compact: true, ...(model ? { model } : {}), ...(effort && efforts.includes(effort) ? { effort } : {}), ...(lastVoiced.current ? { voice: true, vocabulary: stt(v.current.cfg).vocabulary } : {}) });
    return true;
  };
  const compactEvent = (ev: Extract<ChatEvent, { type: 'compact' }>) => {
    const auto = ev.trigger === 'auto' || (!!compactTurn.current && compactTurn.current !== 'manual'); // the provider's own, or the app's (the setting, a message that did not fit)
    if (ev.phase === 'start') { setCompacting(true); if (!compactTurn.current) setNote('Compacting: the context is nearly full…'); window.desktop.debugPush('note', `${PROVIDER_LABEL[provider]} started compacting ${auto ? 'on its own' : 'as asked'}${ev.before ? ` at ${tokens(ev.before)} tokens` : ''}`); return; }
    setCompacting(false); setLastCompact({ at: Date.now(), ok: ev.ok !== false, ...(ev.before ? { before: ev.before } : {}), ...(ev.after !== undefined ? { after: ev.after } : {}) });
    const what = ev.ok === false ? `The conversation could not be compacted${ev.error ? `: ${ev.error}` : ''}` : `Conversation compacted${auto ? ' automatically' : ''}${ev.before ? `: ${tokens(ev.before)}${ev.after !== undefined ? ` → ${tokens(ev.after)}` : ''} tokens` : ''}`;
    window.desktop.debugPush('note', what); setNote(what);
    const mark: ChatMessage = { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: `(from the app) ${what}.` }], meta: false }; // where it happened, kept with the session's notes
    setMessages((m) => [...m, mark]); toBottom(); void keepNotes([mark]);
  };
  const endCompactTurn = (ev: Extract<ChatEvent, { type: 'done' }>) => {
    const why = compactTurn.current; compactTurn.current = null; ownWrite.current = Date.now(); turnText.current = ''; setTurns((n) => n + 1);
    v.current.running = false; setRunning(false); setCompacting(false); setLiveText(''); setAsks([]);
    const stopped = v.current.stopped; v.current.stopped = false;
    if (stopped) setNote('Compaction interrupted');
    else if (!ev.ok) { const err = ev.error ?? 'the compaction failed'; setNote(`Could not compact: ${err}`); setMessages((m) => [...m, { uuid: `local-err-${Date.now()}`, role: 'system', blocks: [{ type: 'text', text: `Could not compact the conversation: ${err}` }], meta: false, error: true }]); toBottom(); }
    else setNote((n) => (/^(Compacting|The context was full)/.test(n) ? 'Nothing was compacted' : n)); // the provider found nothing to compact
    onTurnEnd();
    const ls = lastSent.current;
    if (why === 'too-long' && ev.ok && !stopped && ls) { window.desktop.debugPush('note', 'compacted after a message that did not fit: sending it again'); setTimeout(() => void sendRef.current(ls.text, false, undefined, true, ls.images, true, !!ls.dictated), 150); return; }
    if (!flushQueue('compaction ended')) settle();
  };
  const startCompactRef = useRef(startCompact); startCompactRef.current = startCompact; const compactEventRef = useRef(compactEvent); compactEventRef.current = compactEvent; const endCompactRef = useRef(endCompactTurn); endCompactRef.current = endCompactTurn;
  // Queued messages leave one at a time, each as its own turn, in the order they were typed: nothing is ever merged into another message.
  const qLabel = (q: QueueItem) => `${q.text}${q.images.length ? ` (+${q.images.length} image${q.images.length > 1 ? 's' : ''})` : ''}`;
  const flushQueue = (why: string): boolean => { const next = queue.current.shift(); setQueued([...queue.current]); persistQueue(); if (!next) return false;
    window.desktop.debugPush('queue', `${why}: sending the next queued message${queue.current.length ? ` (${queue.current.length} more wait for the next turn)` : ''}: ${qLabel(next)}`); void sendRef.current(next.text, false, undefined, true, next.images.length ? next.images : undefined, !!next.shown, !!next.spoken); return true; };
  const enqueueForMain = (text: string, images?: Attachment[], spoken = false) => { setDraft(null); const item: QueueItem = { text, images: images ?? [], ...(spoken ? { spoken: true } : {}) }; if (!item.text && !item.images.length) return; window.desktop.debugPush('queue', `queued for the main thread: ${qLabel(item)}`); queue.current.push(item); setQueued([...queue.current]); persistQueue(); toBottom(); if (!v.current.running) flushQueue('queued while no turn was running'); };

  const toggleVoice = async () => {
    if (voiceOn) { if (thought.current.text) { window.desktop.debugPush('thought', 'voice switched off with words held: sending them now'); await flushHeldRef.current(); } hush(); v.current.engine?.stop(); v.current.engine = null; setVoiceOn(false); setPhase('off'); setDraft(null); setMicMuted(false); void window.desktop.voiceOn(false, ears.current); return; }
    setVoiceOn(true); setPhase('listening'); setDraft(null);
    try {
      await window.desktop.decisions(cfg.decisions === 'jev');
      setVstatus(await window.desktop.voiceOn(true, ears.current, speaker.current.provider, cfg.ack ? speaker.current.model : undefined, stt(cfg)));
      const flushHeld = async () => { clearTimeout(thought.current.timer); const said = thought.current.text; thought.current = { ...thought.current, text: '', parts: 0, done: false }; if (said) await handleUtterance(said, null); }; flushHeldRef.current = flushHeld;
      const engine = new VoiceEngine({
        level: (rms) => { micLevel.current = rms; },
        wake: (wav) => { window.desktop.debugPush('note', `ears: muted, a short phrase heard (${Math.round((wav.byteLength - 44) / 32)} ms): checked for the wake phrase`); if (wakeBusy.current) return; wakeBusy.current = true; const c = v.current.cfg; void window.desktop.wakeCheck(wav, c.wakePhrase ?? '', c.language).then((r) => { if (r.woke && v.current.engine?.muted) { window.desktop.debugPush('note', `wake phrase heard ("${r.heard}"): the microphone is on again`); toggleMicRef.current(); } }).catch(() => {}).finally(() => { wakeBusy.current = false; }); },
        speechStart: () => { // they are talking: the voice stops and listens. The main thread is not touched.
          if (muteTimer.current) { muteCut.current = true; window.desktop.debugPush('note', 'auto-mute: a sound started: the countdown stops (it starts again if the sound was no words)'); }
          cancelAutoMute(); /* talking again: no auto-mute until their next message is sent, or until the sound turns out to be no words */
          clearTimeout(thought.current.timer); if (thought.current.text) thought.current.timer = setTimeout(() => void flushHeld(), HOLD_STUCK_MS); /* the new sound must end (end/dropped) and re-arm this; if it never does, the held words still go */ hushPlaying(); v.current.hearing = true; v.current.starts++; emptyInterims.current = 0; setPhase('hearing');
          clearTimeout(draftTimer.current); draftTimer.current = setTimeout(() => setDraftState((d) => { if (d === null) toBottom(); return d ?? thought.current.text; }), 300); // a click or a cough is over before this: no bubble for those
        },
        // A sound that turned out to be nothing (a blip, a ghost). Words that were being held for "what comes next" must not
        // wait for it forever: nothing came, so they go now if the thought was already judged finished, or after the usual hold.
        // Still talking: show the words so far. One request at a time, never logged, and never used for anything but the bubble.
        interim: (wav) => { if (interimBusy.current || sttBusy.current > 0) return; interimBusy.current = true; /* never competes with the transcript that counts */ void window.desktop.transcribe(wav, v.current.cfg.language, true).then((t) => { if (t.text && v.current.hearing) { emptyInterims.current = 0; setDraft([thought.current.text, t.text].filter(Boolean).join(' ')); }
          else if (!t.text && v.current.hearing && ++emptyInterims.current >= 3) { emptyInterims.current = 0; window.desktop.debugPush('heard', 'a sound with no words in it for seconds (a fan, a video, typing): not speech, the segment is dropped so the voice is not held for it'); engine.abandon(); } }).catch(() => {}).finally(() => { interimBusy.current = false; }); }, /* a segment the ears keep open with no words in it would hold every spoken line for as long as the noise lasts (it once held a summary for 100 s) */
        dropped: () => { v.current.hearing = false; if (!thought.current.text) setDraft(null); else clearTimeout(draftTimer.current); if (thought.current.text) { window.desktop.debugPush('thought', `the sound after the held words was nothing: ${thought.current.done ? 'sending them now' : 'holding a little longer'}`); clearTimeout(thought.current.timer); thought.current.timer = setTimeout(flushHeld, thought.current.done ? 0 : HOLD_MS); } settle(); resumeAutoMute(); },
        trace: (what) => window.desktop.debugPush('note', `ears: ${what}`),
        maybeEnd: (wav, id) => { // they went quiet: use the pause. Transcribe, word the acknowledgment and render it before the turn even ends.
          const stretch = v.current.starts; /* the fullest text any pass of this stretch heard, against a final pass that loses words */
          if (sttBusy.current > 0) { v.current.spec = null; return; } /* the previous pass is still running: no speculative pass on top of it (they piled up, and the real end waited behind stale ones); the end transcribes */
          const c = v.current.cfg; sttBusy.current++; const p = window.desktop.transcribe(wav, c.language); void p.catch(() => {}).finally(() => { sttBusy.current--; });
          void p.then((t) => { if (t.text && wordsOf(t.text) > wordsOf(bestPass.current.get(stretch) ?? '')) bestPass.current.set(stretch, t.text); if (t.text && v.current.spec?.id === id) setDraft([thought.current.text, t.text].filter(Boolean).join(' ')); }).catch(() => {});
          const busy = v.current.running; // said while the main thread works: the voice confirms it is queued, not that it is being done
          if (busy) void p.then((t) => { if (isStopCommand(t.text)) stopNow(); }).catch(() => { /* the final transcript decides */ }); // 240 ms into the pause, before the turn is even over
          // busy: the voice also decides what this means for the running work (wait its turn, stop it, replace it)
          const triage = busy ? p.then((t) => (t.text ? window.desktop.triage(t.text, speaker.current.provider, speaker.current.model, main.current, v.current.asked) : null)).catch(() => null) : null;
          const words = triage ? triage.then((r) => r?.say ?? '') : p.then((t) => (t.text ? window.desktop.ack(t.text) : ''));
          const ackAudio = c.ack && !v.current.speakerOff ? say(words).catch(() => null) : Promise.resolve(null);
          v.current.spec = { id, p, ackAudio, busy, triage };
        },
        resumed: () => { v.current.spec = null; },
        end: (wav, id, cut) => { const stretch = v.current.starts; void (async () => {
          const startsAtEnd = stretch; const stillHearing = () => v.current.starts !== startsAtEnd; /* a new segment began while this one was transcribed: they are still talking */
          setPhase('transcribing');
          try { const held = v.current.spec; v.current.spec = null; const spec = held && held.id === id ? held : null;
            const t = spec ? await spec.p : await window.desktop.transcribe(wav, v.current.cfg.language);
            { const best = bestPass.current.get(stretch) ?? null; for (const k of [...bestPass.current.keys()]) if (k <= stretch) bestPass.current.delete(k);
              if (suspicious(t.text, best)) { const r = await window.desktop.transcribe(wav, v.current.cfg.language, false, '', true).catch(() => null); const pick = pickTranscript(t.text, best, r?.text ?? null);
                window.desktop.debugPush('note', `ears: the pass over the whole stretch heard ${wordsOf(t.text)} word(s) ("${t.text.slice(0, 60)}") where an earlier pass of it heard ${wordsOf(best!)}; the retry heard ${r ? wordsOf(r.text) : 'nothing'}: kept the ${pick.by}'s text`); t.text = pick.text; } }
            if (t.text) quiet(); /* real speech: whatever the voice still had to say is off the table. A sound that was nothing (a click, a cough, a ghost) leaves the queued lines and the renders alone: it used to cut them, and the second and third stages went missing */
            if (!stillHearing()) v.current.hearing = false; if (t.text) v.current.lastHeard = Date.now(); if (t.dropped && t.dropped.split(/\s+/).length >= 3) setNote(`Not sent, it did not sound like speech to me: "${t.dropped}"`); /* never erased without a trace */ if (!t.text && !thought.current.text) { setDraft(null); settle(); resumeAutoMute(); return; }
            if (!t.text) { clearTimeout(thought.current.timer); thought.current.timer = setTimeout(flushHeld, thought.current.done ? 0 : HOLD_MS); settle(); return; } // noise after a held fragment: keep waiting for the rest
            const said = [thought.current.text, t.text].filter(Boolean).join(' '); const joined = thought.current.parts > 0; setDraft(said);
            // Closed for its length at a short pause, not because they stopped: held for the next words, which join it. Not counted as a hold.
            if (cut && !isStopCommand(t.text)) { thought.current.text = said; thought.current.done = false; setDraft(`${said} …`); clearTimeout(thought.current.timer); thought.current.timer = setTimeout(() => void flushHeld(), v.current.hearing ? HOLD_STUCK_MS : HOLD_MS); window.desktop.debugPush('thought', `a long dictation, closed at a pause so its words land in time: the next words join it (${said.split(/\s+/).length} words so far)`); settle(); return; }
            // Is the thought finished? Jev judges it from the words (a quarter of a second). A stop command never waits, and nothing is held more than three times.
            if (!isStopCommand(t.text) && thought.current.parts < 3) { const d = await window.desktop.thoughtDone(said).catch(() => ({ done: true }));
              if (!d.done && !v.current.hearing) { thought.current.text = said; thought.current.parts++; thought.current.done = false; setDraft(`${said} …`); clearTimeout(thought.current.timer); thought.current.timer = setTimeout(flushHeld, HOLD_MS); settle(); return; }
              if (v.current.hearing) { thought.current.text = said; thought.current.parts++; thought.current.done = d.done; clearTimeout(thought.current.timer); thought.current.timer = setTimeout(() => void flushHeld(), HOLD_STUCK_MS); return; } } // they are already talking again: this joins what comes next (and if that sound never ends, the words go anyway)
            thought.current = { ...thought.current, text: '', parts: 0, done: false };
            await handleUtterance(said, joined ? null : spec); return; // what was prepared during the pause only fits if nothing was joined to it
          } catch (e) { if (!stillHearing()) v.current.hearing = false; setNote(`Voice: ${(e as Error).message}`); settle(); }
        })(); },
      });
      const handleUtterance = async (text: string, spec: typeof v.current.spec) => { const t = { text };
          try {
            // The app asked about an order nobody was sure of (shared/orders.ts): these words answer it. A clear yes carries the order out;
            // anything else sends the words it asked about to the agent as they were said (followed by these, when they are more than a no).
            const asked = pendingOrder.current; pendingOrder.current = null; let answered: AppCommand | null = null;
            if (asked && Date.now() - asked.at < 120_000) { const a = answerIs(text); window.desktop.debugPush('note', `the app's question about an order: ${a ?? 'no clear answer'}  <- ${text}`);
              if (a === 'yes') answered = asked.cmd; else { t.text = a === 'no' ? asked.text : `${asked.text}\n\n${text}`; spec = null; } }
            // For the app, not for the main thread? ("create a new Codex agent in the homepage project")
            const cmd0 = answered ?? (cmdRef.current.onCommand && !asked && !isStopCommand(text) ? await window.desktop.command(text, cmdRef.current.folders, project.id, { provider: speaker.current.provider, model: speaker.current.model, main: main.current, mainModel: model || mainModel.current || undefined }).catch(() => null) : null);
            const inner = cmd0?.type === 'confirm' ? cmd0.pending : cmd0;
            const cmd = inner && inner.type === 'new-agent' && project.builtin === 'jauvex' ? null : cmd0; /* said to the Jauvex agent, a new agent is its job: it asks the folder and creates it; the app's own shortcut would open a session in the app's folder */
            if (cmd && cmd.type === 'confirm') { setDraft(null); pendingOrder.current = { cmd: cmd.pending, text: cmd.text, at: Date.now() }; // asked, not done: the next words answer
              const said = [{ uuid: `local-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text }], meta: false }, { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: `(from the app) ${cmd.say}` }], meta: false }] as ChatMessage[]; setMessages((m) => [...m, ...said]); toBottom(); await keepNotes(said);
              if (!v.current.speakerOff) enqueue(say(cmd.say), v.current.gen); sayDeferred(v.current.gen); v.current.chain = v.current.chain.then(settle); settle(); return; }
            if (cmd && cmd.type === 'hold') { setDraft(null); window.desktop.debugPush('note', `a pause: nothing sent, waiting  <- ${text}`); if (v.current.cfg.ack && !v.current.speakerOff) enqueue(say(cmd.say), v.current.gen); sayDeferred(v.current.gen); v.current.chain = v.current.chain.then(settle); settle(); return; } // "one second": they are pausing; the voice says it will wait and nothing moves
            if (cmd && cmd.type === 'goodbye' && cmd.after) { byeAfter.current = cmd.say; window.desktop.debugPush('note', 'goodbye with something to do first: the goodbye waits for the end of the turn'); } // falls through: the text is a normal message
            else if (cmd) { setDraft(null); const said = [{ uuid: `local-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text }], meta: false }, { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: `(from the app) ${cmd.say}` }], meta: false }] as ChatMessage[]; setMessages((m) => [...m, ...said]); toBottom(); await keepNotes(said); let wait = 0; if (!v.current.speakerOff) { const l = await say(cmd.say).catch(() => null); const played = l?.audio && v.current.engine ? await v.current.engine.play(l.audio, settle) : null; if (played) { setPhase('speaking'); wait = played.inMs + played.ms; } }
              setTimeout(() => { if (cmd.type === 'goodbye') { if (v.current.engine) void commands.current.toggleVoice(); } else cmdRef.current.onCommand?.(cmd, speaker.current.provider); }, wait + 150); return; }
            const busy = v.current.running; const prepared = spec && spec.busy === busy ? spec.ackAudio : undefined;
            if (!busy) { await sendRef.current(t.text, true, prepared); startAutoMute(); return; } /* always the latest send: the provider may have changed since voice started (the Jauvex agent moves) */
            if (isStopCommand(t.text)) { setDraft(null); showStop(t.text); stopNow(); if (v.current.cfg.ack && !v.current.speakerOff) enqueue(say('Okay, stopped.'), v.current.gen); v.current.chain = v.current.chain.then(settle); settle(); return; }
            // The main thread is mid-turn. Said out loud, this reaches it now, as added information: it keeps going and keeps everything it has.
            // It only waits when they ask for that ("queue this"), and only a clear "stop" or "not that, this" interrupts the work. (Typed text queues, with a Send now button.)
            const triage = spec && spec.busy && spec.triage ? spec.triage : window.desktop.triage(t.text, speaker.current.provider, speaker.current.model, main.current, v.current.asked).catch(() => null);
            const r = await triage; const action = v.current.running ? r?.action ?? 'steer' : 'queue';
            if (action === 'steer') { if (await steer(t.text, undefined, true)) v.current.asked = `${v.current.asked}\n(added while I worked) ${t.text}`; } // the summary at the end covers this too
            else if (action === 'replace') { setDraft(null); queue.current.unshift({ text: t.text, images: [], spoken: true }); setQueued([...queue.current]); persistQueue(); window.desktop.debugPush('queue', `first in the queue, it replaces the work: ${t.text}`); } else if (action !== 'stop') enqueueForMain(t.text, undefined, true);                  // stop alone carries nothing to hand over
            if (action === 'stop') { setDraft(null); showStop(t.text); }
            if (action === 'stop' || action === 'replace') { window.desktop.debugPush('stop', `main thread interrupted (${action})`); v.current.stopped = true; void window.desktop.chatStop(chatId.current); } // the queue is sent as soon as the turn has ended
            if (v.current.cfg.ack && !v.current.speakerOff && r?.say) enqueue(prepared ?? say(r.say), v.current.gen); sayDeferred(v.current.gen);
            if (!v.current.running) flushQueue('the turn ended while this was being weighed');
            if (action !== 'stop') startAutoMute();
            v.current.chain = v.current.chain.then(settle); settle();
          } catch (e) { setNote(`Voice: ${(e as Error).message}`); settle(); }
      };
      engine.pauseMs = cfg.pauseMs; engine.muted = micMuted; engine.wake = cfg.wakeOn !== false && !!(cfg.wakePhrase ?? '').trim(); engine.output = cfg.output ?? ''; await engine.start(); v.current.engine = engine;
      const poll = setInterval(() => { void window.desktop.voiceStatus().then((st) => { setVstatus(st); if (st.whisper !== 'starting' || !v.current.engine) clearInterval(poll); }); }, 700);
    } catch (e) { setVoiceOn(false); setPhase('off'); setNote(`Voice could not start: ${(e as Error).message}`); void window.desktop.voiceOn(false, ears.current); }
  };
  useEffect(() => () => { v.current.engine?.stop(); v.current.engine = null; void window.desktop.voiceOn(false, ears.current); window.desktop.voiceState({ on: false, phase: 'off', level: 0, micMuted: false, speakerOff: false }); }, []);
  // Auto-mute (a setting): after each spoken message, a countdown on the microphone, then muted; talking again cancels it. With the
  // wake phrase, the user mutes by staying quiet and comes back by saying it.
  const [muteIn, setMuteIn] = useState<number | null>(null); const muteTimer = useRef<ReturnType<typeof setInterval> | null>(null); const wakeBusy = useRef(false);
  const muteCut = useRef(false); // a sound stopped the countdown: if it turns out to be no words, the countdown starts again (T-127: a breath once stopped it for good)
  const cancelAutoMute = () => { if (muteTimer.current) clearInterval(muteTimer.current); muteTimer.current = null; setMuteIn(null); };
  const startAutoMute = () => { muteCut.current = false; const c = v.current.cfg; if (!c.autoMute || !v.current.engine || v.current.engine.muted) return; cancelAutoMute(); let left = Math.max(1, Math.round(c.autoMuteSec || 5)); setMuteIn(left);
    muteTimer.current = setInterval(() => { left -= 1; if (left > 0) { setMuteIn(left); return; } cancelAutoMute(); if (v.current.engine && !v.current.engine.muted) { window.desktop.debugPush('note', `auto-mute: muted ${c.autoMuteSec || 5} s after the last message${(c.wakePhrase ?? '').trim() ? `; "${c.wakePhrase}" unmutes` : ''}`); toggleMicRef.current(); } }, 1000); };
  const resumeAutoMute = () => { if (!muteCut.current || v.current.hearing) return; muteCut.current = false; window.desktop.debugPush('note', 'auto-mute: that sound had no words in it: the countdown starts again'); startAutoMute(); };
  const toggleMic = () => setMicMuted((m) => { const next = !m; cancelAutoMute(); muteCut.current = false; if (v.current.engine) v.current.engine.muted = next; if (next && thought.current.text) { window.desktop.debugPush('thought', 'mic muted with words held: sending them now'); void flushHeldRef.current(); } return next; });
  const toggleSpeaker = () => setSpeakerOff((o) => { const next = !o; v.current.speakerOff = next; if (next) { v.current.engine?.silence(); void window.desktop.cancelSpeech(); v.current.chain = Promise.resolve(); } return next; });
  // The orb's level, and the mirror the floating controller draws from (10 times a second while voice is on).
  const mirror = useRef({ phase, micMuted, speakerOff }); mirror.current = { phase, micMuted, speakerOff };
  useEffect(() => {
    if (!voiceOn) { window.desktop.voiceState({ on: false, phase: 'off', level: 0, micMuted: false, speakerOff: false }); return; }
    let n = 0; const t = setInterval(() => { const e = v.current.engine; const out = e?.outputLevel() ?? 0; level.current = out > 0.004 ? out * 1.6 : micLevel.current;
      if (++n % 3 === 0) window.desktop.voiceState({ on: true, level: level.current, ...mirror.current }); }, 33);
    return () => clearInterval(t);
  }, [voiceOn]);
  // Left for another session: the turn keeps running here in the background, only the microphone goes (one voice at a time).
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => { onBusy(running); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) { pinned.current = true; toBottom(); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // One microphone in the whole app. It stays with this session while the user looks at or types into others; it only goes when
  // voice is started somewhere else (the app then names that chat as the listening one) or turned off here.
  const onListeningRef = useRef(onListening); onListeningRef.current = onListening;
  useEffect(() => { onListeningRef.current?.(voiceOn); }, [voiceOn]);
  const onVoiceUiRef = useRef(onVoiceUi); onVoiceUiRef.current = onVoiceUi;
  const hadVoice = useRef(false); // a chat that never had voice on says nothing: on mount, this effect would otherwise clear the sidebar orb of the chat that is listening
  useEffect(() => { if (!voiceOn && !hadVoice.current) return; hadVoice.current = voiceOn; onVoiceUiRef.current?.(voiceOn ? { muteIn, phase, level, micMuted, speakerOff, hush, toggleMic, toggleSpeaker, end: () => void toggleVoice() } : null); }, [voiceOn, phase, micMuted, speakerOff, muteIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (voiceOn && mic === 'elsewhere') void toggleVoice(); }, [mic]); // eslint-disable-line react-hooks/exhaustive-deps
  const startedVoice = useRef(false);
  useEffect(() => { if (startVoice && active && !startedVoice.current && !voiceOn) { startedVoice.current = true; void toggleVoice(); } }, [startVoice, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMicRef = useRef(toggleMic); toggleMicRef.current = toggleMic;
  // Mute when idle (a setting): nobody talking (the user or the voice) for that long mutes the microphone; the last 5 s count down on it.
  const lastActive = useRef(Date.now()); const idleCounting = useRef(false);
  useEffect(() => { lastActive.current = Date.now(); }, [phase, micMuted]);
  useEffect(() => { if (!voiceOn) return; lastActive.current = Date.now(); const t = setInterval(() => { const secs = v.current.cfg.idleMuteSec ?? 0; const e = v.current.engine;
    if (!secs || !e || e.muted || muteTimer.current) { if (idleCounting.current) { idleCounting.current = false; setMuteIn(null); } return; }
    if (['hearing', 'transcribing', 'speaking', 'wording'].includes(mirror.current.phase)) lastActive.current = Date.now();
    const left = Math.ceil((lastActive.current + secs * 1000 - Date.now()) / 1000);
    if (left <= 0) { idleCounting.current = false; setMuteIn(null); window.desktop.debugPush('note', `idle mute: muted after ${secs} s with nobody talking`); toggleMicRef.current(); }
    else if (left <= 5) { idleCounting.current = true; setMuteIn(left); } else if (idleCounting.current) { idleCounting.current = false; setMuteIn(null); } }, 1000);
    return () => clearInterval(t); }, [voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!voiceOn) { cancelAutoMute(); muteCut.current = false; } }, [voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const commands = useRef({ toggleMic, toggleSpeaker, toggleVoice, onNew }); commands.current = { toggleMic, toggleSpeaker, toggleVoice, onNew };
  useEffect(() => window.desktop.onVoiceType((text: string) => { if (!v.current.engine || !text.trim()) return; void sendRef.current(text, false); }), []); // from the tiny bar: the listening chat, typed (queued while a turn runs, like the composer)
  useEffect(() => window.desktop.onVoiceCmd((cmd: VoiceCommand) => { if (cmd === 'new') { if (activeRef.current) commands.current.onNew(); return; } if (!v.current.engine) return; /* the floating controller drives the one chat that is listening */ const c = commands.current; if (cmd === 'mic') c.toggleMic(); else if (cmd === 'speaker') c.toggleSpeaker(); else if (cmd === 'end') void c.toggleVoice(); }), []);

  const send = async (text: string, spoken = false, preparedAck?: Promise<Spoken | null>, fromQueue = false, images?: Attachment[], resend = false, dictated = spoken) => {
    const typed = text.trim(); if (!typed && !images?.length) return;
    if (!spoken && !dictated && !images?.length && /^\/compact(\s|$)/i.test(typed)) { // typed /compact: the app's own compaction, shown as it runs (as a plain message it ran unseen)
      if (v.current.running) { enqueueForMain(typed); return; }
      if (!sid.current) { setNote('Nothing to compact yet: this session has no conversation.'); return; }
      if (!resend) { setMessages((m) => [...m, { uuid: `local-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: typed }], meta: false }]); toBottom(); }
      startCompactRef.current('manual', typed); return; }
    if (!spoken && !fromQueue && thought.current.text) { window.desktop.debugPush('thought', 'a typed message while words were held: the held words go first'); await flushHeldRef.current(); } /* never erased by what is typed next */
    if (typed && !spoken && !fromQueue && v.current.engine && cmdRef.current.onCommand) { // typed while voice mode is on: an order for the app is still an order for the app
      const cmd1 = await window.desktop.command(typed, cmdRef.current.folders, project.id, { provider: speaker.current.provider, model: speaker.current.model, main: main.current, mainModel: model || mainModel.current || undefined }).catch(() => null);
      const cmd = cmd1 && cmd1.type === 'new-agent' && project.builtin === 'jauvex' ? null : cmd1; /* the Jauvex agent creates agents itself */
      if (cmd && cmd.type !== 'hold') { const said = [{ uuid: `local-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: typed }], meta: false }, { uuid: `local-note-${Date.now()}`, role: 'user', blocks: [{ type: 'text', text: `(from the app) ${cmd.say}` }], meta: false }] as ChatMessage[]; setMessages((m) => [...m, ...said]); toBottom(); await keepNotes(said); cmdRef.current.onCommand(cmd, speaker.current.provider); return; } } // typed "wait" is a message like any other
    if (v.current.running) { enqueueForMain(typed, images, dictated); return; }
    const voiced = spoken || v.current.engine !== null; // typed while voice mode is on: the reply is spoken too
    lastVoiced.current = voiced;
    if (voiced) {
      if (fromQueue) { /* the voice may still be summing up the turn that just ended: let it finish */ }
      else if (v.current.engine?.speaking) hush(); else { v.current.gen++; v.current.chain = Promise.resolve(); } // never kill the acknowledgment that is being prepared
      const gen = v.current.gen; v.current.asked = typed; v.current.answer = ''; v.current.mainStarted = false; v.current.speakTurn = true; setPhase('thinking');
      // the small model restates what was asked while the selected model thinks; dropped if the real answer gets there first
      if (spoken && v.current.cfg.ack && !v.current.speakerOff) {
        // Three stages. 1: the quick line, prepared during the pause when it could be, dropped only if the answer beat it.
        const stageOne = preparedAck ?? say(window.desktop.ack(typed)); enqueue(stageOne, gen, () => v.current.mainStarted);
        // 2: the understanding, worded from the context by the voice model, which is told what stage one said so it continues from it instead of
        // repeating it; said unless the turn is already over (the summary then covers it).
        if (typed.split(/\s+/).length >= 5) { const said = stageOne.then((s) => s?.text ?? '', () => ''); enqueue(say(said.then((s) => window.desktop.understand(typed, speaker.current.provider, speaker.current.model, main.current, recentRef.current, s))), gen, () => !v.current.running, 'response', undefined, 'understanding'); warmBridges(); }
        sayDeferred(gen);
      }
    }
    v.current.stopped = false;
    v.current.running = true; turnSteers.current = [];
    pinned.current = true; setRunning(true); setNote(''); setLiveText(''); setDraft(null);
    const imageBlocks = (images ?? []).map((i): Block => ({ type: 'image', src: `data:${i.mediaType};base64,${i.data}`, name: i.name }));
    if (!resend) { setMessages((m) => [...m, { uuid: `local-${Date.now()}`, role: 'user', blocks: [...(typed ? [{ type: 'text', text: typed } as Block] : []), ...imageBlocks], meta: false }]); toBottom();
    record('user', typed + (images?.length ? ` [${images.length} image${images.length > 1 ? 's' : ''} attached]` : '')); }
    lastSent.current = { text: typed, images, at: Date.now(), resent: resend, dictated }; /* for a turn the provider swallows (see the turn's end) */
    const prelude = migrate.current ? replayPrelude(prevProvider.current ?? provider) : ''; migrate.current = false; /* the first message after a move carries the whole conversation */
    await window.desktop.chatStart({ chatId: chatId.current, projectId: project.id, sessionId: sid.current, provider, permissions, ...(embed ? { hidden: true } : {}), ...(project.builtin === 'jauvex' ? { steward: true } : {}), text: embed ? `${embed.context()}${dictated ? DICTATED_TAG : ''}${typed}` : `${prelude}${dictated ? DICTATED_TAG : ''}${typed}`, /* a dictated message says so, every time (T-76) */ ...(images?.length ? { images } : {}), ...(model ? { model } : {}), ...(effort && efforts.includes(effort) ? { effort } : {}), ...(voiced ? { voice: true, vocabulary: stt(v.current.cfg).vocabulary } : {}) });
  };
  sendRef.current = send; if (embed) embed.bridge.send = (text) => void send(text);
  const answer = (requestId: string, d: PermissionDecision) => { setAsks((a) => a.filter((x) => x.requestId !== requestId)); void window.desktop.chatAnswer(chatId.current, requestId, d); };
  const earlier = async () => {
    if (!sid.current) return; const el = scroller.current; const prev = el?.scrollHeight ?? 0;
    const p = await api.messages(project.id, sid.current, start);
    setMessages((m) => [...p.messages, ...m]); setStart(p.start);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prev; });
  };
  const results = useMemo(() => { const m = new Map<string, Extract<Block, { type: 'tool_result' }>>(); for (const msg of messages) for (const b of msg.blocks) if (b.type === 'tool_result') m.set(b.toolUseId, b); return m; }, [messages]);
  // Written in the last two minutes, since this chat was opened, and not by a turn of this chat: someone else may be in the session.
  const busyElsewhere = !running && info != null && info.lastModified > mountedAt.current && info.lastModified > ownWrite.current + 5000 && Date.now() - info.lastModified < 120_000;

  return (
    <>
      {state === 'loading' ? <div className="empty"><Mark busy /><p>Loading conversation…</p></div>
        : state === 'error' ? <div className="empty"><h2>Could not load this session</h2><p>{err}</p></div>
        : <div className={voiceOn ? 'scroll under-orb' : 'scroll'} ref={scroller} onScroll={(e) => { const el = e.currentTarget; const gap = el.scrollHeight - el.scrollTop - el.clientHeight; const up = el.scrollTop < lastTop.current - 2; lastTop.current = el.scrollTop; if (gap < 80) pinned.current = true; else if (up) pinned.current = false; /* content growing under a pinned view is not the user leaving the bottom */ }}>
            <div className="thread">
              {start > 0 && <button className="earlier" onClick={() => void earlier()}>Load earlier messages ({start} more)</button>}
              {messages.length === 0 && !running && (embed ? <p className="jev-hint">Tell {PROVIDER_LABEL[provider]} what this agent should judge, by text or by voice. It sees the state, the questions and the last output, and it can rewrite them and run the evaluation.</p>
                : <div className="empty inline"><Mark /><h2>New {PROVIDER_LABEL[provider]} session in {project.name}</h2><p>{project.path}</p></div>)}
              {messages.map((m) => (m.voice && !cfg.showVoiceLines ? null : <Message key={m.uuid} m={m} showMeta={showMeta} results={results} base={project.path} />))}
              {liveText && <div className="assistant"><div className="prose" dangerouslySetInnerHTML={{ __html: md(liveText, project.path) }} /></div>}
              {asks.map((a) => (
                <div key={a.requestId} className="ask">
                  <div className="ask-head"><ShieldQuestion size={16} /><b>{a.toolName}</b><span>{toolHint(a.input)}</span></div>
                  <pre>{JSON.stringify(a.input, null, 2)}</pre>
                  <div className="ask-row"><button className="btn ghost" onClick={() => answer(a.requestId, 'deny')}>Deny</button><button className="btn ghost" onClick={() => answer(a.requestId, 'always')}>Always allow {a.toolName}</button><button className="btn" onClick={() => answer(a.requestId, 'allow')}>Allow once</button></div>
                </div>
              ))}
              {queued.some((q) => !q.shown) && <div className="user">{queued.map((q, i) => q.shown ? null : <div key={i} className="bubble queued" title="Goes to the main thread as soon as this turn ends"><small>Queued</small>{q.text}{q.images.length > 0 && <div className="queued-imgs">{q.images.map((a, j) => <img key={j} src={`data:${a.mediaType};base64,${a.data}`} alt={a.name} title={a.name} />)}</div>}<button className="steer-now" title="Hand it to the running turn now, without interrupting it" onClick={() => { queue.current.splice(i, 1); setQueued([...queue.current]); persistQueue(); void steer(q.text, q.images.length ? q.images : undefined); }}>Send now</button></div>)}</div>}
              {draft !== null && <div className="user"><div className="bubble draft" title="What is being heard. It becomes your message when you finish the thought."><small>Hearing you</small>{draft ? <DraftText text={draft} /> : <span className="draft-dots"><i /><i /><i /></span>}</div></div>}
              <div className="thread-end"><Mark busy={running} />{note && <span>{note}</span>}</div>
            </div>
          </div>}
      <Composer context={sid.current || ctx ? { usage: ctx, compacting, autoPct, hasSession: !!sid.current, last: lastCompact, onCompact: () => { if (!startCompactRef.current('manual')) setNote(v.current.running ? 'The conversation can be compacted once this turn is over.' : 'Nothing to compact yet: this session has no conversation.'); } } : undefined} draftKey={storeKey} signedIn={signedIn} usageTick={turns} usageModel={model || mainModel.current || ''} jev={jev} running={running} disabled={state !== 'ready'} provider={provider} onProvider={hybrid ? (running ? undefined : switchProvider) : !embed && !sessionId && !sid.current && messages.length === 0 && !running ? pickProvider : undefined}
        models={provider === 'codex' ? codexModels : CLAUDE_MODELS} model={model} onModel={(m) => { setModel(m); localStorage.setItem(modelKey(provider), m); keep({ model: m }); }}
        permissions={permissions} onPermissions={(p) => { setPermissions(p); localStorage.setItem('cvc.permissions', p); keep({ permissions: p }); }}
        efforts={efforts} effort={effort} onEffort={(e) => { setEffort(e); localStorage.setItem(effortKey(provider), e); keep({ effort: e }); }} onSend={(t, images) => void send(t, false, undefined, false, images)} onStop={() => { hush(); v.current.stopped = true; void window.desktop.chatStop(chatId.current); }}
        voice={{ muteIn, on: voiceOn, phase, status: vstatus, cfg, level, micMuted, speakerOff, toggle: () => void toggleVoice(), toggleMic, toggleSpeaker, hush, save: saveCfg, test: () => { if (v.current.engine) enqueue(say('This is the voice. If you hear this, the speaker is right.'), v.current.gen); } }}
        warning={busyElsewhere ? 'This session was active moments ago, possibly in another window. Writing here at the same time can tangle its history.' : ''} />
    </>
  );
}

/** What the voice said: not the session's own words, so it gets its own look, and it is typed at the pace it is spoken. */
function VoiceLine({ text, ms, cut }: { text: string; ms: number; cut: boolean }) {
  const [n, setN] = useState(0); const stop = useRef(false); stop.current = cut;
  useEffect(() => { const t0 = performance.now(); let raf = 0;
    const tick = () => { if (stop.current) return; const k = Math.min(text.length, Math.ceil(((performance.now() - t0) / Math.max(300, ms * 0.94)) * text.length)); setN(k); if (k < text.length) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [text, ms]);
  const typing = n < text.length && !cut;
  return <div className="voice-line"><span className="voice-tag"><AudioLines size={12} />Voice</span><p>{text.slice(0, n)}{typing ? <i className="caret" /> : n < text.length ? '…' : ''}</p></div>;
}

function Message({ m, showMeta, results, base }: { m: ChatMessage; showMeta: boolean; results: Map<string, Extract<Block, { type: 'tool_result' }>>; base: string }) {
  if (m.error) return <div className="chat-error" role="alert"><strong>{m.role === 'system' ? 'The turn failed' : 'The provider could not answer'}</strong><span>{m.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')}</span></div>;
  if (m.voice) return <VoiceLine text={m.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ')} ms={m.voice.ms} cut={Boolean(m.voice.cut)} />;
  if (m.meta) {
    if (!showMeta) return null;
    const text = m.blocks.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_result' ? `[result] ${b.text.slice(0, 400)}` : `[${b.type}]`)).join('\n');
    return <Fold label={m.role === 'system' ? 'System' : 'System event'} icon={<Eye size={13} />} body={text} />;
  }
  if (m.role === 'user' && m.blocks.some((x) => x.type === 'text' && x.text.replace(CONTEXT_TAG, '').trim().startsWith('(from the app)'))) { const note = m.blocks[0]?.type === 'text' ? m.blocks[0].text.replace(CONTEXT_TAG, '').trim().replace('(from the app) ', '') : ''; return <p className="app-note">{!note ? 'The app showed the trainer the result of the evaluation.' : note.length <= 240 ? note : `${note.slice(0, 240)}…`}</p>; }
  if (m.role === 'user') return <div className="user">{m.blocks.map((b, i) => { if (b.type !== 'text') return b.type === 'image' ? (b.src ? <img key={i} className="bubble-img" src={b.src} alt={b.name ?? 'image'} title={b.name} /> : <div key={i} className="bubble muted">[image]</div>) : null; const raw = b.text.replace(CONTEXT_TAG, '').trim(); if (!raw) return null; const from = /^\(from agent "([^"]+)"(?: \[[0-9a-f]*\])?\)\s*/.exec(raw); const text = from ? raw.slice(from[0].length) : raw; return <div key={i} className={from ? 'bubble agent-msg' : m.steered || m.stopped ? 'bubble steered' : 'bubble'} title={from ? `Sent by the agent "${from[1]}"${m.steered ? ', handed to the running turn' : ''}` : m.steered ? 'Handed to the running turn without interrupting it' : undefined}>{from ? <small>From {from[1]}</small> : m.stopped ? <small>Stopped the turn</small> : m.steered && <small>Sent mid-turn</small>}{text}</div>; })}</div>;
  return (
    <div className="assistant">
      {m.blocks.map((b, i) => {
        if (b.type === 'text') return <div key={i} className="prose" dangerouslySetInnerHTML={{ __html: md(b.text, base) }} />;
        if (b.type === 'thinking') return <Fold key={i} label="Thinking" icon={<Brain size={13} />} body={b.text} />;
        if (b.type === 'tool_use') { const r = results.get(b.id); return <Fold key={i} label={b.name} hint={toolHint(b.input)} icon={<Wrench size={13} />} error={r?.isError} body={`${JSON.stringify(b.input, null, 2)}${r ? `\n\n— result —\n${r.text}` : ''}`} />; }
        return null;
      })}
    </div>
  );
}
function toolHint(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  const v = o.description ?? o.command ?? o.file_path ?? o.pattern ?? o.query ?? o.url ?? o.prompt ?? '';
  return String(v).split('\n')[0]!.slice(0, 140);
}
function Fold({ label, hint, icon, body, error }: { label: string; hint?: string; icon: React.ReactNode; body: string; error?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fold${error ? ' err' : ''}`}>
      <button onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{icon}<b>{label}</b>{hint && <span>{hint}</span>}</button>
      {open && <pre>{body.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')}</pre>} {/* terminal colour codes in tool output would show as garbage */}
    </div>
  );
}

// The words being heard arrive in chunks (a transcript of the audio so far, every second or so). They are typed out, and when
// a newer transcript corrects earlier words only the part that changed is retyped.
function DraftText({ text }: { text: string }) {
  const [n, setN] = useState(0); const prev = useRef('');
  useEffect(() => { let keep = 0; while (keep < prev.current.length && keep < text.length && prev.current[keep] === text[keep]) keep++; prev.current = text; setN((cur) => Math.min(cur, keep));
    const timer = setInterval(() => setN((cur) => { if (cur >= text.length) { clearInterval(timer); return cur; } return Math.min(text.length, cur + 2); }), 16); return () => clearInterval(timer); }, [text]);
  return <>{text.slice(0, n)}<span className="draft-caret" /></>;
}
// Which speaker the voice comes out of. A screen recorder or a virtual audio device can leave the system default somewhere the
// user does not hear; here they pick the real one and try it.
/** The voice settings: under the orb of a chat, and in the main settings (Voice chat). They are one set for the whole app: a change in
 * either place reaches every open chat. */
function VoiceSettingsForm({ c, set, st, provider, models, onTest }: { c: VoiceSettings; set: (patch: Partial<VoiceSettings>) => void; st: VoiceStatus | null; provider: Provider; models: ModelOption[]; onTest?: () => void }) {
  const after = c.autoMute ? (c.autoMuteSec ?? 5) : 0; const idle = c.idleMuteSec ?? 0;
  return <>
          <label>Voice<select value={c.voice} onChange={(e) => set({ voice: e.target.value })}><option value="">System voice (same as `say`)</option>{(st?.voices ?? []).map((x) => { const [n, loc] = x.split('|'); return <option key={x} value={n}>{n} · {loc}</option>; })}</select></label>
          <label><span className="lhead">Speed<em>{c.rate} wpm</em></span><input type="range" min={140} max={260} step={5} value={c.rate} onChange={(e) => set({ rate: +e.target.value })} /></label>
          <label><span className="lhead">Pause that ends your turn<em>{(c.pauseMs / 1000).toFixed(1)} s</em></span><input type="range" min={400} max={2000} step={100} value={c.pauseMs} onChange={(e) => set({ pauseMs: +e.target.value })} /></label>
          <label>Spoken language<select value={c.language} onChange={(e) => set({ language: e.target.value })}>{[['auto', 'Detect'], ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span className="lhead">Transcription model (Whisper, on this Mac){st?.model ? <em>{st.model.replace(/^ggml-|\.bin$/g, '')}</em> : null}</span><select value={(st?.models ?? []).includes(c.sttModel) ? c.sttModel : ''} onChange={(e) => set({ sttModel: e.target.value })}><option value="">Automatic (the fastest one)</option>{(st?.models ?? []).map((m) => <option key={m} value={m}>{m.replace(/^ggml-|\.bin$/g, '')}</option>)}</select></label>
          <label>Names it should know<TextSetting value={c.vocabulary} placeholder="Jauvex, Codex, …" onSave={(x) => set({ vocabulary: x })} /></label>
          <label>Decisions (is the thought finished, is it a question, queue, stop or replace)<select value={c.decisions} onChange={(e) => set({ decisions: e.target.value as VoiceSettings['decisions'] })}><option value="jev">Jev, by TypeSafe, when its key is on this Mac</option><option value="model">Always the voice model</option></select></label>
          <p className="vnote">Deciding now: <b>{st?.jev ? 'Jev' : 'the voice model'}</b>{st?.jev ? ', with the voice model as backup.' : c.decisions === 'jev' && !st?.jevKey ? ' (no Jev key found on this Mac).' : '.'}</p>
          <OutputPicker value={c.output ?? ''} onChange={(id) => set({ output: id })} onTest={onTest} />
          <label className="check"><input type="checkbox" checked={c.wakeOn !== false} onChange={(e) => set({ wakeOn: e.target.checked })} />Wake phrase: said while muted, it turns the microphone back on</label>
    {c.wakeOn !== false && <label><TextSetting value={c.wakePhrase ?? ''} placeholder="Hey Jauvex" onSave={(x) => set({ wakePhrase: x.trim() })} /></label>}
          <label><span className="lhead">Mute after each message<em>{after ? `${after} s` : 'off'}</em></span><input type="range" min={0} max={20} step={1} value={after} onChange={(e) => { const n = +e.target.value; set(n < 2 ? { autoMute: false } : { autoMute: true, autoMuteSec: n }); }} /></label>
          <label><span className="lhead">Mute when idle<em>{idle ? (idle >= 60 ? '1 min' : `${idle} s`) : 'off'}</em></span><input type="range" min={0} max={60} step={5} value={idle} onChange={(e) => set({ idleMuteSec: +e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={c.showVoiceLines} onChange={(e) => set({ showVoiceLines: e.target.checked })} />Show what the voice says in the thread</label>
          <label className="check"><input type="checkbox" checked={c.ack} onChange={(e) => set({ ack: e.target.checked })} />Acknowledge while thinking</label>
          <VoiceModelPick provider={provider} value={provider === 'codex' ? c.codexAckModel : c.ackModel} options={provider === 'codex' ? (st?.voiceModels.codex.length ? st.voiceModels.codex : models.map((m) => ({ id: m.id, label: m.label }))) : st?.voiceModels.claude ?? []} onChange={(id) => set(provider === 'codex' ? { codexAckModel: id } : { ackModel: id })} />
  </>;
}
/** The main settings' Voice chat section: the same form, on the saved settings, told to every open chat. */
/** A text setting that saves as it is typed (after a short pause) and when it goes away: the settings under the orb close as soon as
 * the pointer leaves them, before the box loses focus, and a wake phrase typed there ("Hakuna Matata") was never saved. */
function TextSetting({ value, placeholder, onSave }: { value: string; placeholder?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value); const saved = useRef(value); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const save = useRef(onSave); save.current = onSave;
  const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } setV((cur) => { if (cur !== saved.current) { saved.current = cur; save.current(cur); } return cur; }); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (latest.current !== saved.current) save.current(latest.current); }, []); // closed while typing: the text still counts
  const latest = useRef(value); latest.current = v;
  return <input type="text" value={v} placeholder={placeholder} spellCheck={false} onChange={(e) => { setV(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, 600); }} onBlur={flush} onKeyDown={(e) => { if (e.key === 'Enter') flush(); }} />;
}
function VoiceChatSettings({ provider }: { provider: Provider }) {
  const [c, setC] = useState<VoiceSettings | null>(null); const [st, setSt] = useState<VoiceStatus | null>(null);
  useEffect(() => { void api.state().then((s) => setC({ ...VOICE_DEFAULTS, ...(s.ui?.voice ?? {}) })); void window.desktop.voiceStatus().then(setSt).catch(() => {}); }, []);
  if (!c) return null;
  const set = (patch: Partial<VoiceSettings>) => { const next = { ...c, ...patch }; setC(next); void api.setUi({ voice: next }); window.dispatchEvent(new CustomEvent('cvc-voice-settings', { detail: { cfg: next, from: '' } }));
    if (next.sttModel !== c.sttModel || next.vocabulary !== c.vocabulary) void window.desktop.sttConfig(next.sttModel, next.vocabulary); if (next.decisions !== c.decisions) void window.desktop.decisions(next.decisions === 'jev').then(setSt); };
  return <section className="settings-group vsettings-main"><strong>Voice chat</strong><VoiceSettingsForm c={c} set={set} st={st} provider={provider} models={[]} /></section>;
}
function OutputPicker({ value, onChange, onTest }: { value: string; onChange: (id: string) => void; onTest?: () => void }) {
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { let alive = true; const load = () => void navigator.mediaDevices.enumerateDevices().then((all) => { if (alive) setDevices(all.filter((d) => d.kind === 'audiooutput').map((d) => ({ id: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}` }))); }).catch(() => {}); load(); navigator.mediaDevices.addEventListener('devicechange', load); return () => { alive = false; navigator.mediaDevices.removeEventListener('devicechange', load); }; }, []);
  return <label>Speaker (where the voice comes out)<span className="row-inline"><select value={devices.some((d) => d.id === value) ? value : ''} onChange={(e) => onChange(e.target.value)}><option value="">System default</option>{devices.filter((d) => d.id !== 'default').map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>{onTest && <button type="button" className="mini-btn" onClick={onTest} title="Say a short line through the selected speaker">Test</button>}</span></label>;
}
type VoiceUi = { muteIn: number | null; test: () => void; on: boolean; phase: VoicePhase; status: VoiceStatus | null; cfg: VoiceSettings; level: React.RefObject<number>; micMuted: boolean; speakerOff: boolean; toggle: () => void; toggleMic: () => void; toggleSpeaker: () => void; hush: () => void; save: (c: VoiceSettings) => void };
const PHASE_LABEL: Record<VoicePhase, string> = { off: '', listening: 'Listening', hearing: 'Hearing you', transcribing: 'Transcribing', thinking: 'Thinking', wording: 'Preparing the reply', speaking: 'Speaking' };

/** The controller from ChatGPT's voice mode: mic | orb | speaker in one pill. Shared by the app and the floating window. */
export function VoicePill({ level, phase, micMuted, speakerOff, onMic, onOrb, onSpeaker, orbTitle, muteIn = null }: { level: React.RefObject<number>; phase: VoicePhase; micMuted: boolean; speakerOff: boolean; onMic: () => void; onOrb: () => void; onSpeaker: () => void; orbTitle: string; muteIn?: number | null }) {
  return (
    <div className="pill">
      <button className={`${micMuted ? 'muted' : ''}${muteIn != null ? ' counting' : ''}`} title={muteIn != null ? `Muting in ${muteIn} s (click to mute now)` : micMuted ? 'Unmute microphone' : 'Mute microphone'} onClick={onMic}>{micMuted ? <MicOff size={18} /> : <Mic size={18} />}{muteIn != null && <span className="mute-count" key={muteIn}>{muteIn}</span>}</button>
      <i />
      <button className="pill-orb" title={orbTitle} onClick={onOrb}><Orb size={30} level={level} phase={phase} mute={micMuted} silent={speakerOff} /></button>
      <i />
      <button className={speakerOff ? 'muted' : ''} title={speakerOff ? 'Turn the voice back on' : 'Silence the voice'} onClick={onSpeaker}>{speakerOff ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
    </div>
  );
}

function Composer({ context, draftKey, signedIn, usageTick, usageModel, jev, permissions, onPermissions, running, disabled, provider, onProvider, models, model, onModel, efforts, effort, onEffort, onSend, onStop, warning, voice }: { context?: { usage: ContextUsage | null; compacting: boolean; autoPct: number; hasSession: boolean; last: LastCompact | null; onCompact: () => void }; draftKey?: string; signedIn?: Record<Provider, boolean>; usageTick: number; usageModel: string; jev?: () => void; permissions: Permissions; onPermissions: (p: Permissions) => void; running: boolean; disabled: boolean; provider: Provider; onProvider?: (p: Provider) => void; models: ModelOption[]; model: string; onModel: (v: string) => void; efforts: string[]; effort: string; onEffort: (v: string) => void; onSend: (text: string, images?: Attachment[]) => void; onStop: () => void; warning: string; voice: VoiceUi }) {
  const dKey = draftKey ? `cvc.draft.${draftKey}` : ''; const [text, setTextState] = useState(() => (dKey ? localStorage.getItem(dKey) ?? '' : ''));
  const setText = (t: string) => { setTextState(t); if (dKey) { try { if (t) localStorage.setItem(dKey, t); else localStorage.removeItem(dKey); } catch { /* nothing */ } } }; // typed but not sent: kept across a reload
  const [settings, setSettings] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(220, el.scrollHeight)}px`; } }, [text]);
  useEffect(() => { ta.current?.focus(); }, []);
  // Images: pasted (a screenshot from the clipboard), dropped on the composer, or picked with the clip. Shown as thumbnails until sent.
  const [files, setFiles] = useState<(Attachment & { src: string })[]>([]); const [over, setOver] = useState(false);
  const addFiles = (list: File[]) => { const imgs = list.filter((f) => /^image\/(png|jpe?g|gif|webp)$/.test(f.type)); if (!imgs.length) return;
    void Promise.all(imgs.map((f) => new Promise<Attachment & { src: string }>((res, rej) => { const r = new FileReader(); r.onload = () => { const src = String(r.result); res({ name: f.name || 'pasted image', mediaType: f.type, data: src.slice(src.indexOf(',') + 1), src }); }; r.onerror = () => rej(r.error); r.readAsDataURL(f); }))).then((got) => setFiles((x) => [...x, ...got])); };
  const submit = () => { if ((!text.trim() && !files.length) || disabled) return; onSend(text, files.length ? files.map(({ src: _src, ...a }) => a) : undefined); setText(''); setFiles([]); }; // while a turn runs, this queues the message
  const st = voice.status; const c = voice.cfg; const set = (patch: Partial<VoiceSettings>) => voice.save({ ...c, ...patch });
  return (
    <div className="composer-wrap">
      {warning && <p className="composer-warn">{warning}</p>}
      {voice.on && (
        <div className="voice-dock">
          <button className="orb-btn" title="Tap to make it stop talking" onClick={voice.hush}><Orb size={132} level={voice.level} phase={voice.phase} mute={voice.micMuted} silent={voice.speakerOff} /></button>
          <p className="dock-phase">{st && st.whisper !== 'ready' ? (st.whisper === 'starting' ? 'Loading Whisper…' : st.detail) : voice.micMuted ? 'Muted' : PHASE_LABEL[voice.phase]}</p>
        </div>
      )}
      {voice.on && (
        <div className="voice-controls">
          <button className="round" title="End voice chat" onClick={voice.toggle}><X size={18} /></button>
          <VoicePill muteIn={voice.muteIn} level={voice.level} phase={voice.phase} micMuted={voice.micMuted} speakerOff={voice.speakerOff} onMic={voice.toggleMic} onOrb={voice.hush} onSpeaker={voice.toggleSpeaker} orbTitle="Stop talking" />
          <button className="round" title="Voice settings" onClick={() => setSettings((x) => !x)}><Settings2 size={17} /></button>
          {settings && (
            <div className="vsettings" onMouseLeave={() => setSettings(false)}>
              <VoiceSettingsForm c={c} set={set} st={st} provider={provider} models={models} onTest={() => voice.test()} />
            </div>
          )}
        </div>
      )}
      <div className={`composer${disabled ? ' off' : ''}${over ? ' drop' : ''}`} onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}>
        {files.length > 0 && <div className="attach-row">{files.map((f, i) => <div key={i} className="attach" title={f.name}><img src={f.src} alt={f.name} /><button title="Remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X size={11} /></button></div>)}</div>}
        <textarea ref={ta} rows={1} value={text} disabled={disabled} onPaste={(e) => { const fs = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f); if (fs.length) { e.preventDefault(); addFiles(fs); } }} placeholder={voice.on ? 'Talk, or type here' : running ? `${PROVIDER_LABEL[provider]} is working… Enter queues your next message` : 'Type a message'} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
        {running && <button className="send stop" title="Stop" onClick={onStop}><Square size={13} fill="currentColor" /></button>}
        {!running && (text.trim() || files.length > 0) && <button className="send" title="Send" disabled={disabled} onClick={submit}><ArrowUp size={16} /></button>}
        {!voice.on && !(text.trim() || files.length > 0) && <button className="voice-start" title="Start voice chat" disabled={disabled} onClick={voice.toggle}><AudioLines size={16} /></button>} {/* also while a turn runs: voice can join the work in progress */}
      </div>
      <div className="composer-row"><button className="icon-btn sm" title="Attach images (or paste, or drop them here)" disabled={disabled} onClick={() => void window.desktop.pickImages().then((got) => { if (got.length) setFiles((x) => [...x, ...got.map((a) => ({ ...a, src: `data:${a.mediaType};base64,${a.data}` }))]); })}><Paperclip size={16} /></button>
        <select className="model" value={permissions} onChange={(e) => onPermissions(e.target.value as Permissions)} title={provider === 'codex' ? "Ask: you approve what Codex's sandbox will not allow. Auto: Codex's automatic reviewer decides." : 'Ask: you approve each tool that needs permission. Auto: Claude\'s permission classifier decides.'}><option value="ask">Ask permission</option><option value="auto">Auto permissions</option></select>
        <span className="grow" />
        {context && <ContextMeter {...context} provider={provider} running={running} />}
        <UsageBattery provider={provider} model={usageModel} tick={usageTick} others={PROVIDERS.filter((p) => p !== provider && signedIn?.[p] !== false)} />
        {onProvider ? <select className="model" value={provider} onChange={(e) => (e.target.value === 'jev' ? jev?.() : onProvider(e.target.value as Provider))} title="Who answers in this session. Fixed once the session starts. Jev is not a chat: it opens an agent (state, questions, output).">{PROVIDERS.map((p) => <option key={p} value={p} disabled={p !== provider && signedIn?.[p] === false}>{PROVIDER_LABEL[p]}{p !== provider && signedIn?.[p] === false ? ' (not signed in)' : ''}</option>)}{jev && <option value="jev">Jev agent</option>}</select>
          : <span title="A session stays with the provider it started with">{PROVIDER_LABEL[provider]}</span>}
        <select className="model" value={models.some((m) => m.id === model) ? model : ''} onChange={(e) => onModel(e.target.value)} title="Model for the next message"><option value="">Default model</option>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        {efforts.length > 0 && <select className="model" value={efforts.includes(effort) ? effort : ''} onChange={(e) => onEffort(e.target.value)} title="How hard the model thinks, from the next message on"><option value="">Default effort</option>{efforts.map((e) => <option key={e} value={e}>{EFFORT_LABEL[e] ?? e} effort</option>)}</select>}
      </div>
    </div>
  );
}

/** The floating controller: shown by the main process while voice is on and the app is in the background. */
export function Mini() {
  const [st, setSt] = useState({ on: false, phase: 'off' as VoicePhase, micMuted: false, speakerOff: false });
  const level = useRef(0);
  // The typing box: the keyboard button slides an input open (the bar grows with it); Enter sends the text to the listening session
  // the way its composer would, without talking and without bringing the app forward; Escape or leaving the box closes it.
  const [typing, setTyping] = useState(false); const [text, setText] = useState(''); const box = useRef<HTMLInputElement>(null);
  const BAR = 268, BOX = 230;
  const openBox = () => { window.desktop.miniSize(BAR + BOX); setTyping(true); setTimeout(() => box.current?.focus(), 60); };
  const closeBox = () => { setTyping(false); setText(''); window.desktop.miniSize(BAR); };
  const submit = () => { const t = text.trim(); if (t) window.desktop.voiceType(t); closeBox(); };
  useEffect(() => window.desktop.onVoiceState((m) => { level.current = m.level; setSt((cur) => (cur.on === m.on && cur.phase === m.phase && cur.micMuted === m.micMuted && cur.speakerOff === m.speakerOff ? cur : { on: m.on, phase: m.phase as VoicePhase, micMuted: m.micMuted, speakerOff: m.speakerOff })); }), []);
  return (
    <div className="mini">
      {/* The move handle: it appears when the bar is hovered (the bar never takes focus), and dragging it moves the bar; nothing else drags. */}
      <span className="mini-move" title="Drag to move" onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); window.desktop.miniDrag(true); }} onPointerUp={() => window.desktop.miniDrag(false)} onPointerCancel={() => window.desktop.miniDrag(false)} onLostPointerCapture={() => window.desktop.miniDrag(false)}><Move size={14} /></span>
      <button className={`round${typing ? ' on' : ''}`} title={typing ? 'Close the typing box' : 'Type to this session instead of talking'} onClick={() => (typing ? closeBox() : openBox())}><Keyboard size={17} /></button>
      <span className={`mini-type${typing ? ' open' : ''}`}><input ref={box} value={text} placeholder="Type to the session…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } else if (e.key === 'Escape') closeBox(); }} onBlur={() => setTimeout(() => { if (document.activeElement !== box.current) closeBox(); }, 120)} /></span>
      <VoicePill level={level} phase={st.phase} micMuted={st.micMuted} speakerOff={st.speakerOff} onMic={() => window.desktop.voiceCmd('mic')} onOrb={() => window.desktop.voiceCmd('focus')} onSpeaker={() => window.desktop.voiceCmd('speaker')} orbTitle="Back to the app" />
    </div>
  );
}

/** The app's own settings (the wheel in the sidebar's footer). Voice settings stay with the voice; accounts with the accounts panel. */
function SettingsPanel({ signedIn, welcomeNext, onWelcomeNext, onOpenWelcome, defaultProvider, onDefaultProvider, showJauvex, onShowJauvex, jauvexMove, onJauvexMove, autoCompact, onAutoCompact, onClose }: { autoCompact: number; onAutoCompact: (pct: number) => void; signedIn: Record<Provider, boolean>; welcomeNext: boolean; onWelcomeNext: (on: boolean) => void; onOpenWelcome: () => void; defaultProvider: Provider | null; onDefaultProvider: (p: Provider) => void; showJauvex: boolean; onShowJauvex: (on: boolean) => void; jauvexMove: 'unified' | 'handoff'; onJauvexMove: (m: 'unified' | 'handoff') => void; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings" role="dialog" aria-label="Jauvex settings" onClick={(e) => e.stopPropagation()}>
        <h2>Jauvex settings</h2>
        <p className="muted">Accounts are in the Jauvex button below the sidebar. The voice settings are here and under the orb of any session: one set for the whole app.</p>
        <section className="settings-group">
          <strong>Default agent</strong>
          <label className="check">New sessions and the Jauvex agent start with<select className="model" value={defaultProvider ?? ''} onChange={(e) => onDefaultProvider(e.target.value as Provider)}><option value="" disabled>Not chosen yet</option>{PROVIDERS.map((p) => <option key={p} value={p} disabled={signedIn?.[p] === false}>{PROVIDER_LABEL[p]}{signedIn?.[p] === false ? ' (not signed in)' : ''}</option>)}</select></label>
        </section>
        <section className="settings-group">
          <strong>Jauvex agent</strong>
          <label className="check"><input type="checkbox" checked={showJauvex} onChange={(e) => onShowJauvex(e.target.checked)} />Show it at the top of the sidebar (hidden, it still exists and still answers other agents)</label>
          <label className="check stack">When it moves to the other provider<select className="model" value={jauvexMove} onChange={(e) => onJauvexMove(e.target.value as 'unified' | 'handoff')}><option value="unified">Unified (experimental): the app replays the whole conversation</option><option value="handoff">Handover: the leaving agent writes a note, the next starts from it</option></select></label>
        </section>
        <section className="settings-group">
          <strong>Context</strong>
          <label className="check stack">Compact an agent's conversation by itself when its context is this full<select className="model" value={autoCompact} onChange={(e) => onAutoCompact(Number(e.target.value))}>{AUTO_COMPACT_CHOICES.map((p) => <option key={p} value={p}>{p} %{p === AUTO_COMPACT_DEFAULT ? ' (default)' : ''}</option>)}{![0, ...AUTO_COMPACT_CHOICES].includes(autoCompact) && <option value={autoCompact}>{autoCompact} %</option>}<option value={0}>Leave it to the provider (Claude near the limit, Codex at about 95 %)</option></select></label>
          <p className="muted">The pile of sheets next to each composer shows how full that agent's context is: click it for the numbers and to compact now. Compacting replaces the conversation so far with a summary. It also happens at once when a message does not fit, and that message is then sent again.</p>
        </section>
        <VoiceChatSettings provider={defaultProvider ?? 'claude'} />
        <section className="settings-group">
          <strong>Welcome screen</strong>
          <label className="check"><input type="checkbox" checked={welcomeNext} onChange={(e) => onWelcomeNext(e.target.checked)} />Show it again on the next start</label>
          <div className="row-btns"><button onClick={onOpenWelcome}>Open it now</button></div>
        </section>
        <section className="settings-group danger">
          <strong>Danger zone</strong>
          <p>Reset the app to its initial state: the sidebar's folders and sessions (the sessions stay in Claude and Codex), the Jauvex agent's conversation and every setting. Cannot be undone; the app exits.</p>
          <div className="row-btns"><button className="btn-danger" onClick={() => void window.desktop.appReset()}>Reset the app…</button></div>
        </section>
        <div className="modal-foot"><span className="app-version">Jauvex Personal {__APP_VERSION__}</span><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/** The voice's model for a provider: the live list, "Automatic (the smallest)" by default, and the one really in use (a chosen id that is gone falls back to the smallest). */
function VoiceModelPick({ provider, value, options, onChange }: { provider: Provider; value: string; options: { id: string; label: string; resolved?: string }[]; onChange: (id: string) => void }) {
  const [inUse, setInUse] = useState(''); const [list, setList] = useState(options);
  useEffect(() => { let alive = true; void window.desktop.voiceModelInUse(provider, value).then((m) => { if (alive) setInUse(m); }).catch(() => {}); return () => { alive = false; }; }, [provider, value, list]);
  // The live list can still be on its way when the panel opens (it is asked once per run): keep looking for it a few seconds.
  useEffect(() => { if (options.length) { setList(options); return; } let alive = true; let tries = 0; const look = () => { void window.desktop.voiceStatus().then((st) => { if (!alive) return; const l = st.voiceModels[provider]; if (l.length) setList(l); else if (tries++ < 14) setTimeout(look, 700); }).catch(() => {}); }; look(); return () => { alive = false; }; }, [provider, options]);
  const shown = list.find((o) => o.id === value)?.id ?? list.find((o) => o.resolved === value)?.id ?? ''; const known = !!shown; /* a saved wire id (claude-sonnet-5) shows as the alias that stands for it (sonnet), so the selector never claims automatic while Sonnet is in use */
  return <label>Voice model for {PROVIDER_LABEL[provider]} sessions (acknowledges, then says what happened)<em>in use: {inUse ? (list.find((o) => o.id === inUse) ?? list.find((o) => o.resolved === inUse))?.label ?? inUse : '…'}</em>
    <select value={shown} onChange={(e) => onChange(e.target.value)}><option value="">Automatic (the smallest{list.length ? '' : ', list loading'})</option>{list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}{value && !known && list.length > 0 && <option value={value} disabled>{value} (not offered any more: automatic is used)</option>}</select></label>;
}
