import { connect, sleep, check, done } from './lib.ts';
const { js, close } = await connect(); await sleep(2500);
// A session's menu (right-click on its row) lists Rename, Copy session ID and Remove one under another. It was drawn with the
// class "menu ctx", and the context meter's own ".ctx" style (a small inline pill) laid its items out in a row (2026-09-24).
await js("(() => { const r = [...document.querySelectorAll('.row:not(.ghost)')].find((x) => x.querySelector('.provider-icon')); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 160 })); })()");
await sleep(400);
const items = await js("[...document.querySelectorAll('.menu.ctx button')].map((b) => { const r = b.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), text: b.textContent.trim() }; })");
check('the menu opens with its items', Array.isArray(items) && items.length >= 3, JSON.stringify(items));
check('its items stand one under another, not side by side', items.length >= 3 && items.every((it, i) => i === 0 || (it.t > items[i - 1].t && it.l === items[0].l)), JSON.stringify(items));
done(close);
