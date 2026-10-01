// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/folder-drag/claude
// The folders of the left panel are moved by dragging (T-255; the user, 2026-10-01: "I want to be able to rearrange the folders. Right now I
// can't, the project folders. In the left panel"): three folders added in order; the last one dragged by its name over the upper half of the
// first one's name (a line shows above it) and dropped: it comes first, in the panel and in the app's own list of folders (`list`); another
// dropped over the lower half of a name goes below that folder; a reload keeps the order. The folders are under this edition's own tmp/work.
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 30000): Promise<any> => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
const BASE = path.join(process.cwd(), 'tmp/work/order'); rmSync(BASE, { recursive: true, force: true });
const OURS = ['alpha', 'beta', 'gamma']; for (const n of OURS) { mkdirSync(path.join(BASE, n), { recursive: true }); run('add-folder', path.join(BASE, n)); }
const names = () => js("[...document.querySelectorAll('.sidebar section.group .group-label')].map((x) => x.textContent)");
const ours = async () => ((await names()) ?? []).filter((n: string) => OURS.includes(n)).join();
check('(three folders added, shown in the order they were added)', (await until(async () => (await ours()) === 'alpha,beta,gamma', 15000)) !== null, JSON.stringify(await names()));
// a drag as the window gets it: dragstart on the moved folder's name, dragover and drop on the other's, with one DataTransfer
const drag = (from: string, to: string, half: 'upper' | 'lower') => js(`(async () => {
  const group = (n) => [...document.querySelectorAll('.sidebar section.group')].find((g) => g.querySelector('.group-label')?.textContent === n);
  const src = group(${JSON.stringify(from)}).querySelector('.group-head'); const dst = group(${JSON.stringify(to)}); const head = dst.querySelector('.group-head'); const h = head.getBoundingClientRect();
  const x = h.left + 20, y = ${half === 'upper' ? 'h.top + 2' : 'h.bottom - 2'}; const dt = new DataTransfer(); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  fire(src, 'dragstart'); await wait(100); const faded = group(${JSON.stringify(from)}).classList.contains('dragging');
  fire(head, 'dragenter'); fire(head, 'dragover'); await wait(150); const line = dst.className;
  fire(head, 'drop'); fire(src, 'dragend'); return { faded, line }; })()`);
const first = await drag('gamma', 'alpha', 'upper');
check("while gamma is dragged over the upper half of alpha's name, gamma fades and a line shows above alpha", first?.faded === true && /\bdrop-before\b/.test(first?.line ?? ''), JSON.stringify(first));
check('dropped there, gamma comes first', (await until(async () => (await ours()) === 'gamma,alpha,beta', 5000)) !== null, await ours());
const inList = () => (run('list').folders ?? []).map((f: any) => f.name).filter((n: string) => OURS.includes(n)).join();
check("the app's own list of folders keeps that order", inList() === 'gamma,alpha,beta', String(inList()));
const second = await drag('alpha', 'beta', 'lower');
check("dropped over the lower half of beta's name, alpha goes below beta", /\bdrop-after\b/.test(second?.line ?? '') && (await until(async () => (await ours()) === 'gamma,beta,alpha', 5000)) !== null, `${JSON.stringify(second)} ${await ours()}`);
run('reload'); await sleep(5000);
check('after a reload, the folders are still in the order made', (await until(async () => (await ours()) === 'gamma,beta,alpha', 15000)) !== null, await ours());
done(close);
