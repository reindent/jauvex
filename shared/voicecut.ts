// When a stretch of speech ends, or is closed into a piece the transcription takes on its own (FB-21, from Pro: garbled
// names and phrases split up; a turn ends after a 2.0 s pause, so people talk on through their usual pauses and a stretch grows long). A piece
// is closed only where the speaker leaves a gap: after 6 s at a real pause (400 ms, between phrases), after 12 s at any gap between words
// (90 ms), never in the middle of a word as the 12 s cut did; 45 s whatever happens. Pure: tests/voice-cut.test.ts.
export const LONG_MS = 6_000, HARD_MS = 12_000, MAX_MS = 45_000;
export const PHRASE_GAP_MS = 400, WORD_GAP_MS = 90;
/** 'end': the speaker stopped (the turn's pause); 'cut': close this piece here and keep listening; null: go on. */
export function voiceCut(silentMs: number, lenMs: number, pauseMs: number): 'end' | 'cut' | null {
  if (silentMs >= pauseMs) return 'end';
  if (lenMs > MAX_MS) return 'cut';
  if (lenMs > HARD_MS && silentMs >= WORD_GAP_MS) return 'cut';
  if (lenMs > LONG_MS && silentMs >= PHRASE_GAP_MS) return 'cut';
  return null;
}
