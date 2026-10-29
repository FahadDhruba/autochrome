import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from '@/src/ui/theme';
import '@/src/ui/base.css';
import './style.css';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
