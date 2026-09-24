#!/usr/bin/env node
// Jauvex.app, built on this Mac from this folder's build (sh start.sh, or npm run build): Electron's own app renamed Jauvex, with the
// app inside it (the built window and main process, the command line, the icon, the Whisper models, Claude and Codex), its name, icon
// and microphone text, signed ad hoc. Nothing compiled is handed out: the install command runs this on each user's Mac, so there is
// nothing for Apple to notarize (the way Jauvex Pro builds its Mac app).
//   node scripts/mac-app.ts   → tmp/mac-app/Jauvex.app; its path is the last line printed (the progress goes to stderr)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); process.chdir(ROOT);
const log = (s: string) => process.stderr.write(`${s}\n`);
const fail = (s: string): never => { log(s); process.exit(1); };
const sh = (cmd: string, args: string[], cwd = ROOT): string => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const installed = (name: string): string => JSON.parse(readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')).version;
const step = (label: string, fn: () => void) => { const t = Date.now(); fn(); log(`  \x1b[32m✓\x1b[0m ${label} \x1b[2m(${Math.round((Date.now() - t) / 1000)}s)\x1b[0m`); };

if (process.platform !== 'darwin') fail('Jauvex.app is made on macOS only.');
const ELECTRON = path.join('node_modules', 'electron', 'dist', 'Electron.app');
for (const need of ['dist/index.html', 'dist-electron/main.mjs', 'dist-electron/preload.cjs', ELECTRON, 'assets/icon.png'])
  if (!existsSync(need)) fail(`${need} is missing: build first (sh start.sh, or npm run build).`);
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
const WORK = path.join(ROOT, 'tmp', 'mac-app'); const BUNDLE = path.join(WORK, 'Jauvex.app');
const RES = path.join(BUNDLE, 'Contents', 'Resources'); const APP = path.join(RES, 'app'); const PLIST = path.join(BUNDLE, 'Contents', 'Info.plist');
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });

// The executable keeps Electron's name: Electron finds its helper apps (Electron Helper.app, ...) by that name.
step('Electron, as Jauvex.app', () => { sh('ditto', [ELECTRON, BUNDLE]); /* ditto keeps the frameworks' symbolic links */ rmSync(path.join(RES, 'default_app.asar'), { force: true }); });
step('the app inside it', () => {
  for (const f of ['dist', 'dist-electron', 'assets', 'scripts/jauvex.ts', 'README.md', 'AGENTS.md', 'LICENSE', 'NOTICE']) if (existsSync(f)) { mkdirSync(path.dirname(path.join(APP, f)), { recursive: true }); cpSync(f, path.join(APP, f), { recursive: true }); }
  // The models the voice uses (MODEL_CANDIDATES in electron/voice.ts): cloned on APFS, so they take no space twice. Without them, it types.
  mkdirSync(path.join(APP, 'models'), { recursive: true });
  for (const m of ['ggml-small-q5_1.bin', 'ggml-base-q5_1.bin']) if (existsSync(path.join('models', m))) { const from = path.join('models', m); const to = path.join(APP, 'models', m); try { execFileSync('cp', ['-c', from, to], { stdio: 'ignore' }); } catch { cpSync(from, to); } }
  // Only what the bundles leave outside (the Claude Agent SDK; Codex, found in node_modules by electron/codex.ts), for this Mac's CPU
  writeFileSync(path.join(APP, 'package.json'), `${JSON.stringify({ name: 'jauvex', productName: 'Jauvex', version, private: true, type: 'module', main: 'dist-electron/main.mjs',
    dependencies: { '@anthropic-ai/claude-agent-sdk': installed('@anthropic-ai/claude-agent-sdk'), '@openai/codex': installed('@openai/codex') } }, null, 2)}\n`);
});
step('Claude and Codex for this Mac', () => {
  sh('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts', '--loglevel=error'], APP);
  const arch = process.arch; const triple = `${arch === 'x64' ? 'x86_64' : 'aarch64'}-apple-darwin`;
  for (const f of [`node_modules/@anthropic-ai/claude-agent-sdk-darwin-${arch}/claude`, `node_modules/@openai/codex-darwin-${arch}/vendor/${triple}/bin/codex`])
    if (!existsSync(path.join(APP, f))) fail(`missing after the install: ${f}`);
});
step('its name, icon and microphone text', () => {
  const set = (key: string, value: string) => { try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, PLIST], { stdio: 'ignore' }); } catch { sh('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, PLIST]); } };
  const short = version.replace(/-.*$/, ''); // macOS wants numbers here; the app's package.json keeps the whole version
  for (const [k, v] of [['CFBundleName', 'Jauvex'], ['CFBundleDisplayName', 'Jauvex'], ['CFBundleIdentifier', 'com.reindent.jauvex-personal'], ['CFBundleShortVersionString', short],
    ['CFBundleVersion', short], ['CFBundleIconFile', 'icon.icns'], ['NSMicrophoneUsageDescription', 'Jauvex uses the microphone for voice: what you say to your agents is transcribed on this Mac.']]) set(k, v);
  const icons = path.join(WORK, 'icon.iconset'); mkdirSync(icons); // the Dock and Finder icon, from assets/icon.png (1024 px)
  for (const s of [16, 32, 128, 256, 512]) { sh('sips', ['-z', String(s), String(s), 'assets/icon.png', '--out', path.join(icons, `icon_${s}x${s}.png`)]); sh('sips', ['-z', String(s * 2), String(s * 2), 'assets/icon.png', '--out', path.join(icons, `icon_${s}x${s}@2x.png`)]); }
  sh('iconutil', ['-c', 'icns', icons, '-o', path.join(RES, 'icon.icns')]); rmSync(path.join(RES, 'electron.icns'), { force: true }); rmSync(icons, { recursive: true });
});
step('signed ad hoc, on this Mac', () => { sh('xattr', ['-cr', BUNDLE]);
  // codesign reports on stderr even when all is well ("replacing existing signature"): shown only when it fails
  for (const args of [['--force', '--deep', '--sign', '-', BUNDLE], ['--verify', '--deep', '--strict', BUNDLE]])
    try { execFileSync('codesign', args, { stdio: 'pipe' }); } catch (e) { log(String(e.stderr ?? e)); fail('codesign failed: Jauvex.app is not signed.'); } });
console.log(BUNDLE);
