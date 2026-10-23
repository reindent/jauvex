// needs: mic
// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/side-orb/claude CODEX_HOME=__ROOT__/tmp/testrun/side-orb/codex MOCK_DELAY_MS=5
import { connect, sleep, check, done, V, ownAgents, rowOf } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(3000); // the session list re-sorts as the details load: wait for it to settle
// One microphone in the app: voice started in a session keeps listening while another session is looked at; its orb waits in the sidebar.
await ownAgents(js, ['Orb one', 'Orb two']);
await js(`${rowOf('Orb one')}.click()`); await sleep(2000); const a = await js("document.querySelector('.tb-name')?.textContent");
await js(`${V}.querySelector('.voice-start').click()`); await sleep(2500);
check('no side orb while the listening session is on screen', !(await js("!!document.querySelector('.side-voice')")));
const other = rowOf('Orb two'); // another session than the open one
await js(`${other}.click()`); await sleep(1500); const b = await js("document.querySelector('.tb-name')?.textContent");
check('looking at another session: the orb waits at the bottom of the sidebar with the listening session\'s name', (await js("document.querySelector('.side-voice-name')?.textContent")) === a && b !== a);
check('the session on screen has no orb of its own', !(await js(`!!${V}.querySelector('.voice-dock')`)));
await js("document.querySelector('.side-voice-name').click()"); await sleep(1200);
check('the name takes you back, orb back in place', (await js("document.querySelector('.tb-name')?.textContent")) === a && !(await js("!!document.querySelector('.side-voice')")) && (await js(`!!${V}.querySelector('.voice-dock')`)));
await js(`${other}.click()`); await sleep(800); await js("[...document.querySelectorAll('.side-voice-btns button')].pop().click()"); await sleep(800);
check('the end button in the sidebar turns voice off', !(await js("!!document.querySelector('.side-voice')")));
done(close);
