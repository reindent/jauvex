// Downloads through Node (electron/webget.ts, 1.8.0): gzip and deflate are opened, a Brotli or zstd answer is refused before it is read
// (Node's Brotli decoder had a flaw, CVE-2026-111497), only gzip and deflate are asked for, and redirects behave as fetch's do.
import http from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { webGet } from '../electron/webget.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const PORT = 4483, base = `http://127.0.0.1:${PORT}`; const text = 'hello from the server';
let asked = '';
const server = http.createServer((req, res) => {
  asked = String(req.headers['accept-encoding'] ?? '');
  const send = (encoding: string, body: Buffer | string) => { res.writeHead(200, { 'content-type': 'text/plain', ...(encoding ? { 'content-encoding': encoding } : {}) }); res.end(body); };
  if (req.url === '/plain') send('', text);
  else if (req.url === '/gzip') send('gzip', gzipSync(text));
  else if (req.url === '/deflate') send('deflate', deflateSync(text));
  else if (req.url === '/br') send('br', brotliCompressSync(text));
  else if (req.url === '/zstd') send('zstd', Buffer.from('not really zstd'));
  else if (req.url === '/moved') { res.writeHead(302, { location: '/gzip' }); res.end(); }
  else if (req.url === '/post') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => send('', `${req.method} ${b}`)); }
  else { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
const read = async (p: string, init = {}) => { const r = await webGet(`${base}${p}`, init); return { r, body: await r.text() }; };
const refused = async (p: string) => { try { await webGet(`${base}${p}`); return ''; } catch (e) { return String((e as Error).message); } };

const plain = await read('/plain');
check('a plain answer is read as it is', plain.body === text && plain.r.ok);
check('only gzip and deflate are asked for, never br', asked === 'gzip, deflate', asked);
check('a gzip answer is opened', (await read('/gzip')).body === text);
check('a deflate answer is opened', (await read('/deflate')).body === text);
check('a Brotli answer is refused, never decoded', /br-compressed answer/.test(await refused('/br')));
check('any other encoding (zstd) is refused too', /zstd-compressed answer/.test(await refused('/zstd')));
const moved = await read('/moved');
check('a redirect is followed, and the answer names where it ended', moved.body === text && moved.r.url === `${base}/gzip` && moved.r.redirected);
check('redirect: error refuses one', /redirect/.test(await webGet(`${base}/moved`, { redirect: 'error' }).then(() => '', (e) => String(e.message))));
check('a POST carries its body', (await read('/post', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } })).body === 'POST {"a":1}');
check('a failing status is an answer, not an error', (await webGet(`${base}/none`)).status === 404);
check('only http and https are fetched', /only http and https/.test(await webGet('file:///etc/passwd').then(() => '', (e) => String(e.message))));
server.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
