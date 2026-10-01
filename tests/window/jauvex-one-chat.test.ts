// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/jauvex-one-chat/claude CODEX_HOME=__ROOT__/tmp/testrun/jauvex-one-chat/codex MOCK_DELAY_MS=5 CVC_UPDATE_INSTALLED=1
// The Jauvex agent has one chat in the window, whatever opened it (T-262; the user, 2026-10-01, after an update: "This session was active moments
// ago, possibly in another window ... is shown in the Jauvex agent ... and the new chat history wont show"). The window opens again on the chat
// that was on screen, by its session; after an update the app tells the Jauvex agent so, and looked for its chat under a name of its own: not
// finding it, it opened a second chat of the same session, hidden, and the agent's answer went there. Here: the Jauvex agent's chat on screen,
// then the window opened as after an update; its message and the answer show in the chat on screen, with no warning.
import { connect, sleep, check, done, V } from './lib.ts';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const data = process.env.CVC_DATA_DIR!;
const until = async (expr: string, ms = 20000) => { for (let t = 0; t < ms; t += 300) { const v = await js(expr); if (v) return v; await sleep(300); } return null; };
const told = (what: string) => { const f = path.join(data, 'jauvex-transcript.json'); return existsSync(f) && readFileSync(f, 'utf8').includes(what); };
const waitTold = async (what: string, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (told(what)) return true; await sleep(300); } return false; };

await js("document.querySelector('.jauvex-row').click()"); await sleep(1500); // the Jauvex agent's chat on screen, with a conversation
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'A first word for the Jauvex agent.'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
check('(the Jauvex agent has a conversation)', await waitTold('A first word for the Jauvex agent'));
await until(`!document.querySelector('.side-scroll .row-working, .jauvex-row.working')`, 15000); await sleep(1500);
const versions = [...readFileSync('CHANGELOG.md', 'utf8').matchAll(/^## (\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
await js(`window.desktop.api('setUi', { lastVersion: '${versions[2]}' })`); await sleep(500); await js('location.reload()'); await sleep(3000); // opened again after an update
check('(after the update, the Jauvex agent is told so)', await waitTold('has just been updated', 25000));
check("the message and the agent's answer show in the Jauvex agent's chat on screen", !!(await until(`(() => { const t = ${V}?.textContent ?? ''; return /has just been updated/.test(t) && /I got: "[^"]*has just been updated/.test(t); })()`, 20000)), await js(`(${V}?.textContent ?? '').slice(-300)`));
await sleep(3000);
const chats = "[...document.querySelectorAll('.chat-host')].filter((h) => /A first word for the Jauvex agent/.test(h.textContent)).length";
check('...and it says nothing of the session being active somewhere else: the window has one chat of it', !(await js(`/active moments ago/.test(${V}?.textContent ?? '')`)) && (await js(chats)) === 1, String(await js(chats)));
done(close);
