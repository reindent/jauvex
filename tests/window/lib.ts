// Shared by the window checks: a CDP connection to the hidden instance the runner started, and PASS/FAIL bookkeeping.
type Target = { type: string; url: string; webSocketDebuggerUrl: string };
/** A DevTools Protocol call; the result is whatever the method returns. */
export type Cdp = (method: string, params?: Record<string, unknown>) => Promise<any>;
export async function connect(port = 9341): Promise<{ cdp: Cdp; js: (expression: string) => Promise<any>; close: () => void }> {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  const page = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Target[]).find((t) => t.type === 'page' && !t.url.includes('#mini'))!;
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const waiting = new Map<number, (result: any) => void>();
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)!(m.result ?? {}); waiting.delete(m.id); } };
  const cdp: Cdp = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runs an expression in the window and returns its value (awaited, by value). */
  const js = async (expression: string): Promise<any> => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  return { cdp, js, close: () => ws.close() };
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
export const check = (name: string, ok: unknown, detail: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };
export const done = (close?: () => void): never => { console.log(failed ? `${failed} FAILED` : 'ALL PASS'); close?.(); process.exit(failed ? 1 : 0); };
/** The chat host on screen (several stay mounted in the background). */
export const V = "[...document.querySelectorAll('.chat-host')].find((x) => x.style.display !== 'none')";
/** Opens the welcome screen through Jauvex settings. */
export const openWelcome = "(async () => { document.querySelector('button[title=\"Jauvex settings\"]').click(); await new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('.modal.settings button')].find((b) => b.textContent === 'Open it now').click(); })()";
