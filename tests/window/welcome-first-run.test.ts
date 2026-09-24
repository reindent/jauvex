// fresh
import { connect, sleep, check, done } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2000);
// An empty data folder is a first run: the welcome opens by itself over the main window, and closing it is remembered.
check('first run: the welcome opens by itself', await js("!!document.querySelector('.welcome')"));
check('the main window is behind it', await js("!!document.querySelector('.sidebar')"));
await js("document.querySelector('.welcome-close').click()"); await sleep(600);
check('Skip closes it', !(await js("!!document.querySelector('.welcome')")));
await js("location.reload()"); await sleep(3000);
check('after a reload it stays closed', !(await js("!!document.querySelector('.welcome')")));
done(close);
