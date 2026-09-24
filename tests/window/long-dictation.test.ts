// llm
// needs: mic
// wav: tests/fixtures/long-dictation.wav
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(1500);
// A 31 s dictation in four parts with 350 ms pauses (under the 800 ms that ends an utterance): once it passes 12 s the engine closes it at the
// next pause, so no transcription pass covers a whole paragraph (that took 3 to 5 s a pass and the words landed late, cut), and the
// parts join into one message, from its first word to its last.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(1500);
const mine = (t) => /omega/i.test(t) || /video agent collaboration/i.test(t); const bubbles = () => js(`[...${V}.querySelectorAll('.user .bubble:not(.queued):not(.draft)')].map((b) => b.textContent)`);
const before = (await bubbles()).filter(mine).length; // earlier runs of this check live in the session's history
await js(`${V}.querySelector('.voice-start').click()`); // the capture starts: the fake microphone plays the dictation once
let sent: any[] = []; for (let i = 0; i < 75; i++) { await sleep(1000); sent = await js(`[...${V}.querySelectorAll('.user .bubble:not(.queued):not(.draft)')].map((b) => b.textContent)`); if (sent.filter(mine).length > before && /omega/i.test(sent.filter(mine).pop() ?? '')) break; } /* a new message: the history already holds earlier runs' Omega, and the loop once stopped after a second */
await sleep(1500); sent = await js(`[...${V}.querySelectorAll('.user .bubble:not(.queued):not(.draft)')].map((b) => b.textContent)`);
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
const cuts = log.split('\n').filter((l) => /a long dictation, closed at a pause/.test(l));
const passes = [...log.matchAll(/heard \[whisper\] (\d+)ms: (?!\()/g)].map((m) => Number(m[1]));
check('the dictation was closed at a pause at least once', cuts.length >= 1, `${cuts.length} cut(s)`);
check('the passes were many and short instead of one over the whole paragraph', passes.length >= 4, `passes: ${passes.join(', ')} ms (the machine's load decides the numbers; what counts is that none covers the paragraph)`);
const whole = sent.find((t) => /alpha/i.test(t) && /omega/i.test(t));
check('the parts joined into one message, from Alpha to Omega', !!whole, sent.map((t) => t.slice(0, 70)).join(' | '));
check('one message, not several', sent.filter(mine).length - before === 1, `${sent.filter(mine).length - before} new message(s)`);
done(close);
