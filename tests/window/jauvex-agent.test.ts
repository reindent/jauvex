import { connect, sleep, check, done, V } from './lib.ts';
const { cdp, js, close } = await connect(); await sleep(2000);
// The Jauvex agent: a pinned row at the top of the sidebar, its project the app's own folder; a switch in the settings hides it.
// pinned: in the block at the top of the folders' list that stays put as they scroll (with the tabs and the filter, since 2026-10-22), above every folder
check('the Jauvex row is pinned at the top of the sidebar', await js("(() => { const top = document.querySelector('.side-scroll').firstElementChild, row = top?.querySelector('.jauvex-row'), folder = document.querySelector('.side-scroll .group'); return !!row && top.classList.contains('side-top') && getComputedStyle(top).position === 'sticky' && (!folder || !!(row.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING)); })()"));
check('the app folder is not listed as an ordinary project', !(await js("[...document.querySelectorAll('.group-head')].some((g) => g.textContent.includes('Jauvex'))")));
await js("document.querySelector('.jauvex-row').click()"); await sleep(1500);
check('clicking it opens a chat with a composer', await js(`!!${V}?.querySelector('.composer textarea')`));
check('the row is marked as the open one', await js("document.querySelector('.jauvex-row').classList.contains('on')"));
await js("document.querySelector('button[title=\"Jauvex settings\"]').click()"); await sleep(300);
await js("[...document.querySelectorAll('.modal.settings input[type=checkbox]')].find((i) => i.parentElement.textContent.includes('Show it at the top')).click()"); await sleep(300);
check('the settings switch hides the row', !(await js("!!document.querySelector('.jauvex-row')")));
await js("[...document.querySelectorAll('.modal.settings input[type=checkbox]')].find((i) => i.parentElement.textContent.includes('Show it at the top')).click()"); await sleep(300);
check('and brings it back', await js("!!document.querySelector('.jauvex-row')"));
done(close);
