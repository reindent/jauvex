// env: CVC_TEST_HOOKS=1
// Never a bare window (from the other edition's fix of a window left white, nothing in it, three times in a day). Three ways a window ends up
// empty, each made on purpose here, each said in the flight recorder and each ended by the window loading itself again with its sidebar back:
// a component that throws while drawing (React would unmount the whole page: the page's own error boundary, Fallback, catches it, says so and
// reloads), a page alive with nothing drawn in it (its beats say so, and the app reloads it), and an error anywhere in the page (said, so the
// next blank window is never a mystery). The page's crash is tests/window/window-crash.test.ts.
import { connect, sleep, check, done } from './lib.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } };
const saidWithin = async (re: RegExp, ms: number) => { for (let t = 0; t < ms; t += 300) { const l = log().split('\n').find((x) => re.test(x)); if (l) return l; await sleep(300); } return ''; };
const back = async (c: Awaited<ReturnType<typeof connect>>, ms = 20000) => { for (let t = 0; t < ms; t += 300) { if (await c.js("!!document.querySelector('.side-scroll')").catch(() => false)) return true; await sleep(300); } return false; };
let c = await connect(); await sleep(2500);
check('(the window is up, its sidebar drawn)', !!(await c.js("!!document.querySelector('.side-scroll')")));
check('the page beats: the app has heard it is alive and drawn', !!(await c.js("typeof window.desktop.alive === 'function'")));
// 1. an error anywhere in the page is said
await c.js("setTimeout(() => { throw new Error('a stray error (a check asked for it)'); }, 0); true");
check('an error in the page goes to the flight recorder, with its words', /an error in the window's page: Uncaught Error: a stray error \(a check asked for it\)/.test(await saidWithin(/an error in the window's page/, 8000)), log().split('\n').filter((l) => /window's page/.test(l)).slice(-2).join(' | '));
// 2. a component throws while drawing: the page says what threw and where, shows its own notice, and loads again by itself
await c.js("window.__cvcBoom = true; window.dispatchEvent(new Event('cvc-probe')); true");
const notice = await (async () => { for (let t = 0; t < 4000; t += 100) { const v = String(await c.js("document.querySelector('.page-fallback')?.textContent ?? ''").catch(() => '')); if (v) return v; await sleep(100); } return ''; })();
check('a component that throws while drawing: the page shows its own notice instead of nothing', /The window hit a snag/.test(notice) && /boom \(a check asked for it\)/.test(notice), notice.slice(0, 200));
const said = await saidWithin(/hit an error while drawing/, 8000);
check('...the flight recorder says what threw, and where (the built page has no component names: file positions)', /the window's page hit an error while drawing: boom \(a check asked for it\) \(at .+\.js:\d+:\d+/.test(said), said || log().split('\n').slice(-3).join(' | '));
c.close(); await sleep(2500); c = await connect();
check('...and the window loads again by itself: its sidebar is back', await back(c));
// 3. the page alive with nothing drawn in it: its beats say so, and the app loads it again
await c.js("document.getElementById('root').replaceChildren(); true");
check('the page emptied: nothing drawn', !(await c.js("!!document.querySelector('.side-scroll')")));
const blank = await saidWithin(/shows nothing/, 30000);
check("the app notices from the page's beats, says so and loads it again", /the window's page shows nothing \(its root has been empty for 15 s\): the window loads again in \d+ s/.test(blank), blank || log().split('\n').slice(-3).join(' | '));
c.close(); await sleep(4000); c = await connect();
check('...and the sidebar is back', await back(c));
check('no reload for a page that merely runs: the beats never stop', !/stopped beating/.test(log()));
done(c.close);
