import { app } from './app.js';
import { cutCards, arrangeForPrint } from './pdf-arrange.js';
import { shorten } from './scene.js';
import { planPDF } from './pdf-layout.js';
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
    svg.append(node('text', { x: own.minX + size * .5, y: own.minY + size * 1.2, 'font-size': size, 'font-weight': 700, fill: 'var(--ink-soft)', stroke: 'var(--paper)', 'stroke-width': size * .18, 'paint-order': 'stroke', class: 'pdf-page-number' }, String(index + 2)));
  }
  return svg;
}

export function openPDF() {
  const title = app.activeName(), original = structuredClone(app.store);
  let plan; try { plan = planPDF(original, app.width(), title); } catch (error) { app.notice(error.message); return; }
  app.openSheet('PDF'); const epoch = ++pdfEpoch;
  let arranged = null, useArranged = false;
  const frame = el('div', 'pdf-preview'), info = el('div', 'pdf-info'), actions = el('div', 'confirmation pdf-confirmation');
  app.sheetContent.append(frame, info, actions);
  const chosen = () => useArranged ? arranged : { store: original, plan };
  const paint = () => {
    if (!frame.isConnected) return;
    const current = chosen().plan, cut = cutCards(current).length;
    frame.replaceChildren(pdfPreview(current));
    info.replaceChildren(el('strong', '', `${current.total} sayfa · A4 ${current.orientation === 'portrait' ? 'dikey' : 'yatay'}`),
      el('small', cut ? 'danger' : 'muted', cut ? `${cut} kart çizgide` : `${title}-A4.pdf`));
    actions.replaceChildren();
    if (useArranged) actions.append(button('Özgün', () => { useArranged = false; paint(); }, 'button secondary'));
    else if (arranged?.improved) actions.append(button('Düzenle', () => { useArranged = true; paint(); }, 'button secondary'));
    actions.append(button('Oluştur', generate, 'button'));
  };
  const generate = () => {
    const { store: snapshot, plan: printPlan } = chosen(); actions.remove();
    let ready, retry = false;
    const send = button('Paylaş', async () => {
      if (!ready) return; const result = await sharePrepared(ready.file, title);
      if (result === 'activation') { if (retry) downloadFile(ready.file); else { retry = true; send.replaceChildren(document.createTextNode('Gönder')); send.setAttribute('aria-label', 'Gönder'); } }
    }, 'button wide', 'share'); send.disabled = true; app.sheetContent.append(send);
    preparePDF(snapshot, app.width(), title, printPlan).then(result => { if (epoch !== pdfEpoch || !send.isConnected) return; ready = result; send.disabled = false; }).catch(error => {
      if (epoch !== pdfEpoch || !send.isConnected) return; const copy = el('p', 'sheet-copy danger', 'PDF hazırlanamadı. Yeniden dene.'); app.sheetContent.append(copy, button('Yeniden', () => openPDF(), 'button secondary')); console.warn('PDF:', error);
    });
  };
  paint();
  // Print arrangement plans several grids; run it after the sheet is on screen.
  setTimeout(() => { if (epoch !== pdfEpoch) return; try { arranged = arrangeForPrint(original, app.width(), title); } catch { arranged = null; } paint(); }, 0);
}
