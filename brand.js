// The only authored brand source. Regenerate PWA icons with `npm run icons` after editing.
export const APP_NAME = 'Sinaps';
export const BRAND_PATHS = '<path d="M9.1 9.1L7.6 7.6M7.6 7.6L4.51 6.77M7.6 7.6L6.77 4.51M14.9 9.1L16.4 7.6M16.4 7.6L19.49 6.77M16.4 7.6L17.23 4.51M14.9 14.9L16.4 16.4M16.4 16.4L19.49 17.23M16.4 16.4L17.23 19.49M9.1 14.9L7.6 16.4M7.6 16.4L4.51 17.23M7.6 16.4L6.77 19.49"/><circle cx="12" cy="12" r="2.6" fill="ACCENT" stroke="none"/>';
export function brandSVG({ size = 24, ink = '#1d1b18', accent = '#b8462b', paper = null } = {}) {
  const paths = BRAND_PATHS.replace('ACCENT', accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${paper ? `<rect width="24" height="24" fill="${paper}"/>` : ''}<g${paper ? ' transform="translate(12 12) scale(.72) translate(-12 -12)"' : ''} fill="none" stroke="${ink}" stroke-width="${paper && size <= 32 ? 2.7 : 1.8}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
