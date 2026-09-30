// New replies, per agent (T-226; the user, 2026-09-30: "Personal should have the badges"): a reply counts on its agent while that agent is
// not on screen, its row in the sidebar shows the count (the Jauvex agent's too), and opening the agent clears it. The counts are kept on this
// computer, so a reload or a restart keeps them. Pure: tests/unread.test.ts.

/** New replies, per agent (its session id). */
export type Unread = Record<string, number>;

/** The badge's text: nothing for none, the number up to 99, then 99+. */
export const badgeText = (n: number): string => (!(n > 0) ? '' : n > 99 ? '99+' : String(Math.floor(n)));

/** One more reply of agent `sid`: counted, unless that agent is on screen now. */
export const counted = (u: Unread, sid: string | null | undefined, onScreen = false): Unread =>
  !sid || onScreen ? u : { ...u, [sid]: (u[sid] ?? 0) + 1 };

/** The person opened agent `sid`: its count is gone, and only its count. */
export function seen(u: Unread, sid: string | null | undefined): Unread {
  if (!sid || !u[sid]) return u;
  const { [sid]: _gone, ...rest } = u; return rest;
}

/** What an agent's row shows. */
export const countOf = (u: Unread, sid: string | null | undefined): number => (sid ? u[sid] ?? 0 : 0);

/** The counts kept on this computer, read back; anything that is not a count of an agent is dropped. */
export function unreadFrom(text: string | null): Unread {
  try {
    const o = JSON.parse(text ?? '{}') as unknown; if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0).map(([k, n]) => [k, Math.floor(n)]));
  } catch { return {}; }
}
