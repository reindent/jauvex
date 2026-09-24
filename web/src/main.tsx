import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { Mini } from './App';
import './styles.css';

const mini = location.hash === '#mini';
if (mini) document.documentElement.classList.add('is-mini');
createRoot(document.getElementById('root')!).render(<StrictMode>{mini ? <Mini /> : <App />}</StrictMode>);
