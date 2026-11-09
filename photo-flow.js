import { app } from './app.js';
import { releasePhotos, warmPhotos, removePhoto, photoURL, encodePhoto, putPhoto } from './photos.js';
import { $, row, el } from './ui.js';
import { hasCardText, deleteCard, restoreDeleted, cardTitle, positionCard } from './graph.js';

export function warmActivePhotos() {
  // Only the open board's photos stay decoded; leaving a board frees the rest.
  releasePhotos(app.store.kartlar.map(card => card.fotoId).filter(Boolean));
  warmPhotos(app.store.kartlar).then(() => { app.canvas.requestDraw(); if (app.current) app.render(); }).catch(() => app.notice('Fotoğraf açılamadı. Yedekten yükleyebilirsin.'));
}

export function retirePhotos(cards, delay = 6500) {
  for (const id of new Set(cards.map(card => card?.fotoId).filter(Boolean))) setTimeout(() => {
    if (!app.library.kartlar.some(card => card.fotoId === id) && !app.store.kartlar.some(card => card.fotoId === id)) removePhoto(id).catch(() => {});
  }, delay);
}

export function pickPhoto(id) { app.photoTarget = id; $('#photo-file').value = ''; $('#photo-file').click(); }

export function requestPhoto(id) {
  const card = app.store.kartlar.find(card => card.id === id); if (!card || app.locked) return;
  app.view.highlight = null; app.canvas.requestDraw();
  if (!card.fotoId) { pickPhoto(id); return; }
  app.photoTarget = id; app.openSheet('Görsel', 'Fotoğraf');
  const change = row('Değiştir', () => pickPhoto(id), { glyph: 'photo' });
  const remove = row('Kaldır', () => {
    const old = card.fotoId;
    const removed = !hasCardText(card) ? deleteCard(app.store, id) : null;
    const next = removed?.store || { ...app.store, kartlar: app.store.kartlar.map(item => { if (item.id !== id) return item; const next = { ...item, degisme: new Date().toISOString() }; delete next.fotoId; return next; }) };
    if (!app.persist(next)) return;
    if (removed) { app.drafts.delete(id); app.current = null; app.entryCard = null; }
    app.sheet.close(); app.pushRoute({ card: app.current, panel: null, target: null }, true); app.render();
    app.setUndo(() => removed ? restoreDeleted(app.store, removed) : ({ ...app.store, kartlar: app.store.kartlar.map(item => item.id === id ? { ...item, fotoId: old } : item) }), removed ? 'Kart silindi' : 'Fotoğraf kaldırıldı'); retirePhotos([{ fotoId: old }]);
  }, { glyph: 'delete' }); remove.classList.add('danger'); app.sheetContent.append(change, remove);
}

export function viewPhoto(id) {
  const card = app.store.kartlar.find(card => card.id === id); if (!card?.fotoId) return;
  app.openSheet('Fotoğraf', 'Fotoğraf-görsel'); app.sheet.classList.add('photo-viewer');
  const image = el('img', 'full-photo'); image.src = photoURL(card.fotoId); image.alt = cardTitle(card); app.sheetContent.append(image);
}

$('#photo-file').addEventListener('change', async event => {
  const file = event.target.files[0], id = app.photoTarget; if (!file || app.locked) return;
  let stage = 'encode';
  try {
    const record = await encodePhoto(file), card = app.store.kartlar.find(item => item.id === id); if (!card) return;
    stage = 'put'; await putPhoto(record); stage = 'warm'; await warmPhotos([{ fotoId: record.id }]);
    let next = { ...app.store, kartlar: app.store.kartlar.map(item => item.id === id ? { ...item, fotoId: record.id, degisme: new Date().toISOString() } : item) };
    next = positionCard(next, id, card.x, card.y, app.width());
    const beforeLibrary = app.library;
    if (!app.persist(next)) { app.library = beforeLibrary; await removePhoto(record.id); return; }
    if (app.sheet.open) { app.sheet.close(); app.pushRoute({ card: app.current, panel: null, target: null }, true); }
    app.view.highlight = null; app.render(); retirePhotos([card]);
  } catch (error) { console.warn('Fotoğraf:', stage, error?.name, error?.message); app.notice('Fotoğraf eklenemedi. Yeniden dene.'); }
});
