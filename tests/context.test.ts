// How full an agent's context is, and when the app compacts it (shared/context.ts, T-74). The incident: a Claude session at 962,484
// of 1M tokens took one more message and every message after it failed with "Prompt is too long"; nothing on screen said why.
import { AUTO_COMPACT_DEFAULT, autoCompactPct, claudeCompactEnv, claudeUsed, codexUsage, contextLevel, contextPercent, shouldCompact, tokens, tooLong } from '../shared/context.ts';
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };
const at = 1;

check('Claude: a request carries its input, cache writes and cache reads (the output is not counted)', claudeUsed({ input_tokens: 2, cache_creation_input_tokens: 12_463, cache_read_input_tokens: 950_019 }) === 962_484);
check('Claude: no usage is nothing', claudeUsed(null) === 0 && claudeUsed({}) === 0);
check('the incident read as a percentage: 96 %', contextPercent({ used: 962_484, window: 1_000_000, at }) === 96);
check('no window known yet: no percentage', contextPercent({ used: 5000, window: 0, at }) === null && contextPercent(null) === null);
check('never above 100 %', contextPercent({ used: 1_200_000, window: 1_000_000, at }) === 100);
check('green below half, amber from 50 %, red from 80 %', contextLevel(49) === 'ok' && contextLevel(50) === 'mid' && contextLevel(79) === 'mid' && contextLevel(80) === 'high' && contextLevel(100) === 'high');
check('the setting defaults to 90 %', autoCompactPct(undefined) === 90 && autoCompactPct({}) === AUTO_COMPACT_DEFAULT && autoCompactPct({ autoCompact: 150 }) === 90);
check('a saved 0 leaves it to the provider', autoCompactPct({ autoCompact: 0 }) === 0 && !shouldCompact({ used: 999_000, window: 1_000_000, at }, 0));
check('at 90 %, the incident\'s 962K was past it: compacted before the next message', shouldCompact({ used: 962_484, window: 1_000_000, at }, 90));
check('at 90 %, 899K is not yet', !shouldCompact({ used: 899_000, window: 1_000_000, at }, 90));
check('no window, or nothing measured: never', !shouldCompact({ used: 999_000, window: 0, at }, 90) && !shouldCompact(null, 90));
check("Claude Code's own trigger is scaled to mean 90 % of the whole window (its share leaves out 20K for the answer)", claudeCompactEnv(90, { used: 1, window: 1_000_000, maxOutput: 64_000, at }).CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === '91.8');
check('a window not known yet: the setting as it is', claudeCompactEnv(85).CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === '85');
check('never past 100 (a 200K model at 95 %)', claudeCompactEnv(95, { used: 1, window: 200_000, maxOutput: 32_000, at }).CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === '100');
check('left to the provider: Claude Code is not told anything', Object.keys(claudeCompactEnv(0)).length === 0);
const cx = codexUsage({ last: { totalTokens: 120_000 }, modelContextWindow: 258_400 }, at);
check('Codex: the last request against the model\'s usable window', cx?.used === 120_000 && cx.window === 258_400, JSON.stringify(cx));
check('Codex with no window: nothing to show', codexUsage({ last: { totalTokens: 5 }, modelContextWindow: null }, at) === null);
check('did not fit: Claude\'s reasons and text, Codex\'s error', tooLong('prompt_too_long') && tooLong('blocking_limit') && tooLong(null, 'Prompt is too long') && tooLong(null, 'contextWindowExceeded') && tooLong(null, "Codex ran out of room in the model's context window."));
check('other failures are not "too long"', !tooLong('completed', 'rate limit reached') && !tooLong(null, '') && !tooLong(undefined, undefined));
check('tokens read short', tokens(962_484) === '962K' && tokens(1_000_000) === '1M' && tokens(1_500_000) === '1.5M' && tokens(950) === '950', `${tokens(962_484)} ${tokens(1_000_000)} ${tokens(1_500_000)}`);

console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
