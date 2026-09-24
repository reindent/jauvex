// How full an agent's context is, and when the app compacts it (T-74). Pure, shared by the main process and the window;
// checked in tests/context.test.ts.
//
// The incident behind it (2026-09-23): a Claude session sat at 962K of its 1M window, one short message pushed it over, and the
// messages after it went unanswered or failed with "Prompt is too long" while the app showed nothing: no meter, no "compacting".

/** The tokens the agent's last request carried, against its model's window. `maxOutput`: the model's default answer size (Claude). */
export type ContextUsage = { used: number; window: number; at: number; model?: string; maxOutput?: number };

/** Compact when the context is this full (UiState.autoCompact, in percent). 0 leaves it to the provider: Claude compacts near the
 * limit (about 967K of a 1M window), Codex at 90 % of its model's window (about 95 % of what the meter shows as the window). */
export const AUTO_COMPACT_DEFAULT = 90;
export const AUTO_COMPACT_CHOICES = [95, 90, 85, 80, 75, 70, 60, 50];
export const autoCompactPct = (ui?: { autoCompact?: number } | null): number => { const v = ui?.autoCompact; return typeof v === 'number' && v >= 0 && v <= 100 ? v : AUTO_COMPACT_DEFAULT; };

export const contextPercent = (u?: ContextUsage | null): number | null => (u && u.window > 0 ? Math.min(100, Math.round((u.used / u.window) * 100)) : null);
/** The meter's colour: white, yellow from half full, red from 80 %. */
export const contextLevel = (pct: number): 'ok' | 'mid' | 'high' => (pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'ok');
/** 962484 -> "962K", 1000000 -> "1M", 1500000 -> "1.5M". */
export const tokens = (n: number): string => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)));

type ClaudeUsage = { input_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
/** Claude: what a request carried is its input, cache writes and cache reads. The answer's own tokens are not counted: Anthropic's
 * status line counts the same way, and an assistant message's output count is a placeholder until the turn ends. */
export const claudeUsed = (u?: ClaudeUsage | null): number => (u ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : 0);
/** Codex (`thread/tokenUsage/updated`): the last request's total against the model's usable window. */
export const codexUsage = (t: { last?: { totalTokens?: number } | null; modelContextWindow?: number | null } | null | undefined, at: number): ContextUsage | null =>
  (t?.last && typeof t.last.totalTokens === 'number' && t.modelContextWindow ? { used: t.last.totalTokens, window: t.modelContextWindow, at } : null);

/** Time to compact, between turns: only with a known window, and never when the setting leaves it to the provider (0). */
export const shouldCompact = (u: ContextUsage | null | undefined, pct: number): boolean => !!u && pct > 0 && pct < 100 && u.window > 0 && u.used >= (u.window * pct) / 100;

/** Claude Code's own trigger (it also compacts in the middle of a long turn), moved to pct % of the window. Its
 * CLAUDE_AUTOCOMPACT_PCT_OVERRIDE is a share of the window less the room it keeps for the answer (the model's output size, at
 * most 20K), so the value is scaled to mean pct % of the whole window. It can only lower Claude Code's own threshold. */
export function claudeCompactEnv(pct: number, known?: ContextUsage | null): Record<string, string> {
  if (!(pct > 0 && pct < 100)) return {};
  const room = known && known.window > 0 ? Math.min(known.maxOutput ?? 20_000, 20_000) : 0;
  const scaled = known && known.window > room ? (pct * known.window) / (known.window - room) : pct;
  return { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(Math.min(100, Math.round(scaled * 10) / 10)) };
}

/** The request did not fit the window: Claude's result (`terminal_reason`, or its text), Codex's error (`contextWindowExceeded`). */
export const tooLong = (reason?: string | null, text?: string | null): boolean => reason === 'prompt_too_long' || reason === 'blocking_limit' || /prompt is too long|context window|contextWindowExceeded/i.test(text ?? '');
