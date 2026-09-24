// needs: mic
import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// Both providers signed in and no default yet: the welcome asks which one to start with; Start then opens the Jauvex agent with voice on.
await js(openWelcome);
for (let i = 0; i < 220; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
await sleep(400);
const pick = await js("[...document.querySelectorAll('.welcome-pick:not(.welcome-move) button')].map((b) => b.textContent).join(',')");
check('the welcome asks which agent to start with', pick === 'Claude,Codex', pick);
check('Start waits for the choice', await js("document.querySelector('.welcome-go').disabled"));
check('the move question comes after the Start-with row', (await js("[...document.querySelectorAll('.welcome-pick')].map((d) => d.classList.contains('welcome-move') ? 'move' : 'start').join(',')")) === 'start,move');
check('the welcome also asks how the Jauvex agent moves, unified preselected', (await js("[...document.querySelectorAll('.welcome-move button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',')")) === 'Unified, experimental*,Handover');
await js("[...document.querySelectorAll('.welcome-pick:not(.welcome-move) button')].find((b) => b.textContent === 'Codex').click()"); await sleep(300);
check('picking one enables Start', !(await js("document.querySelector('.welcome-go').disabled")));
await js("document.querySelector('.welcome-go').click()"); await sleep(3500);
check('Start closes the welcome and opens the Jauvex agent', !(await js("!!document.querySelector('.welcome')")) && (await js("document.querySelector('.jauvex-row')?.classList.contains('on')")));
check('with voice on', await js(`!!${V}?.querySelector('.voice-dock')`));
check('the choice is the default agent', (await js("localStorage.getItem('cvc.provider')")) === 'codex');
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
check('and shows in Jauvex settings', (await js("document.querySelector('.modal.settings select').value")) === 'codex');
done(close);
