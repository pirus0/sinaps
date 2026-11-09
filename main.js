import { STORAGE_KEY as GRAPH_KEY, LEGACY_KEY, emptyGraph, addCard, editCard,
  positionCard, connectCards, disconnect, connections, linked, deleteCard, restoreDeleted, backupJSON,
  parseBackup, mergeGraphs, searchCards, exportText, cardTitle, cardText, hasCardText } from './graph.js';
import { cardWidth, makeScene, fitCamera, clampCamera, shorten } from './scene.js';
import { CanvasView } from './canvas-view.js';
import { preparePNG, textMeasure } from './png.js';
import { encodePhoto, putPhoto, getPhoto, removePhoto, warmPhotos, photoURL, exportPhotos, importPhotos } from './photos.js';
import { planPDF } from './pdf-layout.js';
import { arrangeForPrint, cutCards } from './pdf-arrange.js';
import { preparePDF } from './pdf.js';
import { copyPayload, parseCopy, addCopy } from './copy.js';
import { HeaderSearch } from './search-view.js';
import { previewBoard as boardPreview } from './board-preview.js';
import { loadSample } from './sample.js';
import { APP_NAME } from './brand.js';
import { shareFile, datedName, sharePrepared, downloadFile } from './files.js';
import { $, el, button, icon, row } from './ui.js';
import { WORKSPACE_KEY as STORAGE_KEY, WORKSPACE_VIEW_KEY as VIEW_KEY, emptyWorkspace, loadWorkspace,
  boardGraph, putBoardGraph, newBoard, boardName, deleteBoard, backupWorkspace, parseWorkspace,
  mergeWorkspaces, workspaceText, searchWorkspace, trashBoard, restoreBoard, purgeExpired } from './workspace.js';

