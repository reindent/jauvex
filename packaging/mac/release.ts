#!/usr/bin/env node
// A signed and notarized Jauvex.app in a disk image, for handing to someone who installs no source: run on a Mac that holds a Developer ID
// (packaging/mac/RELEASE-ON-MAC.md). It builds this checkout as it is (a clean one, at a numbered version), makes Jauvex.app with
// scripts/mac-app.ts, signs every piece of code in it from the inside out with the hardened runtime and a secure timestamp, has Apple
// notarize it, staples the ticket, puts it in a disk image beside a link to Applications, and signs, notarizes and staples that too.
// Only the built app and the image go to Apple. The keys are never read: codesign finds the identity in the keychain, notarytool reads the
// API key by its path. The image is for this Mac's CPU (scripts/mac-app.ts installs Claude and Codex for it).
//   node packaging/mac/release.ts [--identity "<name>"] (--notary-profile <name> | --notary-key <file.p8> --notary-json <file.json>)
//                                 --private-words <file> [--skip-notarize] [--keep]
// --notary-json holds {"issuer": "...", "keyId": "..."}. --skip-notarize: signed only, a trial (Gatekeeper refuses it). --keep: the work
// folder (tmp/mac-release/<version>) stays. Out: tmp/release/jauvex-personal-<version>-mac-<arch>.dmg and mac-<version>-report.md.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); process.chdir(ROOT);
const log = (s: string) => process.stderr.write(`${s}\n`);
// What leaves this Mac (the Stopped line, the report) names files, never the folders they sit in: a path would carry the home folder.
const bare = (s: string): string => s.replace(/[^\s:'"]*\//g, '');
const fail = (s: string): never => { log(`\nStopped: ${bare(s)}`); process.exit(1); };
const run = (cmd: string, args: string[]): string => execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const both = (cmd: string, args: string[], env?: NodeJS.ProcessEnv): { ok: boolean; out: string } => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: env ?? process.env }); return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }; };
/** A step that can take long: says what it does first, then a line every half minute while it runs. */
const slow = (label: string, cmd: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> => new Promise((resolve) => {
  log(`${label}… please wait`); const t0 = Date.now();
  const timer = setInterval(() => log(`  … still working (${Math.round((Date.now() - t0) / 1000)} s)`), 30_000);
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('error', (e) => { clearInterval(timer); resolve({ ok: false, out, err: String(e) }); });
  p.on('close', (code) => { clearInterval(timer); log(`  done (${Math.round((Date.now() - t0) / 1000)} s)`); resolve({ ok: code === 0, out, err }); });
});
const sha256 = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
const mb = (f: string) => `${(statSync(f).size / 1e6).toFixed(1)} MB`;

const argv = process.argv.slice(2); const flag = (n: string) => argv.includes(n);
const opt = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? fail(`${n} needs a value`)) : undefined; };
const NOTARIZE = !flag('--skip-notarize'); const KEEP = flag('--keep');
// The words that must never ship (real people, clients, companies, hosts): one extended regex per line, # for comments. Required: the built
// app's own files are checked against it before anything is signed, and a hit stops the release.
const WORDS = opt('--private-words') ?? fail('--private-words <file> is required: the list of words the built app must not contain.');
if (!existsSync(WORDS)) fail(`${WORDS} is missing.`);
const ENT = path.join(ROOT, 'packaging', 'mac', 'entitlements.plist'), TOOLS = path.join(ROOT, 'packaging', 'mac', 'tools.plist');

// --- Before anything is built: this Mac, this checkout, the identity, the notary key
if (process.platform !== 'darwin') fail('a signed Jauvex.app is made on macOS only.');
for (const tool of ['codesign', 'ditto', 'spctl', 'xcrun', 'hdiutil', 'security', 'git', 'npm', 'xattr'])
  if (!both('/usr/bin/which', [tool]).ok) fail(`${tool} is needed and was not found (the Xcode command line tools: xcode-select --install).`);
