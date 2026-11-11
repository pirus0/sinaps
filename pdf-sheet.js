import { app } from './app.js';
import { cutCards, printPlan } from './pdf-arrange.js';
import { shorten } from './scene.js';
import { BODY_PT, MIN_PT, MAX_PT } from './pdf-layout.js';
import { el, button } from './ui.js';
import { sharePrepared, downloadFile } from './files.js';
import { preparePDF } from './pdf.js';

export let pdfEpoch = 0;

// Page map for the PDF step: the same grid planPDF prints, numbered as the PDF pages are.
export function pdfPreview(plan) {
  const ns = 'http://www.w3.org/2000/svg', node = (tag, attrs = {}, text) => {
    const item = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    if (text != null) item.textContent = text; return item;
  };
  const x0 = plan.scene.bounds.minX, y0 = plan.scene.bounds.minY, last = plan.cells.at(-1), cut = new Set(cutCards(plan));
  const svg = node('svg', { viewBox: `${x0} ${y0} ${last.maxX - x0} ${last.maxY - y0}`, class: 'pdf-pages', role: 'img', 'aria-label': 'Önizleme' });
  for (const edge of plan.scene.edges) svg.append(node('path', { d: `M${edge.start.x} ${edge.start.y}C${edge.c1.x} ${edge.c1.y} ${edge.c2.x} ${edge.c2.y} ${edge.end.x} ${edge.end.y}`,
    fill: 'none', stroke: 'var(--ip)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  for (const card of plan.scene.cards) svg.append(node('rect', { x: card.x - card.w / 2, y: card.y - card.h / 2, width: card.w, height: card.h, rx: 18,
    fill: 'var(--surface)', stroke: cut.has(card.id) ? 'var(--iris)' : 'var(--cerceve)', 'stroke-width': cut.has(card.id) ? 2.5 : 1, 'vector-effect': 'non-scaling-stroke', ...(cut.has(card.id) ? { class: 'pdf-cut' } : {}) }));
  // Titles only when the preview is large enough to read them (about 7px on screen).
  const fit = (Math.min(innerWidth, 448) - 44) / (last.maxX - x0);
  if (fit * 15 >= 7) for (const card of plan.scene.cards) svg.append(node('text', { x: card.x - card.w / 2 + 14, y: card.y - card.h / 2 + 26, 'font-size': 15, 'font-weight': 600, fill: 'var(--ink)', class: 'pdf-page-number' }, shorten(card.label, card.w - 28, value => value.length * 8)));
  svg.append(node('circle', { cx: 0, cy: 0, r: 9, fill: 'var(--iris)' }));
  const size = Math.min(last.maxX - last.minX, last.maxY - last.minY) * .09;
  for (const [index, cell] of plan.pages.entries()) {
    const own = cell.own;
    svg.append(node('rect', { x: own.minX, y: own.minY, width: own.maxX - own.minX, height: own.maxY - own.minY, fill: 'none',
      stroke: 'var(--ink-soft)', 'stroke-width': 1, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke', class: 'pdf-page' }));
    svg.append(node('text', { x: own.minX + size * .5, y: own.minY + size * 1.2, 'font-size': size, 'font-weight': 700, fill: 'var(--ink-soft)', stroke: 'var(--paper)', 'stroke-width': size * .18, 'paint-order': 'stroke', class: 'pdf-page-number' }, String(index + 1)));
  }
  return svg;
}

export function openPDF() {
  const title = app.activeName(), original = structuredClone(app.store), plans = new Map();
  // Each size is planned once: cards cut by a page edge are already moved into their page.
  const planAt = size => { if (!plans.has(size)) plans.set(size, printPlan(original, app.width(), title, size)); return plans.get(size); };
  let pt = BODY_PT;
  try { planAt(pt); } catch (error) { app.notice(error.message); return; }
  app.openSheet('PDF'); const epoch = ++pdfEpoch;
  const frame = el('div', 'pdf-preview'), zoom = el('div', 'pdf-zoom'), info = el('div', 'pdf-info'), actions = el('div', 'confirmation pdf-confirmation');
  const size = el('span', 'pdf-size');
  const step = delta => {
    const next = pt + delta; if (next < MIN_PT || next > MAX_PT) return;
    try { planAt(next); pt = next; } catch (error) { app.notice(error.message); return; }
    paint();
  };
  const smaller = button('Küçült', () => step(-1), 'icon-button', 'minus'), larger = button('Büyüt', () => step(1), 'icon-button', 'plus');
  zoom.append(smaller, size, larger);
  app.sheetContent.append(frame, zoom, info, actions);
  const chosen = () => planAt(pt);
  const paint = () => {
    if (!frame.isConnected) return;
    const current = chosen().plan, cut = cutCards(current).length;
    frame.replaceChildren(pdfPreview(current));
    size.textContent = `${pt} pt`; smaller.disabled = pt <= MIN_PT; larger.disabled = pt >= MAX_PT;
    info.replaceChildren(el('strong', '', `${current.total} sayfa · A4 yatay`),
      el('small', cut ? 'danger' : 'muted', cut ? `${cut} kart çizgide` : `${title}-A4.pdf`));
    actions.replaceChildren(button('Oluştur', generate, 'button'));
  };
  const generate = () => {
    const { store: snapshot, plan: chosenPlan } = chosen(); actions.remove(); zoom.remove();
    let ready, retry = false;
    const send = button('Paylaş', async () => {
      if (!ready) return; const result = await sharePrepared(ready.file, title);
      if (result === 'activation') { if (retry) downloadFile(ready.file); else { retry = true; send.replaceChildren(document.createTextNode('Gönder')); send.setAttribute('aria-label', 'Gönder'); } }
    }, 'button wide', 'share'); send.disabled = true; app.sheetContent.append(send);
    preparePDF(snapshot, app.width(), title, chosenPlan).then(result => { if (epoch !== pdfEpoch || !send.isConnected) return; ready = result; send.disabled = false; }).catch(error => {
      if (epoch !== pdfEpoch || !send.isConnected) return; const copy = el('p', 'sheet-copy danger', 'PDF hazırlanamadı. Yeniden dene.'); app.sheetContent.append(copy, button('Yeniden', () => openPDF(), 'button secondary')); console.warn('PDF:', error);
    });
  };
  paint();
}
