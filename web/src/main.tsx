import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { Mini } from './App';
import './styles.css';
import { applySavedTheme } from './theme';

applySavedTheme(); // the look it had last time, before the first paint (T-248)

const mini = location.hash === '#mini';
if (mini) document.documentElement.classList.add('is-mini');
createRoot(document.getElementById('root')!).render(<StrictMode>{mini ? <Mini /> : <App />}</StrictMode>);
