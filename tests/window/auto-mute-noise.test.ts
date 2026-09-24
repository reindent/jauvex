// needs: mic
// wav: tests/fixtures/auto-mute-noise.wav
// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/auto-mute-noise/claude CODEX_HOME=__ROOT__/tmp/testrun/auto-mute-noise/codex MOCK_DELAY_MS=10
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2000);
// T-127. A sound during the auto-mute countdown (a breath, a knock) stopped it for good: talking stops the countdown, and only a sent
// message started it again, but a sound with no words in it sends nothing (the user, 2026-09-24: "5, 4, 3, and then it stopped").
// The file: "Reply with the single word OK.", 2 s of silence, half a second of noise, then silence.
await js("window.desktop.api('setUi', { voice: { autoMute: true, autoMuteSec: 6 } })"); await sleep(300);
await js('location.reload()'); await sleep(4000);
await js("document.querySelector('.group-head button[title=\"New session\"], .group-head button[title=\"New agent\"]').click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); // the capture starts: the file plays once
let muted = false; for (let i = 0; i < 100 && !muted; i++) { await sleep(250); muted = await js(`!!${V}.querySelector('.pill button.muted')`); }
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); const after = log.slice(log.search(/heard \[whisper\].*single word OK/i) + 1);
check('the message went out', await js(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /single word OK/i.test(b.textContent))`));
check('the noise came after it, and was no words', /ears: speech starts/.test(after) && /heard \[whisper\][^\n]*\((dropped as noise|nothing)/.test(after));
check('the microphone still mutes by itself', muted && /auto-mute: muted 6 s after the last message/.test(log), muted ? 'muted' : 'never muted');
done(close);
