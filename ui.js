import { brandSVG } from './brand.js';
export const $ = selector => document.querySelector(selector);
const paths = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  photo: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 5-5 3 3 3-3 4 5"/>',
  delete: '<path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7m-8 0 .9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L18 7"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  text: '<path d="M5 6h14M5 10h14M5 14h9M5 18h11"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  backup: '<path d="M7 17.5a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.4 8.6a4.2 4.2 0 0 1-.4 8.9H7ZM12 10.5v5.5m-2.4-2.2 2.4 2.4 2.4-2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  moon: '<path d="M20.5 13.1A8.6 8.6 0 0 1 10.9 3.5a8.6 8.6 0 1 0 9.6 9.6Z"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  simple: '<rect x="3.5" y="8" width="17" height="8" rx="4"/>',
  full: '<rect x="3.5" y="5" width="17" height="14" rx="3.5"/><path d="M7.5 9.5h9M7.5 13h6"/>',
  share: '<path d="M12 16V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  link: '<path d="m9 15 6-6m-7 3-1 1a4 4 0 0 0 6 6l3-3m-1-4 2-2a4 4 0 0 0-6-6L8 7"/>'
};
export function icon(name) {
  const holder = document.createElement('span');
  holder.innerHTML = name === 'brand' ? brandSVG({ ink: 'var(--ink)', accent: 'var(--iris)' })
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.link}</svg>`;
  const svg = holder.firstElementChild; svg.setAttribute('aria-hidden', 'true');
  if (name === 'brand') svg.classList.add('brand');
  return svg;
}
export function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(label, action, className = 'icon-button', glyph) {
  const node = el('button', className); node.type = 'button'; node.setAttribute('aria-label', label);
  if (glyph) node.append(icon(glyph));
  if (className !== 'icon-button') node.append(document.createTextNode(label));
  node.addEventListener('click', action); return node;
}
export function row(label, action, { value, glyph, arrow = false } = {}) {
  const node = button(label, action, 'sheet-row');
  node.replaceChildren(el('span', 'row-text', label));
  if (glyph) node.prepend(icon(glyph));
  if (value !== undefined) node.append(el('span', 'muted', value));
  if (arrow) node.append(icon('right'));
  return node;
}
