// Kokoro's phonemizer spells out a word with no vowel ("Hmm" came out as "M M M"): the sounds written that way
// reach it as words it says (kokoro/speakable.mjs); a date's MM, a lone m and I'm are left as they are.
import { speakable } from '../kokoro/speakable.mjs';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const cases: [string, string][] = [['Mmm, let me think.', 'Hmm, let me think.'], ['Hm, okay.', 'Hmm, okay.'], ['hmmm', 'hmm'], ['Mhm, sure.', 'Uh-huh, sure.'], ['mm-hmm, right', 'uh-huh, right'], ['Hmm, let me see what happened.', 'Hmm, let me see what happened.']];
const bad = cases.filter(([a, b]) => speakable(a) !== b).map(([a]) => `${a} -> ${speakable(a)}`);
check('the thinking and yes sounds are spelled as sounds: Hmm, uh-huh', !bad.length, bad.join(' | '));
const kept = ['The MM/DD field', '5 m away', "I'm here", 'Mmmagic'];
check('...and nothing else changes: a date\'s MM, a lone m, I\'m, a word that only starts so', kept.every((t) => speakable(t) === t), kept.map((t) => speakable(t)).join(' | '));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
