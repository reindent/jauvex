// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/unread-badges/claude MOCK_DELAY_MS=5 MOCK_THINK_MS=1500
// New replies, per agent (T-226; the user, 2026-09-30: "Personal should have the badges"): a reply counts on its agent while that agent is not
// on screen, and its row says how many; a reload keeps them; opening an agent clears its own count and only its own; a reply of the agent on
// screen counts nothing; the Jauvex agent's row has one too; the badge keeps its size in every row.
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
const run = (...a: string[]) => { try { return JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...a], { encoding: 'utf8' })); } catch (e: any) { try { return JSON.parse(e.stdout); } catch { return { ok: false, error: String(e) }; } } };
const until = async (f: () => Promise<unknown>, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await f()) return true; await sleep(250); } return false; };
const scratch = () => (run('list').folders ?? []).find((f: any) => f.name === 'scratch')?.sessions ?? [];
const rowOf = (name: string) => `[...document.querySelectorAll('.side-scroll .row')].find((b) => b.querySelector('.row-title')?.textContent === ${JSON.stringify(name)})`;
const badge = (name: string) => js(`${rowOf(name)}?.querySelector('.row-unread')?.textContent ?? ''`);
const idle = () => until(async () => !(await js("!!document.querySelector('.side-scroll .row.working, .side-scroll .row-working')")), 20000);

for (const name of ['Badge one', 'Badge two', 'Badge three']) run('new-agent', '--provider', 'claude', '--folder', 'scratch', '--name', name, '--no-kickoff'); // the last one made is on screen
let one: any, two: any; await until(async () => (one = scratch().find((s: any) => s.name === 'Badge one')) && (two = scratch().find((s: any) => s.name === 'Badge two')) && scratch().some((s: any) => s.name === 'Badge three'));
await idle(); await sleep(800);
await js("localStorage.setItem('cvc.unread', '{}')"); await js('location.reload()'); await sleep(4000); // a clean start: the new agents' own first replies are not this check's
check('a clean start: no badges', await js("document.querySelectorAll('.row-unread').length === 0"));

run('send', '--session', one.id, '--text', 'A first word, while another agent is on screen.');
check('a reply of an agent that is not on screen puts 1 on its row', await until(async () => (await badge('Badge one')) === '1'), await badge('Badge one'));
run('send', '--session', one.id, '--text', 'A second word.'); await until(async () => (await badge('Badge one')) === '2');
run('send', '--session', one.id, '--text', 'A third word.'); await until(async () => (await badge('Badge one')) === '3');
run('send', '--session', two.id, '--text', 'A word for the other agent.');
check('each agent counts its own: 3 and 1', await until(async () => (await badge('Badge one')) === '3' && (await badge('Badge two')) === '1'), `${await badge('Badge one')} / ${await badge('Badge two')}`);
await idle(); await js('location.reload()'); await sleep(4000);
check('a reload keeps the counts', (await badge('Badge one')) === '3' && (await badge('Badge two')) === '1', `${await badge('Badge one')} / ${await badge('Badge two')}`);

await js(`${rowOf('Badge one')}?.click()`);
check('opening one agent clears its count, and only its count', await until(async () => (await badge('Badge one')) === '' && (await badge('Badge two')) === '1', 6000), `${await badge('Badge one')} / ${await badge('Badge two')}`);
run('send', '--session', one.id, '--text', 'A word while this agent is on screen.');
await until(async () => await js("!!document.querySelector('.side-scroll .row-working')"), 8000); await idle(); await sleep(600);
check('a reply of the agent on screen counts nothing', (await badge('Badge one')) === '' && (await badge('Badge two')) === '1', `${await badge('Badge one')} / ${await badge('Badge two')}`);
await js(`${rowOf('Badge two')}?.click()`);
check('opening the other clears the rest', await until(async () => await js("document.querySelectorAll('.row-unread').length === 0"), 6000));

// the Jauvex agent: a first word on screen starts its session; a reply while another agent is on screen counts on its row
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
await js(`(() => { const ta = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Hello there.'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
await js(`${V}.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
await until(async () => (run('list').jauvex?.session ?? null) !== null, 15000); await sleep(3500);
const jx = "document.querySelector('.jauvex-row .row-unread')?.textContent ?? ''";
check('the Jauvex agent\'s reply on screen counts nothing', (await js(jx)) === '', await js(jx));
await js(`${rowOf('Badge three')}?.click()`); await sleep(1500);
run('send', '--session', 'Jauvex', '--text', 'A word for the Jauvex agent, from elsewhere.');
check('a reply of the Jauvex agent while another agent is on screen puts 1 on its row', await until(async () => (await js(jx)) === '1'), await js(jx));
await js("document.querySelector('.jauvex-row').click()");
check('opening it clears it', await until(async () => (await js(jx)) === '', 6000), await js(jx));

// the badge: 99+ past 99, and the same size in the Jauvex row as in an agent's row, whatever the name beside it
await js(`localStorage.setItem('cvc.unread', JSON.stringify({ ${JSON.stringify(two.id)}: 250, ${JSON.stringify(run('list').jauvex?.session ?? '')}: 7 }))`);
await js(`${rowOf('Badge three')}?.click()`); await sleep(1500); await js('location.reload()'); await sleep(4000);
check('past 99 the badge says 99+', (await badge('Badge two')) === '99+', await badge('Badge two'));
const size = await js(`(() => { const a = ${rowOf('Badge two')}?.querySelector('.row-unread'), b = document.querySelector('.jauvex-row .row-unread'); if (!a || !b) return null; a.textContent = '2'; b.textContent = '2'; const r = [a.getBoundingClientRect(), b.getBoundingClientRect()]; return r.map((x) => [Math.round(x.width), Math.round(x.height)]); })()`);
check('a badge keeps its own size, in an agent\'s row as in the Jauvex row', !!size && size[0][0] === size[1][0] && size[0][1] === 16 && size[0][0] <= 20, JSON.stringify(size));
done(close);
