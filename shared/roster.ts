// Names and short ids for the sessions the app lists and the agents it lets talk to each other. Pure, shared by the main process and the window.

/** A title for a session list or a roster: the text on one line, cut at a word, at most `max` characters. A session with no name of its
 * own is shown by its first message, and a dictated first message can be a whole paragraph. */
export function shortTitle(text: string, max = 60): string {
  const line = text.replace(/\s+/g, ' ').trim(); if (line.length <= max) return line;
  const cut = line.slice(0, max - 1); const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.!?-]+$/, '')}…`;
}

/** Short ids that stay unique in the list: 6 characters, longer where two ids share their start (Codex ids are time-ordered and often do). */
export function shortIds(ids: string[], min = 6): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of ids) { let n = min; while (n < id.length && ids.some((o) => o !== id && o.slice(0, n) === id.slice(0, n))) n++; out.set(id, id.slice(0, n)); }
  return out;
}

/** The agents a name or a short id points at, the sender excluded: an id wins, then the exact name, then a name containing it.
 * Names are matched without case, spaces or punctuation ("CodexAgent" finds "Codex agent"). One match is a delivery; any other count is an answer with the roster. */
export function findAgents<T extends { sessionId: string; name: string }>(all: T[], to: string, fromId?: string): T[] {
  const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ''); const want = squash(to); if (!want) return [];
  const others = all.filter((a) => a.sessionId !== fromId);
  const idm = /^(?:session)?([0-9a-f]{4,})$/.exec(want)?.[1]; const byId = idm ? others.filter((a) => a.sessionId.toLowerCase().startsWith(idm)) : [];
  if (byId.length) return byId;
  const exact = others.filter((a) => squash(a.name) === want); if (exact.length) return exact;
  const inside = others.filter((a) => squash(a.name).includes(want)); if (inside.length) return inside;
  // the other way round: the name asked for holds an agent's whole name, with a word more ("Acme Creative Agent" for "Creative Agent");
  // the longest such name wins, so "Video Agent" does not take a message meant for "Acme Video Agent"
  const holds = others.filter((a) => squash(a.name).length >= 6 && want.includes(squash(a.name))); if (!holds.length) return [];
  const longest = Math.max(...holds.map((a) => squash(a.name).length)); return holds.filter((a) => squash(a.name).length === longest);
}
