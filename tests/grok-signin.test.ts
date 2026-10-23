// Grok signed in after the app's Grok process started (from the other edition's fix): the process keeps the signed-out state it started
// with, so the app answered "not signed in" to every new Grok agent after `grok login` until that process was killed. Now a not-signed-in
// answer, with no turn under way, makes the app ask a fresh process once. Through the stand-in, which keeps its auth as Grok does.
import path from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
const home = path.join(process.env.CVC_DATA_DIR, 'grok-signin'); rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
process.env.CVC_GROK_BIN = path.resolve('tests/mock/grok'); process.env.GROK_HOME = home; process.env.MOCK_GROK_AUTH = path.join(home, 'auth.json'); process.env.MOCK_DELAY_MS = '2';
const grok = await import('../electron/grok.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const ask = () => grok.account().then((a) => `signed in as ${a.email}`, (e: Error) => e.message);
const before = await ask();
check('signed out when the app starts its Grok process: not signed in', /^Grok is not signed in/.test(before), before);
const again = await ask();
check('...and asked again soon after, still not signed in (one fresh process at most every few seconds, no loop)', /^Grok is not signed in/.test(again), again);
writeFileSync(process.env.MOCK_GROK_AUTH, '{}'); // `grok login` done, in a terminal
await new Promise((r) => setTimeout(r, 5200));
const after = await ask();
check('after the sign-in, the next answer comes from a fresh process: signed in, no restart of the app', after === 'signed in as mock@localhost', after);
check('...and stays so', (await ask()) === 'signed in as mock@localhost');
grok.shutdown(); rmSync(home, { recursive: true, force: true }); if (existsSync(home)) failed++;
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
