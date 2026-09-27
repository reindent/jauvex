// Updates (T-165): jauvex.reindent.com says which version of Jauvex is the latest, and the copy the install command made, when it runs
// an older one, asks the user in words, through its own agent, whether to update. Pure: tests/update.test.ts.
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** a is a newer version than b (both x.y.z); false when either is not a version. */
export function newer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !VERSION_RE.test(a) || !VERSION_RE.test(b)) return false;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0; }
  return false;
}

/** current: this copy's version; latest: the site's, once known; installed: a copy that can update itself (the Mac app the install
 *  command made; a copy run from a clone updates with git). */
export type UpdateStatus = { current: string; latest?: string; available: boolean; installed: boolean };

/** The app tells its own agent once per version: a newer one, on a copy that can take it, not asked about before. */
export const shouldAsk = (s: UpdateStatus | null | undefined, asked: string | undefined): boolean =>
  !!s && s.available && s.installed && !!s.latest && asked !== s.latest;

/** What the app tells its own agent when a new version is out: the agent asks the user in words, never a dialog. */
export const updateNote = (current: string, latest: string): string =>
  `(from the app) Jauvex ${latest} is out; this copy runs ${current}. Ask the user, in one short line, whether to update now: the app ` +
  'closes, rebuilds itself on this Mac with the install command (a few minutes) and opens again, and any agent still working stops. On a ' +
  'yes, run the app\'s `update` order as the last thing you do (it refuses while other agents work; `--now` updates anyway, only on the ' +
  'user\'s word). On a no, leave it: the app does not ask again for this version, and the user can say "update the app" at any time.';
