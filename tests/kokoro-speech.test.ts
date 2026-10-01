import path from 'node:path'; import { existsSync, mkdirSync } from 'node:fs';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata'); mkdirSync(process.env.CVC_DATA_DIR, { recursive: true });
process.env.CVC_TTS = 'kokoro'; // on a Mac too, where it is installed: the same path Linux takes
// The spoken voice on Linux (2026-09-30): there is no `say`, so the app speaks with Kokoro (kokoro/server.mjs), a warm process of its own.
// speak() gives the window a WAV as `say` did, the settings list Kokoro's voices, the welcome's check counts it, and a barge-in drops what
// is still waiting.
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
if (!existsSync('kokoro/node_modules/kokoro-js') || !existsSync('models/kokoro/onnx/model.onnx')) { console.log('PASS skipped: Kokoro is not installed here (sh start.sh installs it on Linux)'); console.log('ALL PASS'); process.exit(0); }
const voice = await import('../electron/voice.ts');

const setup = await voice.setupCheck();
check('the welcome counts Kokoro as the voice, a natural one', setup.say && setup.voice === 'natural', JSON.stringify({ say: setup.say, voice: setup.voice }));
const list = await voice.voices();
check('the settings list Kokoro\'s voices, the default among them', list.includes('af_heart|en_US') && list.length > 10, `${list.length} voices`);
const wav = await voice.speak('The build passed.', '', 185);
const head = wav ? Buffer.from(wav).subarray(0, 12).toString('latin1') : '';
check('a sentence comes back as a WAV the window can play', !!wav && head.startsWith('RIFF') && head.endsWith('WAVE') && wav.byteLength > 24_000 * 0.5, `${wav?.byteLength ?? 0} bytes`);
const slow = await voice.speak('The build passed.', '', 140); const fast = await voice.speak('The build passed.', '', 260);
check('the speed setting changes the pace', !!slow && !!fast && slow.byteLength > fast.byteLength, `${slow?.byteLength} > ${fast?.byteLength}`);
check('a voice that is not Kokoro\'s falls back to the default', !!(await voice.speak('Okay.', 'Samantha', 185)));
const many = ['One.', 'Two, and a longer sentence to keep it busy for a while.', 'Three.', 'Four.'].map((t) => voice.speak(t, '', 185));
await new Promise((r) => setTimeout(r, 50)); voice.cancelSpeech();
const after = await Promise.all(many);
check('a barge-in drops every sentence still waiting', after.every((a) => a === null), JSON.stringify(after.map((a) => (a ? a.byteLength : null))));
check('and the next sentence is spoken as usual', !!(await voice.speak('Still here.', '', 185)));
// Stopped by itself (2026-09-30 review): not started again at every sentence, only at the next voice-on.
const { execFileSync } = await import('node:child_process');
const server = () => execFileSync('ps', ['-eo', 'pid=,ppid=,args=']).toString().split('\n').map((l) => l.trim().split(/\s+/)).filter((f) => f[1] === String(process.pid) && f.some((x) => x.endsWith('kokoro/server.mjs'))).map((f) => Number(f[0]));
const [pid] = server(); if (pid) process.kill(pid, 'SIGKILL'); await new Promise((r) => setTimeout(r, 500));
const t0 = Date.now(); const dead = await voice.speak('Anyone there?', '', 185);
check('after it stopped, a sentence is not spoken and does not start it again', !!pid && dead === null && Date.now() - t0 < 200 && server().length === 0, `${Date.now() - t0} ms, ${server().length} running`);
voice.warmSpeech();
check('the next voice-on starts it again', !!(await voice.speak('Back again.', '', 185)));
voice.shutdown();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
