import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/panels.css';
import { useEditor } from './state/store';

// dev only: lets browser checks read the scene
if (import.meta.env.DEV) Object.assign(window, { __editor: useEditor });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
