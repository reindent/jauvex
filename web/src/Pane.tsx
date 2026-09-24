import { createElement, useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { FileView } from '../../shared/types';
import { md } from './md';

// The right pane: where a file or a link an agent shows is opened, instead of the whole window sailing off to it (a
// handoff link once took the window over, with no way back). Files come through the main process (text, markdown,
// images as data), pages and PDFs in a <webview> of their own, muted from the start. Later: terminals, browsers.
export type PaneTarget = { kind: 'file'; path: string } | { kind: 'url'; url: string };
const dirOf = (p: string) => p.replace(/\/[^/]*$/, '');

export function Pane({ target, onClose }: { target: PaneTarget; onClose: () => void }) {
  const [view, setView] = useState<FileView | null>(null);
  useEffect(() => { if (target.kind !== 'file') { setView(null); return; } let alive = true; setView(null); window.desktop.readFile(target.path).then((v) => { if (alive) setView(v); }).catch((e: Error) => { if (alive) setView({ ok: false, error: e.message, path: target.path }); }); return () => { alive = false; }; }, [target]);
  const title = target.kind === 'url' ? target.url.replace(/^https?:\/\//, '') : target.path.split('/').pop() ?? target.path;
  const outside = () => { if (target.kind === 'url') void window.desktop.openExternal(target.url); else void window.desktop.openPath(target.path); };
  // The width: dragged at the left edge, remembered.
  const grip = useRef<HTMLDivElement>(null);
  const onGrip = (e: React.PointerEvent<HTMLDivElement>) => { const el = grip.current; if (!el) return; el.setPointerCapture(e.pointerId); const move = (ev: PointerEvent) => { const w = Math.max(320, Math.min(window.innerWidth - 500, window.innerWidth - ev.clientX)); document.documentElement.style.setProperty('--pane-w', `${w}px`); localStorage.setItem('cvc.pane.w', String(w)); }; const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); };
  let body: React.ReactNode; let frame = false;
  if (target.kind === 'url') { frame = true; body = createElement('webview', { src: target.url, className: 'pane-web', title: target.url }); }
  else if (!view) body = <p className="pane-note">Opening…</p>;
  else if (!view.ok) body = <p className="pane-note err">{view.error}</p>;
  else if (view.kind === 'image') body = <img className="pane-img" src={`data:${view.mediaType};base64,${view.data ?? ''}`} alt={view.name} />;
  else if (view.kind === 'markdown') body = <div className="md pane-md" dangerouslySetInnerHTML={{ __html: md(view.text ?? '', dirOf(view.path)) }} />;
  else if (view.kind === 'frame') { frame = true; body = createElement('webview', { src: `file://${encodeURI(view.path)}`, className: 'pane-web', title: view.name }); }
  else body = <pre className="pane-text">{view.text ?? ''}</pre>;
  return (
    <aside className="pane">
      <div ref={grip} className="pane-grip" onPointerDown={onGrip} title="Drag to resize" />
      <div className="pane-head"><span className="pane-title" title={target.kind === 'url' ? target.url : target.path}>{title}</span>
        <button className="icon-btn sm" title={target.kind === 'url' ? 'Open in the browser' : 'Open with the Mac'} onClick={outside}><ExternalLink size={14} /></button>
        <button className="icon-btn sm" title="Close" onClick={onClose}><X size={14} /></button></div>
      <div className={`pane-body${frame ? ' frame' : ''}`}>{body}</div>
    </aside>
  );
}