if (NOTARIZE && !both('xcrun', ['notarytool', '--version']).ok) fail('xcrun notarytool is missing: install the Xcode command line tools (xcode-select --install).');
if (run('git', ['status', '--porcelain']).trim()) fail('the checkout has changes: a release is built from a commit exactly (git status must show nothing).');
const COMMIT = run('git', ['rev-parse', 'HEAD']).trim();
const VERSION: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) fail(`package.json says ${VERSION}: a release carries its own number (a version in the making, -dev, is not released).`);
const ids = [...run('security', ['find-identity', '-v', '-p', 'codesigning']).matchAll(/"(Developer ID Application: [^"]+ \(([A-Z0-9]{10})\))"/g)].map((m) => ({ name: m[1]!, team: m[2]! }));
const want = opt('--identity'); const pick = want ? ids.filter((i) => i.name === want || i.name.includes(want)) : ids;
if (!pick.length) fail(want ? `no identity "${want}" in this Mac's keychain (security find-identity -v -p codesigning).` : 'no valid "Developer ID Application" identity in this Mac\'s keychain (security find-identity -v -p codesigning).');
if (pick.length > 1) fail(`several Developer ID identities; name one with --identity:\n${pick.map((i) => `  ${i.name}`).join('\n')}`);
const IDENTITY = pick[0]!.name, TEAM = pick[0]!.team;
let notaryAuth: string[] = [];
if (NOTARIZE) {
  const profile = opt('--notary-profile'), key = opt('--notary-key'), json = opt('--notary-json');
  if (profile) notaryAuth = ['--keychain-profile', profile];
  else if (key && json) {
    for (const f of [key, json]) { if (!existsSync(f)) fail(`${f} is missing.`); if ((statSync(f).mode & 0o077) !== 0) fail(`${f} must be readable by you only (chmod 600).`); }
    const j = JSON.parse(readFileSync(json, 'utf8')) as { issuer?: string; keyId?: string }; // the issuer and key ids, not the key
    if (!j.issuer || !j.keyId) fail(`${json} must hold {"issuer": "...", "keyId": "..."}.`);
    notaryAuth = ['--key', key, '--key-id', j.keyId!, '--issuer', j.issuer!];
  } else fail('say how to reach Apple\'s notary service: --notary-profile <name>, or --notary-key <file.p8> with --notary-json <file.json> (or --skip-notarize for a trial).');
}
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const WORK = path.join(ROOT, 'tmp', 'mac-release', VERSION), OUT = path.join(ROOT, 'tmp', 'release');
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true }); mkdirSync(OUT, { recursive: true });
log(`Jauvex ${VERSION} for macOS (${ARCH}), commit ${COMMIT.slice(0, 12)}, signed as ${IDENTITY}${NOTARIZE ? '' : ', NOT notarized (--skip-notarize)'}`);

// --- The build, as the install command makes it on a Mac, then Jauvex.app from it
const must = async (label: string, cmd: string, args: string[]) => { const r = await slow(label, cmd, args); if (!r.ok) fail(`${label} failed:\n${(r.err || r.out).slice(-1500)}`); return r.out; };
await must('Installing the packages (npm ci)', 'npm', ['ci', '--no-audit', '--no-fund']);
for (const line of run('sh', ['scripts/models.sh', 'missing']).split('\n').filter(Boolean)) { const [file, size] = line.split(':'); await must(`Downloading the Whisper model ${file} (${size} MB)`, 'sh', ['scripts/models.sh', 'fetch', file!]); }
await must('Building the app (npm run build)', 'npm', ['run', 'build']);
const made = (await must('Making Jauvex.app (scripts/mac-app.ts)', process.execPath, ['scripts/mac-app.ts'])).trim().split('\n').pop()!;
const BUNDLE = path.join(WORK, 'Jauvex.app'); run('ditto', [made, BUNDLE]); rmSync(path.dirname(made), { recursive: true, force: true });
run('xattr', ['-cr', BUNDLE]);

