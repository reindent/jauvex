// The interface's languages (i18n, 2026-10-03): every language in LANGUAGES has its file (shared/i18n/<code>.ts) with every key English has,
// none empty, the same {placeholders}, both forms of every plural; and every key the code asks for with t('...') exists. The typecheck refuses
// a missing key already; this also catches an empty one, a placeholder translated by mistake, and a key typed wrong in a template.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const { LANGUAGES } = await import('../shared/i18n/index.ts');
const { en } = await import('../shared/i18n/en.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const keys = Object.keys(en);

for (const code of Object.keys(LANGUAGES)) {
  const table = (await import(`../shared/i18n/${code}.ts`))[code] as Record<string, string> | undefined;
  if (!table) { check(`${code}: shared/i18n/${code}.ts exports ${code}`, false); continue; }
  const missing = keys.filter((k) => !(k in table)); const extra = Object.keys(table).filter((k) => !(k in en));
  check(`${code}: every key English has, and no other`, !missing.length && !extra.length, [...missing.map((k) => `missing ${k}`), ...extra.map((k) => `extra ${k}`)].slice(0, 12).join('; '));
  const empty = keys.filter((k) => k in table && !String(table[k]).trim());
  check(`${code}: no empty string`, !empty.length, empty.slice(0, 12).join(', '));
  const wrong = keys.filter((k) => k in table && vars(table[k]!) !== vars(en[k as keyof typeof en]));
  check(`${code}: the same {placeholders} as English`, !wrong.length, wrong.slice(0, 12).map((k) => `${k}: {${vars(en[k as keyof typeof en])}} vs {${vars(table[k]!)}}`).join('; '));
}
const plurals = keys.filter((k) => /\.(one|other)$/.test(k)).map((k) => k.replace(/\.(one|other)$/, ''));
const half = [...new Set(plurals)].filter((b) => !(`${b}.one` in en) || !(`${b}.other` in en));
check('every plural has its .one and its .other', !half.length, half.join(', '));

// Every key the code names in a call: t('...'), tr('...'), ui('...') (the names t() is imported or aliased under).
const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); } else if (/\.tsx?$/.test(f)) files.push(p); } };
for (const d of ['web/src', 'shared', 'electron']) walk(d);
const asked = new Map<string, string>();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:t|tr|ui)\(\s*'([a-z][\w]*(?:\.[\w]+)+)'/g)) asked.set(m[1]!, f);
const unknown = [...asked].filter(([k]) => !(k in en) && !(`${k}.one` in en));
check(`every key the code asks for exists (${asked.size} named in the code)`, !unknown.length, unknown.slice(0, 12).map(([k, f]) => `${k} (${f})`).join('; '));
console.log(`${keys.length} keys, ${Object.keys(LANGUAGES).length} languages`);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
