// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/jauvex-row-on/claude MOCK_DELAY_MS=5
// The Jauvex agent's row in the left panel is lit while its chat is the one on screen, however the chat was opened (it was
// not lit with the Jauvex chat on screen).
import { connect, sleep, check, done } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
const until = async (expr: string, ms = 10000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
await until("!!document.querySelector('.jauvex-row')"); await js("document.querySelector('.jauvex-row').click()");
check('a click on the Jauvex row opens its chat and lights the row', await until("document.querySelector('.jauvex-row')?.classList.contains('on') === true"));
// a word to it, so it has a session: the window then reopens it at start under that session's key
await js(`(() => { const ta = [...document.querySelectorAll('.chat-host')].find((x) => x.style.display !== 'none').querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Hello'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
await until("[...document.querySelectorAll('.chat-host')].some((h) => h.querySelector('.assistant'))", 20000); await sleep(1500);
await js('location.reload()'); await sleep(4000);
check('...after a reload, its chat back on screen, the row is lit', await until("!!document.querySelector('.chat-host[style*=contents]') && document.querySelector('.jauvex-row')?.classList.contains('on') === true"), await js("JSON.stringify({ on: document.querySelector('.jauvex-row')?.className, hosts: [...document.querySelectorAll('.chat-host')].length })"));
await js("[...document.querySelectorAll('.group .row')].find((r) => r.querySelector('.provider-icon'))?.click()"); await sleep(800);
check('another chat opened: the Jauvex row is not lit', await until("document.querySelector('.jauvex-row')?.classList.contains('on') === false"));
done(close);
