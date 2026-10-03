// The app's languages (i18n; the user, 2026-10-03: Spanish first, a third language should be one file). Every text the app shows is a key of
// en.ts, English, the source and the fallback; each other language is one file of the same keys (es.ts), typed against it so TypeScript
// refuses a missing key, and tests/i18n-keys.test.ts also refuses an empty one, an unknown key and a placeholder that does not match.
// Not translated: what models read (prompts, briefings), logs, file formats. Shared with Jauvex Personal: change both (GLOSSARY.md).
//   t('sidebar.newHuddle')                       the text in the language on now
//   t('workflow.runOf', { n: 3, total: 4 })      {n} and {total} filled in
//   t('agents.count', { count: 2 })             'agents.count.one' or 'agents.count.other', by the count
import { en } from './en.js';
import { es } from './es.js';

export type Key = keyof typeof en;
export type Table = Record<Key, string>;
/** The languages the app speaks, as each names itself. A third: its file, and one line here. */
export const LANGUAGES = { en: 'English', es: 'Español' } as const;
export type Language = keyof typeof LANGUAGES;
export const TABLES: Record<Language, Table> = { en, es };
/** What the person picked: a language, or 'auto' (the system's). */
export type LanguagePref = 'auto' | Language;

/** The language to speak for a preference and the system's locale ('es-PA', 'en_US'): the picked one, else the system's when the app has
 *  it, else English. */
export function resolveLanguage(pref: string | undefined | null, system: string | undefined | null): Language {
  if (pref && pref !== 'auto' && pref in LANGUAGES) return pref as Language;
  const sys = String(system ?? '').slice(0, 2).toLowerCase();
  return (sys in LANGUAGES ? sys : 'en') as Language;
}

let current: Language = 'en';
export const language = (): Language => current;
export function setLanguage(l: Language): void { current = l in LANGUAGES ? l : 'en'; }

const fill = (s: string, vars?: Record<string, string | number | null | undefined>): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m)) : s);
/** A key's text in the language on now (English when that language lacks it), its {placeholders} filled. With vars.count and no such key,
 *  the plural forms `<key>.one` / `<key>.other`. */
export function t(key: Key | `${string}`, vars?: Record<string, string | number | null | undefined>): string {
  const table = TABLES[current] as Record<string, string>; const base = en as Record<string, string>;
  let k = key as string;
  if (!(k in base) && vars && typeof vars.count === 'number') k = `${k}.${vars.count === 1 ? 'one' : 'other'}`;
  return fill(table[k] || base[k] || k, vars);
}
/** t, for a scope where a local `t` hides it. */
export const tr = t;
/** The same in a given language, whatever is on now (the main process answering a window in another one). */
export function tIn(l: Language, key: Key | `${string}`, vars?: Record<string, string | number | null | undefined>): string { const was = current; current = l; try { return t(key, vars); } finally { current = was; } }
