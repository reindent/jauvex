// Updates (T-165). The app asks jauvex.reindent.com which version of Jauvex is the latest (at launch and every six hours). The copy the
// install command made (Jauvex.app in Applications, built from ~/.jauvex/personal/app) updates itself on the user's yes: it fetches the
// same installer, checks that it installs the version offered, hands a one-shot launchd job the work (wait for the app to quit, run the
// installer, which rebuilds the app on this Mac and opens it, or open the app as it was if the installer fails), then quits. A copy run
// from a clone updates with git: it only says so.
import { spawn, execFile } from 'node:child_process';
import { openSync, closeSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newer, VERSION_RE, type UpdateStatus } from '../shared/update.js';

export const SITE = 'https://jauvex.reindent.com';

/** The runner launchd starts, once: `sh run.sh <app pid> <app bundle> [<launchd label>]`, next to the installer the app fetched. */
export const RUNNER = `#!/bin/sh
# An update of the installed app, started once by launchd: it waits for the app to quit, runs the installer the app fetched from
# jauvex.reindent.com (it rebuilds the app on this Mac and opens it), and opens the app as it was if the installer does not finish.
dir=$(cd "$(dirname "$0")" && pwd); pid="$1"; bundle="$2"; label="$3"
echo "--- $(date '+%F %T') update: waiting for the app (pid $pid) to quit"
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1)); if [ "$i" -gt 120 ]; then echo 'The app did not quit in two minutes: no update.'; rm -f "$dir/install.sh"; exit 1; fi
  sleep 1
done
echo "--- $(date '+%F %T') installing"
if sh "$dir/install.sh" < /dev/null; then echo "--- $(date '+%F %T') updated"
else echo "--- $(date '+%F %T') the update did not finish: the app opens as it was"; if [ -n "$bundle" ] && [ -z "$JAUVEX_NO_LAUNCH" ]; then open "$bundle"; fi; fi
rm -f "$dir/install.sh"
if [ -n "$label" ]; then rm -f "$dir/$label.plist"; launchctl bootout "gui/$(id -u)/$label" 2>/dev/null; fi
`;

/** The app's bundle when this copy runs as a Mac app (…/Jauvex.app/Contents/MacOS/<binary>); null for a copy run from a clone
 *  (Electron's own app under node_modules) or anything that is not a Mac app. */
export function appBundleOf(execPath: string): string | null {
  const bundle = /^(\/.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1];
  return bundle && !bundle.includes('/node_modules/') ? bundle : null;
}

/** The copy the install command made: Jauvex.app in /Applications or ~/Applications, and its source in the data folder's app/. */
export function madeByInstaller(bundle: string | null, dataDir: string): boolean {
  if (!bundle || !/(^|\/)Applications\/Jauvex\.app$/.test(bundle)) return false;
  try { return JSON.parse(readFileSync(path.join(dataDir, 'app', 'package.json'), 'utf8')).name === 'jauvex'; } catch { return false; }
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Hands the runner to launchd as a one-shot job of this user (it outlives the app); a detached process if launchd refuses it. */
async function launchd(dir: string, label: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const log = path.join(dir, 'update.log'), plist = path.join(dir, `${label}.plist`);
  const vars = ['PATH', 'HOME', 'TMPDIR'].filter((k) => env[k]).map((k) => `<key>${k}</key><string>${xml(env[k]!)}</string>`).join('');
  await fs.writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string>${args.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>EnvironmentVariables</key><dict>${vars}</dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`, { mode: 0o600 });
  const uid = process.getuid?.() ?? 0;
  const taken = await new Promise<boolean>((resolve) => execFile('launchctl', ['bootstrap', `gui/${uid}`, plist], (err) => resolve(!err)));
  if (taken) return;
  await fs.rm(plist, { force: true });
  const out = openSync(log, 'a');
  try { spawn('/bin/sh', args.slice(0, 3), { detached: true, stdio: ['ignore', out, out], env }).unref(); } finally { closeSync(out); }
}

export type UpdaterDeps = {
  dataDir: string; version: string; pid: number;
  appBundle: string | null; // appBundleOf(process.execPath)
  quit: () => void; // the app quits so that the installer may replace it
  site?: string; fetcher?: typeof fetch;
  launch?: (dir: string, label: string, args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  installed?: boolean; // the checks' stand-in for the installed app (CVC_UPDATE_INSTALLED, hidden copies only)
  quitAfterMs?: number;
};

export function updater(deps: UpdaterDeps) {
  let latest: string | undefined;
  const site = deps.site ?? SITE, get = deps.fetcher ?? fetch;
  const dir = path.join(deps.dataDir, 'update');
  const status = async (): Promise<UpdateStatus> => ({ current: deps.version, latest, available: newer(latest, deps.version), installed: deps.installed ?? madeByInstaller(deps.appBundle, deps.dataDir) });
  return {
    /** The latest version, as the site named it. */
    note(v: string) { if (VERSION_RE.test(v)) latest = v; },
    status,
    /** Asks the site which version is the latest; true when it named one. Offline or any other answer: nothing changes. */
    async check(): Promise<boolean> {
      try {
        const r = await get(`${site}/api/personal/version`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        if (!r.ok) { await r.body?.cancel(); return false; }
        const v = ((await r.json().catch(() => null)) as { latest_version?: unknown } | null)?.latest_version;
        if (typeof v !== 'string' || !VERSION_RE.test(v)) return false;
        latest = v; return true;
      } catch { return false; }
    },
    /** On the user's yes: fetches the installer, hands the update to launchd, and quits the app. */
    async run(): Promise<{ ok: boolean; error?: string; updating?: string; log?: string }> {
      const s = await status();
      if (!s.installed) return { ok: false, error: 'This copy updates the way it was installed: a copy run from a clone with git pull and a build. Only the Jauvex.app the install command made updates itself.' };
      if (!s.available) return { ok: false, error: s.latest ? `There is no newer version: this copy runs ${s.current}, the latest is ${s.latest}.` : 'No newer version is known yet: the app asks jauvex.reindent.com at launch and every six hours.' };
      let script: string;
      try {
        const r = await get(`${site}/install`, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
        if (!r.ok) { await r.body?.cancel(); return { ok: false, error: `jauvex.reindent.com answered ${r.status}. Nothing was changed.` }; }
        script = await r.text();
      } catch { return { ok: false, error: 'jauvex.reindent.com could not be reached. Nothing was changed.' }; }
      if (!script.startsWith('#!/bin/sh') || !script.includes('Jauvex Personal') || script.length > 200_000) return { ok: false, error: 'jauvex.reindent.com did not send the installer. Nothing was changed.' };
      const offered = /^\s*version='([^']*)'/m.exec(script)?.[1];
      if (offered !== s.latest) return { ok: false, error: `The installer is for ${offered || 'no version'}, not ${s.latest}: try again in a minute. Nothing was changed.` };
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      for (const [name, body, mode] of [['install.sh', script, 0o600], ['run.sh', RUNNER, 0o700]] as const) { const f = path.join(dir, name); await fs.rm(f, { force: true }); await fs.writeFile(f, body, { mode }); }
      const label = `com.reindent.jauvex-personal.update-${Date.now()}`;
      await (deps.launch ?? launchd)(dir, label, [path.join(dir, 'run.sh'), String(deps.pid), deps.appBundle ?? '', label], deps.env ?? process.env);
      setTimeout(deps.quit, deps.quitAfterMs ?? 1500); // the order's answer reaches the command line first
      return { ok: true, updating: s.latest, log: path.join(dir, 'update.log') };
    },
  };
}
