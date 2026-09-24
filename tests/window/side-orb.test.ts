// needs: mic
import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(3000); // the session list re-sorts as the details load: wait for it to settle
// One microphone in the app: voice started in a session keeps listening while another session is looked at; its orb waits in the sidebar.
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(2000); const a = await js("document.querySelector('.tb-name')?.textContent");
await js(`${V}.querySelector('.voice-start').click()`); await sleep(2500);
check('no side orb while the listening session is on screen', !(await js("!!document.querySelector('.side-voice')")));
const other = `${rows}.find((r) => !r.classList.contains('on'))`; // another session than the open one, whatever the order is now
await js(`${other}.click()`); await sleep(1500); const b = await js("document.querySelector('.tb-name')?.textContent");
check('looking at another session: the orb waits at the bottom of the sidebar with the listening session\'s name', (await js("document.querySelector('.side-voice-name')?.textContent")) === a && b !== a);
check('the session on screen has no orb of its own', !(await js(`!!${V}.querySelector('.voice-dock')`)));
await js("document.querySelector('.side-voice-name').click()"); await sleep(1200);
check('the name takes you back, orb back in place', (await js("document.querySelector('.tb-name')?.textContent")) === a && !(await js("!!document.querySelector('.side-voice')")) && (await js(`!!${V}.querySelector('.voice-dock')`)));
await js(`${other}.click()`); await sleep(800); await js("[...document.querySelectorAll('.side-voice-btns button')].pop().click()"); await sleep(800);
check('the end button in the sidebar turns voice off', !(await js("!!document.querySelector('.side-voice')")));
done(close);
