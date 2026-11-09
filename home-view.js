import { app } from './app.js';
import { previewBoard as boardPreview } from './board-preview.js';
import { $, el, icon, button, row } from './ui.js';
import { APP_NAME } from './brand.js';
import { brandTap } from './theme.js';
import { openSettings, openImport } from './backup-sheets.js';
import { boardName, trashBoard, restoreBoard } from './workspace.js';
import { openTrash } from './trash-view.js';

export function previewBoard(board, source = app.library) { return boardPreview(board, source); }

export function renderHome() {
  $('#board').hidden = true; $('#app').className = 'home-route'; document.body.classList.remove('canvas-page');
  const header = $('#header'), content = $('#content'); header.className = ''; header.replaceChildren(); content.replaceChildren(); content.className = 'board-grid';
  const heading = el('h1'); heading.id = 'brand-title'; heading.append(icon('brand'), document.createTextNode(APP_NAME)); heading.setAttribute('aria-label', APP_NAME); heading.addEventListener('click', brandTap);
  const pill = el('div', 'toolbar-pill'), settings = button('Ayarlar', openSettings, 'icon-button', 'settings');
  pill.append(settings, button('Ara', app.openGlobalSearch, 'icon-button', 'search')); header.append(heading, pill);
  for (const board of app.library.tuvaller.filter(board => !board.silinme).sort((a, b) => Date.parse(b.sonAcilma) - Date.parse(a.sonAcilma))) {
    let held = false, timer;
    const tile = button(boardName(app.library, board), () => { if (!held) app.activateWorkspace(board.id); }, 'board-tile'); tile.dataset.board = board.id;
    const label = el('span', 'board-label'); label.append(el('span', '', boardName(app.library, board)),
      el('small', '', `${app.library.kartlar.filter(card => card.tuvalId === board.id).length} kart`));
    tile.replaceChildren(previewBoard(board), label);
    tile.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; app.boardMenuId = board.id; openBoardMenu(); }, 400); });
    tile.addEventListener('pointerup', () => clearTimeout(timer)); tile.addEventListener('pointercancel', () => clearTimeout(timer));
    tile.addEventListener('pointermove', () => clearTimeout(timer)); tile.addEventListener('keydown', () => { held = false; });
    tile.addEventListener('contextmenu', event => { event.preventDefault(); held = true; app.boardMenuId = board.id; openBoardMenu(); }); content.append(tile);
  }
  const trashed = app.library.tuvaller.filter(board => board.silinme);
  if (trashed.length) { const trash = row('Çöp', openTrash, { glyph: 'delete', value: String(trashed.length), arrow: true }); trash.classList.add('trash-entry'); content.append(trash); }
  if (!app.library.tuvaller.some(board => !board.silinme)) {
    content.className = 'home-empty'; const empty = el('div', 'empty'), mark = icon('brand'); mark.classList.add('empty-brand');
    const create = button('Yeni', app.createWorkspace, 'button accent', 'plus'); create.disabled = app.locked;
    empty.append(mark, el('p', 'empty-label', 'Boş'), create, button('Yükle', openImport, 'button quiet', 'upload')); content.append(empty); if (trashed.length) content.append(row('Çöp', openTrash, { glyph: 'delete', value: String(trashed.length), arrow: true }));
  }
  app.paintToolbar(); app.updateViewport();
}

export function openBoardMenu() {
  const board = app.library.tuvaller.find(item => item.id === app.boardMenuId); if (!board) return;
  app.openSheet(boardName(app.library, board), 'Tuval');
  app.sheetContent.append(row('Adlandır', () => app.activateWorkspace(board.id, { fresh: true, replace: true })), el('hr', 'sheet-divider'),
    row('Sil', () => {
      app.library = trashBoard(app.library, board.id); if (!app.persist()) return;
      app.sheet.close(); app.pushRoute({ card: null, panel: null, target: null }, true); app.render();
      app.setUndo(() => restoreBoard(app.library, board.id), 'Çöp kutusuna taşındı');
    }, { glyph: 'delete' }));

}
