#!/usr/bin/env node
// The app's command line, for agents (the Jauvex agent above all): every action in the app, as a request file in
// data/commands that the running app answers. Usage: node scripts/jauvex.ts <command> [--flag value ...]
// Commands: list | add-folder <path> | pick-folder | new-agent [--provider claude|codex|grok|jev] [--folder name|path|id] [--name ..] [--purpose ..] [--kickoff ".."] (always started: --no-kickoff gives it its own introduction)
//           open [--folder ..] [--session id|title] | import --folder .. [<session id|title> ...] [--last N] | new-board --name .. [--folder ..] | send --session id|title [--folder ..] --text ".." | rename --session .. --title ".."
//           settings [--default-provider claude|codex|grok] [--show-jauvex yes|no] [--welcome-next yes|no] [--jauvex-move unified|handoff] [--auto-compact <percent>|provider] [--permission-provider claude|codex|grok --permission-mode ask|auto|yolo|session] | welcome | reload | restart
//           update [--check] [--now] (the app the install command made, to the latest version: it closes, rebuilds and opens again)
// Prints the JSON result; exits 1 when the app said no or did not answer (is it running? same data folder?).
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const dir = path.join(process.env.CVC_DATA_DIR || path.join(process.env.CVC_JAUVEX_HOME || path.join(os.homedir(), '.jauvex'), 'personal'), 'commands'); // electron/paths.ts: the app's data folder // the app's data folder: electron/paths.ts
const [cmd, ...rest] = process.argv.slice(2);
const flags: Record<string, any> = {}; const bare: string[] = [];
for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } } else bare.push(a); }
const yes = (v) => v === true || /^(yes|true|on|1)$/i.test(String(v)); const bool = (k) => (k in flags ? yes(flags[k]) : undefined);
const shapes = {
  list: () => ({ type: 'list' }),
  'add-folder': () => ({ type: 'add-folder', path: flags.path ?? bare[0] }),
  'pick-folder': () => ({ type: 'pick-folder' }),
  'new-agent': () => ({ type: 'new-agent', provider: flags.provider, folder: flags.folder, name: flags.name, purpose: flags.purpose, kickoff: flags['no-kickoff'] ? '' : flags.kickoff }),
  open: () => ({ type: 'open', folder: flags.folder, session: flags.session ?? bare[0] }),
  import: () => ({ type: 'import', folder: flags.folder, sessions: [...(typeof flags.session === 'string' ? [flags.session] : []), ...bare], last: flags.last === undefined ? undefined : Number(flags.last) }),
  'new-board': () => ({ type: 'new-board', folder: flags.folder, name: flags.name ?? bare.join(' ') }),
  send: () => ({ type: 'send', folder: flags.folder, session: flags.session, text: flags.text ?? bare.join(' ') }),
  rename: () => ({ type: 'rename', folder: flags.folder, session: flags.session, title: flags.title ?? bare.join(' ') }),
  settings: () => ({ type: 'settings', permissionProvider: flags['permission-provider'], permissionMode: flags['permission-mode'], defaultProvider: flags['default-provider'], showJauvex: bool('show-jauvex'), welcomeNext: bool('welcome-next'), jauvexMove: flags['jauvex-move'], autoCompact: flags['auto-compact'] === undefined ? undefined : /^provider$/i.test(String(flags['auto-compact'])) ? 0 : Number(String(flags['auto-compact']).replace('%', '')) }), // provider: the provider decides
  update: () => ({ type: 'update', check: flags.check ? true : undefined, now: flags.now ? true : undefined }), // the installed app, to the latest version
  welcome: () => ({ type: 'welcome' }), reload: () => ({ type: 'reload-ui' }), restart: () => ({ type: 'restart-app' }),
};
if (!cmd || !shapes[cmd]) { console.error(`usage: node scripts/jauvex.ts <${Object.keys(shapes).join('|')}> [--flag value ...]`); process.exit(2); }
const body = Object.fromEntries(Object.entries(shapes[cmd]()).filter(([, v]) => v !== undefined));
mkdirSync(dir, { recursive: true }); const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const tmp = path.join(dir, `${id}.tmp`); writeFileSync(tmp, JSON.stringify(body)); renameSync(tmp, path.join(dir, `${id}.json`)); // whole or not there
const result = path.join(dir, `${id}.result.json`); const deadline = Date.now() + Number(flags.timeout ?? 30000);
while (Date.now() < deadline) { if (existsSync(result)) { let r; try { r = JSON.parse(readFileSync(result, 'utf8')); } catch { await new Promise((s) => setTimeout(s, 50)); continue; } try { unlinkSync(result); } catch { /* gone */ } console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); } await new Promise((s) => setTimeout(s, 100)); }
try { unlinkSync(path.join(dir, `${id}.json`)); } catch { /* taken */ }
console.error(JSON.stringify({ ok: false, error: `no answer from the app in ${Math.round((deadline - Date.now() + Number(flags.timeout ?? 30000)) / 1000)}s: is it running, on this data folder (${dir})?` })); process.exit(1);
