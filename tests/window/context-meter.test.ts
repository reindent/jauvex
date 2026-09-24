// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/context-meter/claude MOCK_CONTEXT_TOKENS=150000 MOCK_CONTEXT_WINDOW=200000 MOCK_DELAY_MS=10
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
// The context meter (T-74), on the Claude stand-in: every request carries 150K tokens of a 200K window. The meter shows 75 % in amber and
// its panel the numbers and a Compact button; a compaction marks the thread and the meter goes down; a typed /compact does the same; past
// the auto-compact setting the chat compacts by itself after the answer; a message that does not fit is compacted for and sent again, once.
const run = (...args) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })); } catch (e) { return { ok: false, raw: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await sleep(250); } return false; };
const meter = `${V}?.querySelector('.ctx')`; const notes = `[...${V}.querySelectorAll('.app-note')].map((n) => n.textContent)`;
const compactions = async () => (await js(`${notes}.filter((t) => /compacted/i.test(t)).length`)) ?? 0;
const idle = `!${V}.querySelector('.send.stop')`; // the stop button is there while a turn (or a compaction) runs
const type = async (text) => { await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
  await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); };

const made = run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Meter', '--kickoff', 'hello, meter');
check('a Claude agent on the stand-in is made and says hello', made.ok === true, JSON.stringify(made).slice(0, 200));
check('after its first answer the meter shows 75 % in amber', await until(`${meter}?.textContent === '75%' && ${meter}.classList.contains('mid') && ${idle}`), await js(`${meter}?.outerHTML?.slice(0, 160) ?? 'no meter'`));
await js(`${meter}.click()`); await sleep(200);
const pop = (await js(`${V}.querySelector('.ctx-pop')?.textContent ?? ''`)) ?? '';
check('its panel has the numbers and the auto-compact setting', pop.includes('150K of 200K tokens (75 %)') && pop.includes('Compacts by itself at 90 %'), pop.slice(0, 220));
await js(`[...${V}.querySelectorAll('.ctx-pop button')].find((b) => b.textContent === 'Compact now').click()`);
check('Compact now: the thread says it was compacted, with the tokens', await until(`${notes}.some((t) => t.includes('Conversation compacted: 150K → 8K tokens'))`), JSON.stringify(await js(notes)));
check('... and the meter goes down, back to white', await until(`${meter}?.textContent === '4%' && ${meter}.classList.contains('ok') && ${idle}`), await js(`${meter}?.textContent`));

await type('/compact'); await sleep(300);
check('a typed /compact compacts too', await until(`${notes}.filter((t) => t.includes('Conversation compacted')).length === 2 && ${idle}`), JSON.stringify(await js(notes)));

const set = run('settings', '--auto-compact', '50');
check('settings --auto-compact 50 is taken', set.ok === true && set.autoCompact === 50, JSON.stringify(set));
await type('one more, please');
check('past the setting, the chat compacts by itself after the answer', await until(`${notes}.some((t) => t.includes('compacted automatically')) && ${idle}`), JSON.stringify(await js(notes)));

run('settings', '--auto-compact', '90'); await sleep(300);
const before = await compactions(); const cards = (await js(`${V}.querySelectorAll('.chat-error').length`)) ?? 0;
await type('this one is [[too long]]');
// The stand-in refuses it every time: compacted once, sent once more, and then the failure shows: no loop.
await until(`${V}.querySelectorAll('.chat-error').length >= ${cards + 3} && ${idle}`, 20000); await sleep(1500);
check('a message that does not fit: compacted at once and sent again, once', (await compactions()) === before + 1, `${before} -> ${await compactions()}`);
check('... then the failure shows, and nothing loops', (await js(`${V}.querySelectorAll('.chat-error').length`)) === cards + 3 && (await js(idle)), String(await js(`${V}.querySelectorAll('.chat-error').length`)));

await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
check('the setting is in Jauvex settings, under Context', (await js("[...document.querySelectorAll('.modal.settings .settings-group')].some((g) => g.querySelector('strong')?.textContent === 'Context' && g.querySelector('select')?.value === '90')")) === true);
done(close);
