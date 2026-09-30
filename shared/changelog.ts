// What a version brings, from CHANGELOG.md (T-218; the user, 2026-09-30: "We need a change log ... the app should notify what the change
// log is about"). Every release has a section, `## <version>: <date>` (older ones `## <version> — <date>`), newest first. The app tells the
// user what a new version brings before an update (the notes the site serves) and after it (its own CHANGELOG.md). Pure:
// tests/changelog.test.ts.
import { newer } from './update.js';

export type ChangelogSection = { version: string; date: string; body: string };

const HEAD = /^## (\d+\.\d+\.\d+)(?:\s*(?::|—|-)\s*(.*))?$/;

/** The changelog's sections, as they are written (newest first): each release's version, date and text, its heading left out. */
export function changelogSections(md: string): ChangelogSection[] {
  const out: ChangelogSection[] = []; let cur: ChangelogSection | null = null;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = HEAD.exec(line.trim());
    if (m) { cur = { version: m[1]!, date: (m[2] ?? '').trim(), body: '' }; out.push(cur); continue; }
    if (/^## /.test(line)) { cur = null; continue; } // any other heading ends a section
    if (cur) cur.body += `${line}\n`;
  }
  for (const s of out) s.body = s.body.trim();
  return out;
}

/** What versions after `from` up to `to` bring, newest first, each under its heading; `from` unknown: `to`'s own section. Empty when the
 *  changelog says nothing of them. */
export function changelogSince(md: string, from: string | null, to: string): string {
  return changelogSections(md)
    .filter((s) => (s.version === to || newer(to, s.version)) && (from ? newer(s.version, from) : s.version === to))
    .map((s) => `## ${s.version}${s.date ? `: ${s.date}` : ''}\n\n${s.body}`).join('\n\n');
}
