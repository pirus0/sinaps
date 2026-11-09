import { app } from './app.js';
import { $ } from './ui.js';

export function themePreference() { try { return localStorage.getItem('dallanan-not-theme') || 'system'; } catch { return 'system'; } }

export function applyTheme(preference, save = true) {
  const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme; $('meta[name="theme-color"]').content = theme === 'dark' ? '#11100e' : '#efebe2';
  if (save) { try { localStorage.setItem('dallanan-not-theme', preference); } catch {} }
  app.invalidatePNG(); app.canvas.requestDraw();
}

export function brandTap() {
  const time = Date.now();
  if (time - app.lastBrandTap < 300) {
    app.lastBrandTap = 0; const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(next);
    if (next === 'light') navigator.vibrate?.(10);
    dispatchEvent(new CustomEvent('sinaps:theme', { detail: next }));
  }
  else app.lastBrandTap = time;
}
