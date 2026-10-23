// Open models (1.8.0): agents on a model server of the user's own that speaks OpenAI's style, a local one (Ollama, LM Studio, vLLM) or
// OpenRouter's catalogue. Pure: the presets, the address check, and what Codex is told (an agent on open models runs on Codex's engine, its
// tools, permissions, sessions and resume, with Codex sent to that server instead of OpenAI's). tests/openmodels.test.ts.
export type OpenPreset = { id: 'ollama' | 'lmstudio' | 'vllm' | 'openrouter'; label: string; baseUrl: string; needsKey: boolean };
export const OPEN_PRESETS: OpenPreset[] = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', needsKey: false },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8000/v1', needsKey: false },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true },
];
/** What the window knows of the connection: never the key, only whether one is kept. */
export type OpenModelsView = { baseUrl: string; model: string; hasKey: boolean };
/** The provider's id in Codex's configuration, and the variable its key reaches Codex in (never written to a file Codex keeps). */
export const OPEN_PROVIDER_ID = 'jauvex-open';
export const OPEN_KEY_ENV = 'JAUVEX_OPEN_MODELS_KEY';

/** The address as it is kept: an http(s) URL, no trailing slash, no query; null when it is not one. */
export function cleanBaseUrl(raw: string): string | null {
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = ''; u.search = '';
  return u.toString().replace(/\/+$/, '');
}
/** Ready to run agents: an address and a model. */
export const openReady = (v: OpenModelsView | null | undefined): boolean => !!v && !!v.baseUrl && !!v.model;

/** What Codex is told when a thread runs on open models: a provider of its own, at that address, in Responses style (the only one Codex
 *  0.155 speaks to a custom server; Ollama, LM Studio, vLLM and OpenRouter all serve it under /v1), its key from OPEN_KEY_ENV when there is one. */
export function codexOpenConfig(baseUrl: string, hasKey: boolean): Record<string, unknown> {
  return { model_providers: { [OPEN_PROVIDER_ID]: { name: 'Open models', base_url: baseUrl, wire_api: 'responses', ...(hasKey ? { env_key: OPEN_KEY_ENV } : {}) } } };
}
/** The model names a server lists at GET <baseUrl>/models (OpenAI's shape: { data: [{ id }] }), sorted, without repeats. */
export function modelIds(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? [...new Set(data.map((m) => (m as { id?: unknown })?.id).filter((x): x is string => typeof x === 'string' && !!x))].sort() : [];
}
