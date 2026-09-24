// Which text a stretch of speech keeps (pure, checked in tests/transcript-pick.test.ts).
// On 2026-09-22 the pass over a whole 14-second stretch came back as "I" where the earlier passes over its first 5 and 7 seconds had
// heard two full sentences, and the app kept the "I": the sentences were lost. A pass that hears far fewer words than an earlier pass of
// the same stretch is suspicious: the stretch is transcribed once more, and the fullest text is kept.
export const wordsOf = (t: string): number => t.split(/\s+/).filter(Boolean).length;
export function suspicious(final: string, best: string | null): boolean { return !!best && wordsOf(best) >= 4 && wordsOf(final) < 0.6 * wordsOf(best); }
export function pickTranscript(final: string, best: string | null, retry: string | null): { text: string; by: 'final pass' | 'retry' | 'earlier pass' } {
  if (!suspicious(final, best)) return { text: final, by: 'final pass' };
  if (retry && wordsOf(retry) >= wordsOf(best!)) return { text: retry, by: 'retry' };
  return { text: best!, by: 'earlier pass' };
}

/** Is what was heard the wake phrase? By sound, not spelling: the small model hears "Hey Jauvex" as "Hey, Jev, X." or "Hey Javex".
 * Both are squashed (lowercase, letters and digits); a match is the phrase inside what was heard, or the same consonants in the same
 * order (vowels are what the models get wrong), or, for a short phrase heard alone, an edit distance of at most a third. */
export function wakeMatch(heard: string, phrase: string): boolean {
  const sq = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ''); const skel = (x: string) => sq(x).replace(/[aeiouy]+/g, '');
  const h = sq(heard), p = sq(phrase); if (!h || !p) return false; if (h.includes(p)) return true;
  if (heard.split(/\s+/).filter(Boolean).length > 6) return false; // a sentence that happens to hold the name is not a wake phrase
  const hs = skel(heard), ps = skel(phrase); if (ps.length >= 3 && hs.includes(ps)) return true;
  const d = (a: string, b: string) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]); for (let j = 1; j <= b.length; j++) m[0]![j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i]![j] = Math.min(m[i - 1]![j]! + 1, m[i]![j - 1]! + 1, m[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length]![b.length]!; };
  return h.length <= p.length * 1.6 && d(h, p) <= Math.ceil(p.length / 3);
}
