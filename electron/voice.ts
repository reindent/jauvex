import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promises as fs, existsSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AppCommand, BusyTriage, CommandDetails, Provider, SetupCheck, Transcript, VoiceStatus } from '../shared/types.js';
import { withAppWords } from '../shared/types.js';
import { wakeMatch } from '../shared/transcript.js';
import { JEV_MIN_CONFIDENCE, orderVerdict } from '../shared/orders.js';
import * as codex from './codex.js';
import { DATA_DIR } from './paths.js';
import * as jev from './jev.js';
import * as debug from './debug.js';
import { claudeExe } from './account.js';

/**
 * The voice engine. Three local pieces and one small model:
 *   ears   - whisper.cpp `whisper-server`, started once so the model stays warm in memory
 *   mouth  - macOS `say`, rendering one sentence at a time to a WAV that the window plays (so it can fade
 *            out instantly on barge-in and Chromium's echo canceller knows what the speakers are playing)
 *   voice  - a small fast model from the session's own provider (Claude or Codex) that acknowledges while the selected
 *            model thinks, and afterwards says briefly what happened. The selected model's full answer is never read aloud; it stays on screen.
 */
const ROOT = process.env.CVC_ROOT ?? process.cwd();
const WHISPER_PORT = Number(process.env.CVC_WHISPER_PORT || 4341);
// small first: ~0.4 s per utterance on Apple Silicon, which fits inside the end-of-turn pause. CVC_WHISPER_MODEL overrides.
const MODEL_CANDIDATES = ['ggml-small-q5_1.bin', 'ggml-small.bin', 'ggml-base-q5_1.bin', 'ggml-base.bin', 'ggml-large-v3-turbo-q5_0.bin', 'ggml-large-v3-turbo.bin'];

// ---------- ears
let whisper: ChildProcess | null = null;
let whisperState: VoiceStatus['whisper'] = 'starting';
let whisperDetail = '';

function findOnPath(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(':').concat(['/opt/homebrew/bin', '/usr/local/bin'])) { const p = path.join(dir, bin); if (dir && existsSync(p)) return p; }
  return null;
}
// What the user picked in the voice settings. The vocabulary is Whisper's "initial prompt": names it would otherwise
// mishear (measured here: "Clothex", "Cotex", "Reigned-in" without it; all correct with it, on the small model).
// whisper-server only takes it at start-up (the per-request prompt field is ignored), so a change restarts the server.
let want = { model: '', vocabulary: '' }; let running = { model: '', vocabulary: '' };
export function listModels(): string[] { try { return readdirSync(path.join(ROOT, 'models')).filter((f) => f.endsWith('.bin')).sort(); } catch { return []; } }
export function configureStt(model: string, vocabulary: string): void {
  want = { model, vocabulary: withAppWords(vocabulary.replace(/\s+/g, ' ').trim()).slice(0, 600) }; // the app's own names always go in (Jev was heard as Jauvex)
  if (whisper && (want.model !== running.model || want.vocabulary !== running.vocabulary)) { const old = whisper; whisper = null; whisperState = 'starting'; old.removeAllListeners('exit'); old.once('exit', () => void ensureWhisper()); old.kill('SIGTERM'); }
}
function findModel(): string | null {
  const dirs = [process.env.CVC_WHISPER_MODEL_DIR, path.join(ROOT, 'models')].filter((d): d is string => Boolean(d));
  if (want.model && existsSync(path.join(ROOT, 'models', want.model))) return path.join(ROOT, 'models', want.model);
  if (process.env.CVC_WHISPER_MODEL && existsSync(process.env.CVC_WHISPER_MODEL)) return process.env.CVC_WHISPER_MODEL;
  for (const d of dirs) for (const m of MODEL_CANDIDATES) { const p = path.join(d, m); if (existsSync(p)) return p; }
  return null;
}
/** The whisper-servers a previous run of the app left on one of its ports (the app dies without them when it is killed, and each restart used to add a pair).
 * Found by port (lsof), each one checked by its command line (whisper-server on exactly that port, with a model from this install), never ours, and
 * stopped by its own pid. Another install's is left alone: on 2026-09-24 starting the other edition next to this one stopped both our servers. */
const ownModel = (cmd: string): boolean => [path.join(ROOT, 'models'), process.env.CVC_WHISPER_MODEL_DIR].some((d) => !!d && cmd.includes(`${d}${path.sep}`)) || (!!process.env.CVC_WHISPER_MODEL && cmd.includes(process.env.CVC_WHISPER_MODEL));
const capture = (bin: string, args: string[]) => new Promise<string>((resolve) => execFile(bin, args, (_e, out) => resolve(out ?? '')));
const listening = async (port: number): Promise<number[]> => (await capture('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])).split(/\s+/).map(Number).filter((p) => p > 0);
export async function stopLeftovers(port: number): Promise<number[]> {
  const pids = (await listening(port)).filter((p) => p !== process.pid && p !== whisper?.pid && p !== live?.pid);
  const stopped: number[] = [];
  for (const pid of pids) { const cmd = await capture('ps', ['-o', 'command=', '-p', String(pid)]); if (!/(^|\/)whisper-server\b/.test(cmd) || !cmd.includes(`--port ${port}`)) continue; if (!ownModel(cmd)) { debug.log('note', `port ${port} is taken by another install's whisper-server (pid ${pid}): left alone`, { by: 'app' }); continue; } try { process.kill(pid, 'SIGTERM'); stopped.push(pid); } catch { /* already gone */ } }
  if (stopped.length) { debug.log('note', `stopped ${stopped.length} whisper-server${stopped.length > 1 ? 's' : ''} left on port ${port} by a previous run (pid ${stopped.join(', ')})`, { by: 'app' }); await new Promise((r) => setTimeout(r, 300)); }
  return stopped;
}
/** Who listens on a port, apart from the leftovers just stopped (still on their way out): "node (pid 123)", or '' when nobody does. */
async function portHolder(port: number, leaving: number[]): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const pids = await listening(port); const other = pids.find((p) => !leaving.includes(p));
    if (other) return `${path.basename((await capture('ps', ['-o', 'comm=', '-p', String(other)])).trim()) || 'another program'} (pid ${other})`;
    if (!pids.length) return '';
    await new Promise((r) => setTimeout(r, 250));
  }
  return '';
}
const portTaken = (port: number, holder: string) => `port ${port} is taken by ${holder || 'another program'}, so Whisper cannot start. Quit that program, then talk again`;
const FETCHED = ['ggml-small-q5_1.bin', 'ggml-base-q5_1.bin']; // the models the install command and start.sh download (scripts/models.sh), and download again when one is cut short
const INSTALLED = /\.app\/Contents\//.test(ROOT); // Jauvex.app, made by the install command; else a clone, run with start.sh
/** Why whisper-server stopped before it answered, in words, from what it printed. It prints its error (a model it cannot load, a port that is
 * taken) and returns; on the Mac's GPU it then fails an assertion on the way out (ggml frees its Metal device with the model still in it) and
 * prints a backtrace, so the end of its output is that backtrace alone. "exited (null). 9 dyld ... start + 6124" was all the app said on
 * 2026-09-24, on a new Mac whose small model an interrupted download had left incomplete. The error is in the lines before it. */
export function whisperFailure(out: string, o: { model: string; port: number; code: number | null; signal: string | null; installed?: boolean }): string {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const end = lines.findIndex((l) => /GGML_ASSERT|ggml_abort|^\d+\s+\S+\s+0x[0-9a-f]{8,}\s/.test(l));
  const said = end < 0 ? lines : lines.slice(0, end);
  if (said.some((l) => /couldn't bind to server socket/i.test(l))) return portTaken(o.port, '');
  const name = path.basename(o.model);
  if (said.some((l) => /not all tensors loaded|failed to load model|failed to initialize whisper context|invalid model|bad magic|has wrong size/i.test(l)))
    return `${name} is incomplete or damaged, so Whisper cannot load it. ${FETCHED.includes(name) ? `${o.installed ? 'Run the install command again' : 'Run sh start.sh again'}: it downloads the model again` : 'Download it again'}`;
  const why = said.find((l) => /^error\b/i.test(l)) ?? [...said].reverse().find((l) => /error|failed|cannot|could not|unknown|invalid/i.test(l)) ?? said.at(-1) ?? '';
  return `whisper-server stopped (${o.signal ?? `exit ${o.code}`})${why ? `: ${why.slice(0, 200)}` : ''}`;
}
let lastFailure = ''; // said once in the flight recorder, not at every retry (each utterance tries again)
function failed(detail: string, out = ''): void {
  whisperState = 'error'; whisperDetail = detail; if (detail === lastFailure) return; lastFailure = detail;
  debug.log('note', detail, { by: 'whisper', ...(out ? { detail: out.slice(-6000) } : {}) });
}
/** Until whisper-server answers, or its process ends: a server that died at start used to be waited for the whole minute, and every word said meanwhile with it. */
async function waitForServer(ms: number, proc: ChildProcess | null): Promise<boolean> {
  const t0 = Date.now(); const ended = () => !!proc && (proc.exitCode !== null || proc.signalCode !== null);
  while (Date.now() - t0 < ms && !ended()) { try { const r = await fetch(`http://127.0.0.1:${WHISPER_PORT}/`); if (r.status < 500) return !ended(); } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
  return false;
}
let whisperStarting: Promise<void> | null = null; // one start at a time: two callers during the leftover cleanup used to spawn two servers
export async function ensureWhisper(): Promise<void> {
  ensureLive(); // the small server for live words starts alongside
  if (whisper && whisperState === 'ready') return;
  if (whisperStarting) return whisperStarting;
  whisperStarting = startWhisper().finally(() => { whisperStarting = null; }); return whisperStarting;
}
async function startWhisper(): Promise<void> {
  if (whisper && whisperState === 'starting') { await waitForServer(60_000, whisper); return; }
  if (whisper) { const hung = whisper; whisper = null; hung.removeAllListeners('exit'); hung.kill('SIGKILL'); } // one that never came up
  const bin = findOnPath('whisper-server');
  if (!bin) { whisperState = 'missing-binary'; whisperDetail = 'whisper-server not found. Install with: brew install whisper-cpp'; return; }
  const model = findModel();
  if (!model) { whisperState = 'missing-model'; whisperDetail = `No Whisper model in ${path.join(ROOT, 'models')}. See README for the one-line download.`; return; }
  whisperState = 'starting'; whisperDetail = path.basename(model); running = { ...want };
  const leaving = await stopLeftovers(WHISPER_PORT); // else the old one answers first, with an old vocabulary, and stays forever
  const holder = await portHolder(WHISPER_PORT, leaving); if (holder) { failed(portTaken(WHISPER_PORT, holder)); return; } // another program would answer in its place
  // -l auto: language detected per utterance. -nt: no timestamps. -sns: suppress non-speech tokens. --prompt: the vocabulary.
  const me = spawn(bin, ['-m', model, '--host', '127.0.0.1', '--port', String(WHISPER_PORT), '-l', 'auto', '-nt', '-sns', ...(want.vocabulary ? ['--prompt', `${want.vocabulary}.`] : [])], { stdio: ['ignore', 'ignore', 'pipe'] }); whisper = me;
  let err = ''; me.stderr?.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-20_000); });
  // 'close', not 'exit': by then all it printed is in. One replaced (a new vocabulary) or stopped on purpose is no longer `whisper`.
  const closed = new Promise<void>((resolve) => me.on('close', (code, signal) => { if (whisper === me) { whisper = null; if (whisperState !== 'ready' || code) failed(whisperFailure(err, { model, port: WHISPER_PORT, code, signal, installed: INSTALLED }), err); } resolve(); }));
  if (await waitForServer(60_000, me)) { whisperState = 'ready'; lastFailure = ''; void warmStt(WHISPER_PORT); }
  else if (me.exitCode !== null || me.signalCode !== null) await closed; // its reason is set by then
  else if (whisper === me) failed('whisper-server did not come up in 60 s', err);
}
const NOISE = /^[\s.,!?¡¿-]*$|^\s*[\[(][^\])]*[\])]\s*$/; // "", "...", "[BLANK_AUDIO]", "(wind blowing)"
// Whisper's ghosts: what it writes when it is handed a knock, a hum or room noise instead of speech. They are real phrases, so they
// are only dropped when Whisper itself was unsure (its no-speech probability and its confidence in the words come with every segment).
const PHANTOM = /^\W*(thank you( very much| so much)?|thanks( for watching| for listening)?|thank you for watching|bye( bye)?|you|okay|ok|so|yeah|hmm+|uh+|um+|gracias|gracias por ver( el video)?|subt[ií]tulos.*|amara\.org.*|please subscribe.*)\W*$/i;
type Segment = { text?: string; no_speech_prob?: number; avg_logprob?: number };
/** Why a transcript is not speech, or '' when it is. Measured here: real speech scores about -0.1 confidence and 0.01 no-speech; hiss 0.88 no-speech; a knock -0.35 and gibberish.
 * The no-speech score alone only drops short or doubtful text: a short greeting padded with silence scored 0.74 while Whisper had every word right, and it vanished. */
