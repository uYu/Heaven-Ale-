import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './style.css';
import './tabletop.css';
import './interface.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
