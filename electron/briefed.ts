// The rules each Codex and Grok conversation has been given, by their paragraphs' keys (shared/rules-update.ts), so that a briefing changed by an
// update reaches the conversations made before it: once, with the next turn. Kept in <data folder>/briefed.json, a record the app can lose
// (no backup): a lost one only means the whole briefing goes once more.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';
import { rulesNote } from '../shared/rules-update.js';

const FILE = path.join(DATA_DIR, 'briefed.json');
const KEEP = 2000; // conversations remembered; the oldest go first
let cache: Record<string, string[]> | null = null;
const read = (): Record<string, string[]> => {
  if (cache) return cache;
  try { const v = JSON.parse(readFileSync(FILE, 'utf8')) as unknown; cache = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string[]> : {}; } catch { cache = {}; }
  return cache;
};
const save = (): void => {
  const all = read(); const ids = Object.keys(all); if (ids.length > KEEP) for (const id of ids.slice(0, ids.length - KEEP)) delete all[id];
  try { const tmp = `${FILE}.${process.pid}`; writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 }); renameSync(tmp, FILE); } catch { /* sent again next turn */ }
};

/** A conversation just made with these rules: they are what it has. */
export function briefedWith(sessionId: string, rules: string): void { const all = read(); delete all[sessionId]; all[sessionId] = rulesNote(rules, []).keys; save(); }

/** What to add after the person's words in this turn of an existing conversation, and how to note it as given once the turn has started. */
export function rulesUpdate(sessionId: string, rules: string): { note: string; given: () => void } {
  const had = read()[sessionId] ?? null; const { note, keys } = rulesNote(rules, had);
  return { note, given: () => { if (!note) return; const all = read(); delete all[sessionId]; all[sessionId] = keys; save(); } };
}

/** A conversation compacted, or whose rules may have been summed away: the whole briefing goes with its next turn. */
export function forgetBriefing(sessionId: string): void { const all = read(); if (!(sessionId in all)) return; delete all[sessionId]; save(); }
