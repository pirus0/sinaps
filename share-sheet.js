import { app } from './app.js';
import { warmPhotos, exportPhotos } from './photos.js';
import { preparePNG } from './png.js';
import { $, row } from './ui.js';
import { planPDF } from './pdf-layout.js';
import { openPDF } from './pdf-sheet.js';
import { sharePrepared, downloadFile } from './files.js';
import { boardGraph } from './workspace.js';
import { copyPayload } from './copy.js';
import { APP_NAME } from './brand.js';

export function invalidatePNG() {
  app.pngEpoch++; app.png = { ready: null, preparing: false, retry: false };
  if (app.view.sade && !app.current && app.store.kartlar.length) queueMicrotask(prepareShare);
}

export async function prepareShare() {
  if (!app.view.sade || app.current || !app.store.kartlar.length || app.png.preparing || app.png.ready) return;
  app.png.preparing = true; const epoch = app.pngEpoch, snapshot = JSON.parse(JSON.stringify(app.store)); app.paintToolbar();
  try {
    await warmPhotos(snapshot.kartlar);
    const result = await preparePNG(snapshot, app.width(), { title: app.activeName() });
    if (epoch !== app.pngEpoch) return;
    app.png = { ready: result, preparing: false, retry: false }; app.paintToolbar(); if ($('#share-image')) $('#share-image').disabled = false;
  } catch {
    if (epoch !== app.pngEpoch) return;
    app.png.preparing = false; app.notice('Görüntü hazırlanamadı'); app.paintToolbar();
  }
}

export function openShare() {
  app.openSheet('Paylaş');
  const image = row(app.png.retry ? 'Gönder' : 'Görsel', sendPNG, { glyph: 'share' }); image.id = 'share-image'; image.disabled = !app.png.ready;
  let plan; try { plan = planPDF(app.store, app.width(), app.activeName()); } catch {}
  const pdf = row('PDF', () => openPDF(), { glyph: 'text', value: plan ? `${plan.total} sayfa` : '', arrow: true }); pdf.disabled = !plan;
  let readyCopy, copyRetry = false; const snapshot = structuredClone(app.library), boardId = app.activeBoard, title = app.activeName();
  const copy = row('Kopya', async () => { if (!readyCopy) return; const result = await sharePrepared(readyCopy, title, `Sinaps tuvali: ${title} · ${new URL('./', location.href).href}`);
    if (result === 'activation') { if (copyRetry) downloadFile(readyCopy); else { copyRetry = true; copy.setAttribute('aria-label', 'Gönder'); copy.querySelector('.row-text').textContent = 'Gönder'; } }
  }, { glyph: 'copy' }); copy.disabled = true; app.sheetContent.append(copy, pdf, image); prepareShare();
  exportPhotos(boardGraph(snapshot, boardId).kartlar).then(photos => { const payload = copyPayload(snapshot, boardId, photos); readyCopy = new File([JSON.stringify(payload)], `${title.replace(/[\\/:*?"<>|]/g, '-')}.sinaps`, { type: 'application/json' }); if (copy.isConnected) copy.disabled = false; }).catch(() => app.notice('Kopya hazırlanamadı'));

}

export async function sendPNG() {
  if (!app.png.ready) return;
  const ready = app.png.ready, retry = app.png.retry;
  const result = await sharePrepared(ready.file, APP_NAME);
  if (result === 'activation') {
    if (retry) { downloadFile(ready.file); app.notice('Görüntü indirildi'); }
    else { app.png.retry = true; app.paintToolbar(); if ($('#share-image')) { $('#share-image').setAttribute('aria-label', 'Gönder'); $('#share-image').querySelector('.row-text').textContent = 'Gönder'; } }
  } else if (result !== 'cancelled' && app.png.ready === ready) { app.png.retry = false; app.paintToolbar(); }
}
