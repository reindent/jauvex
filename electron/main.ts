import { app, BrowserWindow, dialog, ipcMain, screen, shell, systemPreferences } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SHELL_VARS, parseShellVars } from './shellenv.js';
import { DATA_DIR } from './paths.js';
import { execFileSync } from 'node:child_process';
import { watch as fsWatch, existsSync, unlinkSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Attachment, ChatEvent, ChatStart, DebugEvent, PermissionDecision, Provider } from '../shared/types.js';

const here = path.dirname(fileURLToPath(import.meta.url)); // dist-electron/
const ROOT = path.resolve(here, '..');
process.env.CVC_ROOT = ROOT;
const DEV_URL = process.env.CVC_DEV_URL;        // set by `npm run dev` (Vite)
const HIDDEN = process.env.CVC_HIDDEN === '1';   // UI checks without taking focus

// Everything this app stores is in its data folder, ~/.jauvex/personal for every copy (electron/paths.ts), run from source or compiled:
// the state, and the Chromium profile in its profile/. CVC_DATA_DIR points automated checks at a throwaway folder so they can never
// touch the real state.
process.env.CVC_DATA_DIR = DATA_DIR;
app.setPath('userData', path.join(DATA_DIR, 'profile'));

// Only one main process may ever exist per data folder. Two copies would both drive the same sessions (a resumed session
// forks, work is done twice, state.json is overwritten). The lock lives in userData, so it is per data folder: a check
// pointed at a throwaway CVC_DATA_DIR still runs beside the real app. A second launch exits here, before it opens a
// window, starts Whisper or touches a session, and the copy that is already running comes to the front instead.
if (!app.requestSingleInstanceLock()) { console.error(`Jauvex is already running on ${DATA_DIR}; this second copy exits.`); app.exit(0); process.exit(0); }
app.on('second-instance', () => { if (!win || HIDDEN) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); });

let win: BrowserWindow | null = null;
let mini: BrowserWindow | null = null;
// Who is listening (each chat by its key, or the welcome): the window makes a sound while anyone is. Counted by name, never one
// flag: when voice moves from one chat to another, the old chat's "off" arrives after the new chat's "on" and used to mute it.
const ears = new Set<string>(); let welcomeOpen = false;
const audible = () => ears.size > 0 || welcomeOpen;
const applyMute = () => win?.webContents.setAudioMuted(HIDDEN || !audible());   // the floating voice controller, visible only while voice is on and the app is in the background
let voiceActive = false;

