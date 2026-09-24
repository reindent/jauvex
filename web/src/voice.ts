/**
 * Microphone, voice-activity detection and playback for voice mode. No libraries.
 *
 *   mic -> AudioWorklet (16 kHz frames + loudness) -> VAD state machine -> utterances as WAV
 *   speech audio from `say` -> one gain node -> speakers (fade out in 120 ms on barge-in)
 *
 * Everything the app plays goes through Chromium, so its echo canceller knows what the speakers are
 * playing and the app does not interrupt itself.
 */
const WORKLET = `
class Frames extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.sum = 0; this.n = 0; this.out = new Float32Array(480); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]; if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {           // average down to 16 kHz
      this.sum += ch[k]; this.n++; this.acc += 1;
      if (this.acc >= this.ratio) { this.acc -= this.ratio; this.out[this.i++] = this.sum / this.n; this.sum = 0; this.n = 0;
        if (this.i === 480) { let e = 0; for (let j = 0; j < 480; j++) e += this.out[j] * this.out[j]; this.port.postMessage({ pcm: this.out.slice(0), rms: Math.sqrt(e / 480) }); this.i = 0; } }
    }
    return true;
  }
}
registerProcessor('cvc-frames', Frames);`;

export type VoicePhase = 'off' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'wording' | 'speaking'; // wording: the answer is in, the voice is putting its reply into words and rendering it
export type VoiceEvents = {
  level(rms: number): void;
  speechStart(): void;                       // the user started talking (also the barge-in signal)
  maybeEnd(wav: ArrayBuffer, id: number): void;   // short silence: transcribe speculatively
  resumed(id: number): void;                 // they kept talking: drop that speculative result
  end(wav: ArrayBuffer, id: number, cut?: boolean): void;
  trace?(what: string): void; // every stretch boundary, for the flight recorder: what the ears did and when // cut: closed for its length at a short pause, the speaker has not finished   // the pause is long enough: this is the utterance
  dropped(): void;                           // too short to be speech (a cough, a click): nothing follows speechStart
  interim?(wav: ArrayBuffer): void;
  wake?(wav: ArrayBuffer): void;             // muted, with a wake phrase set: a short phrase heard, to be checked against it (nothing else is sent)          // still talking: the audio so far, every INTERIM_MS, to show the words as they come
};
const TAIL_MS = 240 /* of the closing pause kept */, FRAME_MS = 30, PREROLL = 10 /* 300 ms kept before speech starts */, MAYBE_MS = 240, MIN_SPEECH_MS = 200 /* the default; the welcome asks for less, one word at a time */, MAX_UTTERANCE_MS = 45_000, INTERIM_MS = 1300;
// A dictation longer than this is closed at its next short pause and the next words start a new segment that joins it: every pass over
// the audio costs by its length, and a paragraph re-transcribed at each pause took 3 to 5 seconds a pass, so the words landed late and cut.
const LONG_MS = 6_000; // was 9 s: a 14 s pass once came back as "I" (T-79)
const HARD_MS = 12_000; // no pause short enough for that long: closed anyway, so no pass ever covers a paragraph

export class VoiceEngine {
  private ctx: AudioContext | null = null; private stream: MediaStream | null = null; private node: AudioWorkletNode | null = null;
  private out: GainNode | null = null; private sources = new Set<AudioBufferSourceNode>(); private nextAt = 0;
  private frames: Float32Array[] = []; private pre: Float32Array[] = []; private inSpeech = false; private silentMs = 0; private speechMs = 0; private over = 0;
  private noise = 0.004; private lastInterim = 0; private maybeSent = false; private seq = 0; private meter: AnalyserNode | null = null; private meterBuf = new Float32Array(512);
  pauseMs = 800;
  minSpeechMs = MIN_SPEECH_MS; // loud frames needed for a sound to count as speech (a crisp "start" is short)
  /** Mic muted: nothing is heard, nothing can interrupt. */
  muted = false; wake = false; // wake: while muted, short phrases still go to on.wake (the wake phrase unmutes)
  private wk = { on: false, frames: [] as Float32Array[], speech: 0, silent: 0 };
  constructor(private on: VoiceEvents) {}

  get speaking(): boolean { return this.sources.size > 0; }

