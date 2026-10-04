import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { Mini } from './App';
import './styles.css';
import { applySavedTheme } from './theme';
import { applySavedLanguage } from './language';

applySavedTheme(); // the look it had last time, before the first paint (T-248)
applySavedLanguage(); // and its words (i18n): before any string is drawn

const mini = location.hash === '#mini';
if (mini) document.documentElement.classList.add('is-mini');
// The window's own title bar is macOS only (the traffic lights sit in it); elsewhere the system draws the frame.
if (window.desktop?.platform && window.desktop.platform !== 'darwin') document.documentElement.classList.add('system-frame');
createRoot(document.getElementById('root')!).render(<StrictMode>{mini ? <Mini /> : <App />}</StrictMode>);
