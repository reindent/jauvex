// needs: mic
// wav: tests/fixtures/long-speech.wav
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(1500);
// The user is never interrupted: a line that is ready while they talk (10 s of speech from the fake microphone) waits; "Speaking" never overlaps "Hearing you".
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); // the capture starts: 1.5 s of silence, then ten seconds of talk
await sleep(1200); await js(`${V}.querySelector('.voice-controls button[title="Voice settings"]').click()`); await sleep(200);
await js(`${V}.querySelector('.mini-btn[title^="Say a short line"]').click()`); // a line the voice wants to say, ready in a couple of seconds, while the user talks
const t0 = Date.now(); const samples: any[] = [];
for (let i = 0; i < 150; i++) { await sleep(100); samples.push({ t: Date.now() - t0, phase: await js(`${V}.querySelector('.dock-phase')?.textContent ?? ''`) }); }
const hearing = samples.filter((s) => s.phase === 'Hearing you'); const speaking = samples.filter((s) => s.phase === 'Speaking');
const lastHearing = hearing.at(-1)?.t ?? -1; const firstSpeaking = speaking[0]?.t ?? Infinity;
check('the microphone heard the user for a long stretch', hearing.length >= 40, `${hearing.length} samples of Hearing you, last at ${lastHearing} ms`);
check('the voice never spoke while the user was talking', firstSpeaking > lastHearing, speaking.length ? `first Speaking at ${firstSpeaking} ms` : 'it never spoke (the line was dropped because they said something new, which is also right)');
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
check('the flight recorder shows the line held or dropped for the user', /held [\d.]+ s while the user was talking|NOT said \(the user started talking/.test(log));
done(close);
