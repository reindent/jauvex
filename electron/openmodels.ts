// The open-models connection (1.8.0): the server's address, the model agents use unless they pick another, and its key when it needs one.
// Kept in the data folder's open-models.json, readable by this user only (0600), never in state.json; the window is told the address, the
// model and whether a key is kept, never the key. The key reaches Codex only in its environment (codex.ts).
import { readFileSync, writeFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';
import { webGet } from './webget.js';
import { cleanBaseUrl, modelIds, type OpenModelsView } from '../shared/openmodels.js';

type Saved = { baseUrl: string; model: string; key?: string };
const file = () => path.join(DATA_DIR, 'open-models.json');
function read(): Saved | null { try { const s = JSON.parse(readFileSync(file(), 'utf8')) as Saved; return s && typeof s.baseUrl === 'string' ? s : null; } catch { return null; } }

export const openView = (): OpenModelsView | null => { const s = read(); return s ? { baseUrl: s.baseUrl, model: s.model ?? '', hasKey: !!s.key } : null; };
export const openKey = (): string => read()?.key ?? '';

/** Saves the connection. key: a new key; '' keeps the one kept; null removes it. Backed up first (the user's data). */
export function saveOpen(baseUrl: string, model: string, key: string | null): OpenModelsView {
  const url = cleanBaseUrl(baseUrl); if (!url) throw new Error('The address must be an http(s) address, such as http://localhost:11434/v1.');
  const was = read(); const next: Saved = { baseUrl: url, model: model.trim(), ...(key === null ? {} : key ? { key: key.trim() } : was?.key ? { key: was.key } : {}) };
  if (existsSync(file())) { const back = `${file()}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`; copyFileSync(file(), back); chmodSync(back, 0o600); }
  writeFileSync(file(), JSON.stringify(next, null, 1), { mode: 0o600 }); chmodSync(file(), 0o600);
  return { baseUrl: next.baseUrl, model: next.model, hasKey: !!next.key };
}

/** The models the server lists (GET <baseUrl>/models): a wrong address or key says so here, before anything is saved. key '' uses the kept one. */
export async function listOpenModels(baseUrl: string, key: string): Promise<string[]> {
  const url = cleanBaseUrl(baseUrl); if (!url) throw new Error('The address must be an http(s) address, such as http://localhost:11434/v1.');
  const k = key || openKey();
  let r: Response;
  try { r = await webGet(`${url}/models`, { headers: k ? { Authorization: `Bearer ${k}` } : {}, signal: AbortSignal.timeout(10_000) }); }
  catch (e) { throw new Error(/compressed answer/.test(String((e as Error)?.message)) ? (e as Error).message : `No server answered at ${url}. Is it running?`); }
  if (r.status === 401 || r.status === 403) { await r.body?.cancel(); throw new Error('The server refused the key.'); }
  if (!r.ok) { await r.body?.cancel(); throw new Error(`The server answered ${r.status} at ${url}/models.`); }
  return modelIds(await r.json().catch(() => null));
}
