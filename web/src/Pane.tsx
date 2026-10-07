import { createElement, useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { FileView } from '../../shared/types';
import { md } from './md';
import { t } from '../../shared/i18n';

// The right pane: where a file or a link an agent shows is opened, instead of the whole window sailing off to it (a
// handoff link once took the window over, with no way back). Files come through the main process (text, markdown,
// images as data), pages and PDFs in a <webview> of their own, muted from the start. Later: terminals, browsers.
/** key: what a view shows, for the view that drew it to tell whether the pane still shows it (a workflow's step, drawn again as its run moves on). */
export type PaneTarget = { kind: 'file'; path: string } | { kind: 'url'; url: string } | { kind: 'view'; title: string; node: React.ReactNode; key?: string };
const dirOf = (p: string) => p.replace(/\/[^/]*$/, '');
/** A web page's Markdown as HTML, its relative links and pictures made whole against the page's address. */
const webMd = (text: string, url: string): string => { const doc = new DOMParser().parseFromString(md(text, '', url), 'text/html');
  for (const [sel, attr] of [['a[href]', 'href'], ['img[src]', 'src']] as const) for (const el of doc.querySelectorAll(sel)) { const v = el.getAttribute(attr) ?? ''; if (v && !v.startsWith('#')) try { el.setAttribute(attr, new URL(v, url).href); } catch { /* left as it is */ } }
  return doc.body.innerHTML; };

export function Pane({ target, onClose, onClickCapture }: { target: PaneTarget; onClose: () => void; onClickCapture?: (e: React.MouseEvent) => void }) {
  const [view, setView] = useState<FileView | null>(null);
  // a web link: Markdown (it opened blank, 2026-10-06) or a text Chromium would download is drawn here; anything else in the webview
  const [page, setPage] = useState<{ kind: 'markdown' | 'text'; text: string; url: string } | { kind: 'web' } | null>(null);
  useEffect(() => { if (target.kind !== 'url') { setPage(null); return; } let alive = true; setPage(null); window.desktop.urlPeek(target.url).then((p) => { if (alive) setPage(p); }).catch(() => { if (alive) setPage({ kind: 'web' }); }); return () => { alive = false; }; }, [target]);
  useEffect(() => { if (target.kind !== 'file') { setView(null); return; } let alive = true; setView(null); window.desktop.readFile(target.path).then((v) => { if (alive) setView(v); }).catch((e: Error) => { if (alive) setView({ ok: false, error: e.message, path: target.path }); }); return () => { alive = false; }; }, [target]);
  const title = target.kind === 'view' ? target.title : target.kind === 'url' ? target.url.replace(/^https?:\/\//, '') : target.path.split('/').pop() ?? target.path;
  const outside = () => { if (target.kind === 'view') return; if (target.kind === 'url') void window.desktop.openExternal(target.url); else void window.desktop.openPath(target.path); };
  // The width: dragged at the left edge, remembered.
  const grip = useRef<HTMLDivElement>(null);
  const onGrip = (e: React.PointerEvent<HTMLDivElement>) => { const el = grip.current; if (!el) return; el.setPointerCapture(e.pointerId); const move = (ev: PointerEvent) => { const w = Math.max(320, Math.min(window.innerWidth * 0.34, window.innerWidth - ev.clientX)); document.documentElement.style.setProperty('--pane-w', `${w}px`); localStorage.setItem('cvc.pane.w', String(w)); }; const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); };
  let body: React.ReactNode; let frame = false;
  if (target.kind === 'view') body = <div className="pane-view">{target.node}</div>;
  else if (target.kind === 'url' && !page) body = <p className="pane-note">{t('misc.pane.opening')}</p>;
  else if (target.kind === 'url' && page?.kind === 'markdown') body = <div className="md pane-md" dangerouslySetInnerHTML={{ __html: webMd(page.text, page.url) }} />;
  else if (target.kind === 'url' && page?.kind === 'text') body = <pre className="pane-text">{page.text}</pre>;
  else if (target.kind === 'url') { frame = true; body = createElement('webview', { src: target.url, className: 'pane-web', title: target.url }); }
  else if (!view) body = <p className="pane-note">{t('misc.pane.opening')}</p>;
  else if (!view.ok) body = <p className="pane-note err">{view.error}</p>;
  else if (view.kind === 'image') body = <img className="pane-img" src={`data:${view.mediaType};base64,${view.data ?? ''}`} alt={view.name} />;
  else if (view.kind === 'markdown') body = <div className="md pane-md" dangerouslySetInnerHTML={{ __html: md(view.text ?? '', dirOf(view.path)) }} />;
  else if (view.kind === 'frame') { frame = true; body = createElement('webview', { src: `file://${encodeURI(view.path)}`, className: 'pane-web', title: view.name }); }
  else body = <pre className="pane-text">{view.text ?? ''}</pre>;
  return (
    <aside className="pane" onClickCapture={onClickCapture}>
      <div ref={grip} className="pane-grip" onPointerDown={onGrip} title={t('misc.pane.dragToResize')} />
      <div className="pane-head"><span className="pane-title" title={target.kind === 'view' ? target.title : target.kind === 'url' ? target.url : target.path}>{title}</span>
        {target.kind !== 'view' && <button className="icon-btn sm" title={target.kind === 'url' ? t('misc.pane.openInBrowser') : t('misc.pane.openWithMac')} onClick={outside}><ExternalLink size={14} /></button>}
        <button className="icon-btn sm" title={t('misc.pane.close')} onClick={onClose}><X size={14} /></button></div>
      <div className={`pane-body${frame ? ' frame' : ''}`}>{body}</div>
    </aside>
  );
}
