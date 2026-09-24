import { connect, sleep, check, done, V } from './lib.ts'; import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
// The Jauvex agent's session is gone from where it lives (its folder moved): the conversation stays on screen from the app's own
// transcript, a note says what happened, and the next message starts a new session carrying the conversation so far.
const data = process.env.CVC_DATA_DIR!; const tf = path.join(data, 'jauvex-transcript.json');
writeFileSync(tf, JSON.stringify([{ message: { uuid: 'jx-a', role: 'user', blocks: [{ type: 'text', text: 'Remember the word PELICAN.' }], meta: false }, provider: 'claude', at: Date.now() - 60000 }, { message: { uuid: 'jx-b', role: 'assistant', blocks: [{ type: 'text', text: 'Noted: PELICAN.' }], meta: false }, provider: 'claude', at: Date.now() - 59000 }]));
await js("window.desktop.api('setUi', { jauvexSession: '00000000-0000-4000-8000-000000000000', jauvexProvider: 'claude' })"); await sleep(300);
await js('location.reload()'); await sleep(4500);
await js("document.querySelector('.jauvex-row').click()"); await sleep(3000);
check('the conversation is on screen, from the app\'s own transcript', /PELICAN/.test(await js(`${V}?.textContent ?? ''`)));
const ui = JSON.parse(readFileSync(path.join(data, 'state.json'), 'utf8')).ui ?? {};
check('the lost session is let go: the next message starts a new one', ui.jauvexSession == null, JSON.stringify(ui.jauvexSession));
check('a note in the conversation says why', /session was not found where the agent now lives/.test(readFileSync(tf, 'utf8')));
check('the recorder says it too', /the Jauvex agent's session 00000000 was not found/.test(readFileSync(path.join(data, 'voice-debug.log'), 'utf8')));
done(close);
