// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/sidebar-tabs/claude MOCK_DELAY_MS=5
// The left panel's tabs and filter, as in Jauvex Pro.
// All shows each folder as its tree; Agents, Workflows and Boards show that kind alone in every folder, every row, without the group's head;
// the tab is remembered. The filter narrows every folder's agents, workflows and boards as it is typed (a folder whose name fits shows whole),
// hides a folder with nothing that fits, and Escape empties it.
import { connect, sleep, check, done, useWork, WORK } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
await useWork(js);
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 20000): Promise<any> => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
const agents = (): any[] => (run('list').folders ?? []).find((f: any) => f.name === 'work')?.sessions ?? [];
for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) { run('new-agent', '--provider', 'claude', '--folder', 'work', '--name', name, '--no-kickoff'); await until(() => agents().find((x) => x.name === name && !x.busy), 30000); }
mkdirSync(path.join(WORK, 'workflows/hello'), { recursive: true }); mkdirSync(path.join(WORK, 'boards'), { recursive: true });
writeFileSync(path.join(WORK, 'workflows/hello.md'), '# Hello\n\nSays hello.\n\nwhen: manual\n\n## 1. [Hello](hello/hello.md) → Alpha\n');
writeFileSync(path.join(WORK, 'workflows/hello/hello.md'), 'Say hello.\n');
writeFileSync(path.join(WORK, 'boards/launch.md'), '<!-- boards: v1 -->\n# Launch\n\n## P0 — now\n\n- [ ] **T-01 · Write the plan** — first.\n');
await js('location.reload()'); await sleep(4000);
const G = "[...document.querySelectorAll('.group')].find((g) => g.querySelector('.group-label')?.textContent === 'work')";
const heads = () => js(`${G} ? [...${G}.querySelectorAll('.subgroup-head .subgroup-title')].map((x) => x.textContent).join(',') : 'no folder'`);
const kinds = () => js(`(() => { const g = ${G}; if (!g) return null; const r = [...g.querySelectorAll('.subgroup-rows > .row:not(.ghost):not(.subgroup-more)')]; return { agents: r.filter((x) => x.querySelector('.provider-icon')).length, workflows: r.filter((x) => x.querySelector('.wf-dot')).length, boards: r.filter((x) => x.querySelector('.board-dot')).length }; })()`);
const tab = (name: string) => js(`[...document.querySelectorAll('.side-tab')].find((b) => b.textContent === '${name}').click()`);
const on = () => js("document.querySelector('.side-tab.on')?.textContent");
const filter = (q: string) => js(`(() => { const i = document.querySelector('.side-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);

check('four tabs, All on at first, and the filter under them', (await js("[...document.querySelectorAll('.side-tab')].map((b) => b.textContent).join(',')")) === 'All,Agents,Workflows,Boards' && (await on()) === 'All'
  && (await js("document.querySelector('.side-search input')?.placeholder")) === 'Filter agents, workflows, boards…', await js("document.querySelector('.side-scroll')?.innerHTML.slice(0, 300) ?? 'none'"));
const all = await kinds();
check('All: the folder as its tree, three groups, three agents shown of four', (await heads()) === 'Agents,Workflows,Boards' && all.agents === 3 && all.workflows === 1 && all.boards === 1, `${await heads()} ${JSON.stringify(all)}`);
await tab('Agents'); await sleep(300); let k = await kinds();
check('Agents: every agent, and no group heads', (await heads()) === '' && k.agents === 4 && k.workflows === 0 && k.boards === 0, `${await heads()} ${JSON.stringify(k)}`);
await tab('Workflows'); await sleep(300); k = await kinds();
check('Workflows: only the workflows', (await heads()) === '' && k.workflows === 1 && k.agents === 0 && k.boards === 0, JSON.stringify(k));
await tab('Boards'); await sleep(300); k = await kinds();
check('Boards: only the boards; one tab on at a time', k.boards === 1 && k.agents === 0 && k.workflows === 0 && (await js("document.querySelectorAll('.side-tab.on').length")) === 1, JSON.stringify(k));
await js('location.reload()'); await sleep(4000);
check('the tab chosen is still on after a reload', (await on()) === 'Boards');
await tab('All'); await sleep(300);
await filter('gam'); await sleep(400); k = await kinds();
check('the filter narrows as it is typed: one agent fits, no workflow or board, their groups hidden', k?.agents === 1 && k.workflows === 0 && k.boards === 0 && (await heads()) === 'Agents', `${await heads()} ${JSON.stringify(k)}`);
await filter('launch'); await sleep(400); k = await kinds();
check('...a board by its title', k?.boards === 1 && k.agents === 0 && (await heads()) === 'Boards', `${await heads()} ${JSON.stringify(k)}`);
await filter('wor'); await sleep(400); k = await kinds();
check("...a folder whose name fits shows whole, every agent of it", k?.agents === 4 && k.workflows === 1 && k.boards === 1, JSON.stringify(k));
await filter('zzz-nothing'); await sleep(400);
check('a folder with nothing that fits is hidden', !(await js(`!!${G}`)));
await js("document.querySelector('.side-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); await sleep(400);
check('Escape empties the filter: the folder is back', (await js("document.querySelector('.side-search input').value")) === '' && !!(await js(`!!${G}`)));
done(close);
