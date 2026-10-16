import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import { useStore } from './store/app';
import { engine } from './lib/engine';

createRoot(document.getElementById('root')!).render(<App />);

// Debug hook for automated checks (store is read-only from outside without the preload bridge).
(window as any).__ks = { store: useStore, engine };
