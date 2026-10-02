// The Jauvex agent's dashboard (T-276, from the other edition's, where it sits on a workspace's agent; the user, 2026-10-01: "when you open
// a workspace ... a little dashboard, a half screen or one third of a screen on top, with the top three or top five tasks that you need to do
// ... and some important things, notes", "it would be cool if people can customize their dashboards", and "this should be available only
// for the workspace, or the main Jauvex agent in the personal"). It sits on top of the Jauvex agent's chat. What the app knows by itself
// (workflow steps waiting for you, agents asking or with new replies, who is working, today's runs) it adds on its own; what only the Jauvex
// agent knows (what waits on you, notes to keep in mind) the agent keeps in a file of its folder, DASHBOARD.md. The file's rules are the
// other edition's, which has several people per workspace: here the person's section is "## You". Pure: tests/dashboard.test.ts.

export const DASHBOARD_FILE = 'DASHBOARD.md';
export type DashLine = { text: string; note: string };
export type DashboardFile = { people: { name: string; items: DashLine[] }[]; team: DashLine[]; pinned: string[] };

/** The workspace agent's file, read: a "## <name>" section holds what waits on that person (open items only), "## Team" what waits on
 *  anyone, "## Pinned" notes everyone keeps in mind. An item is a list line, "- [ ] what — why or from whom" (or "· "); a done one,
 *  "- [x]", is left out. A first-level heading and anything that is not a list line are left out. */
export function parseDashboard(md: string): DashboardFile {
  const out: DashboardFile = { people: [], team: [], pinned: [] };
  let into: DashLine[] | null = null; let pins = false;
  for (const raw of String(md ?? '').split('\n')) {
    const line = raw.trimEnd();
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const title = h[1]!.replace(/^needs\s+/i, '').replace(/[:*]/g, '').trim(); pins = /^pinned$/i.test(title);
      if (pins) into = null; else if (/^(team|everyone|anyone|all)$/i.test(title)) into = out.team;
      else { const p = { name: title, items: [] as DashLine[] }; out.people.push(p); into = p.items; }
      continue;
    }
    if (/^#\s/.test(line)) { into = null; pins = false; continue; }
    const it = /^\s*[-*]\s+(?:\[([ xX~])\]\s+)?(.+)$/.exec(line); if (!it) continue;
    if (it[1] === 'x' || it[1] === 'X') continue;
    const body = it[2]!.replace(/\*\*/g, '').trim(); if (!body) continue;
    if (pins) { out.pinned.push(body); continue; }
    if (!into) continue;
    const [text, ...rest] = body.split(/\s+[—–]\s+|\s+·\s+/);
    into.push({ text: text!.trim(), note: rest.join(' · ').trim() });
  }
  return out;
}

/** What waits on a person: the section with their name, or with the first word of it, whatever the case. */
export function itemsFor(f: DashboardFile, name: string): DashLine[] {
  const n = name.trim().toLowerCase(); const first = n.split(/\s+/)[0] ?? '';
  if (!n) return [];
  return f.people.find((p) => { const k = p.name.toLowerCase(); return k === n || k === first || k.split(/\s+/)[0] === first; })?.items ?? [];
}

/** "Good morning, Diego": by the hour on this computer, with the first word of the person's name. */
export const greetingFor = (hour: number, name: string): string => {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
};

/** How a person has their dashboard: how much of the view it takes, and the cards they hid. Kept on their own computer. */
export const DASH_CARDS = ['needs', 'today', 'working', 'pinned'] as const;
export type DashCard = (typeof DASH_CARDS)[number];
export type DashSize = 'third' | 'half' | 'folded';
export type DashPrefs = { size: DashSize; hide: DashCard[] };
export const DEFAULT_DASH: DashPrefs = { size: 'third', hide: [] };
export function dashPrefsFrom(raw: string | null | undefined): DashPrefs {
  try {
    const v = JSON.parse(raw ?? '') as { size?: unknown; hide?: unknown };
    const size: DashSize = v.size === 'half' || v.size === 'folded' ? v.size : 'third';
    const hide = Array.isArray(v.hide) ? (v.hide.filter((x) => (DASH_CARDS as readonly unknown[]).includes(x)) as DashCard[]) : [];
    return { size, hide };
  } catch { return { ...DEFAULT_DASH }; }
}

/** When the app asks the Jauvex agent to bring its dashboard up to date (T-279, from the other edition's; the user, 2026-10-01: "on
 *  initialization ... the dashboard for the first time ... it should rebuild this dashboard ... rebuilt regularly, every now and then,
 *  whenever there's some critical thing, that should be handled by the workspace agent. Or by Jauvex in the case of the personal version",
 *  "smart ... keeps it up to date, somehow regularly, but not too abuse of the workspace agent ... from an agent or the boards are updated
 *  or some time has passed ... without over-updating"). Only while you look at it (the window reads the file), never twice within half an
 *  hour, and once asked and not done yet, three hours before asking again. Its reasons: no file yet, a board of your folders changed since
 *  the file did, or the file is six hours old. What happens between (a report, a decision, a question) the agent writes in its own turns. */
export const DASH_GAP = 30 * 60_000; export const DASH_UNANSWERED = 3 * 3_600_000; export const DASH_STALE = 6 * 3_600_000;
export type DashDue = 'missing' | 'boards' | 'stale';
export type DashboardDue = { due: DashDue[]; boards: string[]; hours: number };
export function dashboardDue(now: number, s: { fileAt: number | null; boardsAt: number; askedAt: number | null }): DashDue[] {
  if (s.askedAt != null) {
    if (now - s.askedAt < DASH_GAP) return [];
    if ((s.fileAt ?? 0) < s.askedAt && now - s.askedAt < DASH_UNANSWERED) return []; // asked, not done yet: no nagging
  }
  if (s.fileAt == null) return ['missing'];
  const out: DashDue[] = [];
  if (s.boardsAt > s.fileAt) out.push('boards');
  if (now - s.fileAt > DASH_STALE) out.push('stale');
  return out;
}

/** What the app tells the Jauvex agent when its dashboard is due: why, and how to judge what matters (the agent decides, not a rule). */
export function dashboardNote(d: DashboardDue): string {
  const why = d.due.map((r) => (r === 'missing' ? 'it has no file yet, so it is empty'
    : r === 'boards' ? `${d.boards.length ? d.boards.join(', ') : 'a board'} changed since its last update`
    : `its last update is ${d.hours} hours old`)).join('; ');
  return `(from the app) Your dashboard needs you: ${why}. Bring ${DASHBOARD_FILE} in your own folder up to date now, from what you know of the user's folders, boards and agents: under "## You" the few things that wait on them, the most important first (a board's top-priority tickets, a question only they can answer, a review or a decision they owe), and under "## Pinned" a few notes to keep in mind. Take out what is done. Leave out what the app shows by itself (runs waiting for them, permissions, new replies). If nothing changed, save it as it is, so the app knows it is current. Then answer in one short line.`;
}
