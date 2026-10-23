// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/chat-grips/claude MOCK_DELAY_MS=5
// The line above the chat under a workflow and under a board drags to resize it, as in Jauvex Pro, where every divider resizes; the height is kept on this computer.
import { connect, sleep, check, done, V, useWork, WORK } from './lib.ts';
import { mkdirSync, writeFileSync } from 'node:fs'; import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
await useWork(js);
mkdirSync(path.join(WORK, 'workflows'), { recursive: true }); mkdirSync(path.join(WORK, 'boards'), { recursive: true });
writeFileSync(path.join(WORK, 'workflows', 'grip-flow.md'), '# Grip flow\n\nA flow with a chat under it.\n\nwhen: manual\n\n## 1. Your go → you\nthen: go → Done\n');
writeFileSync(path.join(WORK, 'boards', 'grip-board.md'), '<!-- boards: v1 -->\n# Grip board\n\n## P0 — now\n\n- [ ] **T-01 · A task** — first.\n');
const until = async (f: () => any, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await sleep(300); } return false; };
const open = async (title: string) => { await js("window.dispatchEvent(new Event('focus'))"); await sleep(1500); await js(`[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes(${JSON.stringify(title)}))?.click()`); };
const height = (sel: string) => js(`(() => { const c = ${V}?.querySelector(${JSON.stringify(sel)}); return c ? Math.round(c.getBoundingClientRect().height) : null; })()`);
// a drag on the line at the chat's top: up by `by` pixels
const drag = (sel: string, by: number) => js(`(() => { const c = ${V}.querySelector(${JSON.stringify(sel)}); const g = c.querySelector(':scope > .row-grip'); if (!g) return false; const r = g.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: x, clientY: y - ${by}, pointerId: 1, isPrimary: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, clientX: x, clientY: y - ${by}, pointerId: 1, isPrimary: true })); return true; })()`);
for (const [what, title, sel, key] of [['workflow', 'Grip flow', '.wf-chat', 'wf-chat-h'], ['board', 'Grip board', '.board-chat', 'board-chat-h']] as const) {
  await open(title);
  check(`the ${what}'s chat shows under it`, await until(async () => (await height(sel)) !== null), await js(`${V}?.textContent.slice(0, 160) ?? ''`));
  const before = await height(sel); const dragged = await drag(sel, 120); await sleep(300); const after = await height(sel);
  check(`...the line above it drags: 120 px up, the chat 120 px taller`, dragged === true && after !== null && before !== null && Math.abs(after - (before + 120)) <= 3, `${before} -> ${after}${dragged ? '' : ' (no line to drag)'}`);
  check('...and the height is kept on this computer', Number(await js(`localStorage.getItem('cvc.grip.${key}')`)) === after, String(await js(`localStorage.getItem('cvc.grip.${key}')`)));
}
await js('location.reload()'); await sleep(4000); await open('Grip board');
check("after a reload the board's chat has the height it was left at", await until(async () => { const h = await height('.board-chat'); return h !== null && Math.abs(h - Number(await js("localStorage.getItem('cvc.grip.board-chat-h')"))) <= 1; }), String(await height('.board-chat')));
done(close);
