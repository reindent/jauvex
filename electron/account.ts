import { spawn, execFile, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { AccountEvent, AccountStatus, Provider } from '../shared/types.js';
import * as codex from './codex.js';
import * as debug from './debug.js';

/**
 * Who each provider is signed in as, and switching that account from inside the app.
 *   Claude: the Claude Code sign-in on this Mac (`claude auth status|login|logout`, run on the SDK's own binary, the one
 *           every session here uses). Login is the CLI's own flow: it opens the browser; whatever it prints is shown in
 *           the app, and if it asks for something (a pasted code) the user can type it there.
 *   Codex:  the app-server's account API (`account/read`, `account/login/start` with the ChatGPT flow, `account/logout`);
 *           the browser is opened on the URL it returns and `account/login/completed` says when it is done.
 * Only what the panel shows leaves here (signed in or not, the e-mail, the plan). Tokens and keys are never read.
 */
const ROOT = process.env.CVC_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// CVC_CLAUDE_BIN replaces the Claude CLI everywhere (sessions, the voice helper, usage, sign-in): the checks run the stand-in in
// tests/mock/claude (and tests/mock/codex for CVC_CODEX_BIN), which answers every message with a short canned reply and no account.
export const claudeExe = (): { pathToClaudeCodeExecutable?: string } => (process.env.CVC_CLAUDE_BIN ? { pathToClaudeCodeExecutable: process.env.CVC_CLAUDE_BIN } : {});
const CLAUDE = process.env.CVC_CLAUDE_BIN || path.join(ROOT, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-darwin-arm64', 'claude');
let emit: (e: AccountEvent) => void = () => {};
export function setSink(fn: (e: AccountEvent) => void): void { emit = fn; }

function run(bin: string, args: string[], timeoutMs = 15_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => execFile(bin, args, { timeout: timeoutMs, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } }, (e, stdout, stderr) => resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: `${stdout ?? ''}${stderr ?? ''}` })));
}

export async function status(provider: Provider): Promise<AccountStatus> {
  if (process.env.CVC_SETUP_FAKE === 'missing') return { provider, signedIn: false } as AccountStatus; // window checks: the failing screen
  if (process.env.CVC_SETUP_FAKE === 'claude-only') return { provider, signedIn: provider === 'claude', who: '', plan: '', method: '' } as AccountStatus; // window checks: one provider only
  try {
    if (provider === 'claude') {
      const r = await run(CLAUDE, ['auth', 'status', '--json']);
      const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { loggedIn?: boolean; email?: string; subscriptionType?: string; authMethod?: string; apiProvider?: string };
      return { provider, signedIn: !!j.loggedIn, who: j.email ?? '', plan: j.subscriptionType ?? '', method: j.authMethod ?? j.apiProvider ?? '' };
    }
    const r = await codex.account();
    const a = r.account; if (!a) return { provider, signedIn: false, who: '', plan: '', method: '' };
    return { provider, signedIn: true, who: a.type === 'chatgpt' ? a.email ?? '' : '', plan: a.type === 'chatgpt' ? String(a.planType ?? '') : '', method: a.type === 'chatgpt' ? 'ChatGPT' : a.type };
  } catch (e) { return { provider, signedIn: false, who: '', plan: '', method: '', error: e instanceof Error ? e.message : String(e) }; }
}

export async function logout(provider: Provider): Promise<AccountStatus> {
  debug.log('note', `${provider}: signing out`, { by: 'app' });
  if (provider === 'claude') await run(CLAUDE, ['auth', 'logout']); else await codex.logout();
  return status(provider);
}

// ---------- signing in: one flow per provider at a time
const flows = new Map<Provider, ChildProcess | { cancel: () => void }>();
export async function login(provider: Provider): Promise<boolean> {
  if (flows.has(provider)) return false;
  debug.log('note', `${provider}: sign-in started`, { by: 'app' });
  if (provider === 'codex') {
    const r = await codex.loginStart(); flows.set('codex', { cancel: () => { void codex.loginCancel(r.loginId); } });
    emit({ provider, type: 'url', url: r.authUrl }); emit({ provider, type: 'line', text: 'Sign in with ChatGPT in the browser window that just opened. This waits for it to finish.' });
    codex.onLoginCompleted((ok, error) => { flows.delete('codex'); emit({ provider, type: 'done', ok, ...(error ? { error } : {}) }); });
    return true;
  }
  const child = spawn(CLAUDE, ['auth', 'login'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, FORCE_COLOR: '0', NO_COLOR: '1' } });
  flows.set('claude', child);
  const seen = new Set<string>();
  const onText = (d: Buffer) => { const text = d.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); // no terminal colours in the panel
    for (const m of text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []) if (!seen.has(m)) { seen.add(m); emit({ provider, type: 'url', url: m }); }
    for (const line of text.split(/\r?\n/)) if (line.trim()) emit({ provider, type: 'line', text: line.trim() }); };
  child.stdout?.on('data', onText); child.stderr?.on('data', onText);
  child.on('exit', (code) => { flows.delete('claude'); emit({ provider, type: 'done', ok: code === 0, ...(code ? { error: `the sign-in command ended with code ${code}` } : {}) }); });
  child.on('error', (e) => { flows.delete('claude'); emit({ provider, type: 'done', ok: false, error: e.message }); });
  return true;
}
/** Something the sign-in flow asked for (a pasted code), typed in the panel. */
export function reply(provider: Provider, text: string): boolean {
  const f = flows.get(provider); if (!f || !('stdin' in f) || !f.stdin) return false; f.stdin.write(`${text}\n`); return true;
}
export function cancel(provider: Provider): boolean {
  const f = flows.get(provider); if (!f) return false; flows.delete(provider);
  if ('cancel' in f) f.cancel(); else f.kill('SIGTERM');
  emit({ provider, type: 'done', ok: false, error: 'cancelled' }); return true;
}
export function shutdown(): void { for (const p of [...flows.keys()]) cancel(p); }
