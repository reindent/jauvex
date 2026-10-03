// The interface's words in every language the app speaks (i18n; the user, 2026-10-03: English and Spanish first, a third language one file
// more). en.ts holds every string, by key: it is the source and the fallback. Another language is a file typed as en's keys (es.ts), so the
// typecheck refuses a key it lacks, and one line in LANGUAGES below. tests/i18n-keys.test.ts checks what the typecheck cannot: empty
// values, placeholders that differ, keys the code asks for that do not exist. Model prompts, agent briefings and logs are never translated.
//   t('sidebar.addFolder')                       one string
//   t('welcome.signedInAs', { who })             {who} filled in
//   t('queue.waiting', { count: 3 })             a plural: the key's .one or .other form, by the language's own rules
// Kept identical in Jauvex Personal and Jauvex Pro (index.ts, GLOSSARY.md); the strings themselves differ where the apps do.
import { en } from './en.js';
import { es } from './es.js';

export type Key = keyof typeof en;
type Base<K> = K extends `${infer B}.one` ? B : K extends `${infer B}.other` ? B : never;
/** A key, or the base of a plural pair (key.one / key.other) when given a count. */
export type TKey = Key | Base<Key>;
export type Vars = Record<string, string | number>;

export const LANGUAGES = { en: 'English', es: 'Español' } as const; // each in its own words: the setting's list
export type Lang = keyof typeof LANGUAGES;
const TABLES: Record<Lang, Record<Key, string>> = { en, es };
/** The setting: a language, or 'auto' (the system's, else English). */
export type LangSetting = Lang | 'auto';

/** The language for a setting and the system's locale ('es-CL', 'en_US', 'es'...). */
export function resolveLanguage(setting: unknown, systemLocale: string | undefined): Lang {
  if (typeof setting === 'string' && setting in LANGUAGES) return setting as Lang;
  const base = (systemLocale ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return base in LANGUAGES ? (base as Lang) : 'en';
}

let lang: Lang = 'en';
export const getLanguage = (): Lang => lang;
export function setLanguage(l: Lang): void { lang = l in LANGUAGES ? l : 'en'; }

const fill = (s: string, vars?: Vars): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);
/** The string for a key in the language now in use (English when this language lacks it), with its {placeholders} filled. Given a count and
 *  a plural base, the .one or .other form. */
export function t(key: TKey, vars?: Vars, l: Lang = lang): string {
  const table = TABLES[l];
  let k = key as string;
  if (vars && typeof vars.count === 'number' && !(k in en)) k = `${k}.${new Intl.PluralRules(l).select(vars.count) === 'one' ? 'one' : 'other'}`;
  const s = (table as Record<string, string>)[k] || (en as Record<string, string>)[k];
  return fill(s ?? key, vars);
}