  output = ''; // the speaker device id; '' = the system default
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.ctx = new AudioContext({ latencyHint: 'interactive' }); await this.ctx.resume(); await this.setOutput(this.output);
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    this.node = new AudioWorkletNode(this.ctx, 'cvc-frames', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (e: MessageEvent<{ pcm: Float32Array; rms: number }>) => this.frame(e.data.pcm, e.data.rms);
    this.ctx.createMediaStreamSource(this.stream).connect(this.node);
    this.out = this.ctx.createGain(); this.meter = this.ctx.createAnalyser(); this.meter.fftSize = 512; this.out.connect(this.meter); this.meter.connect(this.ctx.destination);
  }
  /** The sound turned out not to be speech (live words found nothing in it for seconds): forget it, as if it had been a click. */
  private trace(what: string) { this.on.trace?.(`${what} · seq ${this.seq} · ${this.frames.length * FRAME_MS} ms, ${this.speechMs} ms of speech, ${this.silentMs} ms of silence`); }
  abandon(): void { if (!this.inSpeech) return; this.trace('abandoned'); this.inSpeech = false; this.frames = []; this.silentMs = 0; this.speechMs = 0; this.maybeSent = false; this.on.dropped(); }
  stop(): void {
    this.silence(0); this.node?.disconnect(); this.node = null; this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    void this.ctx?.close(); this.ctx = null; this.out = null; this.meter = null; this.frames = []; this.pre = []; this.inSpeech = false;
  }

  // ---- VAD: loudness against an adaptive noise floor, with hangover
  /** Loudness of what the app is saying right now (0 when silent). */
  outputLevel(): number { if (!this.meter || !this.speaking) return 0; this.meter.getFloatTimeDomainData(this.meterBuf); let e = 0; for (let i = 0; i < this.meterBuf.length; i++) e += this.meterBuf[i]! * this.meterBuf[i]!; return Math.sqrt(e / this.meterBuf.length); }

  private frame(pcm: Float32Array, rms: number): void {
    if (this.muted && this.wake && !this.inSpeech) { this.wakeFrame(pcm, rms); return; }
    if (this.muted) { if (this.inSpeech) { this.trace('muted: the stretch ends'); const ok = this.speechMs >= this.minSpeechMs; const wav = ok ? this.wav() : null; const id = this.seq; this.inSpeech = false; this.frames = []; this.silentMs = 0; this.speechMs = 0; this.maybeSent = false; if (wav) this.on.end(wav, id); else this.on.dropped(); } this.over = 0; this.on.level(0); return; } /* muted mid-sentence: what was said still lands; the window used to wait for ever for a segment that had been discarded */
    this.on.level(rms);
    // While the app is talking, demand clearly louder and longer speech before calling it a barge-in.
    // While the app is talking the echo canceller softens the user's voice, so the bar to interrupt is only a little
    // higher than normal (1.35x, 150 ms of sustained speech), and the noise floor stops adapting so the app's own
    // leftover echo is never learned as room noise.
    const speaking = this.speaking; const threshold = Math.max(0.012, this.noise * 3.2) * (speaking ? 1.35 : 1); const needMs = speaking ? 150 : 120;
    const loud = rms > threshold;
    if (!this.inSpeech) {
      if (!loud && !speaking) this.noise = this.noise * 0.95 + rms * 0.05;
      this.pre.push(pcm); if (this.pre.length > PREROLL) this.pre.shift();
      this.over = loud ? this.over + FRAME_MS : 0;
      if (this.over >= needMs) { this.inSpeech = true; this.frames = this.pre.splice(0); this.trace('speech starts'); this.silentMs = 0; this.speechMs = this.over; this.lastInterim = 0; this.over = 0; this.maybeSent = false; this.seq++; this.on.speechStart(); }
      return;
    }
    this.frames.push(pcm);
    if (loud) {
      this.speechMs += FRAME_MS; const sofar = this.frames.length * FRAME_MS; // wall time since they started: loud frames alone run slow, speech is full of tiny gaps
      if (this.on.interim && sofar - this.lastInterim >= INTERIM_MS) { this.lastInterim = sofar; this.on.interim(this.wav()); }
      if (this.maybeSent) { this.maybeSent = false; this.trace('resumed after a pause'); this.on.resumed(this.seq); this.seq++; } this.silentMs = 0;
    } else {
      this.silentMs += FRAME_MS;
      if (!this.maybeSent && this.silentMs >= MAYBE_MS && this.speechMs >= this.minSpeechMs) { this.maybeSent = true; this.trace('pause: speculative pass'); this.on.maybeEnd(this.wav(), this.seq); }
    }
    const cut = (this.silentMs >= MAYBE_MS && this.silentMs < this.pauseMs && this.frames.length * FRAME_MS > LONG_MS) || (this.silentMs < this.pauseMs && this.frames.length * FRAME_MS > HARD_MS);
    if (this.silentMs >= this.pauseMs || this.frames.length * FRAME_MS > MAX_UTTERANCE_MS || cut) {
      const ok = this.speechMs >= this.minSpeechMs; const wav = ok ? this.wav(Math.max(0, Math.floor((this.silentMs - TAIL_MS) / FRAME_MS))) : null; const id = this.seq; this.trace(cut ? 'cut: closed for its length' : ok ? 'ends' : 'ends with too little speech: dropped');
      this.inSpeech = false; this.frames = []; this.silentMs = 0; this.speechMs = 0; this.maybeSent = false;
      if (wav) this.on.end(wav, id, cut); else this.on.dropped();
    }
  }
  /** dropTail: frames of the closing pause to leave out. Whisper invents words when it is handed a second of silence. */
  /** Muted with a wake phrase: a small ear of its own, for phrases of up to 4 s; anything longer is not a wake phrase and is dropped. */
  private wakeFrame(pcm: Float32Array, rms: number): void {
    this.on.level(0); const loud = rms > Math.max(0.012, this.noise * 3.2); const w = this.wk;
    if (!w.on) { this.pre.push(pcm); if (this.pre.length > PREROLL) this.pre.shift(); if (!loud) { this.noise = this.noise * 0.95 + rms * 0.05; return; } w.on = true; w.frames = this.pre.splice(0); w.speech = 0; w.silent = 0; }
    w.frames.push(pcm); if (loud) { w.speech += FRAME_MS; w.silent = 0; } else w.silent += FRAME_MS;
    const len = w.frames.length * FRAME_MS; if (w.silent < 450 && len <= 4000) return;
    const frames = w.frames; w.on = false; w.frames = []; if (len <= 4000 && w.speech >= 250) this.on.wake?.(this.wavOf(frames));
  }
  private wav(dropTail = 0): ArrayBuffer { return this.wavOf(dropTail > 0 ? this.frames.slice(0, Math.max(1, this.frames.length - dropTail)) : this.frames); }
  private wavOf(frames: Float32Array[]): ArrayBuffer {
    const n = frames.reduce((a, f) => a + f.length, 0); const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
    const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const f of frames) for (let i = 0; i < f.length; i++) { const x = Math.max(-1, Math.min(1, f[i]!)); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
    return buf;
  }

