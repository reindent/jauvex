// env: CVC_CONFIRM=yes
import { connect, sleep, check, done } from './lib.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
const { cdp, js, close } = await connect(); await sleep(2000);
// The danger zone: reset the app (the dialogs are skipped here). The app's data goes and the app exits; nothing else is touched.
const data = process.env.CVC_DATA_DIR!; check('the data folder has a state before', existsSync(path.join(data, 'state.json')));
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
check('the danger zone is there, in the settings', await js("!!document.querySelector('.settings-group.danger .btn-danger')"));
await js("document.querySelector('.settings-group.danger .btn-danger').click()"); await sleep(1000);
check('the app data is deleted', !existsSync(path.join(data, 'state.json')) && !existsSync(path.join(data, 'jauvex-transcript.json')));
await sleep(1500); let alive = true; try { await fetch('http://127.0.0.1:9341/json/version'); } catch { alive = false; }
check('the app exited', !alive);
done();
