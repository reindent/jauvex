// A workflow's view laid out as drawn (the user, 2026-09-27, a screenshot: "design is MEGA broken"). A step's branch lines ("↳ failed →
// stop, tell the user") took the sidebar's `.branch` rule, a 9-pixel tree connector placed absolutely: each word fell on a line of its
// own down the left edge, over the step marks, the runs and the links. The chat under the flow greeted with the Jev trainer's words
// ("what this agent should judge"), and its header sat apart from the flow's left edge. A picture of the view is left in tmp/.
import { connect, sleep, check, done, V } from './lib.ts';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'; import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(3000);
const root = process.cwd(); const wdir = path.join(root, 'tmp/scratch/workflows'); rmSync(wdir, { recursive: true, force: true }); mkdirSync(wdir, { recursive: true });
writeFileSync(path.join(wdir, 'news-video-creation.md'), '# News Video Creation\n\nA news story made into a short video, with your approval before it goes out.\n\nwhen: manual\n\n'
  + '## 1. Script → Video Agent\nWrite the script.\nthen: done → Your approval · failed → stop, tell the user\n\n'
  + '## 2. Your approval → you\nthen: approved → Done · changes → back to step 1 with your notes\n\ndone: the video, approved\n');
await js("document.querySelector('.tb-right button[title=\"Refresh\"]').click()"); await sleep(2000);
await js("[...document.querySelectorAll('.group .row')].find((r) => r.textContent.includes('News Video Creation')).click()"); await sleep(2500);
const lines = await js(`[...${V}.querySelectorAll('.steps .st .body div')].filter((d) => d.textContent.startsWith('↳')).map((d) => { const r = d.getBoundingClientRect(), b = d.closest('.body').getBoundingClientRect(); return { text: d.textContent, width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left - b.left), position: getComputedStyle(d).position }; })`);
check('the view draws both branch lines', lines?.length === 2, JSON.stringify(lines));
check('each branch line sits in its step, on one line of its own, full width', lines?.length === 2 && lines.every((l) => l.position !== 'absolute' && l.left >= 0 && l.width > 200 && l.height < 24), JSON.stringify(lines));
const hint = await js(`${V}.querySelector('.wf-chat .jev-hint')?.textContent ?? ''`);
check('the chat under the flow speaks of the workflow, not of a Jev agent', /workflow/i.test(hint) && !/judge|evaluation/i.test(hint), hint);
const edges = await js(`(() => { const h = ${V}.querySelector('.wf-head h1').getBoundingClientRect().left, c = ${V}.querySelector('.wf-chat > header b').getBoundingClientRect().left; return { flow: Math.round(h), chat: Math.round(c) }; })()`);
check('the chat\'s header starts at the flow\'s left edge', Math.abs(edges.flow - edges.chat) <= 2, JSON.stringify(edges));
// the view's width (the user, 2026-09-27: "it uses like 50% of the screen only ... make sure that it works for mobile", then "use all the space
// actually"): the flow takes the whole column, and the Run button ends where the rows end
await js("document.querySelector('.pane .icon-btn[title*=\"Close\"], .pane button[aria-label=\"Close\"]')?.click()"); await sleep(300);
const wide = await js(`(() => { const v = ${V}.querySelector('.wf'), s = v.querySelector('.steps').getBoundingClientRect(), b = v.querySelector('.wf-head .btn').getBoundingClientRect(); return { col: v.clientWidth, steps: Math.round(s.width), gap: Math.round(s.right - 32 - b.right) }; })()`);
check('the flow takes the whole column, and the Run button ends where the rows end', wide.steps === wide.col && Math.abs(wide.gap) <= 2, JSON.stringify(wide));
await js("document.querySelector('.icon-btn[title=\"Toggle sidebar\"]').click()"); await sleep(300);
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false }); await sleep(600);
const narrow = await js(`(() => { const v = ${V}.querySelector('.wf'); const rows = [...v.querySelectorAll('.steps .st')].map((r) => r.getBoundingClientRect()); const s = v.querySelector('.steps'); return { col: v.clientWidth, overflow: v.scrollWidth - v.clientWidth, pad: getComputedStyle(s).paddingLeft, rowsFit: rows.every((r) => r.right <= v.getBoundingClientRect().right + 1 && r.width > 200) }; })()`);
check('on a phone-wide window the same view fits: nothing spills sideways, the margins shrink, every row fits', narrow.overflow <= 0 && narrow.pad === '16px' && narrow.rowsFit, JSON.stringify(narrow));
const phone = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null); if (phone?.data) writeFileSync(path.join(root, 'tmp/workflow-narrow.png'), Buffer.from(phone.data, 'base64'));
await cdp('Emulation.clearDeviceMetricsOverride', {}); await js("document.querySelector('.icon-btn[title=\"Toggle sidebar\"]').click()"); await sleep(400);
const shot = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null);
if (shot?.data) { mkdirSync(path.join(root, 'tmp'), { recursive: true }); writeFileSync(path.join(root, 'tmp/workflow-layout.png'), Buffer.from(shot.data, 'base64')); }
done(close);
