import path from 'node:path'; import http from 'node:http'; import { execFileSync } from 'node:child_process'; import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata'); process.env.CVC_WHISPER_PORT = '4371'; mkdirSync(process.env.CVC_DATA_DIR, { recursive: true });
// Whisper that cannot start says why, at once. On 2026-09-24, on a new Mac whose small model an interrupted download had left incomplete,
// the app waited out a whole minute for a server that had died in a second, then showed only the end of its crash backtrace ("whisper-server
// exited (null). 9 dyld ... start + 6124"), and every word said meanwhile failed with it. A port another program holds is the other way it fails.
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const bin = (() => { try { return execFileSync('which', ['whisper-server']).toString().trim(); } catch { return ''; } })();
const good = ['ggml-base-q5_1.bin', 'ggml-small-q5_1.bin'].map((f) => path.resolve('models', f)).find((f) => existsSync(f));
if (!bin || !good) { console.log('PASS skipped: no whisper-server or model on this machine'); console.log('ALL PASS'); process.exit(0); }
const broken = path.resolve('tmp/whisper-cannot-start/ggml-small-q5_1.bin'); mkdirSync(path.dirname(broken), { recursive: true });
const fd = openSync(good, 'r'); const head = Buffer.alloc(20_000_000); readSync(fd, head, 0, head.length, 0); closeSync(fd); writeFileSync(broken, head); // what the interrupted download left
process.env.CVC_WHISPER_MODEL = broken;
const voice = await import('../electron/voice.ts');
const n = 8000, wav = Buffer.alloc(44 + n * 2); wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
const words = async () => { const t0 = Date.now(); try { await voice.transcribe(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.length) as ArrayBuffer, 'en'); return { ms: Date.now() - t0, err: '' }; } catch (e) { return { ms: Date.now() - t0, err: (e as Error).message }; } };

let a = await words();
check('a model Whisper cannot load is named, with what to do', /^ggml-small-q5_1\.bin is incomplete or damaged, so Whisper cannot load it\. Run sh start\.sh again: it downloads the model again$/.test(a.err), a.err);
check('...and no backtrace in it', !/dyld|0x[0-9a-f]{6,}|GGML_ASSERT/.test(a.err));
check('...said within seconds, not after the minute a starting server gets', a.ms < 20_000, `${a.ms} ms`);
await new Promise((r) => setTimeout(r, 300)); const log = (() => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } })();
check('the flight recorder has the reason and what whisper-server printed', /\[whisper\]: ggml-small-q5_1\.bin is incomplete/.test(log) && /not all tensors loaded/.test(log));
process.env.CVC_WHISPER_MODEL = good;
const other = http.createServer((_q, r) => r.end('not whisper')); await new Promise<void>((r) => other.listen(4371, '127.0.0.1', () => r()));
a = await words();
check('a port another program holds is named, with the program', /^port 4371 is taken by node \(pid \d+\), so Whisper cannot start/.test(a.err), a.err);
await new Promise<void>((r) => other.close(() => r()));
a = await words();
check('once that is fixed, the next words start Whisper', a.err === '', a.err);
voice.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
