// Updates (T-165): jauvex.ai says which version of Jauvex is the latest, and the copy the install command made, when it runs
// an older one, asks the user in words, through its own agent, whether to update. Pure: tests/update.test.ts.
import { t } from './i18n/index.js';
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** a is a newer version than b (both x.y.z); false when either is not a version. */
export function newer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !VERSION_RE.test(a) || !VERSION_RE.test(b)) return false;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0; }
  return false;
}

/** current: this copy's version; latest: the site's, once known; installed: a copy that can update itself (the Mac app the install
 *  command made; a copy run from a clone updates with git); reinstall: the install command, on a Linux or Windows copy that command made
 *  (it updates by running it again). */
export type UpdateStatus = { current: string; latest?: string; available: boolean; installed: boolean; reinstall?: string; notes?: string /* what the newer version brings: its changelog's sections since this one (T-218), when the site sent them */ };

export const INSTALL_UNIX = 'curl -fsSL https://jauvex.ai/install | sh';
export const INSTALL_WINDOWS = 'irm https://jauvex.ai/install/windows | iex';
/** The install command that made this copy, when the Linux or Windows installer made it (it updates by running that command again): on Linux
 *  the source in the data folder's app/, on Windows in %LOCALAPPDATA%\Jauvex\app\jauvex. Undefined on a Mac (Jauvex.app updates itself) and
 *  for a clone (git). */
export function reinstallCommand(platform: string, appRoot: string, dataDir: string, localAppData?: string): string | undefined {
  const plain = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (platform === 'linux') return plain(appRoot) === plain(`${dataDir}/app`) ? INSTALL_UNIX : undefined;
  if (platform === 'win32' && localAppData) return plain(appRoot).toLowerCase() === plain(`${localAppData}/Jauvex/app/jauvex`).toLowerCase() ? INSTALL_WINDOWS : undefined;
  return undefined;
}

/** The app tells its own agent once per version: a newer one, on a copy that can take it, not asked about before. */
export const shouldAsk = (s: UpdateStatus | null | undefined, asked: string | undefined): boolean =>
  !!s && s.available && s.installed && !!s.latest && asked !== s.latest;

/** What a click on What's new found (T-245; the user, 2026-09-30: "when you click what's new, it should check if there's a new version"): the
 *  status after the app asked the site right then, and whether the site answered. */
export type CheckedStatus = UpdateStatus & { reached: boolean };
/** A click on What's new with a newer version out, on the copy that updates itself: the Jauvex agent says what it brings and asks, as the
 *  update notice does; anything else opens the notes. */
export const offersUpdate = (s: UpdateStatus | null | undefined): boolean => !!s && s.available && s.installed && !!s.latest;
/** The line above the notes: what the check found. */
export const checkLine = (s: CheckedStatus | null | undefined, current: string): string =>
  !s || !s.reached ? t('update.unreached', { current })
    : s.available && !s.installed ? (s.reinstall ? t('update.outReinstall', { version: s.latest ?? '', command: s.reinstall }) : t('update.outClone', { version: s.latest ?? '' }))
      : s.available ? t('update.out', { version: s.latest ?? '' }) : t('update.latest', { version: s.current });

/** What the app tells its own agent when a new version is out: the agent asks the user in words, never a dialog. */
export const updateNote = (current: string, latest: string, notes = ''): string =>
  `(from the app) Jauvex ${latest} is out; this copy runs ${current}. ` +
  (notes.trim() ? 'First tell the user, in one or two short lines, what it brings: the main change first, in plain words (its changelog is below; the whole list is at jauvex.ai/changelog). Then ask' : 'Ask') +
  ' the user, in one short line, whether to update now: the app ' +
  'closes, rebuilds itself on this Mac with the install command (a few minutes) and opens again, and any agent still working stops. On a ' +
  'yes, run the app\'s `update` order as the last thing you do (it refuses while other agents work; `--now` updates anyway, only on the ' +
  'user\'s word). On a no, leave it: the app does not ask again for this version, and the user can say "update the app" at any time.' +
  (notes.trim() ? `\n\nWhat ${latest} brings, from its changelog:\n${notes.trim()}` : '');

/** Did the app just open on a new version? Yes when the version it last ran is older (from: that version), or, a copy from before the app
 *  kept its last version, when the version it runs is the one the user agreed to update to (from: unknown). Only the copy the install
 *  command made updates itself: a clone never says so. */
export function justUpdated(s: UpdateStatus | null | undefined, ui: { lastVersion?: string; updateAsked?: string } | undefined): { from: string | null } | null {
  if (!s || !s.installed || !VERSION_RE.test(s.current)) return null;
  const last = ui?.lastVersion;
  if (last) return newer(s.current, last) ? { from: last } : null;
  return ui?.updateAsked === s.current ? { from: null } : null;
}

/** What the app tells its own agent when it opens on a new version (T-218; the user, 2026-09-30: "the app should notify what the change log
 *  is about"): say it is updated, what the new version brings, from its changelog, then check the app and report. */
export const updatedNote = (from: string | null, to: string, notes = ''): string =>
  `(from the app) The app has just been updated${from ? ` from ${from}` : ''} to Jauvex ${to} and opened again. Tell the user in one short ` +
  `line that it is updated to ${to}${notes.trim() ? ', then in two or three short lines what it brings, the main change first, in plain words (its changelog is below; the whole list is at jauvex.ai/changelog)' : ''}. ` +
  `Then check that it works: run the app's \`list\` (its folders and agents are all there) and \`update --check\` (it names ${to} as the version ` +
  'running), and say in one line what you found. If something is wrong, say what, and offer to help: the update\'s log is ' +
  '~/.jauvex/personal/update/update.log, and the install command installs this version again.' +
  (notes.trim() ? `\n\nWhat ${to} brings, from its changelog:\n${notes.trim()}` : '');
