// The app's own agent lives in ~/.jauvex (here: the check's own home), not in the folder the app is installed
// in: renaming that folder (2026-09-22) left the Jauvex agent pointing at a folder that no longer existed, its
// conversation gone from the window. A state like that one is repaired on load.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'; import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const data = process.env.CVC_DATA_DIR!; const home = process.env.CVC_JAUVEX_HOME!; mkdirSync(data, { recursive: true });
const old = '/Users/nobody/Coding/old-name';
writeFileSync(path.join(data, 'state.json'), JSON.stringify({ projects: [
  { id: 'jx', path: old, name: 'Jauvex', builtin: 'jauvex', sessions: ['s1'] },
  { id: 'jx2', path: '/Users/nobody/Coding/jauvex-copy', name: 'Jauvex', builtin: 'jauvex', sessions: [] },
  { id: 'f1', path: data, name: 'a folder', sessions: [] } ] }));
const { backend: api } = await import('../electron/backend.ts');
const st = await api.state();
const jx = st.projects.filter((p) => p.builtin === 'jauvex'); 
check('the Jauvex agent now lives in the home, its sessions kept', jx.length === 1 && jx[0]!.path === home && jx[0]!.sessions[0] === 's1', JSON.stringify(jx));
check('a second Jauvex entry left by a moved install is gone', jx.length === 1);
check('the home exists and says where the app is installed', /installed at/.test(readFileSync(path.join(home, 'README.md'), 'utf8')));
const saved = JSON.parse(readFileSync(path.join(data, 'state.json'), 'utf8'));
check('and the repaired state is saved', saved.projects.find((p: { id: string }) => p.id === 'jx').path === home);
check('a session that is not where its agent now lives is reported missing', (await api.sessionExists('jx', '00000000-0000-4000-8000-000000000000')) === false);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
