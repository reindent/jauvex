import { readdirSync, readFileSync } from 'node:fs'; import path from 'node:path';
// Every language has every key of English, none empty, the same {placeholders}; every key the code uses exists (the user, 2026-10-03:
// "add a check that flags missing keys"); a third language is one file in shared/i18n and one line in LANGUAGES.
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const { TABLES, LANGUAGES, resolveLanguage, setLanguage, t } = await import('../shared/i18n/index.ts');
const en = TABLES.en as Record<string, string>;
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [lang, table] of Object.entries(TABLES) as [string, Record<string, string>][]) {
  if (lang === 'en') continue;
  const missing = Object.keys(en).filter((k) => !(k in table)), extra = Object.keys(table).filter((k) => !(k in en));
  const empty = Object.keys(table).filter((k) => !table[k]?.trim()), mism = Object.keys(en).filter((k) => k in table && vars(en[k]!) !== vars(table[k]!));
  check(`${lang}: every English key is there`, !missing.length, missing.slice(0, 10).join(' '));
  check(`${lang}: no key English does not have`, !extra.length, extra.slice(0, 10).join(' '));
  check(`${lang}: no empty text`, !empty.length, empty.slice(0, 10).join(' '));
  check(`${lang}: the same {placeholders} as English`, !mism.length, mism.slice(0, 5).map((k) => `${k}: "${en[k]}" / "${table[k]}"`).join(' | '));
}
check('every language in LANGUAGES has its table', Object.keys(LANGUAGES).every((l) => l in TABLES));
// the keys the code asks for, in t('...') and tIn(l, '...'), exist in English (a plural base needs its .one and .other)
const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|i18n/.test(p)) walk(p); } else if (/\.(tsx?|mjs)$/.test(f.name)) files.push(p); } };
['web/src', 'electron', 'shared'].forEach(walk);
const used = new Set<string>(); for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt(?:In)?\((?:\w+, )?'([a-z][\w.-]*)'/g)) used.add(m[1]!);
const unknown = [...used].filter((k) => !(k in en) && !(`${k}.one` in en && `${k}.other` in en));
check('every key the code uses exists in English', !unknown.length, unknown.slice(0, 10).join(' '));
check('the code uses keys (the check reads it)', used.size > 0, `${used.size} keys`);
check('the language: picked, else the system\'s when the app has it, else English', resolveLanguage('es', 'en-US') === 'es' && resolveLanguage('auto', 'es-PA') === 'es' && resolveLanguage(undefined, 'es_PA') === 'es' && resolveLanguage('auto', 'de-DE') === 'en' && resolveLanguage('fr', 'es') === 'es');
setLanguage('es'); check('t speaks the language on, with English as the fallback for an unknown key', t('settings.language') === 'Idioma' && t('no.such.key' as never) === 'no.such.key'); setLanguage('en');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
