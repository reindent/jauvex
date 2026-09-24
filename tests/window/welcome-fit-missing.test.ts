// env: CVC_SETUP_FAKE=missing
import { connect, sleep, check, done, V, openWelcome } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(1500);
// The welcome must fit the window without a scroll, at the default size and the smallest one, once every row has landed: here with nothing installed (hints and buttons on every row).
await js(openWelcome);
for (let i = 0; i < 200; i++) { await sleep(150); if (await js("document.querySelectorAll('.welcome-checks .w-wait').length === 0 && !!document.querySelector('.welcome-go')")) break; }
const rows = await js("[...document.querySelectorAll('.welcome-checks li')].map((l) => l.className.replace('w-', '')).join(',')");
for (const [w, h] of [[1360, 880], [900, 600]]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(400);
  const m = JSON.parse(await js("(() => { const w = document.querySelector('.welcome'); return JSON.stringify({ sh: w.scrollHeight, ch: w.clientHeight }); })()"));
  check(`${w}x${h}: fits without a scroll`, m.sh <= m.ch, `content ${m.sh}px in ${m.ch}px [${rows}]`);
}
await cdp('Emulation.clearDeviceMetricsOverride');
done(close);

check("the failing rows are shown as such", rows.includes("no"), rows);