// Whole transcripts Whisper invents from near-silence, a video's outro: dropped whatever their score and length (one joined a real message).
const PHANTOM_LONG = /^\W*(thank you (so much |very much )?for (your time|watching|listening)|thanks (so much )?for (watching|listening|your time)|please subscribe.*|(don't forget to |remember to )?(like and )?subscribe to (the|my|our) channel.*|see you (in the )?next (time|video)|subt[ií]tulos.*|amara\.org.*)\W*$/i;
export function ghost(text: string, segments: Segment[]): string {
  if (PHANTOM_LONG.test(text)) return 'a phrase Whisper invents from near-silence, dropped whatever its score';
  const nsp = Math.max(0, ...segments.map((g) => g.no_speech_prob ?? 0)); const lp = segments.length ? segments.reduce((a, g) => a + (g.avg_logprob ?? 0), 0) / segments.length : 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (/(.)\1{2,}/u.test(text.replace(/\s/g, '')) && text.length < 12) return 'a repeated glyph, not words';
  if (PHANTOM.test(text) && (lp < -0.25 || nsp > 0.3)) return `a known ghost phrase at confidence ${lp.toFixed(2)}, no-speech ${nsp.toFixed(2)}`;
  // A sentence of four words or more is speech unless the words themselves are garbage: a trailing-off "And then in the end it returns a..."
  // scored -0.83 and was dropped, and losing what was said is the worst failure. The scores only judge short text.
  if (words >= 4) return lp < -1.4 ? `confidence ${lp.toFixed(2)}: garbled words` : '';
  if (nsp > 0.6) return `no-speech probability ${nsp.toFixed(2)}`;
  if (lp < -0.8) return `confidence ${lp.toFixed(2)}`;
  return '';
}
/** A server's first inference pays for loading the model onto the GPU (seconds). Half a second of silence pays it before the user's first sentence does. */
async function warmStt(port: number): Promise<void> {
  const n = 8000, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const form = new FormData(); form.append('file', new Blob([buf], { type: 'audio/wav' }), 'warm.wav'); form.append('response_format', 'json');
  try { const t0 = Date.now(); await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form }); debug.log('note', `speech-to-text on port ${port} warmed up`, { by: 'whisper', ms: Date.now() - t0 }); } catch { /* the first real request pays instead */ }
}
// ---------- live words: a second, tiny Whisper only for showing what is being said while it is being said.
// The real transcript must never wait behind these (whisper-server answers one request at a time), so they get their own
// server with the smallest model on disk. No small model, no live words: the bubble then fills in at each pause instead.
// A live server that stops (2026-09-24: it died, and the app never started it again, so every wake phrase after that was heard as
// nothing) starts again the next time it is needed, at most once every LIVE_RETRY_MS: one that dies at start does not loop.
const LIVE_PORT = WHISPER_PORT + 1; const LIVE_RETRY_MS = Number(process.env.CVC_LIVE_RETRY_MS) || 30_000;
let live: ChildProcess | null = null; let liveReady = false; let liveNone = false; let liveStarting = false; let liveNext = 0;
function ensureLive(): void {
  if (live || liveStarting || liveNone || Date.now() < liveNext) return;
  const bin = findOnPath('whisper-server'); const dir = path.join(ROOT, 'models');
  const model = ['ggml-base-q5_1.bin', 'ggml-base.bin', 'ggml-tiny-q5_1.bin', 'ggml-tiny.bin'].map((f) => path.join(dir, f)).find((f) => existsSync(f)); if (!bin || !model) { liveNone = true; return; }
  liveStarting = true; liveNext = Date.now() + LIVE_RETRY_MS;
  void stopLeftovers(LIVE_PORT).then(async () => { // a live-words server left by a previous run goes first, like the main one
  const me = spawn(bin, ['-m', model, '--host', '127.0.0.1', '--port', String(LIVE_PORT), '-t', '2', '-l', 'auto', '-nt', '-sns', ...(want.vocabulary ? ['--prompt', `${want.vocabulary}.`] : [])], { stdio: 'ignore' }); live = me;
  me.on('exit', (code, signal) => { if (live === me) { live = null; liveReady = false; } debug.log('note', `live words: the small whisper-server stopped (${signal ?? `exit ${code}`}); it starts again when next needed`, { by: 'whisper' }); });
  for (let i = 0; i < 120 && live === me; i++) { try { if ((await fetch(`http://127.0.0.1:${LIVE_PORT}/`)).status < 500) { await warmStt(LIVE_PORT); liveReady = true; debug.log('note', `live words: ${path.basename(model)} is up`, { by: 'whisper' }); return; } } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); } }).finally(() => { liveStarting = false; });
}
async function liveWords(wav: ArrayBuffer, language: string, strict = false): Promise<Transcript> { // strict: a server that does not answer is an error, not silence
  ensureLive(); if (!liveReady) { if (strict) throw new Error('live words are not up'); return { text: '', ms: 0 }; }
  const t0 = Date.now(); const form = new FormData(); form.append('file', new Blob([wav], { type: 'audio/wav' }), 'sofar.wav'); form.append('response_format', 'json'); form.append('temperature', '0.0'); if (language && language !== 'auto') form.append('language', language);
  try { const r = await fetch(`http://127.0.0.1:${LIVE_PORT}/inference`, { method: 'POST', body: form }); const j = (await r.json()) as { text?: string }; const text = fixNames(j.text ?? '').replace(/\s+/g, ' ').trim(); return { text: NOISE.test(text) ? '' : text, ms: Date.now() - t0 }; } catch (e) { if (strict) throw e; return { text: '', ms: Date.now() - t0 }; }
}
// quiet: an interim transcript of someone still talking, only used to show the words as they come. It is not logged: the final one is.
/** The app's name as speech-to-text writes it (Jovex, Javex, Jauvix, Claudex, Jobex, "job ex"...) becomes Jauvex, in every transcript. */
export const fixNames = (text: string): string => text.replace(/\b(?:j[aoue]u?v[aeio]?(?:x|cs|ks)|jauvex|jovacs|javecs|jobex|job ex|jove x|jau vex|claudex|cloudex|clau?dex)\b/gi, 'Jauvex')
  .replace(/\bj-e-v\b|\bjevv?\b|\bjav(?=\s+(?:agents?|classifiers?|key)\b)|\bjeff(?=\s+(?:agents?|classifiers?|key)\b)/gi, 'Jev'); // Jev, the typed classifiers: J-E-V, Jevv; "Jav" and "Jeff" only before agent, classifier or key (Jeff is also a name)
/** The audio of every pass is kept for a while (data/voice-audio, the newest 120 files, a few minutes of speech), so a case of lost words
 * can be replayed; it never leaves the computer. */
