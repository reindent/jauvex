// llm
// needs: mic
// wav: tests/fixtures/wake.wav
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2000);
// T-80. Mute after each message: a countdown on the microphone, then muted. While muted, the wake phrase ("Hey Jauvex") turns it back
// on, and nothing else heard while muted is sent. The file: "Reply with the single word OK.", 7 s of silence, "Hey Jauvex."
await js("localStorage.setItem('cvc.model', 'claude-haiku-4-5'); localStorage.setItem('cvc.permissions', 'auto')");
await js("window.desktop.api('setUi', { voice: { autoMute: true, autoMuteSec: 2, wakePhrase: 'Hey Jauvex' } })"); await sleep(300);
await js('location.reload()'); await sleep(4000);
await js("document.querySelector('.group-head button[title=\"New session\"]').click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); // the capture starts: the file plays once
let counted = false, muted = false; for (let i = 0; i < 60 && !muted; i++) { await sleep(250); counted = counted || (await js(`!!${V}.querySelector('.pill .mute-count')`)); muted = await js(`!!${V}.querySelector('.pill button.muted')`); }
check('after the message is sent, a countdown shows on the microphone', counted);
check('then the microphone mutes by itself', muted);
check('the message itself went out', await js(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /single word OK/i.test(b.textContent))`));
let unmuted = false; for (let i = 0; i < 60 && !unmuted; i++) { await sleep(250); unmuted = !(await js(`!!${V}.querySelector('.pill button.muted')`)); }
check('"Hey Jauvex" said while muted turns it back on', unmuted);
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8');
check('the recorder says why: auto-mute, then the wake phrase', /auto-mute: muted 2 s after the last message/.test(log) && /wake phrase heard/.test(log));
check('the wake phrase was not sent as a message', !(await js(`[...${V}.querySelectorAll('.user .bubble')].some((b) => /hey jauvex/i.test(b.textContent))`)));
done(close);
