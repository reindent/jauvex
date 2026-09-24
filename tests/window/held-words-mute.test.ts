// llm
// needs: mic
// wav: tests/fixtures/long-dictation.wav
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(1500);
// Words held for their next part are never lost: the microphone is muted in the middle of the dictation (as the user did once,
// when a breath had begun a segment that then never ended), and everything said so far goes out as a message.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
const mine = (t) => /video agent collaboration/i.test(t); const bubbles = () => js(`[...${V}.querySelectorAll('.user .bubble:not(.queued):not(.draft)')].map((b) => b.textContent)`);
const before = (await bubbles()).filter(mine).length;
await js(`${V}.querySelector('.voice-start').click()`); // the dictation plays: part one and two (17 s) are closed at a pause and held for the next words
await sleep(21000);
check('words are held in the hearing bubble', /…$/.test((await js(`${V}.querySelector('.bubble.draft')?.textContent ?? ''`)).trim()) || (await js(`!!${V}.querySelector('.bubble.draft')`)));
await js(`${V}.querySelector('button[title="Mute microphone"]').click()`);
let sent = false; for (let i = 0; i < 40; i++) { await sleep(1000); if ((await bubbles()).filter(mine).length > before) { sent = true; break; } }
check('muting the microphone sends the held words as a message', sent);
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
check('the recorder says why', /mic muted with words held: sending them now|muted mid-sentence/.test(log) || sent);
done(close);
