// The order of the folders in the left panel (T-255; the user, 2026-10-01: "I want to be able to rearrange the folders"): where a dropped
// folder goes, and how the new order is kept in the app's list of folders, which also holds one the panel does not show (the app's own).
import { moveFolder, inSlots } from '../shared/folder-order.js';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const shown = ['a', 'b', 'c', 'd'];
check('a folder dropped before another goes just above it', moveFolder(shown, 'd', 'b', 'before').join() === 'a,d,b,c', moveFolder(shown, 'd', 'b', 'before').join());
check('...after another, just below it, also to the very end', moveFolder(shown, 'a', 'c', 'after').join() === 'b,c,a,d' && moveFolder(shown, 'b', 'd', 'after').join() === 'a,c,d,b');
check('...to the very top', moveFolder(shown, 'c', 'a', 'before').join() === 'c,a,b,d');
check('dropped on itself, or on a folder not shown: nothing moves', moveFolder(shown, 'b', 'b', 'after') === shown && moveFolder(shown, 'b', 'x', 'before') === shown && moveFolder(shown, 'x', 'b', 'before') === shown);
check("the workspace's list takes the new order in the places those folders held; one the panel does not show stays where it was", inSlots(['a', 'agent', 'b', 'c'], ['c', 'a', 'b']).join() === 'c,agent,a,b', inSlots(['a', 'agent', 'b', 'c'], ['c', 'a', 'b']).join());
check('...an id the list does not have is left out, and one given twice counts once', inSlots(['a', 'b'], ['b', 'zz', 'b', 'a']).join() === 'b,a');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
