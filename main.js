import { STORAGE_KEY as GRAPH_KEY, LEGACY_KEY, emptyGraph, addCard, editCard, positionCard, connectCards, disconnect, linked, deleteCard, restoreDeleted, hasCardText, spaceCards } from './graph.js';
import { cardWidth, makeScene, fitCamera, clampCamera } from './scene.js';
import { CanvasView } from './canvas-view.js';
import { textMeasure } from './png.js';
import { setTextMeasure } from './card-text.js';
import { releasePhotos, photoURL } from './photos.js';
import { loadSample } from './sample.js';
import { APP_NAME } from './brand.js';
import { $, el, button, icon } from './ui.js';
import { WORKSPACE_KEY as STORAGE_KEY, WORKSPACE_VIEW_KEY as VIEW_KEY, emptyWorkspace, loadWorkspace, boardGraph, putBoardGraph, newBoard, boardName, deleteBoard, mergeWorkspaces } from './workspace.js';
import { openPDF } from './pdf-sheet.js';
import { themePreference, applyTheme } from './theme.js';
import { invalidatePNG, prepareShare, openShare } from './share-sheet.js';
import { trashMenu, confirmTrash, renderTrash, sweepTrash } from './trash-view.js';
import { openSettings, openExport, openImport, openImportPreview, openCopyPreview } from './backup-sheets.js';
import { warmActivePhotos, retirePhotos, requestPhoto, viewPhoto } from './photo-flow.js';
import { renderHome, openBoardMenu, previewBoard } from './home-view.js';
import { openSearch, openGlobalSearch } from './header-search.js';
import { openMenu, openConnections } from './card-menu.js';
import { app } from './app.js';

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
// Shared state and helpers the feature modules reach through `app` (see app.js).
Object.defineProperties(app, {
  activateWorkspace: { get: () => activateWorkspace },
  activeBoard: { get: () => activeBoard, set: value => { activeBoard = value; } },
  activeName: { get: () => activeName },
  boardMenuId: { get: () => boardMenuId, set: value => { boardMenuId = value; } },
  canvas: { get: () => canvas },
  clearUndo: { get: () => clearUndo },
  closePanel: { get: () => closePanel },
  createWorkspace: { get: () => createWorkspace },
  current: { get: () => current, set: value => { current = value; } },
  drafts: { get: () => drafts },
  entryCard: { get: () => entryCard, set: value => { entryCard = value; } },
  focusCard: { get: () => focusCard },
  goHome: { get: () => goHome },
  invalidatePNG: { get: () => invalidatePNG },
  lastBrandTap: { get: () => lastBrandTap, set: value => { lastBrandTap = value; } },
  library: { get: () => library, set: value => { library = value; } },
  locked: { get: () => locked, set: value => { locked = value; } },
  meta: { get: () => meta, set: value => { meta = value; } },
  notice: { get: () => notice },
  openCard: { get: () => openCard },
  openGlobalSearch: { get: () => openGlobalSearch },
  openSheet: { get: () => openSheet },
  paintToolbar: { get: () => paintToolbar },
  pendingImport: { get: () => pendingImport, set: value => { pendingImport = value; } },
  persist: { get: () => persist },
  photoTarget: { get: () => photoTarget, set: value => { photoTarget = value; } },
  png: { get: () => png, set: value => { png = value; } },
  pngEpoch: { get: () => pngEpoch, set: value => { pngEpoch = value; } },
  previewBoard: { get: () => previewBoard },
  pushRoute: { get: () => pushRoute },
  rawBroken: { get: () => rawBroken, set: value => { rawBroken = value; } },
  render: { get: () => render },
  restoring: { get: () => restoring, set: value => { restoring = value; } },
  retirePhotos: { get: () => retirePhotos },
  saveMeta: { get: () => saveMeta },
  saveView: { get: () => saveView },
  searchController: { get: () => searchController, set: value => { searchController = value; } },
  searchQueries: { get: () => searchQueries },
  setUndo: { get: () => setUndo },
  sheet: { get: () => sheet },
  sheetContent: { get: () => sheetContent },
  showCanvas: { get: () => showCanvas },
  store: { get: () => store, set: value => { store = value; } },
  trashOpen: { get: () => trashOpen, set: value => { trashOpen = value; } },
  trashTarget: { get: () => trashTarget, set: value => { trashTarget = value; } },
  updateViewport: { get: () => updateViewport },
  view: { get: () => view },
  width: { get: () => width },
});
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
function setUndo(action, message, duration = 6000) {
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
  $('#notice').hidden = false; placeNotice(); undoTimer = setTimeout(clearUndo, duration);
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
// Cards grow with their text; keep them from covering each other (graph.js spaceCards).
function makeRoom() {
  if (!activeBoard || locked) return; const next = spaceCards(store, width());
  if (next !== store) persist(next);
}
function showCanvas({ focus = null, pair = false, replace = false } = {}) {
  cleanWriting(); current = null; entryCard = null; view.target = null; makeRoom();
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
  canvas.cancel(); clearUndo(); activeBoard = id; current = null; entryCard = null; store = boardGraph(library, id); makeRoom();
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
  releasePhotos();
  if (sheet.open) sheet.close(); if (record) pushRoute({ card: null, panel: null, target: null });
  render(); saveView();
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
  const toolbar = $('#toolbar'); toolbar.replaceChildren(); toolbar.hidden = !!view.target;
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

function centerCamera() {
  view.highlight = null; canvas.cancel(); view.camera = view.sade ? fitCamera(scene(), viewport()) : { x: 0, y: 0, z: 1 };
  if (!view.sade) view.tamCamera = { ...view.camera }; saveView(); canvas.draw();
}
function updateViewport() {
  const viewport = visualViewport, bottom = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard', `${bottom}px`); document.body.classList.toggle('keyboard', bottom > 100);
}
const canvas = new CanvasView($('#canvas'), {
  store: () => store, state: () => ({ ...view, locked, title: activeName(), board: activeBoard }), scene,
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
        ? { ...card, x: original.x, y: original.y } : card) }), 'Kart taşındı', 3000);
    }
  },
  onTrashDrop(original) {
    const record = deleteCard(store, original.id); if (!record.card || !persist(record.store)) return;
    drafts.delete(original.id); view.highlight = null;
    setUndo(() => restoreDeleted(store, { ...record, card: { ...record.card, x: original.x, y: original.y } }), 'Kart silindi');
    retirePhotos([record.card]); render();
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
// Card lines are wrapped with the real Geist metrics; re-measure once the fonts have loaded.
function measureCards() {
  try { setTextMeasure(textMeasure('600 15.5px Geist'), textMeasure('400 13.5px Geist')); } catch { return; }
  sceneCache = null; invalidatePNG(); makeRoom(); if (activeBoard && !current) canvas.requestDraw();
}
measureCards();
Promise.all([document.fonts?.load('600 15.5px Geist'), document.fonts?.load('400 13.5px Geist')]).then(measureCards).catch(() => {});
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
