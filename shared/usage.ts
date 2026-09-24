// The usage battery's panel (T-98): a plan's windows in words, and when each resets. Pure, checked in tests/usage-panel.test.ts.

/** How much of a window is left, as the battery colours it: green, amber from 40 % left, red from 15 %. */
export const usageLevel = (left: number): 'ok' | 'mid' | 'low' => (left <= 15 ? 'low' : left <= 40 ? 'mid' : 'ok');

/** A window's label in words: "5 h" -> "5 hours", "7 d Opus" -> "7 days, Opus", "1 h" -> "1 hour". */
export function windowWords(label: string): string {
  const m = /^(\d+) ([hd])\b\s*(.*)$/.exec(label.trim()); if (!m) return label;
  const [, n, u, rest] = m; const unit = `${u === 'h' ? 'hour' : 'day'}${n === '1' ? '' : 's'}`;
  return rest ? `${n} ${unit}, ${rest}` : `${n} ${unit}`;
}

/** When a window resets, counted down and on the clock: "resets in 2 h 14 min (18:30)", "resets in 3 d 4 h (Mon 09:00)".
 * `clock` writes the time (a weekday too when it is a day or more away); the window passes the user's locale. */
export function resetText(at: number | null, now: number, clock: (at: number, far: boolean) => string): string {
  if (!at) return '';
  const mins = Math.round((at - now) / 60_000); if (mins <= 0) return 'resets now';
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const left = d ? `${d} d${h ? ` ${h} h` : ''}` : h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return `resets in ${left} (${clock(at, mins >= 1440)})`;
}

/** A plan as the provider names it ("max", "pro") written for a person: "Max". */
export const planName = (plan: string): string => plan.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
