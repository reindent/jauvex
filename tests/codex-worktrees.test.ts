import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// Which Codex threads belong to a folder: the ones that ran in it, and the ones that ran in a Codex worktree of it (the desktop app's
// agents work in ~/.codex/worktrees/<id>/<basename>), recognised by the basename and the git origin, never by reading Codex's folders.
const { normalizeOrigin, threadBelongs } = await import('../electron/codex.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const forms = ['git@github.com:acme/website.git', 'https://github.com/acme/website', 'ssh://git@github.com/acme/website.git', 'HTTPS://GitHub.com/Acme/Website/'];
check('one form for the same remote whatever the transport', forms.every((f) => normalizeOrigin(f) === 'github.com/acme/website'), forms.map(normalizeOrigin).join(' | '));
check('no remote, no origin', normalizeOrigin('') === '' && normalizeOrigin(null) === '');
const dir = '/Users/x/Coding/acme/website'; const origin = 'github.com/acme/website';
const wt = (id: string, url: string | null) => ({ cwd: `/Users/x/.codex/worktrees/${id}/website`, gitInfo: { originUrl: url } });
check('a thread that ran in the folder belongs to it', threadBelongs({ cwd: dir, gitInfo: null }, dir, origin) && threadBelongs({ cwd: dir }, dir, ''));
check('a worktree thread with the same origin belongs to it', threadBelongs(wt('0121', 'git@github.com:acme/website.git'), dir, origin) && threadBelongs(wt('3628', 'https://github.com/acme/website'), dir, origin));
check('a worktree of another repository with the same folder name does not', !threadBelongs(wt('a1ee', 'git@github.com:other/website.git'), dir, origin));
check('without an origin for the folder, worktree threads are left out', !threadBelongs(wt('0121', 'git@github.com:acme/website.git'), dir, ''));
check('a thread from a subfolder or a sibling does not belong', !threadBelongs({ cwd: `${dir}/sub`, gitInfo: null }, dir, origin) && !threadBelongs({ cwd: '/Users/x/Coding/reindent', gitInfo: null }, dir, origin) && !threadBelongs({ cwd: '/Users/x/.codex/worktrees/0121/online', gitInfo: { originUrl: 'git@github.com:acme/website.git' } }, dir, origin));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
