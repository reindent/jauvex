// A Codex session enters YOLO from the app's setting and leaves it with the user's own approvals and sandbox restored, a read-only one
// included, across a restart of the app (the stand-in keeps what each turn was given).
import path from 'node:path'; import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
process.env.CVC_CODEX_BIN = path.resolve('tests/mock/codex'); process.env.CODEX_HOME = path.join(process.env.CVC_DATA_DIR, 'codex'); process.env.MOCK_DELAY_MS = '1';
const { backend } = await import('../electron/backend.ts'); const chat = await import('../electron/chat.ts'); const codex = await import('../electron/codex.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const project = (await backend.state()).projects.find((p) => p.name === 'scratch')!;
const turn = async (sid: string | null) => { let id = sid, error = '';
  await chat.startChat({ chatId: `mode-${Date.now()}`, projectId: project.id, sessionId: sid, provider: 'codex', text: 'permission test' }, (e) => { if (e.type === 'init') id = e.sessionId; if (e.type === 'done' && !e.ok) error = e.error ?? 'failed'; });
  if (error) throw new Error(error); return id!; };
const saved = (id: string) => JSON.parse(fs.readFileSync(path.join(process.env.CODEX_HOME!, 'mock-threads', `${id}.json`), 'utf8'));
if (process.argv.includes('--after-restart')) { // a new run of the app: the setting is Auto now, and the thread's own controls come back
  const sid = process.argv[process.argv.indexOf('--after-restart') + 1]!;
  await backend.setUi({ providerPermissions: { codex: 'auto' } }); await turn(sid);
  const t = saved(sid); codex.shutdown();
  console.log(t.sandbox?.type === 'readOnly' && t.approvalPolicy === 'untrusted' ? 'RESTORED' : `NOT RESTORED ${JSON.stringify([t.sandbox, t.approvalPolicy])}`); process.exit(0);
}
const sid = await turn(null); check('a new Codex session runs with the user\'s own read-only sandbox', saved(sid).sandbox?.type === 'readOnly');
await backend.setUi({ providerPermissions: { codex: 'yolo' } }); await turn(sid);
check('the setting at YOLO: no approvals, full access', saved(sid).sandbox?.type === 'dangerFullAccess' && saved(sid).approvalPolicy === 'never', JSON.stringify([saved(sid).sandbox, saved(sid).approvalPolicy]));
check('the session\'s own controls are kept to restore', (await backend.state()).projects.find((p) => p.id === project.id)!.codexPermissionBaseline?.[sid]?.approvalPolicy === 'untrusted');
codex.shutdown();
const child = spawnSync(path.resolve('node_modules/.bin/tsx'), [process.argv[1]!, '--after-restart', sid], { env: process.env, encoding: 'utf8', timeout: 30000 });
check('after a restart, leaving YOLO restores the read-only sandbox and its approvals', /RESTORED$/m.test(child.stdout) && !/NOT RESTORED/.test(child.stdout), (child.stdout + child.stderr).slice(-300));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
