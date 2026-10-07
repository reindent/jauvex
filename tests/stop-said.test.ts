// What interrupts a busy agent, and when an idle chat compacts (Diego, 2026-10-07: a lone "Off." cut the Reindent agent's turn, and a
// compaction at 90 % in the middle of a conversation hid the messages he sent meanwhile).
import { confirmStop } from '../shared/stop.ts';
import { idleCompactPct, IDLE_COMPACT_MS, shouldCompact } from '../shared/context.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
check('a model\'s "stop" on a fragment with no stop word reaches the turn instead', confirmStop('stop', 'Off.') === 'steer' && confirmStop('stop', 'Work for Reindent.') === 'steer');
check('...a clear stop still stops, in English and Spanish', ['Stop.', 'ok stop that', 'cancel it', 'wait, wait', 'para', 'detente por favor', 'basta'].every((x) => confirmStop('stop', x) === 'stop'));
check('steer, queue and replace are left as the model read them', confirmStop('steer', 'stop') === 'steer' && confirmStop('replace', 'Off.') === 'replace' && confirmStop('queue', 'x') === 'queue');
check('an idle chat compacts ten points under the setting (80 % at 90), never under 40 %', idleCompactPct(90) === 80 && idleCompactPct(50) === 40 && idleCompactPct(45) === 40);
check('...after three idle minutes', IDLE_COMPACT_MS === 180_000);
check('a chat at 82 % of its window compacts while idle, not one at 75 %', shouldCompact({ used: 820_000, window: 1_000_000 } as never, idleCompactPct(90)) && !shouldCompact({ used: 750_000, window: 1_000_000 } as never, idleCompactPct(90)));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
