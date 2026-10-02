// The app's look (T-248; the user, 2026-09-30: "we need a light theme for Jauvex"): the Mac's own by default, light, dark or auto as the Mac is
// set (the user: "make it system aware, depends on the system settings (light/dark/auto) or overriden in Jauvex settings"), or dark or light
// for this app alone. Set on
// the page's root (data-theme), where the stylesheet's light colours hang; kept in the app's settings (ui.theme) and, for the first paint of
// a window (the floating bar's too), in this window's storage.
import { PALETTE_KEYS, cssVars, readPalette, type Palette } from '../../shared/palette';
export type Theme = 'dark' | 'light' | 'system' | 'custom';
const macLight = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : undefined;
let now: Theme = 'system'; let custom: Palette | null = null; // custom: the user's own colours, made with the Jauvex agent (T-278)
export const themeOf = (x: unknown): Theme => (x === 'light' || x === 'dark' || x === 'custom' ? x : 'system'); // nothing chosen: the Mac's own
/** The look: a theme, and for Custom the palette (given when it changes; kept otherwise). Custom puts the palette's base theme on the page's
 *  root and its colours over it; with no palette yet it is the Mac's own. */
export function applyTheme(t: unknown, pal?: Palette | null): void {
  now = themeOf(t); if (pal !== undefined) custom = pal;
  const root = document.documentElement; for (const k of Object.keys(PALETTE_KEYS)) root.style.removeProperty(`--${k}`);
  if (now === 'custom' && custom) { root.dataset.theme = custom.base; for (const [k, v] of Object.entries(cssVars(custom))) root.style.setProperty(k, v); }
  else root.dataset.theme = now === 'light' || (now !== 'dark' && !!macLight?.matches) ? 'light' : 'dark';
  try { localStorage.setItem('cvc.theme', now); if (custom) localStorage.setItem('cvc.theme.custom', JSON.stringify(custom)); } catch { /* the next window paints dark first, then takes it from the settings */ }
}
macLight?.addEventListener?.('change', () => { if (now === 'system' || (now === 'custom' && !custom)) applyTheme(now); });
/** At a window's start, before anything is drawn: the look it had last time. */
export function applySavedTheme(): void { try { const r = readPalette(localStorage.getItem('cvc.theme.custom') ?? ''); applyTheme(localStorage.getItem('cvc.theme'), r.ok ? r.palette : null); } catch { applyTheme('dark'); } }
