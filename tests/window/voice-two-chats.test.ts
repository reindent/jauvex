// needs: mic
import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(3000);
// Voice on in one chat, then the voice button in another without ending the first: the first turns itself off after the
// second turned on, and its "off" must never mute the window the second one is now speaking through.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(2000);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(2500);
check('voice is on in the first chat', await js(`!!${V}.querySelector('.voice-dock')`));
await js(`${rows}.find((r) => !r.classList.contains('on')).click()`); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(3000);
check('voice is on in the second chat', await js(`!!${V}.querySelector('.voice-dock')`));
check('the first chat let go of the mic (no side orb for it)', !(await js("!!document.querySelector('.side-voice')")));
const log = readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8').split('\n').filter((l) => / voice (on|off) for /.test(l));
const last = log[log.length - 1] ?? '';
check('the recorder saw the first chat turn off after the second turned on', log.length >= 3 && / voice off for /.test(last), last.slice(0, 160));
check('and the window stays audible with the second chat listening', /listening now: (?!nobody)/.test(last) && /the window is audible/.test(last), last.slice(-90));
done(close);
