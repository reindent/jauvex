// needs: mic
// wav: tests/fixtures/start-codex.wav
import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// Talking to the welcome: "Let's start with Codex." (spoken after the closing line, once the ears are open) picks Codex and starts; the first conversation opens with the Jauvex agent.
await js(openWelcome);
for (let i = 0; i < 220; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
let heard = ''; let closed = false;
for (let i = 0; i < 200; i++) { await sleep(250); heard = (await js("(document.querySelector('.welcome-heard')?.textContent.match(/“([^”]*)”/) || [])[1] ?? ''")) || heard; closed = !(await js("!!document.querySelector('.welcome')")); if (closed) break; }
check('the welcome heard the words', /start|codex/i.test(heard), heard);
check('and started', closed && (await js("document.querySelector('.jauvex-row')?.classList.contains('on')")));
check('with Codex as the default agent', (await js("localStorage.getItem('cvc.provider')")) === 'codex');
done(close);
