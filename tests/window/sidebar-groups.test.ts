// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/sidebar-groups/claude MOCK_DELAY_MS=5
// A folder in the left panel is a small tree, as in Jauvex Pro: its agents, workflows and boards are three groups, each with its count and a
// plus, three rows then "N more…", hanging off the folder's line; a group folds from its name; a filter opens the agents in full.
import { connect, sleep, check, done, useWork, WORK } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
await useWork(js);
const run = (...a: string[]): any => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => any, ms = 20000): Promise<any> => { for (let t = 0; t < ms; t += 300) { const v = await f(); if (v) return v; await sleep(300); } return null; };
const agents = (): any[] => (run('list').folders ?? []).find((f: any) => f.name === 'work')?.sessions ?? [];
for (const name of ['One', 'Two', 'Three', 'Four']) { run('new-agent', '--provider', 'claude', '--folder', 'work', '--name', name, '--no-kickoff'); await until(() => agents().find((x) => x.name === name && !x.busy), 30000); }
mkdirSync(path.join(WORK, 'workflows/hello'), { recursive: true });
writeFileSync(path.join(WORK, 'workflows/hello.md'), '# Hello\n\nSays hello.\n\nwhen: manual\n\n## 1. [Hello](hello/hello.md) → One\n');
writeFileSync(path.join(WORK, 'workflows/hello/hello.md'), 'Say hello.\n');
await js('location.reload()'); await sleep(4000);
const G = "[...document.querySelectorAll('.group')].find((g) => g.querySelector('.group-label')?.textContent === 'work')";
const heads = () => js(`[...${G}.querySelectorAll('.group-body > .subgroup > .subgroup-head')].map((h) => h.querySelector('.subgroup-title').textContent + ' ' + h.querySelector('small').textContent).join(' | ')`);
check('the folder shows three groups with their counts: Agents 4, Workflows 1, Boards none yet', (await until(async () => (await heads()) === 'Agents 4 | Workflows 1 | Boards none yet' || null, 10000)) === true, await heads());
check('...each with a plus to add one', (await js(`${G}.querySelectorAll('.group-body > .subgroup > .subgroup-head .subgroup-add').length`)) === 3);
check('...hanging off the folder\'s line, as a tree', (await js(`${G}.querySelectorAll('.group-body .subgroup-branch').length`)) === 3 && (await js(`getComputedStyle(${G}.querySelector('.group-body > .subgroup'), '::before').width`)) === '1px');
const agentRows = () => js(`[...${G}.querySelector('.group-body > .subgroup').querySelectorAll('.subgroup-rows > .row:not(.subgroup-more)')].length`);
check('the agents show three, then "1 more…"', (await agentRows()) === 3 && (await js(`${G}.querySelector('.group-body > .subgroup .row.subgroup-more')?.textContent`)) === '1 more…', String(await agentRows()));
await js(`${G}.querySelector('.group-body > .subgroup .row.subgroup-more').click()`); await sleep(300);
check('..."more" shows them all, and "show less"', (await agentRows()) === 4 && (await js(`${G}.querySelector('.group-body > .subgroup .row.subgroup-more')?.textContent`)) === 'show less');
await js(`${G}.querySelector('.group-body > .subgroup .row.subgroup-more').click()`); await sleep(200);
await js(`${G}.querySelectorAll('.group-body > .subgroup > .subgroup-head')[1].click()`); await sleep(300);
check('a group folds from its name', !(await js(`!!${G}.querySelectorAll('.group-body > .subgroup')[1].querySelector('.subgroup-rows')`)));
await js(`${G}.querySelectorAll('.group-body > .subgroup > .subgroup-head')[1].click()`); await sleep(300);
check('...and opens again', (await js(`${G}.querySelectorAll('.group-body > .subgroup')[1].querySelectorAll('.subgroup-rows .row').length`)) === 1);
await js(`${G}.querySelector('button[title="Filter"]').click()`); await sleep(300);
check('a filter on the folder opens its agents in full', (await agentRows()) === 4);
done(close);
