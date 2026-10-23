// Open models in Accounts (1.8.0): the address of a server of your own, List models asks it first, Save keeps the connection (never the key
// in the window), and the composer's menu then offers Open models. The server is a stand-in (tests/mock/open-server.ts).
import { connect, sleep, check, done } from './lib.ts';
import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['--import', 'tsx', 'tests/mock/open-server.ts', '4482'], { stdio: 'ignore' });
const { js, cdp, close } = await connect(); await sleep(2500);
const until = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
const set = (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const click = (text) => js(`(() => { const b = [...document.querySelectorAll('.open-models button')].find((x) => x.textContent === ${JSON.stringify(text)}); b?.click(); return !!b; })()`);
await js("document.querySelector('.foot-btn').click()");
check('Accounts has an Open models section', await until("!!document.querySelector('.open-models')"));
await set('.open-models .open-grid label:nth-child(2) input', 'http://127.0.0.1:4482/v1');
await set('.open-models input[type=password]', 'test-key');
await click('List models');
check('List models asks the server and offers its models', await until("[...document.querySelectorAll('.open-models select')].some((s) => [...s.options].some((o) => o.value === 'stand-in-large'))"), await js("document.querySelector('.open-msg')?.textContent ?? ''"));
await click('Save');
check('Save keeps it, and the section names the model and the address', await until("/stand-in-large|stand-in-small/.test(document.querySelector('.open-models .account-head')?.textContent ?? '') && /4482/.test(document.querySelector('.open-models .account-head')?.textContent ?? '')"));
check('...the key is never shown again', (await js("document.querySelector('.open-models input[type=password]').value")) === '' && /kept/.test(await js("document.querySelector('.open-models input[type=password]').placeholder")));
server.kill();
done(close);
