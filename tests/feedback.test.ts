// In-app feedback (Diego, 2026-10-04): the form checked as the site checks it, and the log cleaned of secrets before it is sent.
import { formProblem, cleanLog } from '../shared/feedback.js';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const ok = { type: 'bug' as const, title: 'The orb is flat', description: 'On Linux.', contact: '', screenshot: false, log: false };
check('a good form passes; a short title, an empty description, a bad email do not', formProblem(ok) === null && formProblem({ ...ok, title: 'x' }) === 'title' && formProblem({ ...ok, description: ' ' }) === 'description' && formProblem({ ...ok, contact: 'nope' }) === 'contact');
const log = ['/home/ana/projects/x opened', 'Authorization: Bearer abcdefghijklmnop', 'key=Zx9_abcdefghijklmnopqrstu&v=1', 'sk-ant-api03-abcdefghijkl', 'mail ana@example.com', 'token: "hunter2hunter2"', 'id 7c9e6679f4c84a7e9bb2f5c1d0e3a4b5c6d7e8f9'].join('\n');
const c = cleanLog(log, '/home/ana');
check('the log loses the home folder, bearer tokens, keys, API keys, emails, tokens and long ids', c.includes('~/projects/x') && !/abcdefghijklmnop|Zx9_|sk-ant|ana@example|hunter2|7c9e6679f4/.test(c), c);
check('...and keeps only its last lines', cleanLog(Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'), '').split('\n').length === 300);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