const AUDIO_DIR = path.join(DATA_DIR, 'voice-audio');
function keepAudio(wav: ArrayBuffer): string { try { mkdirSync(AUDIO_DIR, { recursive: true }); const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.wav`; writeFileSync(path.join(AUDIO_DIR, name), Buffer.from(wav)); const all = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.wav')).sort(); for (const f of all.slice(0, Math.max(0, all.length - 120))) unlinkSync(path.join(AUDIO_DIR, f)); return name; } catch { return ''; } }
/** Muted, a short phrase heard: is it the wake phrase? The live-words model hears it (fast, small); names are fixed as usual; a match is
 * by sound (shared/transcript.ts: wakeMatch). What was heard is never logged unless it woke the microphone. */
export async function wakeCheck(wav: ArrayBuffer, phrase: string, language: string): Promise<{ woke: boolean; heard: string }> {
  const want = phrase.trim(); if (!want) return { woke: false, heard: '' };
  // The live-words server hears it when it is up; when it is not (stopped, starting again), the main one does, without logging the words.
  let via = 'live words'; let t = await liveWords(wav, language, true).catch(() => null);
  if (!t) { via = 'the main Whisper'; t = await quietWords(wav, language).catch(() => null); }
  if (!t) { debug.log('note', 'wake check: no Whisper answered: nothing heard', { by: 'whisper' }); return { woke: false, heard: '' }; }
  const heard = fixNames(t.text ?? '').trim();
  const words = heard.split(/\s+/).filter(Boolean); const woke = wakeMatch(heard, want); // by sound: the small model hears "Hey Jauvex" as "Hey, Jev, X."
  if (woke) debug.log('heard', `woken by the wake phrase: "${heard}" (heard by ${via})`, { by: 'whisper' }); else debug.log('note', `not the wake phrase (${words.length} word(s) heard by ${via}, not logged)`, { by: 'whisper' });
  return { woke, heard: woke ? heard : '' };
}
/** The main server, heard privately: nothing logged, no audio kept. The wake check's ear while the live-words server is down. */
async function quietWords(wav: ArrayBuffer, language: string): Promise<Transcript> {
  await ensureWhisper(); if (whisperState !== 'ready') throw new Error(whisperDetail || 'Whisper is not ready');
  const t0 = Date.now(); const form = new FormData(); form.append('file', new Blob([wav], { type: 'audio/wav' }), 'wake.wav'); form.append('response_format', 'json'); form.append('temperature', '0.0'); if (language && language !== 'auto') form.append('language', language);
  const r = await fetch(`http://127.0.0.1:${WHISPER_PORT}/inference`, { method: 'POST', body: form }); if (!r.ok) throw new Error(`whisper-server ${r.status}`);
  const text = fixNames(((await r.json()) as { text?: string }).text ?? '').replace(/\s+/g, ' ').trim(); return { text: NOISE.test(text) ? '' : text, ms: Date.now() - t0 };
}
export async function transcribe(wav: ArrayBuffer, language: string, quiet = false, hint = '', retry = false): Promise<Transcript> {
  if (quiet) return liveWords(wav, language);
  await ensureWhisper();
  if (whisperState !== 'ready') throw new Error(whisperDetail || 'Whisper is not ready');
  const t0 = Date.now();
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
  form.append('response_format', 'verbose_json'); form.append('temperature', retry ? '0.4' : '0.0'); // a retry decodes differently: the first pass of a stretch lost its words // verbose: each segment says how sure Whisper was
  if (language && language !== 'auto') form.append('language', language);
  if (hint) form.append('prompt', hint); // the few words expected (the welcome: start, Claude, Codex); the server may or may not honour it, the fuzzy match below does the rest
  const r = await fetch(`http://127.0.0.1:${WHISPER_PORT}/inference`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`whisper-server ${r.status}`);
  const j = (await r.json()) as { text?: string; segments?: Segment[] };
  let text = (j.text ?? '').replace(/\s+/g, ' ').trim();
  const why = text && !NOISE.test(text) ? ghost(text, j.segments ?? []) : '';
  let dropped = ''; if (why) { if (!quiet) debug.log('heard', `(dropped as noise: "${text}", ${why})`, { by: 'whisper', ms: Date.now() - t0 }); dropped = text; text = ''; }
  const heard = NOISE.test(text) ? '' : fixNames(text); const nsp = Math.max(0, ...(j.segments ?? []).map((g) => g.no_speech_prob ?? 0));
  const audio = quiet ? '' : keepAudio(wav);
  if (!quiet) debug.log('heard', `${retry ? '(retry) ' : ''}${heard || `(nothing: ${text || 'silence'})`}`, { by: 'whisper', ms: Date.now() - t0, detail: [heard && nsp > 0.3 ? `kept although Whisper's no-speech score was ${nsp.toFixed(2)}: a sentence it was sure of` : '', audio ? `audio: voice-audio/${audio}` : ''].filter(Boolean).join(' · ') || undefined });
  return { text: heard, ms: Date.now() - t0, ...(dropped ? { dropped } : {}) };
}

// ---------- mouth
const renders = new Set<ChildProcess>();
let cachedVoices: string[] | null = null;
export async function voices(): Promise<string[]> {
  if (cachedVoices) return cachedVoices;
  const out = await new Promise<string>((resolve) => execFile('say', ['-v', '?'], (_e, stdout) => resolve(stdout ?? '')));
  cachedVoices = out.split('\n').map((l) => /^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})/.exec(l)).filter((m): m is RegExpExecArray => m !== null).map((m) => `${m[1]!.trim()}|${m[2]}`);
  return cachedVoices;
}
/** Render one chunk of text to 22.05 kHz mono WAV with `say`. Killed immediately by cancelSpeech(). */
export async function speak(text: string, voice: string, rate: number): Promise<ArrayBuffer | null> {
  const clean = text.trim(); if (!clean) return null;
  const file = path.join(os.tmpdir(), `cvc-say-${randomUUID()}.wav`);
  const args = ['-o', file, '--file-format=WAVE', '--data-format=LEI16@22050', '-r', String(Math.round(rate))];
  const render = async (v: string): Promise<number | null> => { const child = spawn('say', [...args, ...(v ? ['-v', v] : []), '--', clean], { stdio: 'ignore' }); renders.add(child); const c = await new Promise<number | null>((resolve) => { child.on('exit', resolve); child.on('error', () => resolve(1)); }); renders.delete(child); return c; };
  // No voice picked means the system's default voice (slower to render than the classic voices, but it is the one that sounds right).
  let code = await render(voice); if (code !== 0 && voice) code = await render(''); // a voice that is not on this Mac: the system's default instead
  try { if (code !== 0) return null; const buf = await fs.readFile(file); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer; }
  catch { return null; } finally { void fs.rm(file, { force: true }); }
}
/** Barge-in: stop every `say` that is still rendering. (Audio already playing is faded by the window.) */
export function cancelSpeech(): void { if (renders.size) debug.log('speech', `${renders.size} render(s) cut: the user spoke`, { by: 'app' }); for (const c of renders) c.kill('SIGKILL'); renders.clear(); }

// ---------- the speaking voice: one warm small-model session with two jobs
// The selected (big) model does the work and its full answer stays on screen, untouched. This small model is
// only the mouth: it acknowledges while the big one thinks, and afterwards it says what happened, briefly.
const VOICE_PROMPT = `You are the speaking voice of an assistant. A bigger model does the real work, and its full answer is shown on the user's screen where they can read and copy it. You only talk. Everything you write is read aloud by a text-to-speech voice, so write exactly what should be said and nothing else.

Who you are: you are not a participant in this conversation and you have no identity of your own. There are two threads. The main thread is the conversation between the user and the main assistant, the provider and model named on the MAIN line of every message you get; it does all the thinking and the work. You are the second thread: only its voice. When you say "I", you speak as that main assistant. Never say or guess what model you yourself run on, and never name a model or a company that is not on the MAIN line or in the answer you were given. If the user asks who they are talking to, or which model or provider is being used, the truthful answer is always the one on the MAIN line: on HEARD you only acknowledge the question, and on DONE you say what the main assistant answered, repeating any model name exactly as it wrote it.

You receive three kinds of messages, each starting with the MAIN line. The kind is the label on the message itself (HEARD, BUSY or DONE): answer that kind and no other, whatever the previous messages were. Only a BUSY message is answered with an action word in capitals; a reply to HEARD or DONE is only the spoken line, and never starts with QUEUE, STEER, STOP or REPLACE.

HEARD: what the user just said out loud. The main assistant has only started thinking. RECENT, when present, is the last of the conversation (what they said before and what the main assistant answered): use it to show you have been following, the way a colleague who was in the room would. Reply with one or two short spoken sentences, between 8 and 22 words, that say in your own words what you understood they are asking or want done, and what you are going to look at or do first: \"Sure, you want the footer label renamed to Muster; I'll find where it is set.\" \"Right, the voice still cuts out after the restart; let me see what the log says.\" \"Okay, one more agent for the billing page, in the homepage folder; opening it.\" Reinforce what they said a little, in your own words, never parrot it: do not repeat their sentence back, do not echo their phrasing, pick up the one thing that matters and say what you are doing about it. Never a single word, never a bare \"noted\", never just \"let me check\" or \"let me think\" on its own: always with the thing you are checking or doing. Never a bare quick line either (\"Sure, one moment\", \"Got it\", \"Okay, one second\"): that line has already been said before you; yours must name what they asked for. SAID, when present, is the exact line the voice already said out loud for this same utterance, a moment ago: your line comes right after it, in the same breath, so never repeat it, never rephrase it, and never open with its words (after \"Sure, one moment.\" do not start with sure or okay, and do not say one moment again); add only what it did not say: what they asked, worded from RECENT when it helps, and what you look at first. A complaint or a problem they report gets concern, never cheer: sound like it matters and say what you will look at (\"Hmm, the orb should be there; let me see what hides it.\", \"That is strange, it talks but it is slow; let me see where the time goes.\"), and never open with sure, great or okay as if all were fine. If it was a remark or thanks, answer it lightly and briefly. The HEARD job never answers in the COMMAND shape. You are never the one who answers, so whether you know the answer or could know it does not matter: never say you cannot see, do not know or lack details, just say you are checking. Never answer the question itself, never give facts, numbers, opinions or advice, never promise an outcome, never ask a question back.

BUSY: what the user just said out loud while the main assistant is still working on their previous request (given as RUNNING when known). Whatever they say by voice is passed to the assistant right away, as added information: its work is not interrupted and nothing it has is lost. First decide what they want done with the running work, then answer in this exact shape: one word in capitals, a colon, then ONE short natural spoken line of at most 14 words. The word is never read aloud: the app removes it and acts on it, so a BUSY reply without the word is broken. The word and the line must agree. STOP: they want the running work cancelled, stopped or aborted, and they name nothing to do in its place (\"stop\", \"cancel that\", \"never mind, forget it\", \"para, cancela eso\"). Full reply: \"STOP: Okay, I'll take care of that right away, stopping now.\" REPLACE: they want the whole running task thrown away AND they name a different task to do instead (\"no, not that, do X instead\", \"scrap that and run the tests\"). Narrowing, trimming or adjusting the same task is NOT this, it is STEER (\"skip the tests for now, just do the migration\", \"only the first file\"): the work must never be interrupted for that. Full reply: \"REPLACE: Okay, switching to that right away.\" QUEUE: only when they say in so many words that it must wait or be kept for later (\"queue this\", \"don't tell it yet\", \"save this for when it's done\", \"remind me of this later\"). Full reply: \"QUEUE: Okay, I'll queue that up.\" STEER: everything else, and anything you are unsure about: a correction, a constraint, a missing fact, one more thing to do, a change of mind about a detail, a question, a remark (\"use the staging database, not production\", \"don't touch the footer\", \"also update the readme\", \"after this, look at the login page\", \"what model are you using?\"). Full reply for information or an instruction: \"STEER: Okay, working on that now.\" or \"STEER: Got it, on it.\" Full reply for a question: \"STEER: Good question, I'll answer that too.\" The user hears one assistant at work: never mention passing anything along, adding to a turn, queues, channels or another agent. With STEER or QUEUE, never say you are stopping anything. Name the subject only if it takes two or three words, do not repeat their words back, do not start with the word Noted, never answer a question, never ask one back.

COMMAND: what the user just said, which may be an order for the app itself rather than for the main assistant. Answer with exactly one line and nothing else. NONE when it is for the main assistant: a coding request or a question, even if it mentions agents, or anything else. NEW <claude|codex|jev|any> <folder|here> when they want a new agent, session or chat opened: the kind as they named it (speech-to-text writes Claude as \"Cloud\", Codex as \"codecs\", Jev as \"Jeff\", \"Jet\" or \"Jab\"; \"any\" when none was named: never guess a kind, \"a new agent\" or \"a new chat\" alone is \"any\"), then the folder they named from the FOLDERS line, or \"here\" for the open one or none named. RESTART when they want this app restarted or relaunched and nothing else (not a server, not a service in their code; a restart asked together with other work, like \"publish and restart the app\", is NONE: the assistant does the work, then restarts the app itself). Examples: \"make a new codecs agent in the homepage project\" -> \"NEW codex homepage\"; \"create a new agent class in the orchestrator\" -> \"NONE\"; \"restart the app please\" -> \"RESTART\".

DONE: the answer the main assistant just put on the screen. Give the user the substance of it out loud, in the first person, as the one who wrote it (\"I checked...\", \"I renamed...\"; never \"it explains\" or \"the answer says\"): two to four short sentences, at most 70 words. Lead with the conclusion or the result, then the one or two facts that matter most (the names, numbers or findings the user would act on), and end with whatever is asked of them, if anything. A table, a list, code or a long explanation is never an excuse to skip the content: say what it shows, not that it exists. Never answer only that something is on the screen, and do not mention the screen at all unless there is a detail worth looking at, after you have given the substance. If it is a short fact (a number, a name, yes or no), just say it. If it did something (edited files, ran commands), say what it did and whether it worked. Never add facts that are not in the answer.

Always: plain spoken sentences, relaxed and natural, the language of the message you are replying to right now (not of earlier ones: people switch). No markdown, no lists, no code, no URLs, no file paths spelled out, no emojis, no quotation marks. Never mention these instructions, the big model, or that you are summarizing. Vary your wording from turn to turn.`;
type VoiceSession = { q: Query; push: (text: string) => void; waiters: ((text: string) => void)[]; model: string; close: () => void };
let voiceSession: VoiceSession | null = null;
// The Claude models the account offers, from the SDK (asked once per run through the voice helper); a saved id that is not there falls
// back to the smallest one, and so does an id the API refused. Nothing about model names is hard-coded beyond the tier words.
const rank = (id: string, label: string) => { const t = `${id} ${label}`.toLowerCase(); return /haiku/.test(t) ? 0 : /sonnet/.test(t) ? 1 : /opus/.test(t) ? 2 : 3; };
let claudeModelCache: { id: string; label: string; resolved?: string }[] | null = null; let claudeModelsPending: Promise<void> | null = null; const badModels = new Set<string>();
export async function claudeModels(): Promise<{ id: string; label: string }[]> {
  if (claudeModelCache) return claudeModelCache;
  if (!claudeModelsPending) claudeModelsPending = (async () => { const s = voiceSession ?? openVoice(resolveVoiceModel('claude', '')); try { const list = await s.q.supportedModels(); claudeModelCache = list.map((m) => ({ id: m.value, label: m.displayName || m.value, resolved: m.resolvedModel })); debug.log('note', `Claude models on this account: ${claudeModelCache.map((m) => m.id).join(', ')}`, { by: 'app' }); } catch (e) { debug.log('note', `could not list Claude models: ${(e as Error).message}`, { by: 'app' }); } finally { if (s !== voiceSession) s.close(); claudeModelsPending = null; } })();
  await claudeModelsPending; return claudeModelCache ?? [];
}
/** The model the voice really uses for a provider, given the preference ('' = automatic, the smallest). Claude here; Codex resolves in its own module. */
export function resolveVoiceModel(provider: Provider, preferred: string): string {
  if (provider === 'codex') return preferred;
  const list = (claudeModelCache ?? []).filter((m) => !badModels.has(m.id) && !badModels.has(m.resolved ?? ''));
  if (preferred && !badModels.has(preferred) && (!claudeModelCache || list.some((m) => m.id === preferred || m.resolved === preferred))) return preferred;
  if (list.length) return [...list].sort((a, b) => rank(a.id, a.label) - rank(b.id, b.label))[0]!.id;
  return preferred && !badModels.has(preferred) ? preferred : 'claude-haiku-4-5'; // no list yet: the smallest known name
}