// --- Nothing private in what ships: the app's own files (its build, scripts and docs; not the third-party packages or the models)
{ const pat = readFileSync(WORDS, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join('|');
  const app = path.join(BUNDLE, 'Contents', 'Resources', 'app');
  const r = spawnSync('grep', ['-r', '-I', '-i', '-E', '-o', '-l', '--exclude-dir=node_modules', '--exclude-dir=models', pat, app], { encoding: 'utf8' });
  if (r.status === 0) fail(`private words in the built app, nothing was signed:\n${r.stdout.trim()}`);
  if (r.status !== 1) fail(`the private-words check could not run: ${(r.stderr || '').trim()}`);
  log('  ✓ no private words in the app\'s own files'); }

// --- Signing, from the inside out
/** Every Mach-O file and every nested bundle in the app (symbolic links skipped: they point at what is signed anyway). */
const MAGIC = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca']);
const isMachO = (f: string): boolean => { const b = Buffer.alloc(8); const fd = openSync(f, 'r'); try { if (readSync(fd, b, 0, 8, 0) < 8) return false; } finally { closeSync(fd); }
  const m = b.subarray(0, 4).toString('hex'); return MAGIC.has(m) && !(m === 'cafebabe' && b.readUInt32BE(4) > 30); /* a Java class file starts cafebabe too */ };
const files: { file: string; exe: boolean }[] = [], bundles: string[] = [];
const walk = (dir: string) => { for (const e of readdirSync(dir)) { const p = path.join(dir, e); const st = lstatSync(p); if (st.isSymbolicLink()) continue;
  if (st.isDirectory()) { walk(p); if (/\.(app|framework)$/.test(e) && p !== BUNDLE) bundles.push(p); } else if (st.isFile() && st.size >= 8 && isMachO(p)) files.push({ file: p, exe: (st.mode & 0o111) !== 0 }); } };
walk(BUNDLE);
const depth = (p: string) => p.split(path.sep).length;
/** Signed by its maker with a Developer ID, the hardened runtime and a timestamp: notarization takes it as it is. */
const makersOwn = (f: string) => { const r = both('codesign', ['-dv', '--verbose=4', f]); return r.ok && /Authority=Developer ID Application:/.test(r.out) && /Timestamp=/.test(r.out) && /\(runtime\)/.test(r.out); };
const sign = (target: string, ent?: string) => { const r = both('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', IDENTITY, ...(ent ? ['--entitlements', ent] : []), target]);
  if (!r.ok) fail(`codesign could not sign ${path.relative(WORK, target)}:\n${r.out}`); };
const kept: string[] = [];
log(`Signing ${files.length} pieces of code and ${bundles.length} nested bundles… please wait`);
const RES = path.join(BUNDLE, 'Contents', 'Resources') + path.sep;
for (const { file, exe } of files.sort((a, b) => depth(b.file) - depth(a.file))) {
  if (path.basename(path.dirname(file)) === 'MacOS' && path.basename(path.dirname(path.dirname(file))) === 'Contents') continue; // signed with its bundle
  const inResources = file.startsWith(RES);
  if (inResources && makersOwn(file)) { kept.push(path.relative(BUNDLE, file)); continue; } // the providers' programs, signed by their makers
  sign(file, inResources && exe ? TOOLS : undefined);
}
for (const b of bundles.sort((x, y) => depth(y) - depth(x))) sign(b, b.endsWith('.app') ? ENT : undefined);
sign(BUNDLE, ENT);
const verify = both('codesign', ['--verify', '--deep', '--strict', '--verbose=2', BUNDLE]); if (!verify.ok) fail(`the signature of Jauvex.app does not verify:\n${verify.out}`);
if (!new RegExp(`TeamIdentifier=${TEAM}\\b`).test(both('codesign', ['-dv', '--verbose=4', BUNDLE]).out)) fail(`Jauvex.app is not signed by team ${TEAM}.`);
const nodeVersion = both(path.join(BUNDLE, 'Contents', 'MacOS', 'Electron'), ['-p', 'process.versions.node'], { ...process.env, ELECTRON_RUN_AS_NODE: '1' }).out;
log(`  ✓ signed (${kept.length} kept their makers' signatures); its Node is ${nodeVersion}`);