  // ---- playback: gapless queue through one gain node
  /** Resolves once the clip is scheduled: when it starts (ms from now) and how long it lasts, so the text can be typed along with it. */
  /** Route what the app says to one speaker device ('' = the system default). Chromium: AudioContext.setSinkId. */
  async setOutput(deviceId: string): Promise<void> {
    this.output = deviceId; const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null; if (!ctx?.setSinkId) return;
    try { await ctx.setSinkId(deviceId); } catch { try { await ctx.setSinkId(''); } catch { /* the default it is */ } }
  }
  async play(audio: ArrayBuffer, onEnded?: () => void): Promise<{ inMs: number; ms: number } | null> {
    if (!this.ctx || !this.out) return null;
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* below */ } } // another app taking the audio can leave the context suspended
    if (this.ctx.state !== 'running') return null;
    const buffer = await this.ctx.decodeAudioData(audio.slice(0)); if (!this.ctx || !this.out) return null;
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.connect(this.out);
    const now = this.ctx.currentTime; this.out.gain.cancelScheduledValues(now); this.out.gain.setValueAtTime(1, now);
    const at = Math.max(now + 0.02, this.nextAt); this.nextAt = at + buffer.duration; this.sources.add(src);
    src.onended = () => { this.sources.delete(src); onEnded?.(); }; src.start(at);
    return { inMs: (at - now) * 1000, ms: buffer.duration * 1000 };
  }
  /** Fade out and drop everything queued. 120 ms is fast enough to feel instant and slow enough not to click. */
  silence(fadeMs = 120): void {
    if (!this.ctx || !this.out) return; const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now); this.out.gain.setValueAtTime(this.out.gain.value, now); this.out.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    const dying = [...this.sources]; this.sources.clear(); this.nextAt = 0;
    setTimeout(() => { for (const s of dying) { try { s.onended = null; s.stop(); } catch { /* already ended */ } } }, fadeMs + 20);
  }
}

// ---- a short plain answer can be spoken as it is; this strips what a voice should not pronounce
export function clean(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\|/g, ', ')
    .replace(/[*_~]{1,3}/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
}
