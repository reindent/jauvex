// Words with no vowel in them are spelled out by Kokoro's phonemizer: "Mmm, let me think." came out "M M M" (2026-10-17; espeak-ng's
// phonemes: "Mmm" ˌɛmˌɛmˈɛm, "Mm-hmm" ˌɛmˈɛmhəm, while "Hmm" is hˈəm and "Uh-huh" ˈʌhˈʌ). The sounds people write that way get a spelling
// it says as a sound: the yes-sound ("mhm", "mm-hmm") "uh-huh", the thinking one ("mmm", "mm", "hm", "hmmm") "hmm". "MM" in capitals
// (a date's month, a size) and a lone "m" (I'm, 5 m) are left alone.
const cased = (word, to) => (word[0] === word[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
export const speakable = (text) => String(text)
  .replace(/\b(?:m+-?h+m+)\b/gi, (w) => cased(w, 'uh-huh'))
  .replace(/\b(?:m{3,}|Mm|mm|h+m+)\b/gi, (w) => (w === 'MM' ? w : cased(w, 'hmm')));
