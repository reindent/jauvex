// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/update-offer/claude CODEX_HOME=__ROOT__/tmp/testrun/update-offer/codex MOCK_DELAY_MS=5 MOCK_THINK_MS=3000 CVC_UPDATE_LATEST=9.9.0 CVC_UPDATE_INSTALLED=1
// A new version (T-165): the main process learns it (here a stand-in for the site's answer, on a stand-in for the installed app): the
// sidebar says so, and the app's own agent is told once, to ask the user in words; `update --check` says what is known; the order refuses
// while another agent works; with --now it goes on, as far as the site, which a check never reaches, and the app stays; after a reload
// nobody is told again.
import { connect, sleep, check, done } from './lib.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const { js, close } = await connect(); await sleep(2500);
const run = (...args) => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: (() => { try { return JSON.parse(String(e.stdout)); } catch { return String(e.stdout ?? e.message); } })() }; } };
const until = async (expr, ms = 30000) => { for (let t = 0; t < ms; t += 400) { if (await js(expr)) return true; await sleep(400); } return false; };
const data = process.env.CVC_DATA_DIR!; // how many times the app told its agent (its transcript, the user side only)
const told = () => { const f = path.join(data, 'jauvex-transcript.json'); if (!existsSync(f)) return 0; return JSON.parse(readFileSync(f, 'utf8')).filter((e) => e.message?.role === 'user' && JSON.stringify(e.message.blocks).includes('Jauvex 9.9.0 is out')).length; };
const asked = () => { try { return JSON.parse(readFileSync(path.join(data, 'state.json'), 'utf8')).ui?.updateAsked; } catch { return undefined; } };

check('the sidebar says a new version is out', await until("document.querySelector('.foot-update')?.textContent === '9.9.0 is out'", 15000), await js("document.querySelector('.side-foot')?.textContent"));
check('the Jauvex agent is told, to ask the user in words', await until("[...document.querySelectorAll('.app-note')].some((n) => n.textContent.includes('Jauvex 9.9.0 is out; this copy runs'))", 30000));
for (let i = 0; i < 20 && asked() !== '9.9.0'; i++) await sleep(300);
check('the app remembers that it told it about this version', asked() === '9.9.0', String(asked()));
const st = run('update', '--check');
check('update --check says what is known', st.code === 0 && st.out.latest === '9.9.0' && st.out.available === true && st.out.installed === true, JSON.stringify(st.out));
await sleep(4000); // the Jauvex agent's turn ends
const ag = run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', 'Busy One', '--kickoff', 'a long piece of work');
check('another agent starts working', ag.code === 0, JSON.stringify(ag.out));
let refused: any = null; for (let i = 0; i < 20 && !refused; i++) { const r = run('update'); if (r.code !== 0 && /Busy One is working/.test(r.out?.error ?? '')) refused = r; else await sleep(150); }
check('the update refuses while another agent works, and names it', !!refused, JSON.stringify(refused?.out));
const now = run('update', '--now');
check('with --now it goes on, as far as the site (a check never reaches it): nothing is changed and the app stays', now.code !== 0 && /could not be reached\. Nothing was changed/.test(now.out?.error ?? '') && run('list').code === 0, JSON.stringify(now.out));
await js('location.reload()'); await sleep(6000);
check('after a reload nobody is told again', told() === 1 && asked() === '9.9.0' && await until("document.querySelector('.foot-update')?.textContent === '9.9.0 is out'", 10000), `told ${told()} times`);
done(close);
