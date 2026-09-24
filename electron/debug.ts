import { appendFile, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import type { DebugEvent } from '../shared/types.js';
import { DATA_DIR } from './paths.js';

/**
 * The voice channel's flight recorder: what was heard, who decided what, how long it took. Kept in memory only
 * (the last 300 events), shown in the app's debug panel. Never holds keys or audio.
 * The same lines also go to `voice-debug.log` in the data folder (rolled over at 2 MB), so that what happened in a
 * session can still be read after the fact, by the user or by an agent working on the app.
 */
const FILE = path.join(DATA_DIR, 'voice-debug.log');
let writes = Promise.resolve();
function persist(e: DebugEvent): void {
  const line = `${new Date(e.at).toISOString()} ${e.kind}${e.by ? ` [${e.by}]` : ''}${e.ms !== undefined ? ` ${e.ms}ms` : ''}: ${e.text}\n${e.detail ? `${e.detail.replace(/^/gm, '    ')}\n` : ''}`;
  writes = writes.then(async () => { try { const s = await stat(FILE).catch(() => null); if (s && s.size > 2_000_000) await rename(FILE, `${FILE}.1`); await appendFile(FILE, line); } catch { /* a log that cannot be written must never break the voice */ } });
}
const events: DebugEvent[] = [];
let sink: ((e: DebugEvent) => void) | null = null;
export function setSink(fn: (e: DebugEvent) => void): void { sink = fn; }
export function list(): DebugEvent[] { return events; }
export function clear(): void { events.length = 0; }
export function log(kind: DebugEvent['kind'], text: string, extra: Partial<Pick<DebugEvent, 'by' | 'ms' | 'detail'>> = {}): void {
  const e: DebugEvent = { at: Date.now(), kind, text: text.replace(/\s+/g, ' ').trim().slice(0, 400), ...extra, ...(extra.detail ? { detail: extra.detail.slice(0, 20_000) } : {}) };
  events.push(e); if (events.length > 300) events.shift(); sink?.(e); persist(e);
}
