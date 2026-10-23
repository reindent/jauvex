// A line between two stacked parts that drags, as in Jauvex Pro, where every divider resizes: the chat under a workflow and under a board. It sets the height of the part next to it in a CSS
// variable on the page (`--<name>`, with the class `sized-<name>` once it was dragged), kept on this computer as the sidebar's width is.
import type React from 'react';
import { t } from '../../shared/i18n';

const GRIPS = ['wf-chat-h', 'board-chat-h', 'dash-h'] as const; // dash-h: the dashboard
export type GripName = (typeof GRIPS)[number];
const set = (name: GripName, px: number) => { const root = document.documentElement; root.style.setProperty(`--${name}`, `${px}px`); root.classList.add(`sized-${name}`); };
// the heights the grips were left at, once, as the page loads
for (const n of GRIPS) { try { const v = Number(localStorage.getItem(`cvc.grip.${n}`)); if (v > 0) set(n, v); } catch { /* none kept */ } }

/** `sizes`: which part the drag sizes, the one before the grip (it grows downwards) or the one it sits at the top of (it grows upwards). */
export function RowGrip({ name, sizes, min = 120 }: { name: GripName; sizes: 'previous' | 'parent'; min?: number }) {
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; e.preventDefault(); const el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch { /* no such pointer (a made-up event): the window still hears it move */ }
    const part = (sizes === 'previous' ? el.previousElementSibling : el.parentElement) as HTMLElement | null; if (!part) return;
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
    const move = (ev: PointerEvent) => { if (!(ev.buttons & 1)) return stop(); const r = part.getBoundingClientRect();
      const h = Math.round(Math.max(min, Math.min(window.innerHeight * 0.85, sizes === 'previous' ? ev.clientY - r.top : r.bottom - ev.clientY)));
      set(name, h); try { localStorage.setItem(`cvc.grip.${name}`, String(h)); } catch { /* not kept: it still resizes */ } };
    // on the window: a captured pointer's moves bubble up to it, and so do a drag's that left the thin line
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  };
  return <div className={`row-grip row-grip-${sizes}`} role="separator" aria-orientation="horizontal" title={t('misc.pane.dragToResize')} onPointerDown={down} />;
}
