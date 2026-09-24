// Where the TypeSafe key is looked for (electron/jev.ts: keyFiles): the environment first, then ~/.typesafe/token, the way Hugging Face
// keeps its token (the user, 2026-09-24: "~/.typesafe/jev" is not a standard name), then the older ~/.typesafe/jev, so a key already there works.
import path from 'node:path';
const { keyFiles } = await import('../electron/jev.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const home = '/Users/someone'; const files = keyFiles(home, {});
check('the key file is ~/.typesafe/token, the Hugging Face way', files[0] === path.join(home, '.typesafe', 'token'), files.join(', '));
check('the older ~/.typesafe/jev is still read, after it', files[1] === path.join(home, '.typesafe', 'jev') && files.length === 2, files.join(', '));
check('a file named for the checks replaces both', keyFiles(home, { JEV_CREDENTIAL_FILE: '/tmp/k' }).join() === '/tmp/k');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
