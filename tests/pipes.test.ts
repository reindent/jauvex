// A child process the app writes to after it stopped reading (from the other edition's fix: a write to a closed pipe, "write EPIPE", became
// Electron's fatal dialog): with its pipes guarded, the write fails quietly and nothing reaches the process as an uncaught error; and the errors
// main.ts lets pass as a closed connection or pipe are those only.
import { spawn } from 'node:child_process';
const { guardPipes, pipeError } = await import('../electron/pipes.ts');
let failed = 0; const ok = (c: boolean, what: string, got = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${what}${got ? `: ${got}` : ''}`); if (!c) failed++; };
const uncaught: string[] = []; process.on('uncaughtException', (e) => { uncaught.push(`${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}`); });
const child = guardPipes(spawn(process.execPath, ['-e', 'require("fs").closeSync(0); setTimeout(() => {}, 1500)'], { stdio: ['pipe', 'pipe', 'pipe'] })); // it stops reading, as a process that died does
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 5; i++) child.stdin!.write('x'.repeat(65536)); child.stdin!.end('bye');
await new Promise((r) => child.once('exit', r)); await new Promise((r) => setTimeout(r, 200));
ok(uncaught.length === 0, 'writing to a child that stopped reading (write EPIPE) raises no uncaught error once its pipes are guarded', uncaught.join(' | '));
const err = (code: string) => Object.assign(new Error(code), { code });
ok(['EPIPE', 'ECONNRESET', 'ECONNABORTED', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'].every((c) => pipeError(err(c))), 'a closed connection or pipe is told as one');
ok(!pipeError(err('ENOENT')) && !pipeError(new TypeError('x is undefined')) && !pipeError(null), '...and nothing else is (a real bug still shows)');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