// --- Apple's notarization: the app (stapled, so it opens offline once copied), then the disk image around it
type Notary = { id: string; status: string };
async function notarize(target: string, label: string): Promise<Notary> {
  if (!NOTARIZE) return { id: '', status: 'not notarized (--skip-notarize)' };
  let upload = target;
  if (target.endsWith('.app')) { upload = path.join(WORK, `${label}-for-notary.zip`); run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', target, upload]); }
  const r = await slow(`Sending ${label} to Apple for notarization (usually a few minutes)`, 'xcrun', ['notarytool', 'submit', upload, ...notaryAuth, '--wait', '--timeout', '2h', '--output-format', 'json']);
  let j: { id?: string; status?: string } = {}; try { j = JSON.parse(r.out); } catch { fail(`notarytool said something unexpected:\n${(r.err || r.out).slice(0, 800)}`); }
  if (j.status !== 'Accepted') { const logFile = path.join(OUT, `mac-${VERSION}-notary-${label}.json`); both('xcrun', ['notarytool', 'log', String(j.id), ...notaryAuth, logFile]);
    fail(`Apple did not accept ${label} (${j.status}, submission ${j.id}). Its log: ${logFile}`); }
  if (upload !== target) rmSync(upload, { force: true });
  log(`Stapling the ticket to ${label}`); if (!both('xcrun', ['stapler', 'staple', target]).ok || !both('xcrun', ['stapler', 'validate', target]).ok) fail(`the ticket of ${label} does not staple`);
  return { id: j.id!, status: j.status! };
}
const appNotary = await notarize(BUNDLE, 'app');
const gateApp = both('spctl', ['--assess', '--type', 'execute', '--verbose=4', BUNDLE]);
if (NOTARIZE && (!gateApp.ok || !/source=Notarized Developer ID/.test(gateApp.out))) fail(`Gatekeeper does not accept Jauvex.app:\n${gateApp.out}`);

const DMG = path.join(OUT, `jauvex-personal-${VERSION}-mac-${ARCH}.dmg`); rmSync(DMG, { force: true });
const STAGE = path.join(WORK, 'dmg'); mkdirSync(STAGE); run('ditto', [BUNDLE, path.join(STAGE, 'Jauvex.app')]); symlinkSync('/Applications', path.join(STAGE, 'Applications'));
await must('Making the disk image', 'hdiutil', ['create', '-volname', `Jauvex ${VERSION}`, '-srcfolder', STAGE, '-fs', 'HFS+', '-format', 'UDZO', '-ov', DMG]);
const ds = both('codesign', ['--force', '--timestamp', '--sign', IDENTITY, DMG]); if (!ds.ok) fail(`codesign could not sign the disk image:\n${ds.out}`);
const dmgNotary = await notarize(DMG, 'dmg');
const gateDmg = both('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', DMG]);
if (NOTARIZE && (!gateDmg.ok || !/source=Notarized Developer ID/.test(gateDmg.out))) fail(`Gatekeeper does not accept the disk image:\n${gateDmg.out}`);

// --- What to report
const REPORT = path.join(OUT, `mac-${VERSION}-report.md`);
writeFileSync(REPORT, [`# Jauvex Personal ${VERSION} for macOS (${ARCH})`, '', `- Commit: ${COMMIT}`, `- Signed as: ${IDENTITY}`, `- Node inside: ${nodeVersion}`, '',
  '| File | Size | SHA-256 | Notarization | Gatekeeper |', '|---|---|---|---|---|',
  `| ${path.basename(DMG)} | ${mb(DMG)} | ${sha256(DMG)} | ${dmgNotary.status} ${dmgNotary.id} | ${bare(gateDmg.out.split('\n').slice(0, 2).join(' '))} |`,
  `| Jauvex.app (inside it) | | | ${appNotary.status} ${appNotary.id} | ${bare(gateApp.out.split('\n').slice(0, 2).join(' '))} |`, '',
  `codesign: ${bare(verify.out.split('\n').filter((l) => /valid on disk|satisfies its Designated Requirement/.test(l)).join('; '))}`, '',
  `Kept their makers' signatures: ${kept.length ? kept.join(', ') : 'none'}`, ''].join('\n'));
if (!KEEP) rmSync(WORK, { recursive: true, force: true });
log(`\nDone: ${DMG}\nReport: ${REPORT}`);
console.log(DMG);
