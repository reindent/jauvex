// needs: mic
// wav: tests/fixtures/silence.wav
// Push to talk (T-157, a voice setting; asked for 2026-09-26): the microphone hears only while its button, or the Option key, is held.
import { connect, sleep, check, done, V } from './lib.ts';
const { js, close } = await connect(); await sleep(3000);
const cfg = await js("window.desktop.api('state').then((s) => s.ui?.voice ?? {})");
await js(`window.desktop.api('setUi', { voice: ${JSON.stringify({ ...cfg, pushToTalk: true })} })`);
const rows = "[...document.querySelectorAll('.row:not(.ghost)')].filter((r) => r.querySelector('.provider-icon'))";
await js(`${rows}[0].click()`); await sleep(2000);
await js(`${V}.querySelector('.voice-start').click()`); await sleep(3000);
const btn = `${V}.querySelector('.pill button.ptt')`;
check('voice on, the microphone is a hold-to-talk button, closed', (await js(`!!${btn}`)) && (await js(`${btn}.classList.contains('muted')`)));
await js(`${btn}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }))`); await sleep(300);
check('held, it hears', !(await js(`${btn}.classList.contains('muted')`)));
await js(`${btn}.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }))`); await sleep(300);
check('let go, it is closed again', await js(`${btn}.classList.contains('muted')`));
await js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }))"); await sleep(300);
check('the Option key held opens it too', !(await js(`${btn}.classList.contains('muted')`)));
await js("window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))"); await sleep(300);
check('and closes it when let go', await js(`${btn}.classList.contains('muted')`));
await js(`window.desktop.api('setUi', { voice: ${JSON.stringify({ ...cfg, pushToTalk: false })} })`);
done(close);
