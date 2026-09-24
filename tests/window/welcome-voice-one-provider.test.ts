// needs: mic
// wav: tests/fixtures/codex-then-start.wav
// env: CVC_SETUP_FAKE=claude-only
import { connect, sleep, check, done, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// Only Claude is signed in: there is no choice to make, "Codex" is refused with the reason, and "Start" starts with Claude.
await js(openWelcome);
for (let i = 0; i < 220; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
check('no provider choice is offered', !(await js("!!document.querySelector('.welcome-pick:not(.welcome-move)')")));
for (let i = 0; i < 40; i++) { await sleep(250); if (/Listening/.test((await js("document.querySelector('.welcome-heard')?.textContent")) || '')) break; }
const ears = (await js("document.querySelector('.welcome-heard')?.textContent")) || ''; check('the ears name only start, not the missing provider', /Say "start"\./.test(ears) && !/Codex/.test(ears), ears);
let refused = false, closed = false; for (let i = 0; i < 200; i++) { await sleep(250); if (/not signed in here/.test((await js("document.querySelector('.welcome-line')?.textContent")) || '')) refused = true; closed = !(await js("!!document.querySelector('.welcome')")); if (closed) break; }
check('"Codex" was refused with the reason', refused);
check('"Start" started with Claude', closed && (await js("localStorage.getItem('cvc.provider')")) === 'claude');
done(close);
