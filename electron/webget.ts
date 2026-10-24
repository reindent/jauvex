// Every download from the web through Node goes here, never through Node's own fetch: fetch decodes a Brotli answer by itself, and Node's
// Brotli decoder had a flaw a hostile server could use to run code (CVE-2026-111497, fixed in Node 24.22.1; Electron 44.9.3 still carries 24.22.0).
// This asks for gzip or deflate only, decodes those itself, and refuses any other encoding before a byte of it is read: a Brotli (or zstd)
// answer never reaches a decoder. It answers like fetch (a Response), so the callers keep their code.
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { createGunzip, createInflate } from 'node:zlib';

export type WebInit = { method?: string; headers?: Record<string, string>; body?: string | Buffer; redirect?: 'follow' | 'error'; signal?: AbortSignal };

const once = (url: URL, init: WebInit): Promise<http.IncomingMessage> => new Promise((resolve, reject) => {
  const mod = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!mod) { reject(new TypeError(`only http and https addresses are fetched, not ${url.protocol}`)); return; }
  const headers: Record<string, string> = { ...init.headers, 'accept-encoding': 'gzip, deflate' };
  if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body));
  const req = mod.request(url, { method: init.method ?? 'GET', headers, signal: init.signal }, resolve);
  req.on('error', reject); req.end(init.body);
});

/** fetch, minus Brotli: gzip and deflate are decoded here, any other encoding is refused (an error, as a failed fetch is). */
export async function webGet(address: string, init: WebInit = {}): Promise<Response> {
  let url = new URL(address); let method = init.method ?? 'GET'; let body = init.body;
  for (let hops = 0; ; hops++) {
    const res = await once(url, { ...init, method, body });
    const status = res.statusCode ?? 0; const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.resume();
      if (init.redirect === 'error') throw new TypeError(`${url.origin} answered with a redirect`);
      if (hops >= 5) throw new TypeError(`${url.origin}: too many redirects`);
      url = new URL(location, url);
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
      continue;
    }
    const encoding = String(res.headers['content-encoding'] ?? '').trim().toLowerCase();
    let stream: Readable = res;
    if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(createGunzip());
    else if (encoding === 'deflate') stream = res.pipe(createInflate());
    else if (encoding && encoding !== 'identity') { res.destroy(); throw new TypeError(`${url.origin} sent a ${encoding}-compressed answer, which Jauvex does not open`); }
    if (stream !== res) res.on('error', (e) => stream.destroy(e));
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined && !(stream !== res && (k === 'content-encoding' || k === 'content-length'))) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const empty = status === 204 || status === 304 || method === 'HEAD';
    if (empty) res.resume();
    const out = new Response(empty ? null : (Readable.toWeb(stream) as ReadableStream), { status, statusText: res.statusMessage, headers });
    Object.defineProperties(out, { url: { value: url.href }, redirected: { value: hops > 0 } });
    return out;
  }
}
