import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process'; import { existsSync, mkdirSync, symlinkSync } from 'node:fs'; import http from 'node:http';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// A whisper-server left on one of the app's ports by a previous run is stopped by its own pid before ours starts; anything
// else listening on a port is left alone. (The app used to add a pair of servers on every restart, and they lived forever.)
const { stopLeftovers } = await import('../electron/voice.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const alive = (pid: number) => { try { execFileSync('ps', ['-p', String(pid)], { stdio: 'ignore' }); return true; } catch { return false; } };
const model = ['ggml-tiny-q5_1.bin', 'ggml-tiny.bin', 'ggml-base-q5_1.bin', 'ggml-base.bin'].map((f) => path.join('models', f)).find((f) => existsSync(f));
const bin = (() => { try { return execFileSync('which', ['whisper-server']).toString().trim(); } catch { return ''; } })();
if (!model || !bin) { console.log('PASS skipped: no whisper-server or model on this machine'); console.log('ALL PASS'); process.exit(0); }
const PORT = 4351, OTHER = 4352;
const old = spawn(bin, ['-m', path.resolve(model), '--host', '127.0.0.1', '--port', String(PORT), '-l', 'auto', '-nt'], { stdio: 'ignore' }); // "left by a previous run"
const other = http.createServer((_q, r) => r.end('hi')).listen(OTHER, '127.0.0.1');
const up = async (port: number) => { for (let i = 0; i < 240; i++) { try { await fetch(`http://127.0.0.1:${port}/`); return true; } catch { await new Promise((r) => setTimeout(r, 250)); } } return false; };
check('the old whisper-server is listening', await up(PORT)); check('the other listener is up', await up(OTHER));
const stopped = await stopLeftovers(PORT); await new Promise((r) => setTimeout(r, 800));
check('it is stopped by its own pid', stopped.length === 1 && stopped[0] === old.pid && !alive(old.pid!), `stopped ${stopped.join(',')}, pid ${old.pid}`);
const none = await stopLeftovers(OTHER);
check('a listener that is not whisper-server on the other port is left alone', none.length === 0 && other.listening, `stopped ${none.join(',')}`);
// Another install's server on the same port (the other edition, run next to this one: 2026-09-24, starting Personal stopped Pro's two
// servers and the wake phrase died with them) is never stopped: its model is not in this install's models folder.
mkdirSync('tmp/other-install/models', { recursive: true }); const foreignModel = path.resolve('tmp/other-install/models', path.basename(model)); if (!existsSync(foreignModel)) symlinkSync(path.resolve(model), foreignModel);
const foreign = spawn(bin, ['-m', foreignModel, '--host', '127.0.0.1', '--port', String(PORT), '-l', 'auto', '-nt'], { stdio: 'ignore' });
check('another install\'s whisper-server is listening on the port', await up(PORT));
const spared = await stopLeftovers(PORT); await new Promise((r) => setTimeout(r, 800));
check('another install\'s whisper-server is left alone', spared.length === 0 && alive(foreign.pid!), `stopped ${spared.join(',')}`);
if (alive(foreign.pid!)) foreign.kill('SIGKILL');
other.close(); if (alive(old.pid!)) old.kill('SIGKILL');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
