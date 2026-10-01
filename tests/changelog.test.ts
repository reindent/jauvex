// What a version brings, read from CHANGELOG.md (T-218; the user, 2026-09-30: "the app should notify what the change log is about"): the
// sections between the version a copy runs and the one it moves to, whatever the heading's separator; the repository's own changelog reads.
import { readFileSync } from 'node:fs';
const { changelogSections, changelogSince, recentNotes } = await import('../shared/changelog.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

const md = '# Changelog\n\nIntro.\n\n## 1.3.1: 2026-09-30\n\n- Notes.\n\n## 1.3.0: 2026-09-29\n\n- **Workflows.** A lot.\n  - More.\n\n## 1.2.1: 2026-09-28\n\n- Boards chat.\n\n## 1.2.0 — 2026-09-28\n\n- Boards.\n';
const s = changelogSections(md);
check('every release is a section: its version, its date, its text, whatever the separator', s.map((x) => `${x.version}|${x.date}`).join(' ') === '1.3.1|2026-09-30 1.3.0|2026-09-29 1.2.1|2026-09-28 1.2.0|2026-09-28' && s[1]!.body === '- **Workflows.** A lot.\n  - More.', JSON.stringify(s));
const since = changelogSince(md, '1.2.0', '1.3.0');
check('from 1.2.0 to 1.3.0: what 1.2.1 and 1.3.0 bring, newest first, and not 1.3.1 nor 1.2.0', /^## 1\.3\.0: 2026-09-29\n\n- \*\*Workflows/.test(since) && /## 1\.2\.1: 2026-09-28\n\n- Boards chat\./.test(since) && !/1\.3\.1|## 1\.2\.0/.test(since), since);
check('from an unknown version: the new one\'s own section', changelogSince(md, null, '1.3.1') === '## 1.3.1: 2026-09-30\n\n- Notes.');
check('a version the changelog does not have, or no newer one: nothing', changelogSince(md, '1.3.1', '1.3.1') === '' && changelogSince(md, null, '9.9.9') === '');
check('What\'s new: the newest releases first, as many as asked, each under its heading', recentNotes(md, 2) === '## 1.3.1: 2026-09-30\n\n- Notes.\n\n## 1.3.0: 2026-09-29\n\n- **Workflows.** A lot.\n  - More.' && recentNotes('# Changelog\n') === '', recentNotes(md, 2));
check('a line wrapped in the file joins its sentence; list items stay lines of their own', changelogSince('## 2.0.0: 2026-10-01\n\n- **One.** A sentence\n  that goes on.\n  - A sub item\n    wrapped too.\n- Two.\n', null, '2.0.0') === '## 2.0.0: 2026-10-01\n\n- **One.** A sentence that goes on.\n  - A sub item wrapped too.\n- Two.', changelogSince('## 2.0.0: 2026-10-01\n\n- **One.** A sentence\n  that goes on.\n  - A sub item\n    wrapped too.\n- Two.\n', null, '2.0.0'));
const own = changelogSections(readFileSync('CHANGELOG.md', 'utf8'));
check('this repository\'s CHANGELOG.md reads: every release from 1.0.0, each with a date and some text', own.length >= 5 && own.at(-1)!.version === '1.0.0' && own.every((x) => /^\d{4}-\d\d-\d\d$/.test(x.date) && x.body.length > 20), JSON.stringify(own.map((x) => [x.version, x.date, x.body.length])));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