const sampleRequest = new URLSearchParams(location.search).get('ornek');
const sheet = $('#sheet'), sheetContent = $('#sheet-content');
let store = emptyGraph(), current = null, entryCard = null, lastSaved = null, rawBroken = null, locked = false;
let route = { card: null, panel: null, target: null }, restoring = false, panelRoute = null;
let saveTimer, noticeTimer, undoTimer, undoAction, focusReturn, persistentRequested = false, lastBrandTap = 0;
let photoTarget = null, renaming = false, trashOpen = false, trashTarget = null;
let searchController = null;
const searchQueries = { Ara: '', Genel: '' };
let pendingImport, sceneCache = null, pngEpoch = 0;
const drafts = new Set();
let png = { ready: null, preparing: false, retry: false };
let library = emptyWorkspace(), activeBoard = null, boardMenuId = null;
const draftBoards = new Set(), viewLibrary = { sonTuvalId: null, tuvaller: Object.create(null) };
const view = { camera: { x: 0, y: 0, z: 1 }, tamCamera: { x: 0, y: 0, z: 1 }, sade: false, target: null, highlight: null };
let meta = { sonYedek: null };
try { meta = { ...meta, ...JSON.parse(localStorage.getItem('dallanan-not-meta-v1') || '{}') }; } catch {}
function saveMeta() { try { localStorage.setItem('dallanan-not-meta-v1', JSON.stringify(meta)); } catch {} }
function saveView() {
  if (activeBoard) viewLibrary.tuvaller[activeBoard] = { camera: view.camera, tamCamera: view.tamCamera, sade: view.sade };
  viewLibrary.sonTuvalId = activeBoard;
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewLibrary)); } catch {}
}
const viewport = () => ({ width: innerWidth, height: innerHeight });
const width = () => cardWidth(innerWidth);
function scene() {
  if (!sceneCache || sceneCache.store !== store || sceneCache.width !== width()) {
    sceneCache = { store, width: width(), scene: makeScene(store, width(), textMeasure(), activeName()) };
  }
  return sceneCache.scene;
}
function activeName() { const board = library.tuvaller.find(item => item.id === activeBoard); return board ? boardName(library, board) : '';  }
function reportError(message) {
  $('#save-error').textContent = message; $('#save-error').hidden = false; document.body.classList.add('locked');
}
function placeNotice() {
  const node = $('#notice');
  if (sheet.open) { sheetContent.append(node); node.classList.add('in-sheet'); }
  else { document.body.append(node); node.classList.remove('in-sheet'); }
}
function notice(message) {
  clearTimeout(noticeTimer); $('#notice').replaceChildren(document.createTextNode(message)); $('#notice').hidden = false;
  placeNotice(); noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 4000);
}
function clearUndo() { undoAction = null; clearTimeout(undoTimer); $('#notice').hidden = true; }
function setUndo(action, message) {
  clearUndo(); clearTimeout(noticeTimer); undoAction = action; $('#notice').replaceChildren();
  if (message) $('#notice').append(el('span', 'undo-message', message));
  $('#notice').append(button('Geri al', () => {
    const next = undoAction?.();
    if (next?.surum === 3) library = next;
    if (next && persist(next.surum === 3 ? store : next)) {
      clearUndo(); if (current && !store.kartlar.some(card => card.id === current)) current = null;
      if (view.sade) view.camera = fitCamera(scene(), viewport(), view.camera);
      if (sheet.open && history.state?.panel) closePanel();
      else { route = { board: activeBoard, card: current, panel: null, target: null }; history.replaceState(route, '', location.pathname); }
      render();
    }
  }, 'undo-button'));
  $('#notice').hidden = false; placeNotice(); undoTimer = setTimeout(clearUndo, 6000);
}
function persistentStore(graph) {
  let result = graph;
  for (const id of drafts) {
    const card = result.kartlar.find(item => item.id === id);
    if (card && !card.baslik.trim() && !card.aciklama.trim() && !card.fotoId) result = deleteCard(result, id).store;
  }
  return result;
}
function persist(next = store, force = false) {
  clearTimeout(saveTimer);
  library = putBoardGraph(library, activeBoard, persistentStore(next));
  if (locked && !force) return false;
  try {
    if (!force && localStorage.getItem(STORAGE_KEY) !== lastSaved) {
      locked = true; reportError('Kartlar başka bir sekmede değişti. Önce yedek al, sonra sayfayı yenile.'); return false;
    }
    const omitted = new Set(library.tuvaller.filter(board => draftBoards.has(board.id) && !library.kartlar.some(card => card.tuvalId === board.id)).map(board => board.id));
    const actual = { ...library, tuvaller: library.tuvaller.filter(board => !omitted.has(board.id)) };
    const serialized = JSON.stringify(actual), changed = serialized !== lastSaved;
    localStorage.setItem(STORAGE_KEY, serialized); store = next; lastSaved = serialized; rawBroken = null; locked = false;
    for (const board of actual.tuvaller) draftBoards.delete(board.id);
    for (const id of drafts) {
      const card = actual.kartlar.find(item => item.id === id);
      if (card && (card.baslik.trim() || card.aciklama.trim() || card.fotoId)) drafts.delete(id);
    }
    if (changed) invalidatePNG();
    if (!persistentRequested && actual.kartlar.length) { persistentRequested = true; navigator.storage?.persist?.().catch(() => {}); }
    $('#save-error').hidden = true; document.body.classList.remove('locked'); return true;
  } catch { reportError('Kaydedilemedi. Kartlarını korumak için Yedek kullan.'); return false; }
}
function cleanWriting() {
  clearTimeout(saveTimer);
  const card = store.kartlar.find(item => item.id === current);
  if (card && !card.baslik.trim() && !card.aciklama.trim() && !card.fotoId) {
    const removed = deleteCard(store, current); store = removed.store; drafts.delete(current); persist();
    if (entryCard && (hasCardText(entryCard) || entryCard.fotoId)) {
      setUndo(() => restoreDeleted(store, { ...removed, card: entryCard }), 'Kart silindi');
    }
  } else if (card) persist();
}
function pushRoute(next, replace = false) {
  next = { ...next, board: activeBoard };
  route = next; history[replace ? 'replaceState' : 'pushState'](next, '', next.card ? `#kart=${encodeURIComponent(next.card)}` : location.pathname);
}
function focusCard(id, pair = false) {
  const card = store.kartlar.find(item => item.id === id); if (!card) return;
  const source = pair && store.kartlar.find(item => item.id === card.kaynakId);
  view.camera = source ? { x: (source.x + card.x) / 2, y: (source.y + card.y) / 2,
    z: Math.min(1, (innerWidth - 32) / (Math.abs(source.x - card.x) + width()), (innerHeight - 230) / (Math.abs(source.y - card.y) + 88)) }
    : { x: card.x, y: card.y, z: 1 };
  view.tamCamera = { ...view.camera }; saveView();
}
function showCanvas({ focus = null, pair = false, replace = false } = {}) {
  cleanWriting(); current = null; entryCard = null; view.target = null;
  if (sheet.open) sheet.close();
  if (focus) { view.sade = false; focusCard(focus, pair); }
  pushRoute({ card: null, panel: null, target: null }, replace); render(); saveView();
}
function openCard(id, { fresh = false, replace = false } = {}) {
  const card = store.kartlar.find(item => item.id === id); if (!card) return;
  if (current && current !== id) cleanWriting();
  if (view.sade) { view.sade = false; focusCard(id); render(); return; }
  current = id; entryCard = { ...card }; view.target = null; view.highlight = null;
  if (sheet.open) sheet.close(); pushRoute({ card: id, panel: null, target: null }, replace);
  render(); window.scrollTo(0, 0); if (fresh) $('#card-title').focus();
}
function createCard(sourceId = null, at = null) {
  if (locked) { notice('Önce mevcut veriyi yedekle.'); return; }
  const source = store.kartlar.find(card => card.id === sourceId);
  if (source && !source.baslik.trim() && !source.aciklama.trim() && !source.fotoId) { $('#card-title')?.focus(); return; }
  if (current && !persist()) return;
  clearUndo();
  const result = addCard(store, { sourceId, x: view.camera.x, y: view.camera.y, width: width() });
  store = at ? positionCard(result.store, result.card.id, at.x, at.y, width()) : result.store;
  drafts.add(result.card.id); view.sade = false; invalidatePNG();
  openCard(result.card.id, { fresh: true, replace: current !== null });
}
function closeWriting() {
  const id = current;
  cleanWriting(); if (id && store.kartlar.some(card => card.id === id)) { view.sade = false; focusCard(id, !!store.kartlar.find(card => card.id === id)?.kaynakId); }
  if (history.state?.card) history.back(); else showCanvas({ replace: true });
}
function selectCard(id) {
  if (view.target) {
    if (locked || id === view.target || linked(store, id, view.target)) return;
    const before = new Set(store.ipler.map(ip => ip.id)), next = connectCards(store, view.target, id);
    if (!persist(next)) return;
    const added = next.ipler.find(ip => !before.has(ip.id));
    view.target = null; current = null; pushRoute({ card: null, panel: null, target: null }, true); render();
    setUndo(() => disconnect(store, added.id), 'Bağlandı'); return;
  }
  view.highlight = null; openCard(id);
}
function themePreference() { try { return localStorage.getItem('dallanan-not-theme') || 'system'; } catch { return 'system'; } }
function applyTheme(preference, save = true) {
  const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme; $('meta[name="theme-color"]').content = theme === 'dark' ? '#11100e' : '#efebe2';
  if (save) { try { localStorage.setItem('dallanan-not-theme', preference); } catch {} }
  invalidatePNG(); canvas.requestDraw();
}
function brandTap() {
  const time = Date.now();
  if (time - lastBrandTap < 300) {
    lastBrandTap = 0; const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(next);
    if (next === 'light') navigator.vibrate?.(10);
    dispatchEvent(new CustomEvent('sinaps:theme', { detail: next }));
  }
  else lastBrandTap = time;
}
function invalidatePNG() {
  pngEpoch++; png = { ready: null, preparing: false, retry: false };
  if (view.sade && !current && store.kartlar.length) queueMicrotask(prepareShare);
}
async function prepareShare() {
  if (!view.sade || current || !store.kartlar.length || png.preparing || png.ready) return;
  png.preparing = true; const epoch = pngEpoch, snapshot = JSON.parse(JSON.stringify(store)); paintToolbar();
  try {
    await warmPhotos(snapshot.kartlar);
    const result = await preparePNG(snapshot, width(), { title: activeName() });
    if (epoch !== pngEpoch) return;
    png = { ready: result, preparing: false, retry: false }; paintToolbar(); if ($('#share-image')) $('#share-image').disabled = false;
  } catch {
    if (epoch !== pngEpoch) return;
    png.preparing = false; notice('Görüntü hazırlanamadı'); paintToolbar();
  }
}
function openShare() {
  openSheet('Paylaş');
  const image = row(png.retry ? 'Gönder' : 'Görsel', sendPNG, { glyph: 'share' }); image.id = 'share-image'; image.disabled = !png.ready;
  let plan; try { plan = planPDF(store, width(), activeName()); } catch {}
  const pdf = row('PDF', () => openPDF(), { glyph: 'text', value: plan ? `${plan.total} sayfa` : '', arrow: true }); pdf.disabled = !plan;
  let readyCopy, copyRetry = false; const snapshot = structuredClone(library), boardId = activeBoard, title = activeName();
  const copy = row('Kopya', async () => { if (!readyCopy) return; const result = await sharePrepared(readyCopy, title, `Sinaps tuvali: ${title} · ${new URL('./', location.href).href}`);
    if (result === 'activation') { if (copyRetry) downloadFile(readyCopy); else { copyRetry = true; copy.setAttribute('aria-label', 'Gönder'); copy.querySelector('.row-text').textContent = 'Gönder'; } }
  }, { glyph: 'copy' }); copy.disabled = true; sheetContent.append(copy, pdf, image); prepareShare();
  exportPhotos(boardGraph(snapshot, boardId).kartlar).then(photos => { const payload = copyPayload(snapshot, boardId, photos); readyCopy = new File([JSON.stringify(payload)], `${title.replace(/[\\/:*?"<>|]/g, '-')}.sinaps`, { type: 'application/json' }); if (copy.isConnected) copy.disabled = false; }).catch(() => notice('Kopya hazırlanamadı'));

}
let pdfEpoch = 0;
// Page map for the PDF step: the same grid planPDF prints, numbered as the PDF pages are.
function pdfPreview(plan) {
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
function openPDF() {
  const title = activeName(), original = structuredClone(store);
  let plan; try { plan = planPDF(original, width(), title); } catch (error) { notice(error.message); return; }
  openSheet('PDF'); const epoch = ++pdfEpoch;
  let arranged = null, useArranged = false;
  const frame = el('div', 'pdf-preview'), info = el('div', 'pdf-info'), actions = el('div', 'confirmation pdf-confirmation');
  sheetContent.append(frame, info, actions);
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
    }, 'button wide', 'share'); send.disabled = true; sheetContent.append(send);
    preparePDF(snapshot, width(), title, printPlan).then(result => { if (epoch !== pdfEpoch || !send.isConnected) return; ready = result; send.disabled = false; }).catch(error => {
      if (epoch !== pdfEpoch || !send.isConnected) return; const copy = el('p', 'sheet-copy danger', 'PDF hazırlanamadı. Yeniden dene.'); sheetContent.append(copy, button('Yeniden', () => openPDF(), 'button secondary')); console.warn('PDF:', error);
    });
  };
  paint();
  // Print arrangement plans several grids; run it after the sheet is on screen.
  setTimeout(() => { if (epoch !== pdfEpoch) return; try { arranged = arrangeForPrint(original, width(), title); } catch { arranged = null; } paint(); }, 0);
}
async function sendPNG() {
  if (!png.ready) return;
  const ready = png.ready, retry = png.retry;
  const result = await sharePrepared(ready.file, APP_NAME);
  if (result === 'activation') {
    if (retry) { downloadFile(ready.file); notice('Görüntü indirildi'); }
    else { png.retry = true; paintToolbar(); if ($('#share-image')) { $('#share-image').setAttribute('aria-label', 'Gönder'); $('#share-image').querySelector('.row-text').textContent = 'Gönder'; } }
  } else if (result !== 'cancelled' && png.ready === ready) { png.retry = false; paintToolbar(); }
}
function toggleSimple() {
  view.highlight = null; canvas.cancel();
  if (view.sade) { view.sade = false; view.camera = { ...view.tamCamera }; }
  else { view.tamCamera = { ...view.camera }; view.sade = true; view.camera = fitCamera(scene(), viewport(), view.tamCamera); }
  invalidatePNG(); saveView(); render(); if (view.sade) prepareShare();
}
function activateWorkspace(id, { fresh = false, replace = false, record = true } = {}) {
  if (!library.tuvaller.some(board => board.id === id && !board.silinme)) return;
  trashOpen = false;
  if (current) cleanWriting(); if (activeBoard) { persist(); saveView(); }
  canvas.cancel(); clearUndo(); activeBoard = id; current = null; entryCard = null; store = boardGraph(library, id);
  const saved = viewLibrary.tuvaller[id];
  const valid = camera => camera && [camera.x, camera.y, camera.z].every(Number.isFinite) && camera.z > 0 && camera.z <= 4;
  view.camera = valid(saved?.camera) ? saved.camera : { x: 0, y: 0, z: 1 };
  view.tamCamera = valid(saved?.tamCamera) ? saved.tamCamera : { ...view.camera };
  view.sade = saved?.sade === true; view.target = null; view.highlight = null;
  library = { ...library, tuvaller: library.tuvaller.map(board => board.id === id ? { ...board, sonAcilma: new Date().toISOString() } : board) };
  if (sheet.open) sheet.close(); if (record) pushRoute({ card: null, panel: null, target: null }, replace);
  renaming = fresh; invalidatePNG(); render(); saveView(); warmActivePhotos(); if (fresh) { $('#board-name').focus(); $('#board-name').select(); }
}
function createWorkspace() {
  if (locked) return;
  const result = newBoard(library); library = result.workspace; draftBoards.add(result.board.id); activateWorkspace(result.board.id, { fresh: true });
}
function goHome({ record = true } = {}) {
  if (current) cleanWriting(); if (activeBoard) { persist(); saveView(); }
  if (activeBoard && draftBoards.has(activeBoard) && !store.kartlar.length) { library = deleteBoard(library, activeBoard); draftBoards.delete(activeBoard); }
  trashOpen = false; canvas.cancel(); clearUndo(); activeBoard = null; current = null; entryCard = null; store = emptyGraph(); view.target = null; view.sade = false;
  if (sheet.open) sheet.close(); if (record) pushRoute({ card: null, panel: null, target: null });
  render(); saveView();
}
function previewBoard(board, source = library) { return boardPreview(board, source); }
function renderHome() {
  $('#board').hidden = true; $('#app').className = 'home-route'; document.body.classList.remove('canvas-page');
  const header = $('#header'), content = $('#content'); header.className = ''; header.replaceChildren(); content.replaceChildren(); content.className = 'board-grid';
  const heading = el('h1'); heading.id = 'brand-title'; heading.append(icon('brand'), document.createTextNode(APP_NAME)); heading.setAttribute('aria-label', APP_NAME); heading.addEventListener('click', brandTap);
  const pill = el('div', 'toolbar-pill'), settings = button('Ayarlar', openSettings, 'icon-button', 'settings');
  pill.append(settings, button('Ara', openGlobalSearch, 'icon-button', 'search')); header.append(heading, pill);
  for (const board of library.tuvaller.filter(board => !board.silinme).sort((a, b) => Date.parse(b.sonAcilma) - Date.parse(a.sonAcilma))) {
    let held = false, timer;
    const tile = button(boardName(library, board), () => { if (!held) activateWorkspace(board.id); }, 'board-tile'); tile.dataset.board = board.id;
    const label = el('span', 'board-label'); label.append(el('span', '', boardName(library, board)),
      el('small', '', `${library.kartlar.filter(card => card.tuvalId === board.id).length} kart`));
    tile.replaceChildren(previewBoard(board), label);
    tile.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; boardMenuId = board.id; openBoardMenu(); }, 400); });
    tile.addEventListener('pointerup', () => clearTimeout(timer)); tile.addEventListener('pointercancel', () => clearTimeout(timer));
    tile.addEventListener('pointermove', () => clearTimeout(timer)); tile.addEventListener('keydown', () => { held = false; });
    tile.addEventListener('contextmenu', event => { event.preventDefault(); held = true; boardMenuId = board.id; openBoardMenu(); }); content.append(tile);
  }
  const trashed = library.tuvaller.filter(board => board.silinme);
  if (trashed.length) { const trash = row('Çöp', openTrash, { glyph: 'delete', value: String(trashed.length), arrow: true }); trash.classList.add('trash-entry'); content.append(trash); }
  if (!library.tuvaller.some(board => !board.silinme)) {
    content.className = 'home-empty'; const empty = el('div', 'empty'), mark = icon('brand'); mark.classList.add('empty-brand');
    const create = button('Yeni', createWorkspace, 'button accent', 'plus'); create.disabled = locked;
    empty.append(mark, el('p', 'empty-label', 'Boş'), create, button('Yükle', openImport, 'button quiet', 'upload')); content.append(empty); if (trashed.length) content.append(row('Çöp', openTrash, { glyph: 'delete', value: String(trashed.length), arrow: true }));
  }
  paintToolbar(); updateViewport();
}
function openBoardMenu() {
  const board = library.tuvaller.find(item => item.id === boardMenuId); if (!board) return;
  openSheet(boardName(library, board), 'Tuval');
  sheetContent.append(row('Adlandır', () => activateWorkspace(board.id, { fresh: true, replace: true })), el('hr', 'sheet-divider'),
    row('Sil', () => {
      library = trashBoard(library, board.id); if (!persist()) return;
      sheet.close(); pushRoute({ card: null, panel: null, target: null }, true); render();
      setUndo(() => restoreBoard(library, board.id), 'Çöp kutusuna taşındı');
    }, { glyph: 'delete' }));

}
function beginLink(id) {
  if (locked) return; if (current && !persist()) return;
  current = null; entryCard = null; view.target = id; view.sade = false;
  if (sheet.open) sheet.close(); pushRoute({ card: null, target: id, panel: null }, !!route.panel); render();
}
function wireDrop(sourceId, targetId, point) {
  if (targetId) {
    if (sourceId === targetId || linked(store, sourceId, targetId) || locked) return;
    const previous = new Set(store.ipler.map(ip => ip.id)), next = connectCards(store, sourceId, targetId);
    if (!persist(next)) return; const added = next.ipler.find(ip => !previous.has(ip.id)); canvas.requestDraw();
    setUndo(() => disconnect(store, added.id), 'Bağlandı');
  } else createCard(sourceId, point);
}

