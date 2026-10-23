// A stand-in for an open model server (1.8.0): OpenAI's style, what Ollama, LM Studio, vLLM and OpenRouter serve under /v1. GET /v1/models
// lists two models; POST /v1/responses streams one short answer, "Hello from the open model.", in the Responses API's events. Every request
// is kept in the file OPEN_SERVER_LOG (one JSON line: method, path, whether a key came, the model asked for). Usage: node open-server.ts <port>
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const port = Number(process.argv[2] || 4481); const log = process.env.OPEN_SERVER_LOG;
const keep = (o: object) => { if (log) appendFileSync(log, `${JSON.stringify(o)}\n`); };
http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => {
    let model = ''; try { model = (JSON.parse(body || '{}') as { model?: string }).model ?? ''; } catch { /* not JSON */ }
    keep({ method: req.method, path: req.url, key: req.headers.authorization ?? '', model });
    if (req.method === 'GET' && req.url === '/v1/models') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ object: 'list', data: [{ id: 'stand-in-small', object: 'model' }, { id: 'stand-in-large', object: 'model' }] })); return; }
    if (req.method === 'POST' && req.url === '/v1/responses') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const id = `resp_${Date.now()}`, item = `msg_${Date.now()}`, text = 'Hello from the open model.';
      const send = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      const message = { type: 'message', id: item, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
      send('response.created', { response: { id, object: 'response', status: 'in_progress', model, output: [] } });
      send('response.output_item.added', { output_index: 0, item: { ...message, status: 'in_progress', content: [] } });
      send('response.output_text.delta', { item_id: item, output_index: 0, content_index: 0, delta: text });
      send('response.output_item.done', { output_index: 0, item: message });
      send('response.completed', { response: { id, object: 'response', status: 'completed', model, output: [message], usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 6, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 16 } } });
      res.end(); return;
    }
    res.writeHead(404); res.end();
  });
}).listen(port, '127.0.0.1');
