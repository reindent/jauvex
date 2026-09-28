// needs: mic
// wav: tests/fixtures/auto-mute-noise.wav
// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/mini-countdown/claude CODEX_HOME=__ROOT__/tmp/testrun/mini-countdown/codex MOCK_DELAY_MS=10 CVC_MINI_CHECK=1
// The auto-mute countdown on the floating bar (T-178, asked for 2026-09-27: the countdown did not show on the floating bar, only in the
// window). The bar drew from a copy of the voice's state that never had the countdown in it. Here the bar is made but never shown
// (CVC_MINI_CHECK), and read over CDP. The file: "Reply with the single word OK.", 2 s of silence, half a second of noise, then silence.
import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(2000);
await js("window.desktop.api('setUi', { voice: { autoMute: true, autoMuteSec: 6 } })"); await sleep(300);
await js('location.reload()'); await sleep(4000);
await js("document.querySelector('.group-head button[title=\"New session\"]').click()"); await sleep(1500);
await js(`${V}.querySelector('.voice-start').click()`); // the capture starts: the file plays once
let bar: any = null; for (let i = 0; i < 40 && !bar; i++) { await sleep(250); bar = (await (await fetch('http://127.0.0.1:9341/json')).json()).find((t) => t.type === 'page' && t.url.includes('#mini')); }
check('the floating bar is there while voice is on', !!bar);
const ws = new WebSocket(bar.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0; const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result ?? {}); waiting.delete(m.id); } };
const onBar = async (expression: string) => (await new Promise<any>((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); })).result?.value;
let inApp: string | null = null, onTheBar: string | null = null, muted = false;
for (let i = 0; i < 120 && !muted; i++) { await sleep(250);
  const a = await js(`${V}.querySelector('.pill .mute-count')?.textContent ?? null`); const b = await onBar("document.querySelector('.pill .mute-count')?.textContent ?? null");
  if (a && !inApp) inApp = a; if (b && !onTheBar) onTheBar = b; muted = await js(`!!${V}.querySelector('.pill button.muted')`); }
check('the countdown shows in the app, as before', !!inApp, String(inApp));
check('and on the floating bar too, the same seconds', !!onTheBar && /^[1-6]$/.test(onTheBar), String(onTheBar));
check('then the microphone mutes, on the bar as well', muted && await (async () => { for (let i = 0; i < 12; i++) { if (await onBar("!!document.querySelector('.pill button.muted') && !document.querySelector('.pill .mute-count')")) return true; await sleep(250); } return false; })());
ws.close(); done(close);
