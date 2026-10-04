// The models, for a system with no POSIX shell (Windows, T-283; start.ps1 runs it): the same list, sizes and SHA-256s as scripts/models.sh,
// read from that file, so there is one list for every system. The same commands and the same rules: a download goes to a .part file and
// becomes the model only once its size and SHA-256 match (an interrupted one once stayed behind under the model's name, 2026-09-24).
//   node scripts/models.ts missing [kokoro]  the models that are missing or incomplete, one per line: <file>:<MB>
//   node scripts/models.ts fetch <file>      downloads that one (again) and checks it
// JAUVEX_MODELS_URL, JAUVEX_KOKORO_URL, JAUVEX_MODELS_DIR and JAUVEX_MODELS_RETRIES as in models.sh (for the checks).
import { readFileSync, existsSync, statSync, mkdirSync, rmSync, renameSync, createWriteStream, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream'; import { pipeline } from 'node:stream/promises';

const sh = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'models.sh'), 'utf8');
type Model = { file: string; bytes: number; sum: string };
const list = (name: string): Model[] => { const m = new RegExp(`^${name}='([^']*)'`, 'm').exec(sh); if (!m) throw Error(`scripts/models.sh has no ${name}`);
  return m[1]!.split('\n').map((l) => l.trim().split(/\s+/)).filter((f) => f.length === 3).map(([file, bytes, sum]) => ({ file: file!, bytes: Number(bytes), sum: sum! })); };
const setting = (name: string, env: string): string => { const m = new RegExp(`^${name}="\\$\\{${env}:-([^}]+)\\}"`, 'm').exec(sh); if (!m) throw Error(`scripts/models.sh has no ${name}`); return process.env[env] || m[1]!; };
const table = list('table'), kokoro = list('kokoro');
const dir = setting('dir', 'JAUVEX_MODELS_DIR');
const size = (f: string): number => (existsSync(f) ? statSync(f).size : 0);
const fail = (text: string, code = 1): never => { process.stderr.write(`${text}\n`); process.exit(code); };

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'missing') {
  for (const m of arg === 'kokoro' ? kokoro : table) if (size(path.join(dir, m.file)) !== m.bytes) console.log(`${m.file}:${Math.floor((m.bytes + 500000) / 1000000)}`);
} else if (cmd === 'fetch') {
  const kok = arg?.startsWith('kokoro/');
  const m = (kok ? kokoro : table).find((x) => x.file === arg) ?? fail(`not a model this script knows: ${arg ?? ''}`, 2);
  const base = kok ? setting('kokoro_url', 'JAUVEX_KOKORO_URL') : setting('url', 'JAUVEX_MODELS_URL');
  const url = `${base}/${kok ? m.file.slice('kokoro/'.length) : m.file.split('/').pop()}`;
  const target = path.join(dir, m.file), part = `${target}.part`; mkdirSync(path.dirname(target), { recursive: true }); rmSync(part, { force: true });
  const tries = 1 + Number(process.env.JAUVEX_MODELS_RETRIES ?? 3); let done = false;
  for (let i = 0; i < tries && !done; i++) {
    try { const r = await fetch(url); if (!r.ok || !r.body) throw Error(`HTTP ${r.status}`); await pipeline(Readable.fromWeb(r.body as never), createWriteStream(part)); done = true; }
    catch { rmSync(part, { force: true }); if (i + 1 < tries) await new Promise((res) => setTimeout(res, 1000 * (i + 1))); }
  }
  if (!done) fail(`The download of ${m.file} failed.`);
  if (size(part) !== m.bytes) { const got = size(part); rmSync(part, { force: true }); fail(`The download of ${m.file} is incomplete: ${got} bytes of ${m.bytes}.`); }
  const hash = createHash('sha256'); await pipeline(createReadStream(part), hash);
  if (hash.digest('hex') !== m.sum) { rmSync(part, { force: true }); fail(`The download of ${m.file} does not match its SHA-256.`); }
  renameSync(part, target);
} else fail('usage: node scripts/models.ts missing [kokoro] | fetch <file>', 2);
