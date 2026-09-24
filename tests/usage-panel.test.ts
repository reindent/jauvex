// The usage battery's panel (T-98): each provider's plan read into windows (a model's own window tagged with that model, so it
// counts only while the model is in use: Claude's Fable week, a Codex model's extra limit), the plan, extra usage and credits, and
// the words the panel says (shared/usage.ts).
import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
const { claudeFromUsage, codexFromLimits } = await import('../electron/usage.ts');
const { planName, resetText, usageLevel, windowWords } = await import('../shared/usage.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const now = Date.parse('2026-09-23T16:00:00Z'); const iso = (m: number) => new Date(now + m * 60_000).toISOString(); const clock = (_at: number, far: boolean) => (far ? 'Sun 19:00' : '18:14');

const c = claudeFromUsage({ subscription_type: 'max', rate_limits_available: true, rate_limits: { five_hour: { utilization: 62, resets_at: iso(134) }, seven_day: { utilization: 18, resets_at: iso(5940) },
  model_scoped: [{ display_name: 'Fable', utilization: 40, resets_at: iso(5940) }], extra_usage: { is_enabled: true, monthly_limit: 100, used_credits: 24, utilization: 24, currency: 'USD' } } }, now);
check('Claude: 5 hours, the week, and Fable\'s own week', c.windows.map((w) => w.label).join('|') === '5 h|7 d|7 d Fable', c.windows.map((w) => w.label).join('|'));
check('Claude: Fable\'s week counts only while Fable is in use', c.windows.find((w) => w.label === '7 d Fable')?.model === 'fable' && !c.windows.find((w) => w.label === '5 h')?.model);
check('Claude: the plan and the extra usage', c.plan === 'max' && c.notes?.[0] === 'Extra usage is on: 24 % of its monthly limit used.', JSON.stringify([c.plan, c.notes]));
check('Claude: resets are kept as times', c.windows[0]?.resetsAt === now + 134 * 60_000);
check('Claude with an API key: not available, and why', !claudeFromUsage({ rate_limits_available: false }, now).available && /do not apply/.test(claudeFromUsage({ rate_limits_available: false }, now).error ?? ''));

const main = { limitId: 'codex', limitName: null, normalModelSlug: null, primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: now / 1000 + 5400 }, secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: now / 1000 + 259200 }, credits: { hasCredits: true, unlimited: false, balance: '42' }, planType: 'pro' };
const x = codexFromLimits({ rateLimits: main, rateLimitsByLimitId: { codex: main, codex_astra: { ...main, limitId: 'codex_astra', limitName: 'gpt-6-astra', primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null }, secondary: null, credits: null } } }, now);
check('Codex: its 5 hours and week, then a model\'s own limit, named after the model', x.windows.map((w) => w.label).join('|') === '5 h|7 d|5 h gpt-6-astra', x.windows.map((w) => w.label).join('|'));
check('Codex: the model\'s limit counts only while that model is in use', x.windows[2]?.model === 'gpt-6-astra' && !x.windows[0]?.model);
check('Codex: the plan and the credits', x.plan === 'pro' && x.notes?.[0] === 'Credits balance: 42.', JSON.stringify([x.plan, x.notes]));
check('Codex: unlimited credits say so', codexFromLimits({ rateLimits: { ...main, credits: { hasCredits: true, unlimited: true, balance: null } } }, now).notes?.[0] === 'Credits: unlimited.');
check('Codex with no windows: not available, and why', !codexFromLimits({ rateLimits: { primary: null, secondary: null } }, now).available);

check('windows in words', windowWords('5 h') === '5 hours' && windowWords('1 h') === '1 hour' && windowWords('7 d Fable') === '7 days, Fable' && windowWords('5 h gpt-6-astra') === '5 hours, gpt-6-astra' && windowWords('limit') === 'limit');
check('a reset later today: counted down, and the time', resetText(now + 134 * 60_000, now, clock) === 'resets in 2 h 14 min (18:14)', resetText(now + 134 * 60_000, now, clock));
check('a reset days away: days and hours, and the day', resetText(now + (4 * 1440 + 180) * 60_000, now, clock) === 'resets in 4 d 3 h (Sun 19:00)', resetText(now + (4 * 1440 + 180) * 60_000, now, clock));
check('minutes only, and a reset that has come', resetText(now + 9 * 60_000, now, clock) === 'resets in 9 min (18:14)' && resetText(now - 1000, now, clock) === 'resets now' && resetText(null, now, clock) === '');
check('the battery\'s colours: green, amber from 40 % left, red from 15 %', usageLevel(41) === 'ok' && usageLevel(40) === 'mid' && usageLevel(16) === 'mid' && usageLevel(15) === 'low');
check('plans read for a person', planName('max') === 'Max' && planName('pro') === 'Pro' && planName('team_plus') === 'Team plus');

console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
