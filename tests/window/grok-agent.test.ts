// env: CVC_CLAUDE_BIN=__ROOT__/tests/mock/claude CVC_CODEX_BIN=__ROOT__/tests/mock/codex CVC_GROK_BIN=__ROOT__/tests/mock/grok CLAUDE_CONFIG_DIR=__ROOT__/tmp/testrun/grok-agent/claude CODEX_HOME=__ROOT__/tmp/testrun/grok-agent/codex GROK_HOME=__ROOT__/tmp/testrun/grok-agent/grok MOCK_DELAY_MS=10
import { connect, sleep, check, done, V } from './lib.ts';
import { execFileSync } from 'node:child_process';
const { js, close } = await connect(); await sleep(2500);
// Grok as a third provider (T-133), in the window, through the stand-in (tests/mock/grok): an agent made on Grok answers, its row carries
// Grok's mark and the name it was given, the composer says Grok, a tool that needs permission shows the card and the answer reaches Grok,
// the folder's session list has Grok's next to Claude's and Codex's, and the settings offer Grok as the default.
const run = (...args: string[]): { code: number; out: any } => { try { return { code: 0, out: JSON.parse(execFileSync('node', ['scripts/jauvex.ts', ...args], { env: { ...process.env }, encoding: 'utf8' })) }; } catch (e) { return { code: e.status, out: { raw: `${e.stdout ?? ''}${e.stderr ?? ''}` } }; } };
const replies = () => js(`[...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).join(' | ')`);
const waitFor = async (expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await sleep(250); } return false; };

const ag = run('new-agent', '--provider', 'grok', '--folder', 'scratch', '--name', 'Grok Test', '--kickoff', 'hello from the check');
check('new-agent --provider grok is taken', ag.code === 0 && ag.out.provider === 'grok', JSON.stringify(ag.out));
const answered = await waitFor(`/mock Grok on/.test([...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).join(' ')) && !${V}.querySelector('.composer .send.stop')`);
check('the Grok agent answers its first message', answered, (await replies())?.slice(0, 120));
check('the composer says the session is Grok\'s', await js(`[...${V}.querySelectorAll('.composer-row span')].some((s) => s.title === 'A session stays with the provider it started with' && s.textContent === 'Grok')`));
await sleep(800);
const row = "[...document.querySelectorAll('.row:not(.ghost)')].find((r) => r.querySelector('.provider-icon.grok'))";
check('its row in the sidebar carries Grok\'s mark and the name it was given', await js(`${row}?.textContent.includes('Grok Test') ?? false`), await js(`${row}?.textContent ?? 'no row with a Grok mark'`));

// A tool that needs permission: the card, then the answer goes back to Grok.
await js(`(() => { const t = ${V}.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'look around [[tool]]'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(200); await js(`${V}.querySelector('.composer .send').click()`);
const asked = await waitFor(`!!${V}.querySelector('.ask')`);
check('a tool that needs permission shows the card, named as Grok names it', asked && (await js(`${V}.querySelector('.ask .ask-head b')?.textContent`)) === 'Run Command', await js(`${V}.querySelector('.ask')?.textContent ?? 'no card'`));
await js(`[...${V}.querySelectorAll('.ask .btn')].find((b) => b.textContent === 'Allow once')?.click()`);
const ran = await waitFor(`/look around/.test([...${V}.querySelectorAll('.assistant .prose')].map((x) => x.textContent).join(' ')) && !${V}.querySelector('.composer .send.stop')`);
check('allowed, the command runs and Grok answers', ran && !(await js(`!!${V}.querySelector('.ask')`)), (await replies())?.slice(-120));

// The folder's sessions: Grok's are listed with Claude's and Codex's, with a filter of their own, and offered as a provider.
await js(`(() => { const head = [...document.querySelectorAll('.group-head')].find((g) => g.textContent.includes('scratch') && !g.textContent.includes('scratch2')); head?.querySelector('button[title="Add sessions"]')?.click(); })()`);
const listed = await waitFor(`[...document.querySelectorAll('.modal .who button')].some((b) => /^Grok[0-9]+$/.test(b.textContent))`, 6000);
check('the folder\'s sessions list Grok\'s, with a filter of their own', listed && (await js(`[...document.querySelectorAll('.modal .pick-main b')].some((b) => b.textContent.includes('Grok Test'))`)), await js(`[...document.querySelectorAll('.modal .who button')].map((b) => b.textContent).join(', ') + ' / ' + [...document.querySelectorAll('.modal .pick-main b')].map((b) => b.textContent).join(', ')`));
await js(`document.querySelector('.modal .modal-head .icon-btn')?.click()`); await sleep(300);
await js(`document.querySelector('button[title="Jauvex settings"]').click()`); await sleep(400);
check('the settings offer Grok as the provider new sessions start with', await js(`[...document.querySelectorAll('.modal.settings select option')].some((o) => o.value === 'grok' && o.textContent.startsWith('Grok'))`), await js(`[...document.querySelectorAll('.modal.settings select option')].map((o) => o.value).join(', ')`));
done(close);