function showMini(): void {
  if (HIDDEN || !voiceActive || !win) return;
  if (!mini) {
    mini = new BrowserWindow({ width: 268, height: 72, show: false, frame: false, transparent: true, resizable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true,
      fullscreenable: false, minimizable: false, maximizable: false, type: 'panel', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    mini.setAlwaysOnTop(true, 'floating');
    // visibleOnFullScreen alone turns the whole app into a background-only app (no Dock tile, no way back to the window from
    // the Dock): skipTransformProcessType keeps it a normal app. The controller still floats above other windows.
    mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); mini.webContents.setAudioMuted(true);
    if (!HIDDEN) app.dock?.show();
    mini.on('closed', () => { mini = null; });
    if (DEV_URL) void mini.loadURL(`${DEV_URL}#mini`); else void mini.loadFile(path.join(ROOT, 'dist', 'index.html'), { hash: 'mini' });
    // Where it was last dragged to (data/mini-position.json), if that is still on a screen; otherwise the bottom centre of the app's display.
    const posFile = path.join(DATA_DIR, 'mini-position.json'); let placed = false;
    try { const [x, y] = JSON.parse(readFileSync(posFile, 'utf8')) as [number, number]; if (screen.getAllDisplays().some((d) => x >= d.workArea.x && x + 268 <= d.workArea.x + d.workArea.width && y >= d.workArea.y && y + 72 <= d.workArea.y + d.workArea.height)) { mini.setPosition(Math.round(x), Math.round(y)); placed = true; } } catch { /* never moved */ }
    if (!placed) { const area = screen.getDisplayMatching(win.getBounds()).workArea; mini.setPosition(Math.round(area.x + area.width / 2 - 134), Math.round(area.y + area.height - 72 - 28)); }
    mini.on('moved', () => { try { writeFileSync(posFile, JSON.stringify(mini?.getPosition() ?? [0, 0])); } catch { /* not remembered */ } });
    // Dragging by the handle: a transparent panel that never takes focus cannot rely on the web drag region, so the window follows the
    // pointer itself: from the moment the handle is pressed until it is released, the bar moves by the pointer's movement on screen.
    let drag: { timer: NodeJS.Timeout; sx: number; sy: number; wx: number; wy: number } | null = null;
    ipcMain.removeAllListeners('mini:drag'); ipcMain.on('mini:drag', (_e, on: boolean) => {
      if (drag) { clearInterval(drag.timer); drag = null; try { writeFileSync(posFile, JSON.stringify(mini?.getPosition() ?? [0, 0])); } catch { /* not remembered */ } }
      if (!on || !mini) return; const c = screen.getCursorScreenPoint(); const [wx = 0, wy = 0] = mini.getPosition();
      drag = { sx: c.x, sy: c.y, wx, wy, timer: setInterval(() => { if (!mini || !drag) return; const n = screen.getCursorScreenPoint(); mini.setPosition(Math.round(drag.wx + n.x - drag.sx), Math.round(drag.wy + n.y - drag.sy)); }, 16) };
    });
  }
  mini.showInactive(); // never takes the keyboard away from whatever the user switched to
}

// Launched through LaunchServices the app gets a bare environment: PATH (Claude's hooks and MCP servers expect the shell's), and the
// providers' own folders when the user moved them: CLAUDE_CONFIG_DIR (where Claude Code keeps its sessions: without it the app looked in
// ~/.claude and listed none of a user's Claude Code sessions, while Codex's showed) and CODEX_HOME. Taken from the login shell.
function adoptShellPath(): void {
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(shell, ['-ilc', SHELL_VARS.map((k) => `printf "__${k}__%s__END_${k}__" "$${k}"`).join('; ')], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
    const got = parseShellVars(out); if (got.PATH) process.env.PATH = got.PATH;
    for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME'] as const) if (got[k] && !process.env[k]) process.env[k] = got[k];
  } catch { /* keep the inherited environment */ }
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 900, minHeight: 600, show: false,
    backgroundColor: '#141413', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 15 },
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', webviewTag: true /* the right pane frames pages and PDFs in a <webview> */ },
  });
  // The window stays muted until voice mode is switched on by the user or the welcome screen is open (and always during hidden automated checks).
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  // The window never sails off to a link: a navigation the app did not catch goes to the right pane instead (a handoff link once took the window over).
  win.webContents.on('will-navigate', (e, url) => { if (url === win?.webContents.getURL()) return; e.preventDefault(); win?.webContents.send('pane:open', url); });
  // Every framed page starts muted and stays so, and opens no windows of its own.
  win.webContents.on('did-attach-webview', (_e, wc) => { wc.setAudioMuted(true); wc.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; }); });
  if (!HIDDEN) win.once('ready-to-show', () => win?.show());
  win.on('blur', () => { if (!mini?.isFocused()) showMini(); });
  win.on('focus', () => mini?.hide());
  win.on('closed', () => { mini?.destroy(); mini = null; win = null; });
  if (DEV_URL) await win.loadURL(DEV_URL); else await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
}

