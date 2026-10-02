import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The welcome: the orb alone first, then the typed line with the speech, then the checks landing one by one, Start after the last.
await js(openWelcome);
const t0 = Date.now(); const seen: any[] = []; let goAt: any = null; let first: any = null;
for (let i = 0; i < 160; i++) { await sleep(150); const o = JSON.parse(await js("(() => { const w = document.querySelector('.welcome'); const r = document.querySelector('.welcome-orb').getBoundingClientRect(); return JSON.stringify({ stage: w.className.match(/stage-\\w+/)[0], mid: Math.round(r.top + r.height / 2), text: +getComputedStyle(document.querySelector('.welcome-text')).opacity, waiting: document.querySelectorAll('.welcome-checks .w-wait').length, go: !!document.querySelector('.welcome-go'), win: innerHeight }); })()")); first ??= o; if (seen.at(-1)?.waiting !== o.waiting) seen.push({ t: Date.now() - t0, waiting: o.waiting }); if (o.go && goAt === null) goAt = Date.now() - t0; if (o.go) break; }
check('the orb starts alone in the middle, text hidden', first.stage === 'stage-orb' && Math.abs(first.mid - first.win / 2) < 14 && first.text === 0, `mid ${first.mid} of ${first.win}`);
const steps = seen.map((s) => s.waiting); const gaps = seen.slice(1).map((s, i) => s.t - seen[i].t);
check('the rows land one by one with a visible wait', steps.join(',') === '6,5,4,3,2,1,0' && gaps.slice(1).every((g) => g >= 450), `${steps.join('>')} gaps ${gaps.join('/')}ms`);
check('the window moves by the welcome\'s top edge, as by its title bar (the user, 2026-10-01: "It doesn\'t seem like it\'s draggable"); Skip stays a button', await js("(() => { const d = document.querySelector('.welcome-drag'); const s = document.querySelector('.welcome-close'); if (!d || !s) return false; const r = d.getBoundingClientRect(); return getComputedStyle(d).getPropertyValue('-webkit-app-region') === 'drag' && r.top === 0 && r.width === innerWidth && r.height >= 40 && getComputedStyle(s).getPropertyValue('-webkit-app-region') === 'no-drag'; })()"));
check('Start appears only after the last row', goAt !== null && goAt >= seen.at(-1).t - 200, `Start at ${goAt}ms, last row at ${seen.at(-1)?.t}ms`);
done(close);
