// Claude Code keeps its sessions under CLAUDE_CONFIG_DIR when the user set one (in a shell profile, say). The app starts through macOS,
// not from a terminal, so it takes that variable from the login shell; the session list then reads from there. A friend saw his Codex
// sessions listed and none of his Claude Code ones.
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import path from 'node:path'; import os from 'node:os';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const { parseShellVars } = await import('../electron/shellenv.ts');
const cfg = path.join(os.tmpdir(), `jauvex-cfg-${process.pid}`); const made = path.join(os.tmpdir(), `jauvex-proj-${process.pid}`); mkdirSync(made, { recursive: true }); const folder = realpathSync(made); // /var is a link to /private/var: Claude Code files sessions under the real path
const sub = path.join(cfg, 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-')); mkdirSync(sub, { recursive: true });
const id = '11111111-2222-4333-8444-555555555555'; const now = new Date().toISOString();
writeFileSync(path.join(sub, `${id}.jsonl`), [JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, sessionId: id, cwd: folder, timestamp: now, message: { role: 'user', content: 'Hello from a moved config folder' } }), JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', sessionId: id, cwd: folder, timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'Hi.' }] } })].join('\n') + '\n');
// The SDK reads its config folder once per process (the app sets the variable at start, before any listing): one process each.
const list = (env: NodeJS.ProcessEnv) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import { listSessions } from '@anthropic-ai/claude-agent-sdk'; console.log(JSON.stringify((await listSessions({ dir: ${JSON.stringify(folder)} })).map((s) => ({ sessionId: s.sessionId }))));`], { env, encoding: 'utf8' })) as { sessionId: string }[];
const { CLAUDE_CONFIG_DIR: _drop, ...plain } = process.env;
const before = list(plain); const after = list({ ...plain, CLAUDE_CONFIG_DIR: cfg });
check('without CLAUDE_CONFIG_DIR the moved sessions are not found (the bug)', !before.some((s) => s.sessionId === id));
check('with it, they are', after.some((s) => s.sessionId === id), JSON.stringify(after.map((s) => s.sessionId)));
{ const got = parseShellVars('noise from a profile\n__PATH__/usr/bin:/bin__END_PATH____CLAUDE_CONFIG_DIR__/Users/x/.config/claude__END_CLAUDE_CONFIG_DIR____CODEX_HOME____END_CODEX_HOME__');
  check('the login shell\'s PATH and CLAUDE_CONFIG_DIR are read, an empty CODEX_HOME is left alone', got.PATH === '/usr/bin:/bin' && got.CLAUDE_CONFIG_DIR === '/Users/x/.config/claude' && !('CODEX_HOME' in got), JSON.stringify(got)); }
rmSync(cfg, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
