// The only authored brand source. Regenerate PWA icons with `npm run icons` after editing.
export const APP_NAME = 'Sinaps';
export const BRAND_PATHS = '<path d="M6.6 9 4.2 5.4M5.2 6.9 2.6 7.2M5.6 11.8H2.6M6.6 14.2 4.2 17.8M5.2 16.3 2.6 16M10.6 12.6C13 14 14.4 16.4 17.6 17.4M17.6 17.4 21 16M17.6 17.4 20 20.6"/><circle cx="8.2" cy="11.8" r="3" fill="ACCENT" stroke="none"/>';
export function brandSVG({ size = 24, ink = '#1d1b18', accent = '#b8462b', paper = null } = {}) {
  const paths = BRAND_PATHS.replace('ACCENT', accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${paper ? `<rect width="24" height="24" fill="${paper}"/>` : ''}<g${paper ? ' transform="translate(12 12) scale(.72) translate(-12 -12)"' : ''} fill="none" stroke="${ink}" stroke-width="${paper && size <= 32 ? 2.7 : 1.8}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
