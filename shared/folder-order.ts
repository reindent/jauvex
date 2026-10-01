// The order of the folders in the left panel (T-255; the user, 2026-10-01: "I want to be able to rearrange the folders. Right now I can't"):
// a folder dragged by its name onto another goes before or after it, and the order is kept in the app's state (its list of folders). Pure,
// checked in tests/folder-order.test.ts.

/** The folders shown, by id, once `id` is dropped before or after `target`; unchanged when either is not shown, or they are the same. */
export function moveFolder(shown: string[], id: string, target: string, where: 'before' | 'after'): string[] {
  if (id === target || !shown.includes(id) || !shown.includes(target)) return shown;
  const rest = shown.filter((x) => x !== id); const at = rest.indexOf(target) + (where === 'after' ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** A whole list of ids with the given ones in the given order, in the places they held: the others stay where they are (the panel shows
 *  only some of the folders: never the app's own). An id the list does not have is left out. */
export function inSlots(all: string[], order: string[]): string[] {
  const next = [...new Set(order)].filter((x) => all.includes(x)); const moved = new Set(next); let i = 0;
  return all.map((x) => (moved.has(x) ? next[i++]! : x));
}
