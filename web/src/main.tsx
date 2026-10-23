import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App, { Mini } from './App';
import { Fallback } from './Fallback';
import './styles.css';
import { applySavedTheme } from './theme';
import { applySavedLanguage } from './language';

applySavedTheme(); // the look it had last time, before the first paint (T-248)
applySavedLanguage(); // and its words (i18n): before any string is drawn

const mini = location.hash === '#mini';
if (mini) document.documentElement.classList.add('is-mini');
// The window's own title bar is macOS only (the traffic lights sit in it); elsewhere the system draws the frame.
if (window.desktop?.platform && window.desktop.platform !== 'darwin') document.documentElement.classList.add('system-frame');
// Never a bare window (from the other edition's fix of a window left blank): the page tells the app every few seconds that it is alive and
// whether anything is drawn in it (the app loads it again when the beat stops or the page is empty), an error anywhere in it goes to the flight
// recorder, and a component that throws while drawing is caught by Fallback, said and reloaded.
if (window.desktop?.alive) { const beat = () => window.desktop.alive(!!document.getElementById('root')?.childElementCount); beat(); window.setInterval(beat, 5000); }
let lastSaid = ''; const say = (text: string) => { if (text === lastSaid) return; lastSaid = text; try { window.desktop?.debugPush('note', text); } catch { /* no bridge */ } };
window.addEventListener('error', (e) => say(`an error in the window's page: ${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
window.addEventListener('unhandledrejection', (e) => say(`a promise failed in the window's page: ${String((e.reason as { message?: string } | null)?.message ?? e.reason).slice(0, 300)}`));
/** A check breaks the page on purpose (CVC_TEST_HOOKS): this throws while drawing when asked, as a real component would. */
function Probe() { const [, tick] = useState(0); useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener('cvc-probe', f); return () => window.removeEventListener('cvc-probe', f); }, []);
  if ((window as unknown as { __cvcBoom?: boolean }).__cvcBoom) throw new Error('boom (a check asked for it)'); return null; }
createRoot(document.getElementById('root')!).render(<StrictMode><Fallback>{window.desktop?.testHooks && <Probe />}{mini ? <Mini /> : <App />}</Fallback></StrictMode>);
