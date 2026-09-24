import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The welcome line is typed out as it is spoken: nothing before the speech starts, growing while it plays.
await js(openWelcome);
const t0 = Date.now(); const samples: any[] = [];
for (let i = 0; i < 70; i++) { await sleep(120); samples.push({ t: Date.now() - t0, ...JSON.parse(await js("JSON.stringify({ len: document.querySelector('.welcome-line')?.textContent.length ?? 0, speaking: document.querySelector('.welcome').className.includes('speaking') })")) }); }
const growing = samples.filter((s, i) => i && s.len > samples[i - 1].len); const first = samples.find((s) => s.len > 0); const speechAt = samples.find((x) => x.speaking)?.t ?? 1e9;
check('the text only starts with the speech', !!first && first.speaking && !samples.some((s) => s.len > 0 && s.t < speechAt), `first text at ${first?.t}ms, speech at ${speechAt}ms`);
check('it grows while the speech plays', growing.length >= 5, `${growing.length} steps`);
done(close);
