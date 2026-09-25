import os from 'node:os';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Provider, ProviderUsage, UsageWindow } from '../shared/types.js';
import * as codex from './codex.js';
import type { RateSnapshot } from './codex.js';
import * as grok from './grok.js';
import type { GrokBilling } from './grok.js';
import { claudeExe } from './account.js';

/**
 * How much of the plan is left, per provider: what the battery next to the composer shows.
 *   Claude: the data behind `/usage` (the SDK's experimental usage request, so every field is read defensively), asked of a
 *           short-lived idle process: nothing is sent to a model and nothing is persisted. About a second.
 *   Codex:  `account/rateLimits/read` on the app-server that is already running.
 *   Grok:   the credits of its plan, from the agent's `x.ai/billing` (what its own usage view reads): one window, the period's included
 *           credits (a week or a month), or its on-demand spending once those are used up.
 * Only percentages, window lengths and reset times leave this file: no account IDs, no credentials.
 */
const FRESH_MS = 30_000; // several chats are mounted at once: they share one answer
const cache = new Map<Provider, { at: number; p: Promise<ProviderUsage> }>();
export function get(provider: Provider, force = false): Promise<ProviderUsage> {
  const hit = cache.get(provider); if (hit && !force && Date.now() - hit.at < FRESH_MS) return hit.p;
  const p = (provider === 'codex' ? codexUsage() : provider === 'grok' ? grokUsage() : claudeUsage()).catch((e): ProviderUsage => ({ provider, available: false, windows: [], at: Date.now(), error: e instanceof Error ? e.message : String(e) }));
  cache.set(provider, { at: Date.now(), p }); return p;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const span = (mins: number | null | undefined): string => (!mins ? 'limit' : mins < 60 * 24 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`);

async function claudeUsage(): Promise<ProviderUsage> {
  let wake: (() => void) | null = null; let closed = false;
  async function* idle(): AsyncGenerator<SDKUserMessage> { while (!closed) await new Promise<void>((r) => { wake = r; }); } // a prompt that never comes: the process only answers the usage request
  const q = query({ prompt: idle(), options: { ...claudeExe(), settingSources: [], tools: [], mcpServers: {}, strictMcpConfig: true, persistSession: false, cwd: os.tmpdir() } });
  void (async () => { try { for await (const _ of q) { /* nothing is asked */ } } catch { /* closed */ } })();
  try {
    const u = await Promise.race([q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), new Promise<never>((_, no) => setTimeout(() => no(new Error('no answer in 20 s')), 20_000))]);
    return claudeFromUsage(u as ClaudeReport, Date.now());
  } finally { closed = true; (wake as (() => void) | null)?.(); }
}

type ClaudeWindow = { utilization?: number | null; resets_at?: string | null } | null | undefined;
type ClaudeReport = { subscription_type?: string | null; rate_limits_available?: boolean; rate_limits?: Record<string, unknown> | null };
/** Claude's /usage data as windows: 5 hours, 7 days, and each model's own weekly window (Fable's, say: it only counts while that model is
 * in use), plus the plan and extra usage. Pure: tests/usage-panel.test.ts. */
export function claudeFromUsage(u: ClaudeReport, at: number): ProviderUsage {
  const rl = u.rate_limits; if (!u.rate_limits_available || !rl) return { provider: 'claude', available: false, windows: [], at, error: 'Plan limits do not apply to this sign-in (API key or cloud provider).' };
  const one = (key: string, label: string, model?: string): UsageWindow[] => { const w = rl[key] as ClaudeWindow; return w && typeof w.utilization === 'number' ? [{ label, usedPercent: clamp(w.utilization), resetsAt: w.resets_at ? Date.parse(w.resets_at) || null : null, ...(model ? { model } : {}) }] : []; };
  const scoped = (Array.isArray(rl.model_scoped) ? rl.model_scoped : []) as { display_name?: string; utilization?: number | null; resets_at?: string | null }[];
  const windows = [...one('five_hour', '5 h'), ...one('seven_day', '7 d'), ...one('seven_day_opus', '7 d Opus', 'opus'), ...one('seven_day_sonnet', '7 d Sonnet', 'sonnet'),
    ...scoped.filter((m) => typeof m.utilization === 'number').map((m): UsageWindow => ({ label: `7 d ${m.display_name ?? 'model'}`, usedPercent: clamp(m.utilization!), resetsAt: m.resets_at ? Date.parse(m.resets_at) || null : null, model: (m.display_name ?? '').toLowerCase().split(/\s+/)[0] || 'model' }))];
  const extra = rl.extra_usage as { is_enabled?: boolean; utilization?: number | null } | null | undefined;
  const notes = extra?.is_enabled ? [`Extra usage is on${typeof extra.utilization === 'number' ? `: ${Math.round(clamp(extra.utilization))} % of its monthly limit used` : ''}.`] : [];
  return { provider: 'claude', available: windows.length > 0, windows, at, ...(typeof u.subscription_type === 'string' && u.subscription_type ? { plan: u.subscription_type } : {}), ...(notes.length ? { notes } : {}) };
}

async function grokUsage(): Promise<ProviderUsage> {
  if (!grok.installed()) return { provider: 'grok', available: false, windows: [], at: Date.now(), error: 'Grok is not installed on this Mac' };
  return grokFromBilling(await grok.billing(), Date.now());
}
const dollars = (cents: number): string => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
/** Grok's credits as a window, the way Grok's own usage view reads them: the share of the period's included credits used (else what was
 *  used of the monthly limit); once those are used up and on-demand spending is allowed, the on-demand share instead. The period's
 *  length names the window ("7 d"), its end is the reset. Pure: tests/usage-panel.test.ts. */
export function grokFromBilling(b: GrokBilling, at: number): ProviderUsage {
  const c = b.config; const plan = b.subscription_tier ? { plan: b.subscription_tier } : {};
  if (!c) return { provider: 'grok', available: false, windows: [], at, ...plan, error: 'Grok reported no credits for this sign-in' };
  const limit = c.monthlyLimit?.val ?? 0; const used = c.used?.val ?? 0; const cap = c.onDemandCap?.val ?? 0; const onDemand = c.onDemandUsed?.val ?? Math.max(0, used - limit);
  const included = typeof c.creditUsagePercent === 'number' ? clamp(c.creditUsagePercent) : limit > 0 ? clamp((used / limit) * 100) : 0; // absent: none used (Grok leaves zeros out)
  const start = Date.parse(c.currentPeriod?.start ?? c.billingPeriodStart ?? ''); const end = Date.parse(c.currentPeriod?.end ?? c.billingPeriodEnd ?? '');
  const length = start && end && end > start ? span((end - start) / 60_000) : /WEEK/.test(c.currentPeriod?.type ?? '') ? '7 d' : /MONTH/.test(c.currentPeriod?.type ?? '') ? '30 d' : 'limit';
  const extra = included >= 100 && cap > 0; // the included credits are used up: it goes on, on demand, up to the cap
  const windows: UsageWindow[] = [{ label: extra ? `${length} on demand` : length, usedPercent: extra ? clamp((onDemand / cap) * 100) : included, resetsAt: end || null }];
  const notes = [...(cap > 0 ? [`On demand: ${dollars(onDemand)} of ${dollars(cap)} this period.`] : []), ...((c.prepaidBalance?.val ?? 0) > 0 ? [`Bought credits left: ${dollars(c.prepaidBalance!.val!)}.`] : [])];
  return { provider: 'grok', available: true, windows, at, ...plan, ...(notes.length ? { notes } : {}) };
}
async function codexUsage(): Promise<ProviderUsage> { return codexFromLimits(await codex.rateLimits(), Date.now()); }
/** Codex's windows: its ordinary limit (`codex`) and each model's own extra limit, named after the model (counted only while that model is
 * in use, as Codex's own status does), plus the plan and credits. Pure: tests/usage-panel.test.ts. */
export function codexFromLimits(r: { rateLimits: RateSnapshot; rateLimitsByLimitId?: Record<string, RateSnapshot | undefined> | null }, at: number): ProviderUsage {
  const main = r.rateLimitsByLimitId?.codex ?? r.rateLimits;
  const of = (snap: RateSnapshot | null | undefined, name?: string): UsageWindow[] => [snap?.primary, snap?.secondary].filter((w): w is NonNullable<typeof w> => !!w && typeof w.usedPercent === 'number')
    .map((w): UsageWindow => ({ label: `${span(w.windowDurationMins)}${name ? ` ${name}` : ''}`, usedPercent: clamp(w.usedPercent), resetsAt: w.resetsAt ? w.resetsAt * 1000 : null, ...(name ? { model: name.toLowerCase() } : {}) }));
  const windows = of(main);
  for (const [id, snap] of Object.entries(r.rateLimitsByLimitId ?? {})) if (snap && snap !== main && id !== 'codex') windows.push(...of(snap, snap.limitName || snap.normalModelSlug || id));
  const c = main?.credits; const notes = c?.unlimited ? ['Credits: unlimited.'] : c?.hasCredits && c.balance ? [`Credits balance: ${c.balance}.`] : [];
  return { provider: 'codex', available: windows.length > 0, windows, at, ...(main?.planType ? { plan: String(main.planType) } : {}), ...(notes.length ? { notes } : {}), ...(windows.length ? {} : { error: 'Codex reported no usage windows for this sign-in.' }) };
}