function paintToolbar() {
  const toolbar = $('#toolbar'); toolbar.replaceChildren(); toolbar.hidden = !!view.target || (!current && !store.kartlar.length);
  if (!activeBoard) {
    const create = button('Yeni', createWorkspace, 'icon-button', 'plus'); create.classList.add('button', 'accent', 'new-action');
    toolbar.hidden = !library.tuvaller.some(board => !board.silinme); toolbar.append(el('span', 'spacer'), create);
    toolbar.lastElementChild.disabled = locked; return;
  }
  if (current) {
    const card = store.kartlar.find(item => item.id === current);
    const visual = button('Görsel', () => requestPhoto(current), 'icon-button', 'plus');
    visual.classList.add('writing-visual'); visual.classList.toggle('has-photo', !!card?.fotoId);
    toolbar.append(visual, button('Tamam', closeWriting, 'button', 'check'));
    toolbar.firstElementChild.disabled = locked; return;
  }
  const simple = button(view.sade ? 'Tam' : 'Sade', toggleSimple, 'icon-button', view.sade ? 'full' : 'simple'); simple.classList.add('button', 'secondary', 'round-action');
  const center = button('Merkez', centerCamera, 'icon-button center-button'); center.replaceChildren(el('span', 'center-dot')); center.classList.add('button', 'secondary', 'round-action');
  const action = view.sade ? button('Paylaş', openShare, 'icon-button', 'share')
    : button('Yeni', () => createCard(), 'icon-button', 'plus');
  if (view.sade) action.classList.add('button', 'accent', 'round-action');
  else action.classList.add('button', 'accent', 'new-action');
  action.disabled = locked;
  toolbar.append(simple, center, action);
}
function render() {
  searchController?.destroy(); searchController = null;
  if (trashOpen) { renderTrash(); return; }
  if (!activeBoard) { renderHome(); return; }
  if (current && !store.kartlar.some(card => card.id === current)) current = null;
  const header = $('#header'), content = $('#content'); header.className = ''; header.replaceChildren(); content.replaceChildren();
  $('#app').className = current ? 'writing-route' : 'canvas-route';
  document.body.classList.toggle('canvas-page', !current); $('#board').hidden = !!current; content.className = '';
  if (current) {
    const back = button('Geri', closeWriting, 'icon-button', 'left'); back.classList.add('board-back');
    const pill = el('div', 'toolbar-pill'); pill.append(button('Menü', openMenu, 'icon-button', 'menu')); header.append(back, pill);
    const card = store.kartlar.find(item => item.id === current), panel = el('section', 'card writing-card');
    const title = el('input', 'title-input'); title.id = 'card-title'; title.type = 'text'; title.placeholder = 'Başlık';
    title.setAttribute('aria-label', 'Başlık'); title.value = card.baslik; title.readOnly = locked;
    const description = el('textarea', 'editor'); description.id = 'card-description'; description.placeholder = 'Açıklama';
    description.setAttribute('aria-label', 'Açıklama'); description.value = card.aciklama; description.readOnly = locked;
    const fit = () => { description.style.height = 'auto'; description.style.height = description.scrollHeight + 'px'; };
    const update = () => {
      store = editCard(store, current, title.value, description.value); clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist(), 300); fit(); invalidatePNG();
    };
    title.addEventListener('input', update); description.addEventListener('input', update);
    title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); description.focus(); } });
    for (const field of [title, description]) { field.addEventListener('focus', updateViewport); field.addEventListener('blur', updateViewport); }
    if (card.fotoId && photoURL(card.fotoId)) {
      const photo = button('Fotoğraf', () => viewPhoto(card.id), 'writing-photo');
      const image = el('img'); image.src = photoURL(card.fotoId); image.alt = ''; photo.replaceChildren(image); panel.append(photo);
    }
    panel.append(title, description); content.append(panel); requestAnimationFrame(fit);
  } else {
    if (view.target) {
      const target = el('div', 'target-header'); target.append(icon('link'), el('span', '', 'Hedef'),
        button('Vazgeç', () => history.back(), 'button secondary')); header.append(target);
    } else {
      const back = button('Tuvaller', goHome, 'icon-button', 'left'); back.classList.add('board-back');
      const name = renaming ? el('input', 'board-name') : button(activeName(), centerCamera, 'board-name board-title'); name.id = 'board-name'; name.setAttribute('aria-label', renaming ? 'Ad' : activeName()); name.placeholder = 'Ad';
      const board = library.tuvaller.find(item => item.id === activeBoard); name.value = board?.ad || ''; name.readOnly = locked;
      if (!name.value && store.kartlar.length) name.value = boardName(library, board);
      name.addEventListener('input', () => {
        library = { ...library, tuvaller: library.tuvaller.map(item => item.id === activeBoard ? { ...item, ad: name.value.trim(), degisme: new Date().toISOString() } : item) };
        clearTimeout(saveTimer); saveTimer = setTimeout(() => persist(), 300);
      });
      name.addEventListener('keydown', event => { if (event.key === 'Enter') { renaming = false; persist(); sceneCache = null; render(); } });
      name.addEventListener('focus', updateViewport); name.addEventListener('blur', updateViewport);
      const search = button('Ara', openSearch, 'icon-button'); search.replaceChildren(icon('search')); search.classList.add('header-search');
      header.append(back, name, search);
    }
    if (!store.kartlar.length) {
      content.className = 'empty-board'; const empty = el('div', 'empty'), mark = icon('brand'); mark.classList.add('empty-brand');
      const create = button('Yeni', () => createCard(), 'button accent', 'plus'); create.disabled = locked;
      empty.append(mark, el('p', 'empty-label', 'Boş'), create); content.append(empty);
    }
    $('#canvas').classList.toggle('sade', view.sade); canvas.draw();
  }
  paintToolbar(); updateViewport();
  if (view.sade && !current) prepareShare();
}
function openSheet(label, kind = label) {
  clearTimeout(saveTimer); if (current) persist();
  const changed = !sheet.open || panelRoute !== kind;
  if (!sheet.open) focusReturn = document.activeElement;
  if (!restoring && changed) pushRoute({ card: current, target: view.target, panel: kind }, panelRoute === 'Menü' && kind === 'Bağlar');
  panelRoute = kind; $('#sheet-title').textContent = label; sheet.classList.remove('tall', 'photo-viewer');
  document.body.append($('#notice')); $('#notice').classList.remove('in-sheet'); sheetContent.replaceChildren();
  $('#sheet-footer').replaceChildren(); $('#sheet-footer').hidden = true;
  if (!sheet.open) sheet.showModal(); if (changed) $('#sheet-title').focus({ preventScroll: true });
}
function closePanel() { if (history.state?.panel) history.back(); else sheet.close(); }
function openMenu() {
  const card = store.kartlar.find(item => item.id === current); if (!card) return;
  openSheet(cardTitle(card), 'Menü');

  const remove = row('Sil', () => {
    openSheet(cardTitle(card), 'Kart-sil'); sheetContent.append(el('p', 'sheet-copy', 'Kart silinsin mi?'));
    const actions = el('div', 'confirmation'); actions.append(button('Vazgeç', closePanel, 'button secondary'), button('Sil', () => {
      clearUndo(); const record = deleteCard(store, current); if (!persist(record.store)) return;
      current = null; entryCard = null; showCanvas({ replace: true }); retirePhotos([record.card], 0);
    }, 'button accent', 'delete')); sheetContent.append(actions);
  }); remove.classList.add('danger'); remove.disabled = locked;
  sheetContent.append(row('Bağlar', openConnections, { value: String(connections(store, current).length), arrow: true }),
    row('Paylaş', async () => {
      try { await shareFile(cardText(store.kartlar.find(item => item.id === current)), datedName('kart', 'txt'), 'text/plain;charset=utf-8', APP_NAME); }
      catch { notice('Paylaşılamadı. Yeniden dene.'); }
    }, { glyph: 'share' }), el('hr', 'sheet-divider'), remove);
}
function openConnections() {
  openSheet('Bağlar');
  for (const ip of connections(store, current)) {
    const otherId = ip.aId === current ? ip.bId : ip.aId;
    const other = store.kartlar.find(card => card.id === otherId); if (!other) continue;
    const entry = el('div', 'connection-row');
    const name = button(cardTitle(other), () => openCard(other.id, { replace: true }), 'connection-name');
    name.replaceChildren(el('span', '', cardTitle(other)), el('small', '', other.aciklama.replace(/\s+/g, ' ').slice(0, 100)));
    const remove = button('Kaldır', () => {
      if (!persist(disconnect(store, ip.id))) return;
      openConnections(); setUndo(() => mergeGraphs(store, { surum: 2, kartlar: [], ipler: [ip] }).store, 'Bağ kaldırıldı');
    }, 'button quiet danger'); remove.disabled = locked; entry.append(name, remove); sheetContent.append(entry);
  }
}
function openHeaderSearch(global = false) {
  searchController?.destroy();
  const kind = global ? 'Genel' : 'Ara';
  if (!restoring) { searchQueries[kind] = ''; pushRoute({ card: null, target: null, panel: kind }); }
  const prefix = global ? el('span', 'icon-button') : button('Tuvaller', goHome, 'icon-button', 'left');
  if (global) prefix.append(icon('brand'));
  searchController = new HeaderSearch({
    header: $('#header'), query: searchQueries[kind], close: closePanel, prefix,
    change: query => { searchQueries[kind] = query; },
    results: query => {
      if (!global) return searchCards(store, query).map(card => ({ label: cardTitle(card), detail: card.aciklama.replace(/\s+/g, ' ').slice(0, 120), cardId: card.id }));
      const found = searchWorkspace(library, query);
      return [
        ...found.boards.map(board => ({ label: boardName(library, board), detail: `${boardGraph(library, board.id).kartlar.length} kart`, boardId: board.id, glyph: 'full' })),
        ...found.cards.map(card => ({ label: cardTitle(card), detail: boardName(library, library.tuvaller.find(board => board.id === card.tuvalId)), boardId: card.tuvalId, cardId: card.id }))
      ];
    },
    select: entry => {
      if (entry.boardId) activateWorkspace(entry.boardId, { replace: true });
      if (entry.cardId) {
        current = null; view.target = null; view.sade = false; focusCard(entry.cardId); view.highlight = entry.cardId;
        pushRoute({ card: null, panel: null, target: null }, true); render();
      }
    }
  });
}
function openSearch() { openHeaderSearch(false); }
function openTrash() {
  goHome({ record: false }); trashOpen = true; pushRoute({ card: null, panel: null, target: null, trash: true }); render();
}
function rescueBoard(id) {
  library = restoreBoard(library, id); if (!persist()) return;
  if (sheet.open) sheet.close(); pushRoute({ card: null, panel: null, target: null, trash: true }, true); render();
}
function trashMenu(id) {
  trashTarget = id; const board = library.tuvaller.find(board => board.id === id); if (!board) return;
  openSheet(boardName(library, board), 'Çöp-menü'); sheetContent.append(row('Kurtar', () => rescueBoard(id)), row('Sil', () => confirmTrash(id), { glyph: 'delete' }));
}
function confirmTrash(id = null) {
  trashTarget = id; const board = id && library.tuvaller.find(board => board.id === id); openSheet(board ? boardName(library, board) : 'Çöp', 'Çöp-sil'); sheetContent.append(el('p', 'sheet-copy', id ? 'Tuval kalıcı olarak silinsin mi? Geri alınamaz.' : 'Çöp boşaltılsın mı? Geri alınamaz.'));
  const actions = el('div', 'confirmation'); actions.append(button('Vazgeç', closePanel, 'button secondary'), button('Sil', () => {
    clearUndo(); const boards = library.tuvaller.filter(board => board.silinme && (!id || board.id === id)), cards = boards.flatMap(board => boardGraph(library, board.id).kartlar);
    for (const board of boards) library = deleteBoard(library, board.id); if (!persist()) return;
    retirePhotos(cards, 0); sheet.close(); pushRoute({ card: null, panel: null, target: null, trash: true }, true); render();
  }, 'button accent', 'delete')); sheetContent.append(actions);
}
function renderTrash() {
  $('#board').hidden = true; $('#app').className = 'home-route'; document.body.classList.remove('canvas-page');
  const header = $('#header'), content = $('#content'); header.className = 'trash-header'; const back = button('Tuvaller', goHome, 'icon-button', 'left'); back.classList.add('board-back'); header.replaceChildren(back, el('h1', '', 'Çöp'));
  const boards = library.tuvaller.filter(board => board.silinme); if (boards.length) header.append(button('Boşalt', () => confirmTrash(), 'button quiet'));
  content.className = 'trash-list'; content.replaceChildren(); const card = el('section', 'trash-card'); content.append(card); $('#toolbar').hidden = true;
  if (!boards.length) content.append(el('p', 'empty-label', 'Boş'));
  for (const board of boards) {
    const entry = el('div', 'trash-row'), label = el('div'), days = Math.max(0, Math.ceil(30 - (Date.now() - Date.parse(board.silinme)) / 86400000));
    label.append(el('strong', '', boardName(library, board)), el('small', '', `${days} gün kaldı`)); entry.append(label, button('Kurtar', () => rescueBoard(board.id), 'button secondary'));
    let timer; entry.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; timer = setTimeout(() => trashMenu(board.id), 400); });
    for (const type of ['pointerup', 'pointercancel', 'pointermove']) entry.addEventListener(type, () => clearTimeout(timer));
    entry.addEventListener('contextmenu', event => { event.preventDefault(); trashMenu(board.id); }); card.append(entry);
  }
  if (boards.length) content.append(el('p', 'sheet-copy', '30 gün sonra kendiliğinden silinir'));
}
function sweepTrash() {
  if (locked) return; const result = purgeExpired(library); if (!result.expired.length) return;
  library = result.workspace;
  if (activeBoard && !library.tuvaller.some(board => board.id === activeBoard)) { activeBoard = null; current = null; store = emptyGraph(); }
  if (persist()) retirePhotos(result.removedCards, 0);
}
function openGlobalSearch() { openHeaderSearch(true); }
function openSettings() {
  openSheet('Ayarlar');
  const days = meta.sonYedek ? Math.max(0, Math.floor((Date.now() - Date.parse(meta.sonYedek)) / 86400000)) : null;
  const backup = row('Yedek', () => openExport(true), { value: days === null ? 'Hiç' : days === 0 ? 'Bugün' : `${days} gün önce`, glyph: 'backup', arrow: true });
  backupSize().then(size => { const value = backup.querySelector('.muted'); if (value?.isConnected) value.textContent += ' · ' + bytesLabel(size); }).catch(() => {});
  sheetContent.append(backup,
    row('Metin', () => openExport(false), { glyph: 'text', arrow: true }), row('Yükle', openImport, { glyph: 'upload', arrow: true }),
    el('p', 'sheet-copy', 'Kartların yalnız bu telefonda saklanır. Telefon değişirse yedekten geri yüklenir.'));
}
function bytesLabel(size) { return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`; }
async function backupContent() {
  if (rawBroken) return rawBroken;
  const result = JSON.parse(backupWorkspace(library)); result.data.fotolar = await exportPhotos(library.kartlar);
  return JSON.stringify(result, null, 2);
}
async function backupSize() { return new Blob([await backupContent()]).size; }
function openExport(backup) {
  openSheet(backup ? 'Yedek' : 'Metin');
  sheetContent.append(el('p', 'sheet-copy', backup ? 'Bütün tuvaller, kartlar ve fotoğraflar tek dosyada.' : 'Kartlar düz metin olarak. Her yerde okunur, geri yüklenmez.'));
  const file = el('div', 'file-card'), details = el('p', 'muted', 'Hazırlanıyor');
  file.append(el('p', '', datedName(backup ? 'yedek' : 'kartlar', backup ? 'json' : 'txt')), details); sheetContent.append(file);
  if (!backup) sheetContent.append(el('pre', 'text-preview', workspaceText(library).slice(0, 500)));
  let ready, snapshot, retry = false;
  const send = button('Paylaş', async () => {
    if (!ready) return;
    let result = await sharePrepared(ready, APP_NAME);
    if (result === 'activation') { if (retry) { downloadFile(ready); result = 'downloaded'; } else { retry = true; send.replaceChildren(document.createTextNode('Gönder')); send.setAttribute('aria-label', 'Gönder'); return; } }
    if (backup && ['shared', 'downloaded'].includes(result) && !rawBroken && snapshot === JSON.stringify(library)) {
      meta.sonYedek = new Date().toISOString(); saveMeta();
    }
  }, 'button wide', 'share'); send.disabled = true; sheetContent.append(send);
  (async () => {
    if (!locked) persist(); snapshot = JSON.stringify(library);
    const content = backup ? await backupContent() : workspaceText(library);
    ready = new File([content], datedName(backup ? 'yedek' : 'kartlar', backup ? 'json' : 'txt'), { type: backup ? 'application/json' : 'text/plain;charset=utf-8' });
    details.textContent = `${bytesLabel(ready.size)} · ${library.kartlar.length} kart · ${meta.sonYedek ? 'son yedek ' + meta.sonYedek.slice(0, 10) : 'son yedek yok'}`; send.disabled = false;
  })().catch(() => { details.textContent = 'Yedek hazırlanamadı'; });
}
function exportBackup() { openExport(true); }
function pickFile() { $('#import-file').value = ''; $('#import-file').click(); }
function openImport() {
  openSheet('Yükle'); sheetContent.append(el('p', 'sheet-copy', 'Bir yedek seç. Var olan kartların silinmez, aynı kart iki kez eklenmez.'),
    button('Dosya', pickFile, 'button secondary wide', 'upload'));
}
function openImportPreview() {
  if (!pendingImport) { openImport(); return; }
  if (pendingImport.copy) { openCopyPreview(); return; }
  const { graph, name } = pendingImport, preview = mergeWorkspaces(library, graph);
  openSheet('Yükle', 'Ekle'); sheetContent.append(el('div', 'file-card', name),
    el('p', 'sheet-copy', `${graph.tuvaller.length} tuval, ${graph.kartlar.length} kart var; ${preview.addedCards.length} kart yeni.`));
  const actions = el('div', 'confirmation');
  actions.append(button('Vazgeç', closePanel, 'button secondary'), button('Ekle', async () => {
    if (locked && rawBroken === null) { notice('Kartlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return; }
    const merged = mergeWorkspaces(library, graph);
    try {
      const ids = new Set(merged.workspace.kartlar.map(card => card.fotoId).filter(Boolean));
      await importPhotos(graph.fotolar || [], ids);
      for (const id of ids) if (!await getPhoto(id)) throw new Error('Fotoğraf eksik');
    } catch { notice('Fotoğraf yedeği geçersiz. Kartlar değişmedi.'); return; }
    library = merged.workspace; if (!persist(store, rawBroken !== null)) return;
    const ids = new Set(merged.addedCards.map(card => card.id)), edgeIds = new Set(merged.addedEdges.map(ip => ip.id)), boards = new Set(merged.addedBoards.map(board => board.id));
    activeBoard = null; store = emptyGraph(); view.sade = false; view.target = null; current = null;
    sheet.close(); pushRoute({ card: null, panel: null, target: null }, true); invalidatePNG(); render(); saveView();
    setUndo(() => ({ surum: 3, tuvaller: library.tuvaller.filter(board => !boards.has(board.id)), kartlar: library.kartlar.filter(card => !ids.has(card.id)),
      ipler: library.ipler.filter(ip => !edgeIds.has(ip.id)) }), `${merged.addedCards.length} kart eklendi`);
  }, 'button'));
  sheetContent.append(actions, row('Yedekle', exportBackup, { glyph: 'backup' }));
}

function openCopyPreview() {
  const payload = pendingImport.payload; openSheet('Kopya', 'Kopya-al');
  const previewWorkspace = { surum: 3, tuvaller: [payload.tuval], kartlar: payload.kartlar, ipler: payload.ipler };
  const summary = el('div', 'copy-summary'), mini = previewBoard(payload.tuval, previewWorkspace), details = el('div');
  details.append(el('strong', '', payload.tuval.ad), el('small', '', `${payload.kartlar.length} kart${payload.fotolar.length ? ` · ${payload.fotolar.length} fotoğraf` : ''}`)); summary.append(mini, details); sheetContent.append(summary);
  const previous = library.tuvaller.find(board => board.kopyaKaynagi?.tuvalId === payload.tuval.id);
  if (previous) details.append(el('p', 'copy-duplicate', `Zaten var · ${new Date(previous.kopyaKaynagi.gonderim).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`));
  const actions = el('div', 'confirmation'); const add = button('Ekle', async () => {
    if (locked) return; add.disabled = true;
    try {
      const result = addCopy(library, payload), ids = new Set(result.photos.map(photo => photo.id)); await importPhotos(result.photos, ids);
      const before = library; library = result.workspace;
      if (!persist()) { library = before; retirePhotos(result.workspace.kartlar.filter(card => card.tuvalId === result.board.id)); add.disabled = false; return; }
      sheet.close(); pushRoute({ card: null, panel: null, target: null }, true); render();
      setUndo(() => { const next = deleteBoard(library, result.board.id); retirePhotos(result.workspace.kartlar.filter(card => card.tuvalId === result.board.id)); return next; }, 'Tuval eklendi');
    } catch { notice('Kopya eklenemedi. Hiçbir kart değişmedi.'); add.disabled = false; }
  }, 'button'); actions.append(button('Vazgeç', closePanel, 'button secondary'), add); sheetContent.append(actions);
}
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (locked && rawBroken === null) { notice('Kartlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return; }
  try { const text = await file.text(), data = JSON.parse(text); pendingImport = data?.app === 'sinaps' && data.tur === 'tuval' ? { copy: true, payload: parseCopy(text), name: file.name } : { graph: parseWorkspace(text), name: file.name }; openImportPreview(); }
  catch {
    openSheet('Yükle', 'Yükle-hata'); sheetContent.append(el('div', 'file-card', file.name),
      el('p', 'sheet-copy danger', 'Bu dosya yedek değil. Hiçbir kart değişmedi.'), button('Seç', pickFile, 'button secondary wide', 'upload'));
  }
});
function centerCamera() {
  view.highlight = null; canvas.cancel(); view.camera = view.sade ? fitCamera(scene(), viewport()) : { x: 0, y: 0, z: 1 };
  if (!view.sade) view.tamCamera = { ...view.camera }; saveView(); canvas.draw();
}
function warmActivePhotos() {
  warmPhotos(store.kartlar).then(() => { canvas.requestDraw(); if (current) render(); }).catch(() => notice('Fotoğraf açılamadı. Yedekten yükleyebilirsin.'));
}
function retirePhotos(cards, delay = 6500) {
  for (const id of new Set(cards.map(card => card?.fotoId).filter(Boolean))) setTimeout(() => {
    if (!library.kartlar.some(card => card.fotoId === id) && !store.kartlar.some(card => card.fotoId === id)) removePhoto(id).catch(() => {});
  }, delay);
}
function pickPhoto(id) { photoTarget = id; $('#photo-file').value = ''; $('#photo-file').click(); }
function requestPhoto(id) {
  const card = store.kartlar.find(card => card.id === id); if (!card || locked) return;
  view.highlight = null; canvas.requestDraw();
  if (!card.fotoId) { pickPhoto(id); return; }
  photoTarget = id; openSheet('Görsel', 'Fotoğraf');
  const change = row('Değiştir', () => pickPhoto(id), { glyph: 'photo' });
  const remove = row('Kaldır', () => {
    const old = card.fotoId;
    const removed = !hasCardText(card) ? deleteCard(store, id) : null;
    const next = removed?.store || { ...store, kartlar: store.kartlar.map(item => { if (item.id !== id) return item; const next = { ...item, degisme: new Date().toISOString() }; delete next.fotoId; return next; }) };
    if (!persist(next)) return;
    if (removed) { drafts.delete(id); current = null; entryCard = null; }
    sheet.close(); pushRoute({ card: current, panel: null, target: null }, true); render();
    setUndo(() => removed ? restoreDeleted(store, removed) : ({ ...store, kartlar: store.kartlar.map(item => item.id === id ? { ...item, fotoId: old } : item) }), removed ? 'Kart silindi' : 'Fotoğraf kaldırıldı'); retirePhotos([{ fotoId: old }]);
  }, { glyph: 'delete' }); remove.classList.add('danger'); sheetContent.append(change, remove);
}
function viewPhoto(id) {
  const card = store.kartlar.find(card => card.id === id); if (!card?.fotoId) return;
  openSheet('Fotoğraf', 'Fotoğraf-görsel'); sheet.classList.add('photo-viewer');
  const image = el('img', 'full-photo'); image.src = photoURL(card.fotoId); image.alt = cardTitle(card); sheetContent.append(image);
}
$('#photo-file').addEventListener('change', async event => {
  const file = event.target.files[0], id = photoTarget; if (!file || locked) return;
  let stage = 'encode';
  try {
    const record = await encodePhoto(file), card = store.kartlar.find(item => item.id === id); if (!card) return;
    stage = 'put'; await putPhoto(record); stage = 'warm'; await warmPhotos([{ fotoId: record.id }]);
    let next = { ...store, kartlar: store.kartlar.map(item => item.id === id ? { ...item, fotoId: record.id, degisme: new Date().toISOString() } : item) };
    next = positionCard(next, id, card.x, card.y, width());
    const beforeLibrary = library;
    if (!persist(next)) { library = beforeLibrary; await removePhoto(record.id); return; }
    if (sheet.open) { sheet.close(); pushRoute({ card: current, panel: null, target: null }, true); }
    view.highlight = null; render(); retirePhotos([card]);
  } catch (error) { console.warn('Fotoğraf:', stage, error?.name, error?.message); notice('Fotoğraf eklenemedi. Yeniden dene.'); }
});
function updateViewport() {
  const viewport = visualViewport, bottom = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard', `${bottom}px`); document.body.classList.toggle('keyboard', bottom > 100);
}
const canvas = new CanvasView($('#canvas'), {
  store: () => store, state: () => ({ ...view, locked, title: activeName() }), scene,
  onCard: selectCard, onPhoto: requestPhoto,
  onWireTap: beginLink,
  onWireDrop: wireDrop,
  onCamera(camera, done) { view.camera = camera; if (done) saveView(); },
  onDragStart: clearUndo,
  onMovePreview(id, x, y) { store = { ...store, kartlar: store.kartlar.map(card => card.id === id ? { ...card, x, y } : card) }; },
  onMoveDone(original) {
    const moved = store.kartlar.find(card => card.id === original.id); if (!moved) return;
    if (persist(positionCard(store, original.id, moved.x, moved.y, width()))) {
      setUndo(() => ({ ...store, kartlar: store.kartlar.map(card => card.id === original.id
        ? { ...card, x: original.x, y: original.y } : card) }), 'Kart taşındı');
    }
  },
  onMoveCancel(original) {
    if (original) store = { ...store, kartlar: store.kartlar.map(card => card.id === original.id ? { ...card, x: original.x, y: original.y } : card) };
  }
});
function renderPanel(kind) {
  if (kind === 'Çöp-menü') trashMenu(trashTarget); else if (kind === 'Çöp-sil') confirmTrash(trashTarget); else if (kind === 'Kart-sil') { openMenu(); sheetContent.lastElementChild.click(); } else if (kind === 'Genel') openGlobalSearch(); else if (kind === 'Fotoğraf') requestPhoto(photoTarget); else if (kind === 'Fotoğraf-görsel') viewPhoto(current); else if (kind === 'Ayarlar') openSettings(); else if (kind === 'Menü') openMenu();
  else if (kind === 'PDF') openPDF(); else if (kind === 'Paylaş') openShare(); else if (kind === 'Ara') openSearch(); else if (kind === 'Bağlar') openConnections();
  else if (kind === 'Yedek') openExport(true); else if (kind === 'Metin') openExport(false);
  else if (kind === 'Kopya-al') openCopyPreview(); else if (kind === 'Ekle') openImportPreview(); else if (kind === 'Tuval') openBoardMenu(); else openImport();
}
window.addEventListener('popstate', event => {
  let next = event.state ?? { card: null, target: null, panel: null };
  // Back from the writing page closes it, including after navigating through linked cards.
  if (current && !route.panel && !next.panel) {
    next = { board: activeBoard, card: null, target: null, panel: null }; history.replaceState(next, '', location.pathname);
  }
  if ((next.board ?? null) !== activeBoard) {
    if (next.board && library.tuvaller.some(board => board.id === next.board)) activateWorkspace(next.board, { record: false });
    else goHome({ record: false });
  }
  if (current && current !== next.card) cleanWriting();
  const nextCard = store.kartlar.find(card => card.id === next.card);
  if (current !== nextCard?.id) entryCard = nextCard ? { ...nextCard } : null;
  current = nextCard?.id ?? null; view.target = store.kartlar.some(card => card.id === next.target) ? next.target : null;
  trashOpen = next.trash === true;
  route = { board: activeBoard, card: current, target: view.target, panel: next.panel ?? null, trash: trashOpen };
  if (sheet.open) sheet.close(); render();
  if (route.panel && (!['Menü', 'Bağlar'].includes(route.panel) || current)) {
    restoring = true; try { renderPanel(route.panel); } finally { restoring = false; }
  }
});
$('#close-sheet').replaceChildren(icon('close')); $('#close-sheet').addEventListener('click', closePanel);
sheet.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
sheet.addEventListener('close', () => {
  if (!sheet.open) panelRoute = null; placeNotice();
  if (!sheet.open && focusReturn?.isConnected && !['INPUT', 'TEXTAREA'].includes(focusReturn.tagName)) focusReturn.focus();
  updateViewport();
});
sheet.addEventListener('click', event => {
  if (event.target !== sheet) return; const rect = sheet.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
});
let dragY = 0;
$('#sheet-handle').addEventListener('pointerdown', event => { dragY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); });
$('#sheet-handle').addEventListener('pointerup', event => { if (event.clientY - dragY > 110) closePanel(); });
window.visualViewport?.addEventListener('resize', updateViewport); window.visualViewport?.addEventListener('scroll', updateViewport);
window.addEventListener('resize', () => {
  sceneCache = null; if (view.sade) view.camera = fitCamera(scene(), viewport(), view.camera);
  invalidatePNG(); canvas.requestDraw(); updateViewport();
});
function flush() { clearTimeout(saveTimer); canvas.cancel(); persist(); saveView(); }
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else { sweepTrash(); if (!searchController) render(); } });
window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY && event.newValue !== lastSaved) || ([LEGACY_KEY, GRAPH_KEY].includes(event.key) && lastSaved === null)) {
    locked = true; clearTimeout(saveTimer); canvas.cancel();
    reportError('Kartlar başka bir sekmede değişti. Önce yedek al, sonra sayfayı yenile.');
    for (const input of document.querySelectorAll('#card-title,#card-description')) input.readOnly = true;
    paintToolbar();
  }
});
addEventListener('sinaps:pdf', () => { if (activeBoard && store.kartlar.length) openPDF(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePreference() === 'system') applyTheme('system', false); });
try {
  lastSaved = localStorage.getItem(STORAGE_KEY); library = loadWorkspace(localStorage);
  let saved = null; try { saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch {}
  const validCamera = camera => camera && [camera.x, camera.y, camera.z].every(Number.isFinite) && camera.z >= .001 && camera.z <= 4;
  if (saved?.tuvaller) Object.assign(viewLibrary.tuvaller, saved.tuvaller);
  activeBoard = library.tuvaller.some(board => board.id === saved?.sonTuvalId && !board.silinme) ? saved.sonTuvalId : null;
  store = boardGraph(library, activeBoard); const savedBoard = activeBoard && viewLibrary.tuvaller[activeBoard];
  if (savedBoard && validCamera(savedBoard.camera)) {
    view.camera = savedBoard.camera; view.sade = savedBoard.sade === true;
    view.tamCamera = validCamera(savedBoard.tamCamera) ? savedBoard.tamCamera : { ...savedBoard.camera };
  } else if (store.kartlar.length) { view.camera = { x: 0, y: 0, z: 1 }; view.tamCamera = { ...view.camera }; }
  view.camera = clampCamera(view.camera, scene(), viewport());
} catch {
  try { rawBroken = lastSaved ?? localStorage.getItem(GRAPH_KEY) ?? localStorage.getItem(LEGACY_KEY); } catch {}
  locked = true; reportError('Kayıt açılamadı. Yedek ile dosyanı koruyup yeniden yükleyebilirsin.');
}
sweepTrash();
document.title = APP_NAME; $('meta[name="apple-mobile-web-app-title"]').content = APP_NAME;
route = { ...route, board: activeBoard }; history.replaceState(route, '', location.pathname); applyTheme(themePreference(), false); render();
warmActivePhotos();
document.fonts.ready.then(() => { sceneCache = null; if (view.sade) view.camera = fitCamera(scene(), viewport(), view.camera); invalidatePNG(); canvas.requestDraw(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => notice('Çevrimdışı hazırlık tamamlanamadı.'));

if (sampleRequest && !locked) {
  loadSample(library, sampleRequest).then(result => {
    // Bring in any edits made while the local sample file was being read.
    const graph = boardGraph(result.workspace, result.board.id);
    library = mergeWorkspaces(library, { surum: 3, tuvaller: [result.board], kartlar: graph.kartlar, ipler: graph.ipler }).workspace;
    if (!persist()) return;
    activateWorkspace(result.board.id, { replace: true });
    view.sade = false; centerCamera(); render();
  }).catch(error => { console.warn('Örnek:', error); notice('Örnek yüklenemedi'); });
}
