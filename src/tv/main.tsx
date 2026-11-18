import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/readex-pro/wght.css';
import './tv.css';
import { TvApp } from './TvApp';

// tv-legacy.js (a plain script for old smart-TV browsers) waits for this flag; if the modern
// build never runs, it draws a simple scoreboard itself.
(window as unknown as { __dtTvReady?: boolean }).__dtTvReady = true;
document.getElementById('tv-legacy')?.remove();

createRoot(document.getElementById('tv-root')!).render(
  <StrictMode>
    <TvApp />
  </StrictMode>,
);
