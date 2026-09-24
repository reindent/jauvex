import http from 'node:http'; import path from 'node:path'; import { execFile } from 'node:child_process'; import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
// scripts/models.sh, start.sh's Whisper models: a model cut short counts as missing and is downloaded again, a dropped connection is tried
// again, and a download that stays incomplete or does not match its SHA-256 never takes the model's name. On 2026-09-24 an interrupted
// download stayed behind as the small model on a new Mac, every later install took it for done ("is here"), and Whisper could not load it.
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const FILE = 'ggml-base-q5_1.bin'; const real = path.resolve('models', FILE);
if (!existsSync(real)) { console.log(`PASS skipped: no models/${FILE} on this machine to serve`); console.log('ALL PASS'); process.exit(0); }
const size = statSync(real).size; const dir = path.resolve('tmp/models-check'); const model = path.join(dir, FILE);
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
// ok: the file. cut: half of it, then the connection drops. flaky: cut the first time, whole after. bad: the right size, other bytes.
let flaky = 0;
const server = http.createServer((req, res) => {
  const [, mode, file] = (req.url ?? '').split('/'); if (file !== FILE) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Length', String(size));
  const cut = mode === 'cut' || (mode === 'flaky' && flaky++ === 0);
  let first = true; createReadStream(real, cut ? { end: Math.floor(size / 2) } : {}).on('data', (c) => { const chunk = Buffer.from(c); if (mode === 'bad' && first) chunk.fill(7); first = false; res.write(chunk); }).on('end', () => (cut ? res.destroy() : res.end()));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); const port = (server.address() as { port: number }).port;
// Not execFileSync: the server answers from this same event loop.
const models = (args: string[], mode = 'ok', retries = '1') => new Promise<{ code: number; out: string; err: string }>((resolve) => execFile('sh', ['scripts/models.sh', ...args],
  { env: { ...process.env, JAUVEX_MODELS_URL: `http://127.0.0.1:${port}/${mode}`, JAUVEX_MODELS_DIR: dir, JAUVEX_MODELS_RETRIES: retries, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } },
  (e, out, err) => resolve({ code: e ? Number(e.code) || 1 : 0, out: String(out), err: String(err) })));

let r = await models(['missing']);
check('both models are missing from an empty folder', r.out.includes(`${FILE}:60`) && r.out.includes('ggml-small-q5_1.bin:190'), r.out.trim());
const fd = openSync(real, 'r'); const head = Buffer.alloc(10_000_000); readSync(fd, head, 0, head.length, 0); closeSync(fd); writeFileSync(model, head); // what the interrupted download left
r = await models(['missing']); check('a model cut short counts as missing', r.out.includes(`${FILE}:60`), r.out.trim());
r = await models(['fetch', FILE], 'cut');
check('a download that stays cut short fails', r.code !== 0 && /incomplete|failed/.test(r.err), `${r.code} ${r.err.trim()}`);
check('...and never takes the model\'s name, nor leaves a .part', statSync(model).size === head.length && !existsSync(`${model}.part`));
r = await models(['fetch', FILE], 'bad');
check('a download that does not match its SHA-256 fails', r.code !== 0 && /SHA-256/.test(r.err), `${r.code} ${r.err.trim()}`);
check('...and never takes the model\'s name, nor leaves a .part', statSync(model).size === head.length && !existsSync(`${model}.part`));
r = await models(['fetch', FILE], 'flaky', '2');
check('a dropped connection is tried again, and the model is whole', r.code === 0 && flaky === 2 && statSync(model).size === size && sha(model) === sha(real), `${r.code} after ${flaky} requests ${r.err.trim()}`);
r = await models(['missing']); check('a whole model is not missing any more', !r.out.includes(FILE), r.out.trim());
r = await models(['fetch', 'ggml-tiny.bin']); check('a model the script does not know is refused', r.code === 2, `${r.code} ${r.err.trim()}`);
server.close(); rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
