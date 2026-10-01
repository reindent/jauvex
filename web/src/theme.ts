// The app's look (T-248; the user, 2026-09-30: "we need a light theme for Jauvex"): the Mac's own by default, light, dark or auto as the Mac is
// set (the user: "make it system aware, depends on the system settings (light/dark/auto) or overriden in Jauvex settings"), or dark or light
// for this app alone. Set on
// the page's root (data-theme), where the stylesheet's light colours hang; kept in the app's settings (ui.theme) and, for the first paint of
// a window (the floating bar's too), in this window's storage.
export type Theme = 'dark' | 'light' | 'system';
const macLight = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : undefined;
let now: Theme = 'system';
export const themeOf = (x: unknown): Theme => (x === 'light' || x === 'dark' ? x : 'system'); // nothing chosen: the Mac's own
export function applyTheme(t: unknown): void {
  now = themeOf(t); const light = now === 'light' || (now === 'system' && !!macLight?.matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  try { localStorage.setItem('cvc.theme', now); } catch { /* the next window paints dark first, then takes it from the settings */ }
}
macLight?.addEventListener?.('change', () => { if (now === 'system') applyTheme(now); });
/** At a window's start, before anything is drawn: the look it had last time. */
export function applySavedTheme(): void { try { applyTheme(localStorage.getItem('cvc.theme')); } catch { applyTheme('dark'); } }
