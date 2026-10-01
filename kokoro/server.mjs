// The spoken voice on Linux (macOS speaks with `say`): Kokoro-82M through kokoro-js, kept warm in a process of its own, as whisper-server
// keeps Whisper. The app starts it with Electron's own Node (ELECTRON_RUN_AS_NODE=1 <electron> kokoro/server.mjs <models folder>) and talks
// to it in JSON lines on stdin and stdout, not over a port: two copies of an app on one machine, or two apps, never meet on a taken port,
// and the process ends with its pipe when the app does.
//   in:  {"id":1,"text":"...","voice":"af_heart","speed":1}   one sentence to render (voice '' = the default, af_heart)
//        {"cancel":true}                                       the user spoke: every sentence still waiting is dropped
//   out: {"ready":true,"voices":["af_heart|en_US",...]}         once, when the model is loaded and has rendered one word
//        {"id":1,"wav":"<base64>"}                              24 kHz mono WAV (32-bit float; the window decodes it as it does `say`'s)
//        {"id":1,"error":"..."}                                 that sentence could not be rendered, or was dropped
//        {"error":"..."}                                        the model could not be loaded; the process then ends
// The model is read from <models folder>/kokoro (scripts/models.sh fetches it, checked), never from the network; the voices come with
// the kokoro-js package.
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { createInterface } from 'node:readline';

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
// Only the protocol on stdout: the libraries' own messages go to stderr.
console.log = console.info = console.warn = (...a) => process.stderr.write(`${a.join(' ')}\n`);

const DEFAULT_VOICE = 'af_heart';
env.localModelPath = process.argv[2] || 'models';
env.allowRemoteModels = false;
let tts;
try {
  tts = await KokoroTTS.from_pretrained('kokoro', { dtype: 'fp32', device: 'cpu' });
  await tts.generate('Hi.', { voice: DEFAULT_VOICE }); // the first render is slow: done before the app counts on it
} catch (e) { out({ error: `Kokoro could not load its model from ${env.localModelPath}/kokoro: ${e?.message ?? e}` }); process.exit(1); }
const voices = Object.entries(tts.voices).map(([id, v]) => `${id}|${v.language === 'en-gb' ? 'en_GB' : 'en_US'}`);
out({ ready: true, voices });

// One sentence at a time, in order; a cancel empties the queue (the one rendering finishes, and the app drops it).
let queue = [];
let busy = false;
async function next() {
  if (busy) return; const job = queue.shift(); if (!job) return; busy = true;
  try {
    const voice = job.voice && tts.voices[job.voice] ? job.voice : DEFAULT_VOICE;
    const speed = Math.min(2, Math.max(0.5, Number(job.speed) || 1));
    const audio = await tts.generate(String(job.text ?? ''), { voice, speed });
    out({ id: job.id, wav: Buffer.from(audio.toWav()).toString('base64') });
  } catch (e) { out({ id: job.id, error: String(e?.message ?? e) }); }
  busy = false; void next();
}
createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.cancel) { for (const j of queue) out({ id: j.id, error: 'cancelled' }); queue = []; return; }
  queue.push(m); void next();
}).on('close', () => process.exit(0));
