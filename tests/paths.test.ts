// Where every copy of the app keeps its data (electron/paths.ts): ~/.jauvex/personal, run from source or compiled (the user's rule,
// 2026-09-23: the compiled app opened empty, its data in another folder than the copy run from source). Each case loads the module in
// a child with only the variables it names, since the checks themselves run with CVC_DATA_DIR and CVC_JAUVEX_HOME set.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };

const home = mkdtempSync(path.join(os.tmpdir(), 'jx-home-'));
const load = (env: Record<string, string>): { DATA_DIR: string; JAUVEX_HOME: string } => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
  "const m = await import('./electron/paths.ts'); console.log(JSON.stringify({ DATA_DIR: m.DATA_DIR, JAUVEX_HOME: m.JAUVEX_HOME }))"], { env: { PATH: process.env.PATH ?? '', HOME: home, ...env }, encoding: 'utf8' }));
const plain = load({});
check('with nothing set, the home is ~/.jauvex and the data ~/.jauvex/personal', plain.JAUVEX_HOME === path.join(home, '.jauvex') && plain.DATA_DIR === path.join(home, '.jauvex', 'personal'), JSON.stringify(plain));
check('CVC_DATA_DIR moves the data alone (the checks, a server\'s launcher)', load({ CVC_DATA_DIR: path.join(home, 'elsewhere') }).DATA_DIR === path.join(home, 'elsewhere'));
check('a home moved with CVC_JAUVEX_HOME takes its data along', load({ CVC_JAUVEX_HOME: path.join(home, 'h') }).DATA_DIR === path.join(home, 'h', 'personal'));
const cli = readFileSync('scripts/jauvex.ts', 'utf8');
check('the command line looks for its command files in the same data folder', /CVC_DATA_DIR \|\| path\.join\(process\.env\.CVC_JAUVEX_HOME \|\| path\.join\(os\.homedir\(\), '\.jauvex'\), 'personal'\)/.test(cli));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