app.setName('Jauvex');
app.whenReady().then(async () => {
  adoptShellPath();
  if (HIDDEN) app.dock?.hide(); // an automated check must not put a second app icon in the user's Dock
  else app.dock?.setIcon(path.join(ROOT, 'assets', 'icon.png')); // launched as the stock Electron.app, so the Dock icon is set at runtime
  // No server: the renderer talks to this process over IPC. One channel, a dispatch table.
  const { backend } = await import('./backend.js');
  ipcMain.handle('api', async (_e, method: string, ...args: unknown[]) => {
    const fn = (backend as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function') throw new Error(`unknown method: ${method}`);
    return fn(...args);
  });
  ipcMain.handle('pick-folder', async () => {
    if (HIDDEN) return null; // an automated check has nobody to choose a folder
    const r = await dialog.showOpenDialog(win!, { title: 'Add a project folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle('pick:images', async () => { // images to attach to a message (the composer also takes paste and drop)
    const r = await dialog.showOpenDialog(win!, { title: 'Attach images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }); if (r.canceled) return [];
    const { readFile } = await import('node:fs/promises'); const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
    return Promise.all(r.filePaths.map(async (f) => ({ name: path.basename(f), mediaType: mime[path.extname(f).slice(1).toLowerCase()] ?? 'image/png', data: (await readFile(f)).toString('base64') })));
  });
  const chat = await import('./chat.js');
  // The message_agent / list_agents tools of a Claude session are answered by the window, which owns the roster and the router.
  const agentWaits = new Map<string, (text: string) => void>();
  chat.setAgentRequest((chatId, req) => new Promise((resolve) => { const id = randomUUID(); const t = setTimeout(() => { agentWaits.delete(id); resolve('The app did not answer in time.'); }, 30_000); agentWaits.set(id, (text) => { clearTimeout(t); resolve(text); }); const l = chat.liveInfo(chatId); win?.webContents.send('agent:request', { id, chatId, projectId: l?.projectId ?? '', sessionId: l?.sessionId ?? null, req }); }));
  ipcMain.on('agent:request:done', (_e, id: string, text: string) => { agentWaits.get(id)?.(text); agentWaits.delete(id); });
  const usage = await import('./usage.js');
  const account = await import('./account.js'); account.setSink((e) => win?.webContents.send('account:event', e));
  ipcMain.handle('account:status', (_e, provider: Provider) => account.status(provider));
  ipcMain.handle('account:logout', (_e, provider: Provider) => account.logout(provider));
  ipcMain.handle('account:login', (_e, provider: Provider) => account.login(provider));
  ipcMain.handle('account:reply', (_e, provider: Provider, text: string) => account.reply(provider, text));
  ipcMain.handle('account:cancel', (_e, provider: Provider) => account.cancel(provider));
  // The app relaunches itself with the build that is on disk (the same arguments, the same data folder); every turn dies with it.
  // The lock must go first: the relaunched copy starts while this one is still on its way out, and with the lock held it
  // would exit at once as "already running", leaving no app at all.
  // The danger zone: reset the app to its initial state. Only the app's own data goes (the folders and sessions listed in the sidebar,
  // the Jauvex agent's conversation, every setting, the flight recorder); the sessions themselves stay in Claude's and Codex's stores,
  // untouched. Confirmed in a native dialog, then the app says so and exits: the next start is a first run.
  ipcMain.handle('app:reset', async () => {
    const auto = HIDDEN || process.env.CVC_CONFIRM === 'yes'; // automated checks cannot click a dialog
    if (!auto) { const r = await dialog.showMessageBox(win!, { type: 'warning', buttons: ['Cancel', 'Reset and exit'], defaultId: 0, cancelId: 0, message: 'Reset the app to its initial state?', detail: "This deletes the app's own data: the folders and sessions in the sidebar (the sessions themselves stay in Claude and Codex, untouched), the Jauvex agent's conversation, and every setting. It cannot be undone. The app will exit afterwards." }); if (r.response !== 1) return false; }
    const { rmSync } = await import('node:fs'); (await import('./backend.js')).forgetState(); /* the copy in memory must not be written back */
    for (const f of ['state.json', 'jauvex-transcript.json', 'jauvex-handover.md', 'mini-position.json', 'voice-debug.log', 'uploads', 'commands']) { try { rmSync(path.join(DATA_DIR, f), { recursive: true, force: true }); } catch { /* gone */ } }
    if (!auto) await dialog.showMessageBox(win!, { type: 'info', buttons: ['OK'], message: "The app's data has been deleted.", detail: 'The app will now exit. Start it again to begin from the welcome screen.' });
    setTimeout(() => app.exit(0), auto ? 1500 : 200); return true;
  });
  ipcMain.handle('app:restart', () => { app.releaseSingleInstanceLock(); app.relaunch(); setTimeout(() => app.exit(0), 300); return true; });
  ipcMain.handle('open:external', (_e, url: string) => (/^(https:\/\/|x-apple\.systempreferences:)/.test(url) ? shell.openExternal(url).then(() => true) : false)); // web pages, and System Settings panes (the welcome opens Spoken Content)
  ipcMain.handle('chat:start', (_e, req: ChatStart) => { void chat.startChat(req, (ev: ChatEvent) => win?.webContents.send('chat:event', ev)).catch((err: Error) => win?.webContents.send('chat:event', { chatId: req.chatId, type: 'done', ok: false, error: err.message } satisfies ChatEvent)); return true; });
  ipcMain.handle('usage:get', (_e, provider: Provider, force?: boolean) => usage.get(provider, force));
  ipcMain.handle('chat:running', (_e, chatId: string) => chat.isRunning(chatId));
  ipcMain.handle('chat:live', () => chat.liveList());
  // A soft restart: the window reloads the UI build on disk; the main process, its servers and every running turn stay.
  // A file for the right pane. Text as is (markdown rendered by the window), images as data, pages and PDFs framed by the window itself.
  ipcMain.handle('file:read', async (_e, p: string) => {
    const { readFile, stat } = await import('node:fs/promises'); const file = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p; const name = path.basename(file);
    try { const st = await stat(file); if (st.isDirectory()) { const names = readdirSync(file).sort(); return { ok: true, kind: 'text', name, path: file, size: st.size, mediaType: 'text/plain', text: names.join('\n') }; }
      const ext = path.extname(file).slice(1).toLowerCase(); const image: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon' };
      if (image[ext]) { if (st.size > 40e6) return { ok: false, error: 'This image is over 40 MB; open it with the Mac.', path: file }; return { ok: true, kind: 'image', name, path: file, size: st.size, mediaType: image[ext], data: (await readFile(file)).toString('base64') }; }
      if (ext === 'pdf' || ext === 'html' || ext === 'htm') return { ok: true, kind: 'frame', name, path: file, size: st.size, mediaType: ext === 'pdf' ? 'application/pdf' : 'text/html' };
      if (st.size > 2e6) return { ok: false, error: `This file is ${(st.size / 1e6).toFixed(1)} MB; open it with the Mac.`, path: file };
      const buf = await readFile(file); if (buf.subarray(0, 8000).includes(0)) return { ok: false, error: 'Not a text file; open it with the Mac.', path: file };
      return { ok: true, kind: /^(md|markdown|mdx)$/.test(ext) ? 'markdown' : 'text', name, path: file, size: st.size, mediaType: 'text/plain', text: buf.toString('utf8') };
    } catch (e) { const err = e as NodeJS.ErrnoException; return { ok: false, error: err.code === 'ENOENT' ? `No such file: ${file}` : err.code === 'EACCES' ? `No permission to read ${file}` : err.message, path: file }; } });
  ipcMain.handle('file:open', (_e, p: string) => shell.openPath(p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p).then((err) => !err));
  ipcMain.handle('app:reload', () => { win?.webContents.reloadIgnoringCache(); return true; });
  // An agent working on the app cannot call IPC: it asks by touching a file in the data folder. `reload-ui` reloads the
  // window (a UI build), `restart-app` relaunches the app (a main-process build). The file is removed once acted on.
  const signals: Record<string, () => void> = { 'reload-ui': () => { win?.webContents.reloadIgnoringCache(); }, 'restart-app': () => { app.releaseSingleInstanceLock(); app.relaunch(); setTimeout(() => app.exit(0), 300); } };
  try { fsWatch(DATA_DIR, (_event, name) => { const key = String(name ?? ''); const act = signals[key]; if (!act) return; const file = path.join(DATA_DIR, key); if (!existsSync(file)) return; try { unlinkSync(file); } catch { /* gone */ } setTimeout(act, 200); }); } catch { /* no watcher, no signals */ }
  // Agents drive the app through files too: a request `<id>.json` in data/commands (written by scripts/jauvex.ts) goes to the
  // window, which does the thing and answers; the answer lands in `<id>.result.json` and the request is removed.
  const CMD_DIR = path.join(DATA_DIR, 'commands'); mkdirSync(CMD_DIR, { recursive: true }); const seen = new Set<string>();
  const takeCommand = (name: string) => { if (!/^[\w-]+\.json$/.test(name) || name.endsWith('.result.json') || seen.has(name)) return; const file = path.join(CMD_DIR, name); if (!existsSync(file)) return;
    let body: unknown; try { body = JSON.parse(readFileSync(file, 'utf8')); } catch { return; } /* still being written: the next event brings it whole */ seen.add(name); const id = name.slice(0, -5);
    if (!win) { writeFileSync(path.join(CMD_DIR, `${id}.result.json`), JSON.stringify({ ok: false, error: 'no window' })); try { unlinkSync(file); } catch { /* gone */ } return; }
    win.webContents.send('app:command', { id, command: body }); };
  ipcMain.on('app:command:done', (_e, id: string, result: unknown) => { const safe = String(id).replace(/[^\w-]/g, ''); writeFileSync(path.join(CMD_DIR, `${safe}.result.json`), JSON.stringify(result)); try { unlinkSync(path.join(CMD_DIR, `${safe}.json`)); } catch { /* gone */ } seen.delete(`${safe}.json`); });
  try { fsWatch(CMD_DIR, (_event, name) => { if (name) setTimeout(() => takeCommand(String(name)), 50); }); } catch { /* no watcher, no commands */ }
  setTimeout(() => { try { for (const n of readdirSync(CMD_DIR)) takeCommand(n); } catch { /* nothing waiting */ } }, 3000); // requests left while the app was down
  ipcMain.handle('chat:steer', (_e, chatId: string, text: string, images?: Attachment[]) => chat.steerChat(chatId, text, images));
  ipcMain.handle('chat:stop', (_e, chatId: string) => chat.stopChat(chatId));
  ipcMain.handle('chat:answer', (_e, chatId: string, requestId: string, decision: PermissionDecision) => chat.answerPermission(chatId, requestId, decision));
  const debug = await import('./debug.js');
  const voice = await import('./voice.js');
  ipcMain.handle('voice:on', async (_e, on: boolean, who: string, provider?: Provider, ackModel?: string, stt?: { model: string; vocabulary: string }) => {
    if (on && process.platform === 'darwin' && !HIDDEN) { const ok = await systemPreferences.askForMediaAccess('microphone'); if (!ok) throw new Error('Microphone access is off for this app. Allow it in System Settings > Privacy & Security > Microphone, then try again.'); }
    const key = who || 'voice'; if (on) ears.add(key); else ears.delete(key); applyMute();
    debug.log('note', `voice ${on ? 'on' : 'off'} for ${key}${provider ? ` (${provider})` : ''}; listening now: ${[...ears].join(', ') || 'nobody'}; the window is ${audible() ? 'audible' : 'muted'}`, { by: 'app' });
    if (on) { if (stt) voice.configureStt(stt.model, stt.vocabulary); void voice.ensureWhisper(); if (provider && ackModel !== undefined) voice.warmAck(provider, ackModel); } else if (!ears.size) voice.cancelSpeech(); /* the last ears off: nothing left to render for */ return voice.status(); });
  const jev = await import('./jev.js');
  ipcMain.handle('welcome:intent', (_e, text: string) => voice.welcomeIntent(text));
  ipcMain.on('audio:welcome', (_e, open: boolean) => { welcomeOpen = open; applyMute(); }); // the welcome screen speaks without voice mode
  ipcMain.handle('voice:decisions', (_e, useJev: boolean) => { jev.setEnabled(useJev); return voice.status(); });
  ipcMain.handle('voice:command', (_e, text: string, projects: { id: string; name: string; path?: string }[], currentId: string, speaker?: { provider: Provider; model: string; main: string; mainModel?: string }) => voice.command(text, projects, currentId, speaker));
  ipcMain.handle('voice:done', (_e, text: string) => voice.thoughtDone(text));
  debug.setSink((e) => win?.webContents.send('debug:event', e));
  voice.setDetailsSink((d) => win?.webContents.send('command:details', d));
  ipcMain.handle('debug:list', () => debug.list());
  ipcMain.handle('debug:clear', () => { debug.clear(); return true; });
  ipcMain.on('debug:push', (_e, kind: DebugEvent['kind'], text: string) => debug.log(kind, text, { by: 'app' }));
  ipcMain.handle('voice:status', () => voice.status());
  ipcMain.handle('voice:model-in-use', (_e, provider: Provider, preferred: string) => voice.voiceModelInUse(provider, preferred));
  ipcMain.handle('setup:check', () => voice.setupCheck());
  ipcMain.handle('voice:stt', (_e, model: string, vocabulary: string) => { voice.configureStt(model, vocabulary); void voice.ensureWhisper(); return true; });
  ipcMain.handle('voice:wake', (_e, wav: ArrayBuffer, phrase: string, language: string) => voice.wakeCheck(wav, phrase, language));
  ipcMain.handle('voice:transcribe', (_e, wav: ArrayBuffer, language: string, quiet?: boolean, hint?: string, retry?: boolean) => voice.transcribe(wav, language, quiet, hint, retry));
  ipcMain.handle('voice:ack', (_e, text: string) => voice.acknowledge(text));
  ipcMain.handle('voice:understand', (_e, text: string, provider: Provider, model: string, main: string, recent?: string, said?: string) => voice.understand(text, provider, model, main, recent, said));
  ipcMain.handle('voice:triage', (_e, text: string, provider: Provider, model: string, main: string, task?: string) => voice.triage(text, provider, model, main, task));
  ipcMain.handle('voice:summarize', (_e, asked: string, answer: string, provider: Provider, model: string, main: string) => voice.summarize(asked, answer, provider, model, main));
  ipcMain.handle('voice:speak', (_e, text: string, v: string, rate: number) => voice.speak(text, v, rate));
  ipcMain.handle('voice:cancel', () => { voice.cancelSpeech(); return true; });
  ipcMain.on('voice:state', (_e, st: { on: boolean }) => { voiceActive = Boolean(st.on); if (!voiceActive) mini?.hide(); mini?.webContents.send('voice:state', st); });
  ipcMain.on('voice:type', (_e, text: string) => { win?.webContents.send('voice:type', String(text)); }); // typed in the tiny bar: to the listening chat, without bringing the app forward
  ipcMain.on('mini:size', (_e, w: number) => { if (!mini) return; const [, h] = mini.getSize(); mini.setSize(Math.max(200, Math.round(w)), h ?? 72, true); }); // the bar grows for its typing box (animated on macOS)
  ipcMain.on('voice:cmd', (_e, cmd: string) => { if ((cmd === 'focus' || cmd === 'new') && !HIDDEN) { win?.show(); win?.focus(); } /* an automated check never comes to the front */ win?.webContents.send('voice:cmd', cmd); });
  const codex = await import('./codex.js');
  app.on('before-quit', () => { chat.stopAll(); voice.shutdown(); account.shutdown(); codex.shutdown(); });
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on('window-all-closed', () => app.quit());
