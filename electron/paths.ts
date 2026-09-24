// Where the app keeps its things, for every copy, run from source or compiled: its home, ~/.jauvex (the Jauvex agent's folder), and its
// data in ~/.jauvex/personal (the state, the window's profile, the logs, the command files), outside the folder the app is installed in, so
// an update or a new copy of the app keeps everything. One data folder means one copy running at a time (the lock in main.ts).
// CVC_JAUVEX_HOME and CVC_DATA_DIR move them: the checks give each run its own. scripts/jauvex.ts repeats this default.
import os from 'node:os';
import path from 'node:path';

export const JAUVEX_HOME = process.env.CVC_JAUVEX_HOME || path.join(os.homedir(), '.jauvex');
export const DATA_DIR = process.env.CVC_DATA_DIR || path.join(JAUVEX_HOME, 'personal');
