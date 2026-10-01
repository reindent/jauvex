// A window whose page dies comes back by itself, and says why (T-271, from the other edition's fix; the user, 2026-10-01, of a window there
// that "completely went black screen (no contents)": the page had gone, the window kept its background colour, and nothing anywhere said
// so). The page is crashed on purpose: the flight recorder says it ended, with the memory then, and the window loads again with its sidebar.
import { connect, sleep, check, done } from './lib.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const first = await connect(); await sleep(2500);
const log = () => { try { return readFileSync(path.join(process.env.CVC_DATA_DIR!, 'voice-debug.log'), 'utf8'); } catch { return ''; } };
check('(the window is up, its sidebar drawn)', !!(await first.js("!!document.querySelector('.side-scroll')")));
void first.cdp('Page.crash'); await sleep(500); first.close(); // the page goes, as when it runs out of memory or crashes
let said = ''; for (let t = 0; t < 15000 && !said; t += 300) { said = log().split('\n').find((l) => /the window's page ended: crashed/.test(l)) ?? ''; if (!said) await sleep(300); }
check("the flight recorder says the window's page ended, why, and the memory then", /the window's page ended: crashed \(exit code -?\d+\); memory then: .*all \d+ MB/.test(said), said || log().split('\n').slice(-3).join(' / '));
await sleep(2500); const again = await connect();
let back = false; for (let t = 0; t < 15000 && !back; t += 300) { back = !!(await Promise.race([again.js("!!document.querySelector('.side-scroll')"), sleep(2000).then(() => false)]).catch(() => false)); if (!back) await sleep(300); }
check('the window loads again by itself: its sidebar is back', back);
done(again.close);
