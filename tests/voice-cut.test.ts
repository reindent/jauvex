// Where the voice closes a piece of speech (FB-21, from Pro: garbled names and phrases split since the turn's pause became 2.0 s): the turn
// ends at the pause; a long stretch is closed into pieces only where the speaker leaves a gap, never in the middle of a word. Pure.
import { voiceCut, HARD_MS, LONG_MS, MAX_MS } from '../shared/voicecut.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
check('the turn ends at the pause the person chose (2.0 s)', voiceCut(2000, 3000, 2000) === 'end' && voiceCut(1990, 3000, 2000) === null);
check('a short message is never cut, whatever its pauses', voiceCut(600, 5000, 2000) === null && voiceCut(1500, LONG_MS, 2000) === null);
check('past 6 s, a real pause between phrases (400 ms) closes a piece', voiceCut(420, 7000, 2000) === 'cut');
check('...but not the short gap inside a phrase (240 ms, what cut before)', voiceCut(240, 7000, 2000) === null);
check('past 12 s, any gap between words closes it', voiceCut(90, HARD_MS + 30, 2000) === 'cut');
check('...and never in the middle of a word, as the 12 s cut did', voiceCut(0, HARD_MS + 30, 2000) === null && voiceCut(60, HARD_MS + 3000, 2000) === null);
check('45 s with no gap at all: closed anyway', voiceCut(0, MAX_MS + 30, 2000) === 'cut');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
