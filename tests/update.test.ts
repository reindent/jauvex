// Updates (T-165): the version jauvex.reindent.com names against this copy's; the app's own agent is told once per version; the check
// asks the site and takes only a version; the update order refuses on a copy that cannot update itself, with nothing new, or with an
// installer that is not the one expected; with the right one it leaves the installer and its runner in the data folder, hands the runner
// to launchd and quits; the runner waits for the app to quit, runs the installer and removes it. No network, no launchd: stand-ins for
// both; a node process plays the app.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { newer, shouldAsk, updateNote } from '../shared/update.ts';
import { updater, appBundleOf, madeByInstaller, RUNNER } from '../electron/updater.ts';
let failed = 0; const ok = (c: boolean, what: string, detail = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${what}${!c && detail ? ` ${detail}` : ''}`); if (!c) failed++; };
const root = path.join(process.env.CVC_DATA_DIR ?? path.join(process.cwd(), 'tmp', 'testdata-update'), 'update-check'); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });

ok(newer('1.1.1', '1.1.0') && newer('1.10.0', '1.9.9') && newer('2.0.0', '1.99.99') && !newer('1.1.0', '1.1.0') && !newer('1.0.0', '1.1.0'), 'a newer version is newer, by number, not by text');
ok(!newer('latest', '1.1.0') && !newer(undefined, '1.1.0') && !newer('1.2.0', '') && !newer('1.2.0-beta', '1.1.0'), 'anything that is not x.y.z is never newer');
const s = { current: '1.1.0', latest: '1.2.0', available: true, installed: true };
ok(shouldAsk(s, undefined) && shouldAsk(s, '1.1.5') && !shouldAsk(s, '1.2.0'), 'the app\'s agent is told once per version');
ok(!shouldAsk({ ...s, installed: false }, undefined) && !shouldAsk({ ...s, available: false }, undefined) && !shouldAsk(null, undefined), 'never on a copy that cannot update itself, nor with nothing newer');
ok(/1\.2\.0 is out; this copy runs 1\.1\.0/.test(updateNote('1.1.0', '1.2.0')) && /`update` order/.test(updateNote('1.1.0', '1.2.0')), 'the note names both versions and the order to run on a yes');
ok(appBundleOf('/Applications/Jauvex.app/Contents/MacOS/Electron') === '/Applications/Jauvex.app' && appBundleOf('/Users/x/jauvex/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron') === null, 'a copy run as a Mac app has a bundle; one run from a clone has none');
{ const data = path.join(root, 'data'); mkdirSync(path.join(data, 'app'), { recursive: true });
  ok(!madeByInstaller('/Applications/Jauvex.app', data), 'without the installer\'s source folder, a Jauvex.app is not the installed copy');
  writeFileSync(path.join(data, 'app', 'package.json'), JSON.stringify({ name: 'jauvex', version: '1.1.0' }));
  ok(madeByInstaller('/Applications/Jauvex.app', data) && madeByInstaller('/Users/x/Applications/Jauvex.app', data), 'the installed copy: Jauvex.app in Applications, its source in the data folder\'s app/');
  ok(!madeByInstaller('/Users/x/jauvex/tmp/mac-app/Jauvex.app', data) && !madeByInstaller(null, data), 'a Jauvex.app made in a clone, or no bundle at all, is not'); }

// the check: the site's answer, a version only
const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
{ const seen: string[] = []; const u = updater({ dataDir: root, version: '1.1.0', pid: 1, appBundle: null, quit: () => {}, fetcher: (async (url: string) => { seen.push(url); return new Response('{"latest_version":"1.2.0"}'); }) as unknown as typeof fetch });
  ok(await u.check() && seen[0] === 'https://jauvex.reindent.com/api/personal/version' && (await u.status()).latest === '1.2.0', 'the check asks the site\'s version address and keeps the version it names', JSON.stringify(seen)); }
for (const [what, f] of [['an answer that is not a version', answer({ latest_version: '1.2; rm -rf ~' })], ['an error', answer({}, 503)], ['no network', (async () => { throw new Error('offline'); }) as unknown as typeof fetch]] as const) {
  const u = updater({ dataDir: root, version: '1.1.0', pid: 1, appBundle: null, quit: () => {}, fetcher: f }); ok(!(await u.check()) && (await u.status()).latest === undefined, `${what}: nothing is known, nothing breaks`); }

// the order
const script = (v: string) => `#!/bin/sh\n# Jauvex Personal installer.\nset -eu\nmain() {\n  version='${v}'\n}\nmain "$@"\n`;
const make = (o: { installed?: boolean; answer?: () => Response; launched?: unknown[][]; quits?: { n: number } } = {}) => {
  const requests: { url: string; init: RequestInit }[] = [];
  const u = updater({ dataDir: root, version: '1.1.0', pid: 4242, appBundle: '/Applications/Jauvex.app', quit: () => { if (o.quits) o.quits.n++; }, quitAfterMs: 10,
    installed: o.installed ?? true, fetcher: (async (url: string, init: RequestInit) => { requests.push({ url, init }); return (o.answer ?? (() => new Response(script('1.2.0'))))(); }) as unknown as typeof fetch,
    launch: async (...a: unknown[]) => { o.launched?.push(a); } });
  return { u, requests };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
{ const { u, requests } = make({ installed: false }); u.note('1.2.0'); const r = await u.run(); ok(!r.ok && /updates the way it was installed/.test(r.error ?? '') && requests.length === 0, 'a copy the install command did not make says how it updates, and fetches nothing', JSON.stringify(r)); }
{ const { u } = make(); const r = await u.run(); ok(!r.ok && /No newer version is known yet/.test(r.error ?? ''), 'nothing known yet: no update'); }
{ const { u } = make(); u.note('1.1.0'); u.note('nonsense'); const r = await u.run(); ok(!r.ok && /no newer version: this copy runs 1\.1\.0, the latest is 1\.1\.0/.test(r.error ?? ''), 'the same version: no update, and a word that is not a version is ignored', JSON.stringify(r)); }
{ const quits = { n: 0 }, launched: unknown[][] = []; const { u } = make({ answer: () => new Response('nope', { status: 500 }), quits, launched }); u.note('1.2.0'); const r = await u.run(); await wait(30);
  ok(!r.ok && /answered 500/.test(r.error ?? '') && launched.length === 0 && quits.n === 0 && !existsSync(path.join(root, 'update', 'install.sh')), 'the site fails: nothing written, nothing started, the app stays', JSON.stringify(r)); }
{ const quits = { n: 0 }, launched: unknown[][] = []; const { u } = make({ answer: () => new Response(script('1.3.0')), quits, launched }); u.note('1.2.0'); const r = await u.run(); await wait(30);
  ok(!r.ok && /for 1\.3\.0, not 1\.2\.0/.test(r.error ?? '') && launched.length === 0 && quits.n === 0, 'an installer for another version than the one offered is refused'); }
{ const { u } = make({ answer: () => new Response('<html>not it</html>') }); u.note('1.2.0'); const r = await u.run(); ok(!r.ok && /did not send the installer/.test(r.error ?? ''), 'a page that is not the installer is refused'); }
{ const quits = { n: 0 }, launched: unknown[][] = []; const { u, requests } = make({ quits, launched }); u.note('1.2.0'); const st = await u.status(); const r = await u.run(); await wait(40);
  const dir = path.join(root, 'update'), req = requests[0];
  ok(st.available && st.installed && st.latest === '1.2.0', 'the status says a newer version is out, on a copy that can take it', JSON.stringify(st));
  ok(req?.url === 'https://jauvex.reindent.com/install' && req.init.redirect === 'error', 'the installer is the site\'s own install command', JSON.stringify(req?.url));
  ok(r.ok && r.updating === '1.2.0' && readFileSync(path.join(dir, 'install.sh'), 'utf8') === script('1.2.0') && (statSync(path.join(dir, 'install.sh')).mode & 0o777) === 0o600 && readFileSync(path.join(dir, 'run.sh'), 'utf8') === RUNNER, 'the installer (readable by this user only) and its runner wait in the data folder', JSON.stringify(r));
  const a = launched[0] as [string, string, string[]] | undefined;
  ok(!!a && a[0] === dir && JSON.stringify(a[2].slice(0, 3)) === JSON.stringify([path.join(dir, 'run.sh'), '4242', '/Applications/Jauvex.app']) && a[2][3] === a[1] && /^com\.reindent\.jauvex-personal\.update-\d+$/.test(a[1]), 'the runner goes to launchd with the app\'s pid and bundle', JSON.stringify(a));
  ok(quits.n === 1, 'then the app quits, so that the installer may replace it'); }

// the runner, for real: a node process plays the app; the installer is a stand-in that leaves a mark
const rdir = path.join(root, 'runner'); mkdirSync(rdir, { recursive: true }); writeFileSync(path.join(rdir, 'run.sh'), RUNNER, { mode: 0o700 });
const runOnce = async (installer: string) => {
  writeFileSync(path.join(rdir, 'install.sh'), installer, { mode: 0o600 }); rmSync(path.join(rdir, 'mark'), { force: true });
  const appProc = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { stdio: 'ignore' }); let quitAt = 0; appProc.on('exit', () => { quitAt = Date.now(); });
  const runner = spawn('/bin/sh', [path.join(rdir, 'run.sh'), String(appProc.pid), '', ''], { env: { ...process.env, JAUVEX_NO_LAUNCH: '1' } }); let out = '';
  runner.stdout.on('data', (d) => { out += d; }); runner.stderr.on('data', (d) => { out += d; });
  const code = await new Promise<number | null>((resolve) => { const t = setTimeout(() => { runner.kill(); resolve(null); }, 20000); runner.on('exit', (c) => { clearTimeout(t); resolve(c); }); });
  const mark = existsSync(path.join(rdir, 'mark')) ? Number(readFileSync(path.join(rdir, 'mark'), 'utf8')) : 0;
  return { out, code, quitAt, mark };
};
const good = await runOnce(`#!/bin/sh\n"${process.execPath}" -e "require('fs').writeFileSync('${path.join(rdir, 'mark')}', String(Date.now()))"\n`);
ok(good.code === 0 && good.mark > 0 && good.quitAt > 0 && good.mark >= good.quitAt && /updated/.test(good.out) && !existsSync(path.join(rdir, 'install.sh')), 'the runner waits for the app to quit, runs the installer, and removes it', JSON.stringify(good));
const bad = await runOnce('#!/bin/sh\nexit 3\n');
ok(/did not finish: the app opens as it was/.test(bad.out) && !existsSync(path.join(rdir, 'install.sh')), 'an installer that fails: the runner says so and the app opens as it was (not here: no bundle, JAUVEX_NO_LAUNCH)', bad.out);

rmSync(root, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
