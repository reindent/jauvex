// Open models (1.8.0): the address check, the server's model list, what Codex is told; then a real Codex turn on a stand-in server
// (tests/mock/open-server.ts, OpenAI's Responses style): Codex must go to that server, with the key and the model, and bring its answer back.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const data = path.resolve('tmp/testdata-openmodels'); rmSync(data, { recursive: true, force: true }); mkdirSync(data, { recursive: true }); process.env.CVC_DATA_DIR = data;
const shared = await import('../shared/openmodels.ts');
check('an http(s) address is kept without its trailing slash; anything else is refused', shared.cleanBaseUrl(' http://localhost:11434/v1/ ') === 'http://localhost:11434/v1' && shared.cleanBaseUrl('ftp://x') === null && shared.cleanBaseUrl('localhost:11434') === null);
check('a server\'s list is read in OpenAI\'s shape, sorted, without repeats', shared.modelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, {}] }).join() === 'a,b' && shared.modelIds(null).length === 0);
const cfg = shared.codexOpenConfig('http://x/v1', true) as { model_providers: Record<string, { base_url: string; env_key?: string; wire_api: string }> };
const noKey = shared.codexOpenConfig('http://x/v1', false) as typeof cfg;
check('Codex is told a provider of its own, in Responses style, its key from the environment', cfg.model_providers[shared.OPEN_PROVIDER_ID]!.base_url === 'http://x/v1' && cfg.model_providers[shared.OPEN_PROVIDER_ID]!.env_key === shared.OPEN_KEY_ENV && cfg.model_providers[shared.OPEN_PROVIDER_ID]!.wire_api === 'responses' && !('env_key' in noKey.model_providers[shared.OPEN_PROVIDER_ID]!));
const PORT = 4481, log = path.join(data, 'requests.log');
const server = spawn(process.execPath, ['--import', 'tsx', 'tests/mock/open-server.ts', String(PORT)], { env: { ...process.env, OPEN_SERVER_LOG: log }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
try {
  const om = await import('../electron/openmodels.ts');
  check('List models asks the server, with the key', (await om.listOpenModels(`http://127.0.0.1:${PORT}/v1`, 'test-key')).join() === 'stand-in-large,stand-in-small');
  let refused = ''; try { await om.listOpenModels('http://127.0.0.1:9/v1', ''); } catch (e) { refused = (e as Error).message; }
  check('...and a server that does not answer says so', /No server answered/.test(refused), refused);
  const v = om.saveOpen(`http://127.0.0.1:${PORT}/v1`, 'stand-in-small', 'test-key');
  check('the connection is kept for this user only, and the window is told no key', v.hasKey && !('key' in v) && (statSync(path.join(data, 'open-models.json')).mode & 0o777) === 0o600);
  const codex = await import('../electron/codex.ts');
  if (process.env.CVC_CODEX_BIN) console.log('PASS skipped: the real Codex is replaced by a stand-in here');
  else {
    const out = await Promise.race([codex.runOnce('Say hello.', { model: 'stand-in-small', modelProvider: shared.OPEN_PROVIDER_ID, config: shared.codexOpenConfig(`http://127.0.0.1:${PORT}/v1`, true) }), new Promise<string>((r) => setTimeout(() => r('(no answer in 60 s)'), 60_000))]);
    const asked = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { method: string; path: string; key: string; model: string }).find((r) => r.path === '/v1/responses');
    check('a Codex turn on open models goes to that server, with the key and the model, and its answer comes back', out === 'Hello from the open model.' && asked?.key === 'Bearer test-key' && asked.model === 'stand-in-small', `${out} ${JSON.stringify(asked)}`);
    codex.shutdown();
  }
} finally { server.kill(); }
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
