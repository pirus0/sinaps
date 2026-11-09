import { app } from './app.js';
import { restoreBoard, boardName, boardGraph, deleteBoard, purgeExpired } from './workspace.js';
import { row, el, button, $ } from './ui.js';
import { emptyGraph } from './graph.js';

export function openTrash() {
  app.goHome({ record: false }); app.trashOpen = true; app.pushRoute({ card: null, panel: null, target: null, trash: true }); app.render();
}

export function rescueBoard(id) {
  app.library = restoreBoard(app.library, id); if (!app.persist()) return;
  if (app.sheet.open) app.sheet.close(); app.pushRoute({ card: null, panel: null, target: null, trash: true }, true); app.render();
}

export function trashMenu(id) {
  app.trashTarget = id; const board = app.library.tuvaller.find(board => board.id === id); if (!board) return;
  app.openSheet(boardName(app.library, board), 'Çöp-menü'); app.sheetContent.append(row('Kurtar', () => rescueBoard(id)), row('Sil', () => confirmTrash(id), { glyph: 'delete' }));
}

export function confirmTrash(id = null) {
  app.trashTarget = id; const board = id && app.library.tuvaller.find(board => board.id === id); app.openSheet(board ? boardName(app.library, board) : 'Çöp', 'Çöp-sil'); app.sheetContent.append(el('p', 'sheet-copy', id ? 'Tuval kalıcı olarak silinsin mi? Geri alınamaz.' : 'Çöp boşaltılsın mı? Geri alınamaz.'));
  const actions = el('div', 'confirmation'); actions.append(button('Vazgeç', app.closePanel, 'button secondary'), button('Sil', () => {
    app.clearUndo(); const boards = app.library.tuvaller.filter(board => board.silinme && (!id || board.id === id)), cards = boards.flatMap(board => boardGraph(app.library, board.id).kartlar);
    for (const board of boards) app.library = deleteBoard(app.library, board.id); if (!app.persist()) return;
    app.retirePhotos(cards, 0); app.sheet.close(); app.pushRoute({ card: null, panel: null, target: null, trash: true }, true); app.render();
  }, 'button accent', 'delete')); app.sheetContent.append(actions);
}

export function renderTrash() {
  $('#board').hidden = true; $('#app').className = 'home-route'; document.body.classList.remove('canvas-page');
  const header = $('#header'), content = $('#content'); header.className = 'trash-header'; const back = button('Tuvaller', app.goHome, 'icon-button', 'left'); back.classList.add('board-back'); header.replaceChildren(back, el('h1', '', 'Çöp'));
  const boards = app.library.tuvaller.filter(board => board.silinme); if (boards.length) header.append(button('Boşalt', () => confirmTrash(), 'button quiet'));
  content.className = 'trash-list'; content.replaceChildren(); const card = el('section', 'trash-card'); content.append(card); $('#toolbar').hidden = true;
  if (!boards.length) content.append(el('p', 'empty-label', 'Boş'));
  for (const board of boards) {
    const entry = el('div', 'trash-row'), label = el('div'), days = Math.max(0, Math.ceil(30 - (Date.now() - Date.parse(board.silinme)) / 86400000));
    label.append(el('strong', '', boardName(app.library, board)), el('small', '', `${days} gün kaldı`)); entry.append(label, button('Kurtar', () => rescueBoard(board.id), 'button secondary'));
    let timer; entry.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; timer = setTimeout(() => trashMenu(board.id), 400); });
    for (const type of ['pointerup', 'pointercancel', 'pointermove']) entry.addEventListener(type, () => clearTimeout(timer));
    entry.addEventListener('contextmenu', event => { event.preventDefault(); trashMenu(board.id); }); card.append(entry);
  }
  if (boards.length) content.append(el('p', 'sheet-copy', '30 gün sonra kendiliğinden silinir'));
}

export function sweepTrash() {
  if (app.locked) return; const result = purgeExpired(app.library); if (!result.expired.length) return;
  app.library = result.workspace;
  if (app.activeBoard && !app.library.tuvaller.some(board => board.id === app.activeBoard)) { app.activeBoard = null; app.current = null; app.store = emptyGraph(); }
  if (app.persist()) app.retirePhotos(result.removedCards, 0);
}
