import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { BOARD_FORMAT, doneFileOf, parseBoard, type Board, type BoardItem, type BoardSection } from '../../shared/board';
import { BOARDS_FORMAT_TEXT, PROVIDER_LABEL, type Project, type Provider } from '../../shared/types';
import type { EmbeddedMail } from './WorkflowView';
import { Chat, type ChatEmbed } from './App';
import { t } from '../../shared/i18n';

// A board (T-171), drawn from its markdown files, always the same way: one column per section, one card per task, the glyph as its status.
// Clicking a glyph moves the task on (to do → doing → done) by rewriting the files: done, it leaves the board for the top of its done file
// (boards format v1, T-174); clicking the glyph of a done one reopens it at the top of the first section. Clicking a card shows its text.
// The done tasks (the done file's) show as a last column once "Show done" is ticked. Agents edit the files too: read again every few seconds.
// Two views (T-180): a column per section (P0, P1, P2...), or a kanban, a lane per status (to do, doing, done with Show done), each card
// tagged with its section; the one chosen is remembered on this computer.
const prio = (s: BoardSection) => (/^P0/.test(s.title) ? 'p0' : /^P1/.test(s.title) ? 'p1' : /^P2/.test(s.title) ? 'p2' : /^Done/i.test(s.title) ? 'done' : 'other');
const NEXT: Record<BoardItem['status'], BoardItem['status']> = { todo: 'doing', doing: 'done', done: 'todo' };
const shipped = (b: string) => { const m = /(?:shipped\s+)?(\d{4}-\d{2}-\d{2})(?:\s*\(([^)]*)\))?\s*$/.exec(b); return m ? { body: b.slice(0, m.index).replace(/\s*[—-]\s*$/, ''), date: m[1]!, refs: m[2] ?? '' } : { body: b, date: '', refs: '' }; };
const inline = (t: string): ReactNode => t.split(/(`[^`]+`)/g).map((part, i) => (part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part));
type Where = 'board' | 'done';
/** A card and the file its line is in; tag: its section, on a kanban lane. */
type Card = { item: BoardItem; where: Where; tag?: BoardSection };
type View = 'sections' | 'kanban';
const VIEW_KEY = 'cvc.board.view';
const isDone = (s: BoardSection) => /^Done/i.test(s.title);
const shortTitle = (s: BoardSection) => s.title.replace(/\s*[—(].*$/, '');

export function BoardView({ project, file, onChanged, chatProvider = 'claude', active = true, showMeta = false, mail }: { mail?: EmbeddedMail /* its chat writes to other agents and hears back (T-205) */; project: Project; file: string; onChanged?: () => void /* the sidebar's counts */; chatProvider?: Provider; active?: boolean; showMeta?: boolean }) {
  const [files, setFiles] = useState({ md: '', done: '' }); const [loaded, setLoaded] = useState(false);
  const [showDone, setShowDone] = useState(() => localStorage.getItem(`cvc.board.done.${project.id}:${file}`) === '1');
  const [openKey, setOpenKey] = useState<string | null>(null); const [note, setNote] = useState('');
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'sections'; } catch { return 'sections'; } });
  const pick = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* remembered for this window only */ } };
  const load = useCallback(async () => { try { setFiles(await api.board(project.id, file)); setLoaded(true); } catch { /* gone */ } }, [project.id, file]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);
  const board: Board = useMemo(() => parseBoard(files.md), [files.md]); const doneBoard: Board = useMemo(() => parseBoard(files.done), [files.done]);
  const shippedItems = doneBoard.sections.flatMap((s) => s.items); const onBoard = board.sections.flatMap((s) => s.items);
  const total = onBoard.length + shippedItems.length; const done = onBoard.filter((i) => i.status === 'done').length + shippedItems.length;
  const newer = board.version > BOARD_FORMAT || doneBoard.version > BOARD_FORMAT; // a format this app does not know: shown, never rewritten (T-173)
  const move = async (item: BoardItem, where: Where) => { if (newer) return; try { setFiles(await api.boardSet(project.id, file, item.line, NEXT[item.status], where, item.id)); setNote(''); onChanged?.(); } catch (e) { setNote((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } };
  const toggleDone = (v: boolean) => { setShowDone(v); try { localStorage.setItem(`cvc.board.done.${project.id}:${file}`, v ? '1' : '0'); } catch { /* nothing */ } };
  const card = ({ item, where, tag }: Card) => { const sh = item.status === 'done' ? shipped(item.body) : { body: item.body, date: '', refs: '' }; const key = `${where}:${item.line}`; return (
    <article key={key} className={`card ${item.status}${openKey === key ? ' open' : ''}`} onClick={() => setOpenKey((k) => (k === key ? null : key))}>
      <div className="head">{tag && <span className={`board-tag ${prio(tag)}`}>{shortTitle(tag)}</span>}<button className="glyph" disabled={newer} title={newer ? t('board.card.glyph.newer') : item.status === 'done' ? t('board.card.glyph.done') : item.status === 'todo' ? t('board.card.glyph.todo') : t('board.card.glyph.doing')} onClick={(e) => { e.stopPropagation(); void move(item, where); }} />{item.id && <span className="id">{item.id}</span>}<span className="ttl">{item.title}</span>{sh.date && <span className="when">{sh.date}</span>}</div>
      {openKey === key && sh.body && <p className="body">{inline(sh.body)}{sh.refs && <span className="refs"> ({sh.refs})</span>}</p>}
    </article>); };
  const lane = (status: BoardItem['status']): Card[] => board.sections.filter((s) => !isDone(s) || status === 'done').flatMap((s) => s.items.filter((i) => i.status === status).map((item): Card => ({ item, where: 'board', tag: s })));
  const doneCards: Card[] = shippedItems.map((item) => ({ item, where: 'done' }));
  const doneCol = { title: t('board.col.done'), note: '', cls: 'done done-file', count: String(doneCards.length + (view === 'kanban' ? lane('done').length : 0)), cards: view === 'kanban' ? [...lane('done'), ...doneCards] : doneCards };
  const cols = view === 'kanban'
    ? [{ title: t('board.col.todo'), note: '', cls: 'lane-todo', count: String(lane('todo').length), cards: lane('todo') }, { title: t('board.col.doing'), note: '', cls: 'lane-doing', count: String(lane('doing').length), cards: lane('doing') }, ...(showDone ? [doneCol] : [])]
    : [...board.sections.filter((s) => showDone || !isDone(s)).map((s) => ({ title: s.title, note: s.note, cls: prio(s), count: `${s.items.filter((i) => i.status === 'done').length}/${s.items.length}`, cards: s.items.map((item): Card => ({ item, where: 'board' })) })), ...(showDone ? [doneCol] : [])];
  // The chat under the board (T-199): a session of its own in the folder, told on every message what the board is now; it edits the board's
  // files and the board redraws from them. Its session is kept in the app's state for this board, never written into the folder.
  const [chat, setChat] = useState<{ provider?: Provider; sessionId?: string | null } | null>(null);
  useEffect(() => { let gone = false; void api.boardChat(project.id, file).then((c) => { if (!gone) setChat(c); }).catch(() => { if (!gone) setChat((cur) => cur ?? {}); }); return () => { gone = true; }; }, [project.id, file]);
  const bridge = useRef<{ send?: (text: string) => void }>({}); const live = useRef(files); live.current = files; const changed = useRef(onChanged); changed.current = onChanged;
  const provider: Provider = chat?.provider ?? chatProvider;
  const redraw = () => { void load(); changed.current?.(); };
  const embed: ChatEmbed = useMemo(() => ({ provider, bridge: bridge.current,
    hint: t('board.chat.hint', { provider: PROVIDER_LABEL[provider] }),
    // the board goes along, unless it is long: then the chat is told to read the file (it has it), not sent a hundred kilobytes a message
    context: () => { const md = live.current.md; const now = md.length <= 30_000 ? `The board now (${file}):\n\`\`\`md\n${md}\n\`\`\`` : `The board is long (${Math.round(md.length / 1000)} KB): read ${file} before you answer.`;
      return `<board-context>\nYou are the assistant of one board of this folder (${project.path}): the file ${file}, its finished items in ${doneFileOf(file)}. The user talks to you about it, by text or by voice: to add work, take it, move it on, finish or reopen it, or plan from it. Change the board by editing its files directly: the view draws the board from them as you save. ${BOARDS_FORMAT_TEXT}\n${now}\n</board-context>\n\n`; },
    onReply: () => redraw(),
  }), [provider, project.path, file]); // eslint-disable-line react-hooks/exhaustive-deps
  // Its chat writes to other agents and hears back, as any chat (T-205): the window's router knows it by its session, as "<title> board".
  const inView = useRef<((text: string, replyTo?: never) => Promise<void>) | null>(null); const chatSid = useRef<string | null>(null); chatSid.current = chat?.sessionId ?? null;
  const chatName = `${(board.title || file.replace(/^boards\//, '').replace(/\.md$/, '')).replace(/\s+board$/i, '')} board`;
  useEffect(() => { const sid = chat?.sessionId; if (!mail || !sid) return;
    return mail.register(project.id, sid, chatName, provider, async (t, r) => { for (let i = 0; i < 40 && !inView.current; i++) await new Promise((res) => setTimeout(res, 100)); await inView.current?.(t, r as never); }); }, [mail, chat?.sessionId, project.id, chatName, provider]);
  if (!loaded) return <div className="board-view"><p className="muted" style={{ padding: 28 }}>{t('board.opening')}</p></div>;
  return (
    <div className="board-wrap">
    <div className="board-view">
      <div className="board-head"><div><h1>{board.title}</h1><p>{t('board.head.counts', { count: total, done })} · {file}{files.done ? ` · ${doneFileOf(file)}` : ''}</p></div><span className="sp" /><div className="bar" title={t('board.head.bar', { done, total })}><i style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div><span className="board-seg" role="tablist">{(['sections', 'kanban'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} title={v === 'sections' ? t('board.view.sectionsTitle') : t('board.view.kanbanTitle')} onClick={() => pick(v)}>{v === 'sections' ? t('board.view.sections') : t('board.view.kanban')}</button>)}</span><label className="check"><input type="checkbox" checked={showDone} onChange={(e) => toggleDone(e.target.checked)} /> {t('board.showDone')}</label></div>
      {newer && <p className="board-newer">{t('board.newer', { version: Math.max(board.version, doneBoard.version), known: BOARD_FORMAT })}</p>}
      {note && <p className="board-newer">{note}</p>}
      <div className="board">
        {cols.map((c, ci) => (
          <section key={`${view}:${ci}`} className={`bcol ${c.cls}`}>
            <header><h2>{c.title}</h2><span className="count">{c.count}</span></header>
            {c.note && <p className="note">{inline(c.note)}</p>}
            <div className="cards">{c.cards.length === 0 && <p className="empty">{c.cls === doneCol.cls || c.title === 'Done' ? t('board.col.emptyDone') : t('board.col.empty')}</p>}{c.cards.map(card)}</div>
          </section>))}
      </div>
    </div>
    {chat && <div className="jev-chat board-chat"><header><b>{t('board.chat.title')}</b><span>{t('board.chat.sub', { provider: PROVIDER_LABEL[provider] })}</span></header>
      <Chat embed={embed} project={project} sessionId={chat.provider === provider ? chat.sessionId ?? null : null} active={active} info={null} showMeta={showMeta} onBusy={() => {}} onTurnEnd={redraw} onNew={() => {}}
        onBridge={(b) => { inView.current = b ? (t, r) => b.deliver(t, r) : null; }} onReply={(text, replyTo) => { const sid = chatSid.current; if (sid && mail) mail.reply(project.id, sid, chatName, text, replyTo); }}
        onSession={(sid) => { const next = { provider, sessionId: sid }; setChat(next); void api.setBoardChat(project.id, file, next); }} /></div>}
    </div>
  );
}
