// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/top-buttons/claude MOCK_DELAY_MS=5
// The buttons at the top right (the user, 2026-10-01). System events (T-259): "The eye should only appear when the goggles are active ... in
// between the bug and the goggles ... the system events icon makes no sense with an eye": shown in developer mode only, after the glasses and
// before the bug, a lines icon. Reload (T-261): "It should do a hard refresh on the app without restarting the app. So basically like doing
// command R": the window reloads, and a draft is still there.
import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 10000) => { for (let t = 0; t < ms; t += 250) { const v = await js(expr); if (v) return v; await sleep(250); } return null; };
const order = "[...document.querySelectorAll('.tb-right > button')].map((b) => b.classList.contains('dev-btn') ? 'glasses' : b.classList.contains('meta-btn') ? 'events' : b.classList.contains('reload-btn') ? 'reload' : b.querySelector('.lucide-bug') ? 'bug' : '?').join(' ')";
if (await js("!!document.querySelector('.dev-btn.lit')")) { await js("document.querySelector('.dev-btn').click()"); await sleep(400); }
check('out of developer mode: no system events button', (await js(order)) === 'glasses bug reload', await js(order));
await js("document.querySelector('.dev-btn').click()");
check('in developer mode it shows, between the glasses and the bug', (await until(`(${order}) === 'glasses events bug reload'`)) === true, await js(order));
check('...with a lines icon, not an eye', await js("!!document.querySelector('.meta-btn .lucide-logs') && !document.querySelector('.meta-btn .lucide-eye, .meta-btn .lucide-eye-off')"));
await js("document.querySelector('.meta-btn').click()");
check('a click turns system events on: the button lights', !!(await until("!!document.querySelector('.meta-btn.lit')", 3000)));
await js("document.querySelector('.dev-btn').click()");
check('developer mode off: the button goes with it', !!(await until("!document.querySelector('.meta-btn')", 3000)));

await js("document.querySelector('.jauvex-row').click()"); await sleep(1200); // a draft in a chat, then the window reloaded
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'A draft kept across the reload'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(1200);
await js('window.reloadMark = 1');
check('Reload is the last button, titled as Cmd+R', await js("document.querySelector('.tb-right > button:last-child')?.classList.contains('reload-btn') && /Cmd\\+R/.test(document.querySelector('.reload-btn').title)"));
await js("document.querySelector('.reload-btn').click()"); await sleep(3500);
check('Reload reloads the window, as Cmd+R does', !!(await until("window.reloadMark === undefined && !!document.querySelector('.jauvex-row')", 10000)));
await js("document.querySelector('.jauvex-row').click()"); await sleep(1200); // its chat, which had no session yet, opened again
check('...and the draft is still there', !!(await until(`${V}?.querySelector('.composer textarea')?.value === 'A draft kept across the reload'`, 8000)), await js(`${V}?.querySelector('.composer textarea')?.value ?? '(no composer)'`));
done(close);
