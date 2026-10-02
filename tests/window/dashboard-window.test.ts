// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/dashboard-window/claude MOCK_DELAY_MS=5
// The Jauvex agent's dashboard (T-276; the user, 2026-10-01: "when you open a workspace ... a little dashboard ... one third of a screen on top,
// with the top three or top five tasks that you need to do ... and some important things, notes", "it would be cool if people can customize
// their dashboards", and "this should be available only for the workspace, or the main Jauvex agent in the personal"): the Jauvex agent's chat
// opens with it, greeting you with the day; what the agent writes in its DASHBOARD.md shows as yours (what waits on you, the pinned notes);
// what the app knows by itself shows too (here a reply of an agent that is not on screen); it takes one third, half, or one line, keeps the
// cards you keep, and remembers both after a reload; an agent's own chat has none.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 200) { const v = await js(expr); if (v) return v; await sleep(200); } return null; };
const D = `${V}?.querySelector('[data-testid=dashboard]')`;
const openJauvex = async () => { await until("!!document.querySelector('.jauvex-row')"); await js("document.querySelector('.jauvex-row').click()"); };
await openJauvex();
const greet = await until(`${D}?.querySelector('.dash-title')?.textContent ?? ''`);
check("the Jauvex agent's chat opens with its dashboard, greeting you, with today's day", /^Good (morning|afternoon|evening)$/.test(greet ?? '') && (await js(`${D}.querySelector('.dash-day').textContent`)).includes(new Date().toLocaleDateString('en-US', { weekday: 'long' })), String(greet));
check('...one third of the view by default, with its four cards', (await js(`${D}.classList.contains('dash-third')`)) && (await js(`${D}.querySelectorAll('.dash-card').length`)) === 4);
// what the Jauvex agent keeps in its folder: what waits on you, and a pinned note
const home = process.env.CVC_JAUVEX_HOME!; mkdirSync(home, { recursive: true });
writeFileSync(path.join(home, 'DASHBOARD.md'), '# Dashboard\n\n## You\n- [ ] Ship the dashboard — the user asked for it\n- [x] Mock it up\n\n## Pinned\n- Files from a server go as links on its address\n');
await js("window.dispatchEvent(new Event('focus'))");
check("what the agent's DASHBOARD.md says waits on you shows under Needs you, with its note; a done item does not", !!(await until(`[...${D}.querySelectorAll('.dash-need')].some((n) => /Ship the dashboard/.test(n.textContent) && /the user asked for it/.test(n.textContent))`)) && !(await js(`/Mock it up/.test(${D}.textContent)`)), await js(`${D}.textContent.slice(0, 300)`));
check('...and its pinned note under Pinned', await js(`[...${D}.querySelectorAll('.dash-pin')].some((p) => /Files from a server go as links/.test(p.textContent))`));
// what the app knows by itself: a reply of an agent that is not on screen
run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Dash helper', '--no-kickoff');
let helper: any = null; for (let i = 0; i < 60 && !helper; i++) { helper = (run('list').folders ?? []).find((f: any) => f.name === 'scratch')?.sessions?.find((s: any) => s.name === 'Dash helper' && !s.busy); if (!helper) await sleep(300); }
await openJauvex(); await sleep(800);
run('send', '--session', helper.id, '--text', 'A word while the Jauvex agent is on screen.');
check('an agent that replied while you were elsewhere shows under Needs you, with an Open button', !!(await until(`[...${D}.querySelectorAll('.dash-need.reply')].some((n) => /Dash helper replied/.test(n.textContent) && !!n.querySelector('.dash-btn'))`, 20000)), await js(`${D}?.textContent.slice(0, 300)`));
// your way of having it: its size, the cards you keep
const seg = (title: string) => `[...${D}.querySelectorAll('.dash-sizes button')].find((b) => b.title === ${JSON.stringify(title)})`; // icons, named by their title
check('the sizes are three icons (line drawings), each named', (await js(`[...${D}.querySelectorAll('.dash-sizes button')].map((b) => (b.querySelector('svg') ? 'svg ' : '') + b.title).join(', ')`)) === 'svg One third of the view, svg Half of the view, svg Folded to one line', await js(`[...${D}.querySelectorAll('.dash-sizes button')].map((b) => b.outerHTML.slice(0, 80)).join(' | ')`));
await js(`${seg('Half of the view')}.click()`); check('Half makes it half of the view', !!(await until(`${D}.classList.contains('dash-half')`, 3000)));
await js(`${seg('Folded to one line')}.click()`); check('Folded: one line that keeps the count and the first thing', !!(await until(`${D}.classList.contains('dash-folded') && /2 need you: Dash helper replied/.test(${D}.querySelector('.dash-fold')?.textContent ?? '') && !${D}.querySelector('.dash-cards')`, 3000)), await js(`${D}.querySelector('.dash-fold')?.textContent ?? ''`));
await js(`[...${D}.querySelectorAll('.dash-link')].find((b) => b.textContent === 'Show').click()`); check('...and Show brings it back to one third', !!(await until(`${D}.classList.contains('dash-third')`, 3000)));
await js(`${seg('Folded to one line')}.click()`); await until(`${D}.classList.contains('dash-folded')`, 3000); await js(`${D}.querySelector('.dash-more').click()`); await sleep(200);
check("folded, its ⋯ menu shows whole, over the chat, not cut by the bar (the user, 2026-10-01)", await js(`(() => { const m = ${D}.querySelector('.dash-menu'); if (!m) return false; const r = m.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6); return r.height > 60 && !!top && m.contains(top); })()`), await js(`(() => { const m = ${D}.querySelector('.dash-menu'); return m ? JSON.stringify(m.getBoundingClientRect()) : 'no menu'; })()`));
await js(`${D}.querySelector('.dash-more').click()`); await sleep(100);
await js(`${seg('Half of the view')}.click()`); await js(`${D}.querySelector('.dash-more').click()`); await sleep(200);
await js(`[...${D}.querySelectorAll('.dash-menu label')].find((l) => l.textContent === 'Today').querySelector('input').click()`);
check('Customize: a card unticked is gone, the others stay', !!(await until(`${D}.querySelectorAll('.dash-card').length === 3 && ![...${D}.querySelectorAll('.dash-card h5')].some((h) => /^Today/.test(h.textContent))`, 3000)));
await js('location.reload()'); await sleep(3000); await openJauvex();
check('after a reload it is as you left it: half, without Today', !!(await until(`${D}?.classList.contains('dash-half') && ${D}.querySelectorAll('.dash-card').length === 3`)), String(await js(`${D}?.className`)));
// an agent's own chat has none
await js(`[...document.querySelectorAll('.side-scroll .row')].find((b) => b.querySelector('.row-title')?.textContent === 'Dash helper')?.click()`);
check("an agent's own chat has no dashboard", !!(await until(`!${D} && /Dash helper|I got/.test(${V}?.textContent ?? '')`, 8000)), String(await js(`${V}?.textContent.slice(0, 120)`)));
done(close);