function openVoice(model: string): VoiceSession {
  const queue: SDKUserMessage[] = []; let wake: (() => void) | null = null; let closed = false;
  async function* input(): AsyncGenerator<SDKUserMessage> {
    while (!closed) { if (queue.length === 0) await new Promise<void>((r) => { wake = r; }); const m = queue.shift(); if (m) yield m; }
  }
  const session: VoiceSession = {
    model, waiters: [], q: undefined as unknown as Query,
    push: (text) => { queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null } as SDKUserMessage); wake?.(); },
    close: () => { closed = true; wake?.(); },
  };
  session.q = query({ prompt: input(), options: { ...claudeExe(), model, systemPrompt: VOICE_PROMPT, settingSources: [], tools: [], mcpServers: {}, strictMcpConfig: true /* no connectors: their instructions made the voice ask about documents */, persistSession: false, thinking: { type: 'disabled' }, cwd: os.tmpdir() } });
  void (async () => {
    try {
      let said = ''; // one answer per question: a turn can carry more than one assistant message, so the turn's end is what pairs them
      for await (const m of session.q) {
        if (m.type === 'assistant') { const text = (m.message.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ').replace(/\s+/g, ' ').trim(); if (text) said = text; }
        else if (m.type === 'result') { const r = m as { is_error?: boolean; result?: string }; if (r.is_error && /model|not found|unavailable|does not exist|invalid/i.test(r.result ?? '')) { badModels.add(session.model); debug.log('note', `the voice model ${session.model} was refused (${(r.result ?? '').slice(0, 80)}): falling back to the smallest one`, { by: 'app' }); session.close(); } session.waiters.shift()?.(said); said = ''; }
      }
    } catch { /* fall through */ }
    for (const w of session.waiters.splice(0)) w('');
    if (voiceSession === session) voiceSession = null;
  })();
  return session;
}
// One question at a time. The helper takes its prompt as a stream, and the harness folds messages that arrive while it is
// answering into the turn that is running: two questions then get ONE answer, and from there every answer goes to the wrong
// question or to nobody (a voice that says nonsense, or nothing at all). So a question is only handed over when the
// previous answer has really arrived. A question still waiting in line is dropped when a newer one of its kind comes in
// (the acknowledgment prepared for half a sentence is worthless once the whole sentence is here), and a helper that
// owes an answer for too long is replaced by a fresh one.
type Waiting = { message: string; kind: string; resolve: (t: string) => void };
const line: Waiting[] = []; let inFlight: { session: VoiceSession; timer: ReturnType<typeof setTimeout> } | null = null;
const ANSWER_DEADLINE_MS = 25_000;
function pump(model: string): void {
  if (inFlight || !line.length) return;
  warmAck('claude', model); const s = voiceSession!; const next = line.shift()!;
  const timer = setTimeout(() => { if (inFlight?.session !== s) return; debug.log('note', 'the voice helper owed an answer for 25 s: replaced by a fresh one', { by: 'voice model' }); inFlight = null; if (voiceSession === s) voiceSession = null; s.close(); next.resolve(''); pump(model); }, ANSWER_DEADLINE_MS);
  inFlight = { session: s, timer };
  const t0 = Date.now();
  s.waiters.push((t) => { if (inFlight?.session === s) { clearTimeout(timer); inFlight = null; } debug.log('model', `voice model (${voiceSession?.model ?? model}): ${next.kind} -> ${JSON.stringify(t.slice(0, 160))}`, { by: 'voice model', ms: Date.now() - t0, detail: `SENT\n${next.message}\n\nREPLY\n${t || '(nothing)'}` }); next.resolve(t); pump(model); });
  s.push(next.message);
}
function ask(message: string, provider: Provider, model: string, timeoutMs: number): Promise<string> {
  if (provider === 'codex') { const t0 = Date.now(); const kind = /^(HEARD|BUSY|DONE|COMMAND):/m.exec(message)?.[1] ?? 'OTHER'; return codex.voiceAsk(VOICE_PROMPT, message, model, timeoutMs + 1500).then(async (t) => { const used = await codex.voiceModel(model).catch(() => model); debug.log('model', `voice model (Codex ${used || model || 'default'}): ${kind} -> ${JSON.stringify(t.slice(0, 160))}`, { by: 'voice model', ms: Date.now() - t0, detail: `SENT\n${message}\n\nREPLY\n${t || '(nothing)'}` }); return t; }); } // a Codex session speaks through a Codex model (it has its own one-at-a-time queue)
  const kind = /^(HEARD|BUSY|DONE):/m.exec(message)?.[1] ?? 'OTHER';
  return new Promise<string>((resolve) => {
    let done = false; const finish = (t: string) => { if (!done) { done = true; resolve(t); } };
    if (kind !== 'DONE') for (let i = line.length - 1; i >= 0; i--) if (line[i]!.kind !== 'DONE') line.splice(i, 1)[0]!.resolve(''); // superseded before it was even asked
    line.push({ message, kind, resolve: finish }); pump(model);
    setTimeout(() => finish(''), timeoutMs); // too late to be worth saying; the helper's answer, when it comes, only frees the line
  });
}
/** Start the small model before the first utterance so its first answer is not paying process start-up. */
export function warmAck(provider: Provider, model: string): void {
  jev.warm();
  if (provider === 'codex') { codex.voiceWarm(VOICE_PROMPT, model); return; }
  const use = resolveVoiceModel('claude', model); void claudeModels(); /* the list lands once; the next warm-up re-resolves against it */
  if (!voiceSession || voiceSession.model !== use) { voiceSession?.close(); voiceSession = openVoice(use); }
}
// main: who the voice is speaking for, e.g. "Codex, model gpt-6-astra". The voice has no identity of its own.
/**
 * Three things are said about one utterance, in this order: the quick line (here: Jev's fixed phrase, at once, so the user
 * knows they were heard), the understanding (`understand`: the voice model, from the recent context, a few seconds later),
 * and the summary of the answer when it lands (`summarize`).
 */
export async function acknowledge(utterance: string): Promise<string> {
  const t0 = Date.now(); const fast = (await jevQuestionLine(utterance)) ?? pick(['Okay, one second.', 'Sure, give me a moment.']);
  debug.log('ack', `"${fast}"  <- ${utterance}`, { by: 'jev', ms: Date.now() - t0 }); return fast;
}
/** The second line: what was understood, in the voice model's own words from the recent context. Empty when it has nothing in time. */
const WEAK = /^\W*(sure|okay|ok|got it|alright|right|mmm|one (second|moment|sec)|give me a (second|moment)|let me (check|think|see|look))\W*(one (second|moment|sec)|give me a (second|moment)|on it|working on (it|that)( now)?|let me (check|think|see|look))?\W*$/i;
const weak = (line: string) => !line || WEAK.test(line) || line.split(/\s+/).length < 7; // a quick line, or too short to carry an understanding
export async function understand(utterance: string, provider: Provider, model: string, main: string, recent = '', said = ''): Promise<string> {
  const t0 = Date.now(); let line = await ackByModel(utterance, provider, model, main, recent, 7000, said);
  if (weak(line) && Date.now() - t0 < 4500) { debug.log('ack', `understanding was only a quick line ("${line}"): asked again, sharper`, { by: 'voice model', ms: Date.now() - t0 });
    line = await ackByModel(`${utterance}\n(The quick line${said ? ` "${said}"` : ''} was already said. Now the understanding, 10 to 22 words: what they asked for, in your words, and what you look at first.)`, provider, model, main, recent, 7000 - (Date.now() - t0), said); if (weak(line)) line = ''; }
  debug.log('ack', `understanding: "${line || '(nothing in time, or only a quick line: stage two skipped)'}"  <- ${utterance}${said ? `  (after "${said}")` : ''}`, { by: 'voice model', ms: Date.now() - t0 }); return line;
}
// A reply in the BUSY shape ("STOP: ...") to a message that was not BUSY is the model mixing its jobs up: that line is never spoken.
const ACTION_WORD = /^\W*(QUEUE|STEER|STOP|REPLACE)\W*[:\-\u2014]/i;
const COMMAND_SHAPE = /^\W*(NONE|NEW|RESTART)\b/; // the COMMAND job's answers, never something to say
const LABELS = /\b(MAIN|HEARD|BUSY|DONE|RUNNING|COMMAND|RECENT|SAID):/;
/** `said`: the quick line (stage one) already spoken for this utterance, so the understanding continues from it instead of repeating it. */
async function ackByModel(utterance: string, provider: Provider, model: string, main: string, recent: string, budgetMs: number, said = ''): Promise<string> {
  const raw = await ask(`MAIN: ${main}\n${recent ? `RECENT: ${recent}\n` : ''}${said ? `SAID: ${said}\n` : ''}HEARD: ${utterance}`, provider, model, budgetMs);
  const line = raw.replace(/^\W*(HEARD|BUSY|DONE|COMMAND|SAID|RECENT)\b[:\s—-]*/i, '').trim(); /* the job's label echoed at the start of the line was once read aloud ("HEARD Got it, ...") */
  if (!line) return '';
  if (ACTION_WORD.test(line) || COMMAND_SHAPE.test(line) || LABELS.test(line) || line.split(/\s+/).length > 40) { debug.log('ack', `the voice model did not answer with a plain spoken line, dropped: ${JSON.stringify(line.slice(0, 100))}`, { by: 'voice model' }); return ''; }
  return line;
}
// ---------- decisions by Jev, when its key is on this machine (see jev.ts). Jev decides, it does not write: the line comes from here.
let lastPicked = '';
/** One of the lines, never the one said last time (the user hears the repetition at once). */
const pick = (xs: string[]): string => { const pool = xs.length > 1 ? xs.filter((x) => x !== lastPicked) : xs; const x = pool[Math.floor(Math.random() * pool.length)]!; lastPicked = x; return x; };
const BUSY_LINES: Record<'task' | 'steer' | 'ask' | 'stop' | 'replace', string[]> = {
  task: ["Okay, I'll queue that up.", "Got it, I'll keep that for right after this."],
  steer: ['Okay, working on that now.', 'Got it, on it.', 'Sure, one moment.'],
  ask: ["Good question, I'll answer that too.", 'Let me look at that as well.'],
  stop: ["Okay, I'll take care of that right away, stopping now.", 'Okay, stopping now.'],
  replace: ['Okay, switching to that right away.', 'Got it, dropping this and switching now.'],
};
async function jevTriage(utterance: string, task: string): Promise<BusyTriage | null> {
  const r = await jev.decide({ situation: "The assistant is in the middle of working on the user's previous request, `running_request`. The user just said `said` out loud.", running_request: task.slice(0, 600), said: utterance }, {
    action: { type: 'choice', instructions: 'What does the user want done with the work that is running right now? What they say is normally passed to the assistant at once, as added information, without interrupting its work.', criteria: {
      steer: 'The normal case, and anything unclear. A correction, a constraint, a missing fact, one more thing to do, a change of mind about a detail, a question or a remark. Examples: "use the staging database, not production", "do not touch the footer", "also update the readme", "after this, look at the login page", "what model are you using?"',
      queue: 'ONLY when they say in so many words that it must wait or be kept for later. Examples: "queue this", "do not tell it yet", "save this for when it is done", "remind me of this later"',
      stop: 'They want the running work cancelled, stopped or aborted, and they name nothing to do in its place',
      replace: 'They want the whole running task thrown away AND they name a different task to do instead ("no, not that, do X instead"). Narrowing or adjusting the same task ("skip the tests for now", "only the first file") is steer, not this' } },
    kind: { type: 'choice', instructions: 'What kind of utterance is `said`?', criteria: { question: 'They are asking something', task: 'They want something done, or it is a remark' } },
  });
  const a = r?.answers.action, k = r?.answers.kind;
  if (!a || !k || a.confidence < JEV_MIN_CONFIDENCE) return null;
  const action = a.choice as BusyTriage['action']; if (action !== 'queue' && action !== 'steer' && action !== 'stop' && action !== 'replace') return null;
  return { action, say: pick(BUSY_LINES[action === 'queue' ? 'task' : action === 'steer' && k.choice === 'question' ? 'ask' : action]), by: 'jev' };
}

// ---------- commands for the app itself, caught before anything reaches the main thread
// A cheap gate first (it costs nothing on ordinary speech), then Jev settles what the words alone cannot: whether this is an
// order for the app or a coding request about "agents", and which open folder was meant. Without Jev the rules decide alone.
const NEW_GATE = /^\W*(?:(?:ok(?:ay)?|hey|please|now|and|so|then)\W+)*(?:can you\W+|could you\W+|i want (?:you )?to\W+|let'?s\W+)?(?:create|make|start|open|spin up|launch|give me|add|new)\b[^.?!]{0,60}\b(?:agent|session|chat|conversation)s?\b/i;
const PROVIDER_WORDS: [Provider | 'jev', RegExp][] = [['codex', /\b(codex|codecs|code ?x|kodex|chat ?gpt|open ?ai|gpt)\b/i], ['jev', /\b(jev|jeff|jet|jab|jav|jeb|classifier)\b/i], ['claude', /\b(claude|cloud|clod|claud|clawed|anthropic)\b/i]];
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "... named CodexAgent", "call it Billing bot", "que se llame Facturas": the name ends at the sentence, or where the folder is named.
const NAME = /\b(?:named|called|name it|call it|with the name|llamad[oa]|que se llame|ll[aá]mal[oa])\s+["“']?(.+?)["”']?(?=\s+(?:about|for|on|to|in|inside|and|then|so|but|because|sobre|para|en|dentro|y|entonces|pero|porque)\b|[,.!?;]|$)/i;
// "... about the billing page", "... for the release notes", "... to clean up the tests": what the new agent is for.
const PURPOSE = /\b(?:about|for|on|to work on|to|sobre|para)\s+(.+?)\s*$/i;
function agentPurpose(sentence: string, name?: string): string | undefined {
  let rest = sentence.replace(/[.!?]+\s*$/, '');
  if (name) rest = rest.replace(new RegExp(`\\b(?:named|called|name it|call it|with the name|llamad[oa]|que se llame|ll[aá]mal[oa])\\s+["“']?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["”']?`, 'i'), '');
  rest = rest.replace(/\s+(?:in|inside of|inside)\s+(?:this|the|that|another|other|my)\b[^,]*$/i, '');
  const after = rest.split(/\b(?:agent|session|chat|conversation|agente|sesi[oó]n)\b/i).slice(1).join(' ');
  const purpose = PURPOSE.exec(after)?.[1]?.replace(/^(?:me|us|it)\s+/i, '').trim();
  return purpose && purpose.length >= 4 && purpose.length <= 200 ? purpose : undefined;
}
function agentName(sentence: string): string | undefined {
  const m = NAME.exec(sentence.replace(/[.!?]+\s*$/, '')); if (!m) return undefined;
  const name = m[1]!.replace(/\s+(?:in|inside of|inside|on)\s+(?:this|the|that|another|other|my)\b.*$/i, '').replace(/["“”']/g, '').trim();
  return name && name.length <= 60 && name.split(/\s+/).length <= 4 ? name : undefined; // a name is a few words; a whole clause is not one
}
// "Restart the app": short, and clearly about the app itself, not about a server or a service in the code.
const RESTART_GATE = /^\W*(?:(?:ok(?:ay)?|hey|please|now|and|so|then)\W+)*(?:can you\W+|could you\W+|please\W+)?(?:restart|relaunch|reload|reboot)\W+(?:the\W+|this\W+)?(?:app|application|program|yourself)\b[^a-z]*$/i;
// "Restart the application, please" / "can you restart the app now?": not the exact shape the rule knows, but the words are there.
// Jev answers whether a restart of this app is meant; the voice model does when Jev is not there. Never the rule alone.
const RESTART_WORDS = /\b(restart|relaunch|reload|reboot)\b/i;
// "Reload the interface" / "soft restart" / "refresh the UI": the window alone, the running turns untouched.
const RELOAD_GATE = /^\W*(?:(?:ok(?:ay)?|hey|please|now|and|so|then)\W+)*(?:can you\W+|could you\W+|please\W+)?(?:(?:reload|refresh|soft[- ]restart|soft[- ]reload)\W+(?:the\W+|this\W+)?(?:ui|interface|window|frontend|front end|view|screen)|soft\W+restart|soft\W+reload)\b(?:\W+(?:please|now))?[^a-z]*$/i;
async function restartMaybe(full: string, projects: { id: string; name: string }[], currentId: string, speaker?: { provider: Provider; model: string; main: string }): Promise<AppCommand | null> {
  if (full.split(/\s+/).length > 14 || !RESTART_WORDS.test(full) || !/\b(app|application|program|yourself|program)\b/i.test(full)) return null;
  const cmd: AppCommand = { type: 'restart-app', by: 'rule', say: 'Okay, restarting the app.' };
  const r = await jev.decide({ said: full }, { restart: { type: 'noul', instructions: 'A user said `said` to a desktop app in which they run AI coding agents. Is restarting or relaunching this desktop app the only thing they ask? When they also ask for other work (publish, commit, build, fix, check...), the answer is No: the assistant does that work and restarts the app itself.', criteria: { true: 'Yes: only a restart, relaunch or reload of the app, the application, the program, and nothing else', false: 'No: a restart together with other work to do, or it is about a server, a service, a process or a device in their project, or a question, or something else' } } }, 1000);
  if (r?.answers.restart) { const p = r.answers.restart.noul; const v = orderVerdict({ jev: { forApp: p >= 0.5, confidence: Math.max(p, 1 - p) } }); debug.log('note', `restart of the app meant: ${p.toFixed(2)}${v === 'ask' ? ', not sure: asking first' : ''}  <- ${full}`, { by: 'jev', ms: r.ms }); return v === 'act' ? cmd : v === 'ask' ? confirmOrder(cmd, full, RESTART_QUESTION) : null; }
  if (!speaker) return null;
  const others = projects.filter((p) => p.id !== currentId); const t1 = Date.now();
  const out = await ask(`MAIN: ${speaker.main}\nFOLDERS: open: ${projects.find((p) => p.id === currentId)?.name ?? ''}; others: ${others.map((p) => p.name).join(', ') || '(none)'}\nCOMMAND: ${full}`, speaker.provider, speaker.model, 4500);
  debug.log('note', `restart of the app meant? the voice model says: ${out.trim() || '(nothing)'}  <- ${full}`, { by: 'voice model', ms: Date.now() - t1 });
  return /^\W*RESTART\b/i.test(out.trim()) ? confirmOrder(cmd, full, RESTART_QUESTION) : null; // the voice model alone is never sure enough
}
const RESTART_QUESTION = 'Restart the app? It stops every turn that is running. Say yes to restart; anything else goes to the agent as you said it.';
/** An order nobody is sure of becomes a question (shared/orders.ts): a clear yes carries it out, anything else goes to the agent. */
const confirmOrder = (cmd: AppCommand, text: string, question: string): AppCommand => ({ type: 'confirm', pending: cmd, text, say: question, by: cmd.by });
/**
 * Orders for the app itself. Jev decides first (a quarter of a second, no load on any LLM); when Jev is not there or not sure,
 * the voice model decides (the COMMAND job); the rules alone are the last resort. `speaker` is the voice model to fall back on.
 */
// ---------- the big model checks the small ones' work
// Jev (or the voice model) says "this is an order for the app"; that is a classification, and it is fast. The DETAILS of the
// order (what kind of agent, its name, what it is for, which folder) are language understanding, and a fixed rule gets them
// wrong ("named CodexAgent and you're going to use..."). So the session's own model reads the sentence once and returns
// them as JSON; its answer overrides what the rules found. It gets a few seconds; if it does not answer, the rules stand.
let detailsSink: (d: CommandDetails) => void = () => {};
export function setDetailsSink(fn: (d: CommandDetails) => void): void { detailsSink = fn; }
type Details = { kind?: 'claude' | 'codex' | 'jev' | null; name?: string | null; purpose?: string | null; folder?: string | null; kickoff?: string | null };
async function oneShot(provider: Provider, model: string | undefined, prompt: string, timeoutMs: number): Promise<string> {
  const run = async (): Promise<string> => {
    if (provider === 'codex') return codex.runOnce(prompt, model ? { model } : {});
    let text = '';
    for await (const m of query({ prompt, options: { ...claudeExe(), ...(model ? { model } : {}), settingSources: [], tools: [], mcpServers: {}, strictMcpConfig: true, persistSession: false, thinking: { type: 'disabled' }, cwd: os.tmpdir(), systemPrompt: 'You answer with the JSON asked for and nothing else.' } })) {
      if (m.type === 'assistant') text += (m.message.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    }
    return text;
  };
  return Promise.race([run(), new Promise<string>((r) => setTimeout(() => r(''), timeoutMs))]).catch(() => '');
}
async function detailsByModel(full: string, projects: { id: string; name: string; path?: string }[], currentId: string, speaker: { provider: Provider; model: string; main: string; mainModel?: string }): Promise<Details | null> {
  const t0 = Date.now(); const open = projects.find((p) => p.id === currentId)?.name ?? '';
  const prompt = `A user of a desktop app that runs AI coding agents said this out loud (a speech-to-text transcript, so names may be misheard: Claude as "Cloud", Codex as "codecs", Jev as "Jeff", "Jet" or "Jab"):\n\n"${full}"\n\nThey are asking the app to open a new agent. Extract exactly what they asked for and answer with ONE JSON object and nothing else, with these keys:\n- "kind": "claude", "codex" or "jev" if they named which kind of agent, else null\n- "name": the name they gave the agent (only if they said "named", "called", "call it" or the like), written as a person would title it, natural words with spaces and capital initials (a transcript glues words: "CodexAgent" -> "Codex Agent"), else null. The name ends where the sentence moves on ("named CodexAgent and you're going to use..." -> "Codex Agent")\n- "purpose": what they said the agent is for, in their words, else null\n- "folder": the folder they named, else null. Folders that exist: open folder "${open}"; others: ${projects.filter((p) => p.id !== currentId).map((p) => `"${p.name}"`).join(', ') || '(none)'}\n- "kickoff": the first message the app will send to that new agent, written by you for it, plain text, at most 120 words. It must say: that it is a new agent the user just opened from the app they run their agents in, in which folder (the one they named, otherwise the open folder "${open}"; name and path from this list: ${projects.map((p) => `"${p.name}" = ${p.path ?? '(path unknown)'}`).join('; ')}); its name if one was given; what the user wants it for, in the user's intent and words (or that they have not said yet); that other agents may be working in this folder or others and it only sees its own conversation; to change no file yet; to look around as far as it needs, say what it understood and proposes first, ask what it needs to know, then wait.`;
  const out = await oneShot(speaker.provider, speaker.mainModel, prompt, 30_000); const m = /\{[\s\S]*\}/.exec(out);
  debug.log('model', `main model (${speaker.provider} ${speaker.mainModel ?? 'default'}) read the order -> ${JSON.stringify(out.slice(0, 160))}`, { by: 'voice model', ms: Date.now() - t0, detail: `SENT\n${prompt}\n\nREPLY\n${out || '(nothing)'}` }); if (!m) { debug.log('note', `the main model gave no details for the order (${Date.now() - t0} ms): the rules stand`, { by: 'voice model' }); return null; }
  try { const d = JSON.parse(m[0]) as Details; debug.log('note', `details by the main model: ${JSON.stringify(d)}`, { by: 'voice model', ms: Date.now() - t0 }); return d; } catch { return null; }
}
// "Bye", "good night", "talk to you later", "I'll be back": the conversation is over for now. The voice says goodbye and voice
// mode ends. Short utterances only; Jev confirms it is a farewell when it is there (a "bye" inside a story is not one).
/* "One second", "wait", "hold on", "let me think": they are pausing, not asking for anything. Nothing goes to the main thread,
   the voice says it will wait. Jev tells a pause from "wait, make it blue" (a task); without Jev only the bare phrase counts. */
const HOLD_WORDS = /\b(?:one|a|just a|give me a|gimme a)\s+(?:sec|second|moment|minute|min)\b|\b(?:hold on|hang on|wait|standby|stand by|not yet|let me think|one moment)\b/i;
const HOLD_ONLY = /^(?:(?:one|a|just a|give me a|gimme a)\s+(?:sec|second|moment|minute|min)|hold on|hang on|wait|wait (?:a (?:sec|second|moment|minute|bit)|up)|standby|stand by|not yet|let me think|one moment|hold on a (?:sec|second|moment|minute))$/i;
async function holding(full: string): Promise<AppCommand | null> {
  const words = full.split(/\s+/).length; if (words > 10 || !HOLD_WORDS.test(full)) return null;
  const say = pick(['Sure, take your time.', "Okay, I'm here.", 'Take your time.', 'Of course, no rush.']);
  const r = await jev.decide({ said: full }, { pausing: { type: 'noul', instructions: 'A person is talking to an assistant by voice and just said `said`. Are they only asking the assistant to wait (they are pausing, thinking, or about to say more), with nothing in it for the assistant to do or answer yet?', criteria: { true: 'Yes: one second, wait, hold on, let me think, not yet, and nothing else of substance', false: 'No: there is a task, a question, a correction or a message in it ("wait, make it blue", "one second, what did you say?"), or the words are used in passing' } } }, 900);
  if (r?.answers.pausing) { const p = r.answers.pausing.noul; debug.log('note', `a pause, not a message? ${p.toFixed(2)}  <- ${full}`, { by: 'jev', ms: r.ms }); return p >= 0.6 ? { type: 'hold', by: 'jev', say } : null; }
  const bare = full.trim().replace(/^\W*(?:(?:yeah|yes|okay|ok|oh|um|uh|hmm|so|and|please|just|now)\b\W*)+/i, '').replace(/[.,!?…\s]+$/, '').trim();
  if (HOLD_ONLY.test(bare)) { debug.log('note', `a pause, not a message (by the words alone)  <- ${full}`, { by: 'rule' }); return { type: 'hold', by: 'rule', say }; }
  return null;
}
const BYE_GATE = /\b(bye|goodbye|good ?night|see you|see ya|talk (?:to you )?later|talk later|catch you later|i'?ll be back|be right back|be back later|that'?s all for now|until next time|later then)\b/i;
async function farewell(full: string): Promise<AppCommand | null> {
  const words = full.split(/\s+/).length; if (words > 12 || !BYE_GATE.test(full)) return null;
  const night = /good ?night/i.test(full); const back = /be (?:right )?back|later/i.test(full);
  const say = night ? pick(['Good night, sleep well.', 'Good night. I will be here when you are back.']) : back ? pick(["Sure, I'll be here. Talk later.", 'Okay, see you in a bit.']) : pick(['Bye for now.', 'Goodbye, talk soon.', 'See you later.']);
  // Two questions: is it a goodbye at all, and is there something to do first ("set the alarm for eight, then bye")?
  const r = await jev.decide({ said: full }, {
    farewell: { type: 'noul', instructions: 'A person is talking to an assistant by voice and just said `said`. Are they saying goodbye or ending the conversation for now (as opposed to mentioning these words in passing)?', criteria: { true: 'Yes: bye, good night, talk later, be right back, that is all for now', false: 'No: the words are part of a request, a story or a question' } },
    task: { type: 'noul', instructions: 'Besides the goodbye, does `said` ask the assistant to do something first (a task, a question to answer, something to set, send, save or check)?', criteria: { true: 'Yes: there is an instruction or a question in it, to be done before the goodbye', false: 'No: it is only a goodbye, thanks or small talk' } },
  }, 900);
  if (r?.answers.farewell) { const p = r.answers.farewell.noul; const t = r.answers.task?.noul ?? 0; debug.log('note', `farewell? ${p.toFixed(2)}, something to do first? ${t.toFixed(2)}  <- ${full}`, { by: 'jev', ms: r.ms }); return p >= 0.6 ? { type: 'goodbye', by: 'jev', say, ...(t >= 0.5 ? { after: true } : {}) } : null; }
  if (words <= 6) { debug.log('note', `farewell (short, by the words alone)  <- ${full}`, { by: 'rule' }); return { type: 'goodbye', by: 'rule', say }; }
  debug.log('note', `farewell with more in it (by the words alone): the message goes through first  <- ${full}`, { by: 'rule' }); return { type: 'goodbye', by: 'rule', say, after: true };
}
export async function command(full: string, projects: { id: string; name: string; path?: string }[], currentId: string, speaker?: { provider: Provider; model: string; main: string; mainModel?: string }): Promise<AppCommand | null> {
  const hold = await holding(full); if (hold) return hold;
  const bye = await farewell(full); if (bye) return bye;
  if (full.split(/(?<=[.!?])\s+/).some((x) => x.split(/\s+/).length <= 10 && RELOAD_GATE.test(x.replace(/^\W*(?:(?:yeah|yes|okay|ok|and|so|obviously|now|then|also|please|just)\b\W*)+/i, '')))) { debug.log('note', `app command: reload the interface  <- ${full}`, { by: 'rule' }); return { type: 'reload-ui', by: 'rule', say: 'Okay, reloading the interface.' }; }
  if (full.split(/\s+/).length <= 8 && RESTART_GATE.test(full)) { debug.log('note', `app command: restart  <- ${full}`, { by: 'rule' }); return { type: 'restart-app', by: 'rule', say: 'Okay, restarting the app.' }; }
  // The order may follow a few words of something else ("Okay, let's see if this works. Make a new Codex agent."): it is looked
  // for sentence by sentence. With more than one sentence it takes Jev's word that this is for the app (or the rest being small talk).
  const sentences = full.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean); const at = sentences.findIndex((x) => x.split(/\s+/).length <= 22 && NEW_GATE.test(x));
  if (at < 0) return restartMaybe(full, projects, currentId, speaker);
  if (full.split(/\s+/).length > 45) return null;
  const text = sentences[at]!; const rest = sentences.filter((_, i) => i !== at); const chatter = rest.every((x) => x.split(/\s+/).length <= 9);
  const t0 = Date.now(); const byWord = PROVIDER_WORDS.find(([, re]) => re.test(text))?.[0] ?? null; const said = norm(text);
  const words = (name: string) => name.split(/[-_.\s/]+/).map(norm).filter((w) => w.length >= 4);
  const named = projects.filter((p) => (norm(p.name) && said.includes(norm(p.name))) || words(p.name).some((w) => new RegExp(`\\b${w}\\b`).test(said))).sort((a, b) => b.name.length - a.name.length)[0] ?? null;
  let provider = byWord, projectId = named && named.id !== currentId ? named.id : null, by: AppCommand['by'] = 'rule';
  const others = projects.filter((p) => p.id !== currentId);
  const r = await jev.decide({ said: full, open_folder: projects.find((p) => p.id === currentId)?.name ?? '', other_folders: others.map((p) => p.name) }, {
    target: { type: 'choice', instructions: 'A developer said `said` to a desktop app that manages their AI coding agents. Who is it for?', criteria: { app: 'An order for the app itself: open or create a new agent, session or chat', assistant: 'A request for the coding assistant to do or write something (even if it mentions agents), or anything else' } },
    kind: { type: 'choice', instructions: 'Which kind of agent is asked for in `said`? Speech-to-text often writes Claude as "Cloud", Codex as "codecs", and Jev as "Jeff", "Jet" or "Jab".', criteria: { claude: 'Claude', codex: 'Codex, ChatGPT or OpenAI', jev: 'Jev, a classifier agent', unspecified: 'No kind was named' } },
    ...(others.length ? { folder: { type: 'choice' as const, instructions: 'In which folder should it be created, according to `said`? `open_folder` is the one on screen.', criteria: { __current: 'The open folder, "this project", "here", or no folder named', ...Object.fromEntries(others.slice(0, 40).map((p) => [p.id, `The folder named "${p.name}"`])) } } } : {}),
  }, 1000);
  // No Jev (no key, over budget, or unsure about the target): the voice model reads it too, in one line. What it reads is weighed with
  // Jev's pick (orderVerdict): the app carries an order out only when sure, and asks otherwise.
  let modelSays: 'order' | 'not' | null = null;
  if (!r || !r.answers.target || r.answers.target.confidence < JEV_MIN_CONFIDENCE) {
    if (speaker) {
      const open = projects.find((p) => p.id === currentId)?.name ?? ''; const t1 = Date.now();
      const out = await ask(`MAIN: ${speaker.main}\nFOLDERS: open: ${open}; others: ${others.map((p) => p.name).join(', ') || '(none)'}\nCOMMAND: ${full}`, speaker.provider, speaker.model, 4500);
      const m = /^\W*(NONE|NEW|RESTART)\b\s*(claude|codex|jev|any)?\s*(.*)$/i.exec(out.trim());
      if (m) {
        const verb = m[1]!.toUpperCase();
        if (verb === 'NONE') { debug.log('note', `not an app command, it is for the main thread: ${full}`, { by: 'voice model', ms: Date.now() - t1 }); return null; }
        if (verb === 'RESTART') { debug.log('note', `the voice model read a restart, nobody sure: asking first  <- ${full}`, { by: 'voice model', ms: Date.now() - t1 }); return confirmOrder({ type: 'restart-app', by: 'rule', say: 'Okay, restarting the app.' }, full, RESTART_QUESTION); }
        modelSays = 'order';
        const kind = (m[2] ?? 'any').toLowerCase(); if (kind !== 'any' && (byWord || /\b(jev|jeff|jet|jab|chatgpt|openai|gpt)\b/i.test(full))) provider = kind as Provider | 'jev'; // a kind only counts when one was said: the model likes to answer with the MAIN provider
        const folder = (m[3] ?? '').trim().toLowerCase(); if (folder && folder !== 'here') { const f = others.find((p) => norm(p.name) === norm(folder) || words(p.name).some((w) => norm(folder).includes(w))); if (f) projectId = f.id; }
        debug.log('note', `the voice model read this as an order for the app: ${out.trim()}`, { by: 'voice model', ms: Date.now() - t1 });
      } else if (rest.length && !chatter) { debug.log('note', `an order for the app inside a longer message, nobody sure enough: it goes to the main thread: ${full}`, { by: 'voice model' }); return null; }
    } else if (rest.length && !chatter) { debug.log('note', `an order for the app inside a longer message, not sure enough to act on it: it goes to the main thread: ${full}`, { by: 'rule' }); return null; }
  } else if (rest.length && r.answers.target.choice !== 'app' && !chatter) { debug.log('note', `an order for the app inside a longer message, Jev says it is not for the app: it goes to the main thread: ${full}`, { by: 'jev' }); return null; }
  if (r) { const a = r.answers; if (a.target?.choice === 'assistant' && a.target.confidence >= JEV_MIN_CONFIDENCE) { debug.log('note', `not an app command, it is for the main thread: ${text}`, { by: 'jev', ms: r.ms }); return null; }
    by = 'jev'; if (a.kind && a.kind.confidence >= JEV_MIN_CONFIDENCE && a.kind.choice !== 'unspecified') provider = a.kind.choice as Provider | 'jev';
    if (!named && a.folder && a.folder.confidence >= JEV_MIN_CONFIDENCE && a.folder.choice !== '__current') projectId = a.folder.choice; }
  const where = projects.find((p) => p.id === (projectId ?? currentId))?.name ?? 'this folder'; const what = provider === 'jev' ? 'Jev' : provider === 'codex' ? 'Codex' : provider === 'claude' ? 'Claude' : '';
  let name = agentName(text); let purpose = agentPurpose(text, name); let kickoff: string | undefined;
  const target = r?.answers.target; const verdict = orderVerdict({ jev: target ? { forApp: target.choice === 'app', confidence: target.confidence } : null, model: modelSays });
  if (verdict !== 'act') { const how = `${target ? `Jev: ${target.choice} ${target.confidence.toFixed(2)}` : 'no Jev'}${modelSays ? `, voice model: ${modelSays}` : ''}`;
    if (verdict === 'pass') { debug.log('note', `not an app command (${how}): it is for the main thread  <- ${text}`, { by, ms: Date.now() - t0 }); return null; }
    debug.log('note', `maybe an order for the app, nobody sure (${how}): asking first  <- ${text}`, { by, ms: Date.now() - t0 });
    return confirmOrder({ type: 'new-agent', provider, projectId, ...(name ? { name } : {}), ...(purpose ? { purpose } : {}), by, say: `Opening a new ${what ? `${what} ` : ''}agent${name ? ` named ${name}` : ''} in ${where}.` }, full,
      `Should I open a new ${what ? `${what} ` : ''}agent in ${where}? Say yes to open it; anything else goes to the agent as you said it.`); }
  // The agent opens at once with what Jev and the rules found; the session's model reads the order in the background and its
  // details (the name as a person would title it, the purpose, the first message it wrote) reach the window a few seconds later.
  const detailsId = speaker ? randomUUID() : undefined;
  if (speaker && detailsId) void detailsByModel(full, projects, currentId, speaker).then((d) => {
    const out: CommandDetails = { id: detailsId };
    if (d) { if (typeof d.name === 'string' && d.name.trim() && d.name.trim().length <= 60) out.name = d.name.trim();
      if (typeof d.purpose === 'string' && d.purpose.trim()) out.purpose = d.purpose.trim().slice(0, 200);
      if (typeof d.kickoff === 'string' && d.kickoff.trim().length >= 40) out.kickoff = d.kickoff.trim(); }
    detailsSink(out);
  }).catch(() => detailsSink({ id: detailsId }));
  const cmd: AppCommand = { type: 'new-agent', provider, projectId, ...(name ? { name } : {}), ...(purpose ? { purpose } : {}), ...(kickoff ? { kickoff } : {}), ...(detailsId ? { detailsId } : {}), by, say: `Opening a new ${what ? `${what} ` : ''}agent${name ? ` named ${name}` : ''} in ${where}.` };
  debug.log('note', `app command: new ${what || 'default'} agent${name ? ` named "${name}"` : ''}${purpose ? ` about "${purpose}"` : ''} in ${where}  <- ${text}`, { by, ms: Date.now() - t0 }); return cmd;
}

/** Is the thought finished? Jev answers from the words alone, in about a quarter of a second. Without Jev: yes, as before. */
export async function thoughtDone(text: string): Promise<{ done: boolean; p: number; by: 'jev' | 'none' }> {
  const r = await jev.decide({ said: text }, { finished: { type: 'noul', instructions: 'A person is dictating to an assistant and just paused after saying `said`. Is this a complete thought that the assistant can act on or answer now?',
    criteria: { true: 'A complete sentence, question, instruction or short reply (yes, okay, thanks), even if informal', false: 'It stops mid-sentence or mid-idea: it ends on a connector or filler (and, but, so, because, that, to, the, let us say, basically), or clearly announces more to come' } } }, 900);
  const p = r?.answers.finished?.noul; if (typeof p !== 'number') return { done: true, p: 1, by: 'none' };
  debug.log('thought', `${p >= 0.3 ? 'finished' : 'NOT finished, holding'} (p=${p.toFixed(2)}): ${text}`, { by: 'jev', ms: r!.ms });
  return { done: p >= 0.3, p, by: 'jev' }; // only a clear "not finished" holds the message back
}
/** What kind of thing was said? A question gets its "let me check" and a thank-you its reply at once, from Jev, without waiting for a worded line. */
async function jevQuestionLine(utterance: string): Promise<string | null> {
  const r = await jev.decide({ said: utterance }, {
    kind: { type: 'choice', instructions: 'What is `said`?', criteria: { problem: 'The user reports something wrong: a bug, an error, something that does not work, is missing, or behaves unexpectedly', question: 'The user asks the assistant something and expects an answer', task: 'The user asks for something to be done', thanks: 'Thanks, praise or approval, and nothing else', other: 'Any other remark, small talk, or unclear' } },
  }, 900);
  const k = r?.answers.kind;
  if (!k || k.confidence < JEV_MIN_CONFIDENCE) return null;
  if (k.choice === 'problem') return pick(['Oh, okay, let me check.', "That's strange, let me look.", 'Hmm, let me see what happened.', "That shouldn't happen, let me look."]); // concern, never cheer: a problem is not a task to be glad about
  if (k.choice === 'question') return pick(['Let me check.', 'Good question, one second.', 'Let me look at that.', 'One moment, checking.']);
  if (k.choice === 'thanks') return pick(['Happy to help.', 'Anytime.', 'Glad you like it.']);
  // A task or a remark too: a fixed line in a quarter of a second beats a worded one in a second and a half. The voice
  // model only words the acknowledgment when Jev is not there or not sure.
  if (k.choice === 'task') return pick(['Okay, one second.', 'Sure, give me a moment.', 'Got it, one moment.', 'Sure, one moment.']);
  return pick(['Okay, one second.', 'Mmm, let me think.', 'Sure, give me a moment.']); // never a single word: it sounds like a brush-off
}

/** Said out loud while the main thread works. By voice it is handed to the running turn at once (steer), without interrupting it; it only waits when they ask for that, and the work is only stopped or replaced when they clearly say so. Doubt means steer. */
export async function triage(utterance: string, provider: Provider, model: string, main: string, task = ''): Promise<BusyTriage> {
  const t0 = Date.now(); const fast = await jevTriage(utterance, task); // Jev when it is there and sure; otherwise the voice model, as before
  if (fast) { debug.log('busy', `${fast.action.toUpperCase()}: "${fast.say}"  <- ${utterance}`, { by: 'jev', ms: Date.now() - t0 }); return fast; }
  const slow = await triageByModel(utterance, provider, model, main, task); debug.log('busy', `${slow.action.toUpperCase()}: "${slow.say}"  <- ${utterance}`, { by: 'voice model', ms: Date.now() - t0 }); return slow;
}
async function triageByModel(utterance: string, provider: Provider, model: string, main: string, task: string): Promise<BusyTriage> {
  const out = await ask(`MAIN: ${main}\n${task ? `RUNNING: ${task.slice(0, 600)}\n` : ''}BUSY: ${utterance}`, provider, model, 4500);
  const m = /^\W*(QUEUE|STEER|STOP|REPLACE)\W*[:\-\u2014]\s*([\s\S]*)$/i.exec(out);
  if (!m) { debug.log('busy', `the voice model gave no action word, so it is passed along as it is: ${JSON.stringify(out.slice(0, 120))}`, { by: 'voice model' }); return { action: 'steer', say: out }; }
  let action = m[1]!.toLowerCase() as BusyTriage['action']; let line = m[2]!.trim();
  if (LABELS.test(line) || line.split(/\s+/).length > 30) line = action === 'stop' ? 'Okay, stopping now.' : action === 'replace' ? 'Okay, switching to that right away.' : action === 'queue' ? "Okay, I'll queue that up." : 'Okay, working on that now.';
  // The app acts on the word, the user hears the line: they must not disagree. A line that announces a stop under QUEUE is replaced, not obeyed.
  if ((action === 'queue' || action === 'steer') && /\b(stopping|stopped|cancel+ing|deteni|cancelando|switching)\b/i.test(line)) line = 'Okay, working on that now.';
  return { action, say: line };
}
/** What to say about the big model's finished answer. Long answers are sent head and tail; the voice only needs the gist. */
export async function summarize(asked: string, answer: string, provider: Provider, model: string, main: string): Promise<string> {
  const a = answer.length > 9000 ? `${answer.slice(0, 5500)}\n[…]\n${answer.slice(-3000)}` : answer;
  const t0 = Date.now(); const said = (await ask(`MAIN: ${main}\nDONE: the user asked: ${asked.slice(0, 600)}\n\nThe answer now on their screen:\n${a}`, provider, model, 14_000)).replace(ACTION_WORD, '').replace(/^.*\b(MAIN|HEARD|BUSY|RUNNING):.*$/s, '').trim(); // (a reply that recites the prompt's labels is not a summary) a long answer takes the small model a while; a summary late beats none
  debug.log('summary', `"${said || '(nothing in time)'}"`, { by: 'voice model', ms: Date.now() - t0 }); return said;
}

/** What the first-run screen needs to know, without starting a server: is `say` there, whisper-server, a model, a TypeSafe key. */
export async function setupCheck(): Promise<SetupCheck> { if (process.env.CVC_SETUP_FAKE === 'missing') return { say: true, voice: 'basic', whisperBinary: false, models: [], jevKey: false }; /* window checks: the failing screen */ const say = !!findOnPath('say') || existsSync('/usr/bin/say'); return { say, voice: say ? await voiceQuality() : 'unknown', whisperBinary: !!findOnPath('whisper-server'), models: listModels(), jevKey: await jev.hasKey() }; }
/** Is the System voice still the basic one? `say` with no voice renders the System voice (Spoken Content); on a fresh Mac that is the
 *  compact Samantha, which sounds robotic. A Siri voice cannot be named by an app (say -v falls back to Samantha), only that setting
 *  reaches it: so the check renders one word both ways and compares the bytes. Same bytes: basic. */
async function voiceQuality(): Promise<SetupCheck['voice']> {
  try { const [a, b] = await Promise.all([speak('Hi.', '', 185), speak('Hi.', 'Samantha', 185)]); if (!a || !b) return 'unknown'; if (a.byteLength !== b.byteLength) return 'natural'; const x = new Uint8Array(a), y = new Uint8Array(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return 'natural'; return 'basic'; } catch { return 'unknown'; }
}
export async function status(): Promise<VoiceStatus> { return { jev: await jev.available(), jevKey: await jev.hasKey(), whisper: whisperState, detail: whisperDetail, voices: await voices(), models: listModels(), model: whisperDetail.endsWith('.bin') ? whisperDetail : '', voiceModels: { claude: (claudeModelCache ?? []).map(({ id, label, resolved }) => ({ id, label, ...(resolved ? { resolved } : {}) })), codex: (await codex.models().catch(() => [])).map(({ id, label }) => ({ id, label })) } }; }
/** The model the voice would use now for a provider and a preference (for the settings' "in use" line). */
export async function voiceModelInUse(provider: Provider, preferred: string): Promise<string> { if (provider === 'codex') return codex.voiceModel(preferred).catch(() => preferred); await claudeModels().catch(() => undefined); return resolveVoiceModel('claude', preferred); }
export function shutdown(): void { cancelSpeech(); voiceSession?.close(); voiceSession = null; if (whisper) { whisper.kill('SIGTERM'); whisper = null; } if (live) { live.kill('SIGTERM'); live = null; } }

/** What someone said to the welcome screen: start, pick Claude, pick Codex, or something else. Jev first, the words alone after.
 *  Speech-to-text writes Claude as "cloud" and Codex as "codecs"; both may come in one breath ("let's start with Codex"). */
export async function welcomeIntent(text: string): Promise<{ start: boolean; provider: Provider | null }> {
  // Three options only at this point: a heard word within one edit of "start", "claude" or "codex" counts, however Whisper spelled it.
  const words = text.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const near = (w: string, target: string, max = 1) => { if (w === target) return true; if (Math.abs(w.length - target.length) > max) return false; const d: number[][] = Array.from({ length: w.length + 1 }, (_, i) => [i, ...Array(target.length).fill(0)]); for (let j = 1; j <= target.length; j++) d[0]![j] = j; for (let i = 1; i <= w.length; i++) for (let j = 1; j <= target.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (w[i - 1] === target[j - 1] ? 0 : 1)); return d[w.length]![target.length]! <= max; };
  const claude = words.some((w) => near(w, 'claude', 2) || near(w, 'claud', 2) || /^(cloud|clod|clon|clawed|claw|klaud|klod|clode|clyde|quad|quod|squad|clot|clout|cloud's|claude's)$/.test(w)); const codex = words.some((w) => near(w, 'codex', 2) || /^(codecs|codec|kodak|kodex|cortex)$/.test(w)) || /\b(code x|co-dex|chat ?gpt|openai)\b/i.test(text);
  const startWord = words.some((w) => near(w, 'start') || near(w, 'starts') || /^(started|starting|star|stark|stat|begin|continue|ready|go)$/.test(w)) || /\b(go ahead|let'?s go|get started|open it|take me in)\b/i.test(text);
  const provider: Provider | null = claude && !codex ? 'claude' : codex && !claude ? 'codex' : null;
  const r = await jev.decide({ said: text }, { start: { type: 'noul', instructions: 'A person is on the welcome screen of a desktop app and just said `said`. Do they want to start, begin, continue, go ahead, or get into the app now (as opposed to asking something, greeting, or just naming an option)?', criteria: { true: 'Yes: start, begin, continue, go, go ahead, let us go, ready, open it, take me in, get started', false: 'No: a question, a greeting, a remark, or only a choice of Claude or Codex without asking to start' } } }, 900);
  const p = r?.answers.start?.noul; const start = (typeof p === 'number' ? p >= 0.6 : false) || startWord; // the word itself always counts, however Whisper spelled it
  debug.log('note', `welcome heard: ${start ? 'start' : 'no start'}${provider ? `, ${provider}` : ''}  <- ${text}`, { by: typeof p === 'number' ? 'jev' : 'rule', ms: r?.ms });
  return { start, provider };
}
