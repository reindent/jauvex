// The pause that ends a turn (Diego, 2026-10-06): 2.0 s by default, up to 5.0 s; a copy on the old 0.8 s default moves to 2.0 s once, a chosen pause stays.
import { VOICE_DEFAULTS, settledVoice, PAUSE_MAX_MS } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
check('the default is 2.0 s, the most 5.0 s', VOICE_DEFAULTS.pauseMs === 2000 && PAUSE_MAX_MS === 5000);
const old = settledVoice({ ...VOICE_DEFAULTS, pauseMs: 800 });
check('a copy still on the old default (0.8 s) moves to 2.0 s, once', old.moved && old.voice.pauseMs === 2000 && old.voice.pauseSet === true && !settledVoice(old.voice).moved);
const mine = settledVoice({ ...VOICE_DEFAULTS, pauseMs: 1200 });
check('a pause the person chose stays', mine.voice.pauseMs === 1200);
check('...and once settled, even 0.8 s chosen again stays', settledVoice({ ...VOICE_DEFAULTS, pauseMs: 800, pauseSet: true }).voice.pauseMs === 800);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
