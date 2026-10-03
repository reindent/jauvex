// The app's language (i18n): the system's by default, or the one chosen in Settings, General (ui.language). Set before the first paint from
// this window's storage, like the look (theme.ts), and checked against the app's settings once they are read. A change reloads the window:
// every string is drawn again in the new language, and a reload keeps the queued messages and unsent text.
import { getLanguage, resolveLanguage, setLanguage, type LangSetting } from '../../shared/i18n';
import { api } from './api';

const KEY = 'cvc.lang';
export const langSettingOf = (x: unknown): LangSetting => (x === 'en' || x === 'es' ? x : 'auto');
const read = (): LangSetting => { try { return langSettingOf(localStorage.getItem(KEY)); } catch { return 'auto'; } };
const resolve = (s: LangSetting) => resolveLanguage(s, navigator.language);

/** At a window's start, before anything is drawn: the language it had last time (the system's the first time). */
export function applySavedLanguage(): void { setLanguage(resolve(read())); }
export const savedLanguageSetting = read;

/** The setting from the app's settings, once read: a window whose storage disagrees (a new profile, a change made in another window) is
 *  drawn again in the right language. */
export function syncLanguage(fromSettings: unknown): void {
  const s = langSettingOf(fromSettings); if (s === read()) return;
  try { localStorage.setItem(KEY, s); } catch { /* the next window starts in the system's language */ }
  if (resolve(s) !== getLanguage()) location.reload();
}

/** The user picked a language in the settings. */
export async function chooseLanguage(s: LangSetting): Promise<void> {
  try { localStorage.setItem(KEY, s); } catch { /* kept in the settings below */ }
  await api.setUi({ language: s });
  if (resolve(s) !== getLanguage()) location.reload();
}
