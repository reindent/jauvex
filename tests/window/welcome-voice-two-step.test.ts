// needs: mic
// wav: tests/fixtures/claude-then-start.wav
import { connect, sleep, check, done, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// Two steps by voice with both providers signed in: "Claude." picks it, then "Start." starts with it.
await js(openWelcome);
for (let i = 0; i < 220; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
let picked = '', closed = false; for (let i = 0; i < 200; i++) { await sleep(250); picked = (await js("document.querySelector('.welcome-pick:not(.welcome-move) button.on')?.textContent")) || picked; closed = !(await js("!!document.querySelector('.welcome')")); if (closed) break; }
check('"Claude" picked Claude', picked === 'Claude', picked);
check('"Start" then started', closed && (await js("document.querySelector('.jauvex-row')?.classList.contains('on')")));
check('with Claude as the default', (await js("localStorage.getItem('cvc.provider')")) === 'claude');
done(close);
