import { STORAGE_KEY, emptyStore, loadStore, saveStore, children, title, ancestors, subtreeIds,
  addNote, editNote, moveNote, reorderNote, deleteNote, restoreNotes, backupJSON, parseBackup, exportText,
  mergeStores, searchNotes } from './model.js';
import { shareFile, datedName } from './files.js';

const $ = selector => document.querySelector(selector);
const sheet = $('#sheet');
const sheetContent = $('#sheet-content');
let store = emptyStore();
let current = null;
let locked = false;
let rawBroken = null;
let lastSaved = null;
let noticeTimer;
let observer;
let focusReturn;
let undoTimer;
let saveTimer;
let undoAction;
let persistentRequested = false;
let enteredText = '';
let lastBrandTap = 0;
let panelRoute = null;
let restoringPanel = false;
let pendingImport;
let meta = { sonYedek: null, yedektenSonraDegisti: false };
try { meta = { ...meta, ...JSON.parse(localStorage.getItem('dallanan-not-meta-v1') || '{}') }; } catch {}
function saveMeta() { try { localStorage.setItem('dallanan-not-meta-v1', JSON.stringify(meta)); } catch {} }
function backupDue() {
  const safariTab = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Android/.test(navigator.userAgent)
    && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
  const days = safariTab ? 3 : 7;
  return meta.yedektenSonraDegisti && (!meta.sonYedek ? store.notlar.length >= 10
    : Date.now() - Date.parse(meta.sonYedek) > days * 86400000);
}
function rememberNote() { try { localStorage.setItem('dallanan-not-last', current ?? ''); } catch {} }
const paths = {
  tree: '<path d="M5 4.5v13a2 2 0 0 0 2 2h3M5 10.5h5M14 10.5h5M14 19.5h5M9 4.5h10"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  text: '<path d="M5 6h14M5 10h14M5 14h9M5 18h11"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  move: '<path d="M5 4v7a3 3 0 0 0 3 3h11M15 10l4 4-4 4"/>',
  backup: '<path d="M7 17.5a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.4 8.6a4.2 4.2 0 0 1-.4 8.9H7ZM12 10.5v5.5m-2.4-2.2 2.4 2.4 2.4-2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  up: '<path d="m6 14.5 6-6 6 6"/>', down: '<path d="m6 9.5 6 6 6-6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  menu: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  brand: '<g transform="translate(-1.2 0)"><path d="M12 21v-7M12 14c0-4-2-6.5-5.5-8M12 14c0-3 1.8-5 4.8-5.8"/><circle cx="18.2" cy="7.8" r="2.1" fill="var(--iris)" stroke="none"/></g>'
};
function icon(name) {
  const holder = document.createElement('span');
  holder.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"${name === 'brand' ? ' class="brand"' : ''}>${paths[name]}</svg>`;
  return holder.firstElementChild;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, action, className = 'icon-button', glyph) {
  const node = el('button', className);
  node.type = 'button'; node.setAttribute('aria-label', label);
  if (glyph) node.append(icon(glyph));
  if (className !== 'icon-button') node.append(document.createTextNode(label));
  node.addEventListener('click', action);
  return node;
}
function reportError(message) {
  $('#save-error').textContent = message;
  $('#save-error').hidden = false;
  document.body.classList.add('locked');
}
function notice(message) {
  clearTimeout(noticeTimer);
  $('#notice').replaceChildren(document.createTextNode(message)); $('#notice').hidden = false;
  placeNotice();
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 4000);
}
function placeNotice() {
  const node = $('#notice');
  if (sheet.open) { sheetContent.append(node); node.classList.add('in-sheet'); }
  else { document.body.append(node); node.classList.remove('in-sheet'); }
}
function persist(next = store, force = false) {
  clearTimeout(saveTimer);
  if (locked && !force) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!force && raw !== lastSaved) {
      locked = true;
      reportError('Notlar başka bir sekmede değişti. Önce yedek al, sonra sayfayı yenile.');
      return false;
    }
    const changed = JSON.stringify(next) !== lastSaved;
    saveStore(localStorage, next);
    lastSaved = JSON.stringify(next);
    store = next; locked = false; rawBroken = null;
    if (changed) { meta.yedektenSonraDegisti = true; saveMeta(); }
    if (!persistentRequested && next.notlar.length) {
      persistentRequested = true;
      navigator.storage?.persist?.().catch(() => {});
    }
    $('#save-error').hidden = true; document.body.classList.remove('locked');
    return true;
  } catch {
    reportError('Kaydedilemedi. Notlarını korumak için Yedek kullan.');
    return false;
  }
}
function cleanupBlank() {
  clearTimeout(saveTimer);
  const note = store.notlar.find(item => item.id === current);
  if (note && !note.metin.trim() && !children(store, current).length) {
    const next = deleteNote(store, current).store;
    store = next;
    persist(next);
    if (enteredText.trim()) {
      setUndo(() => restoreNotes(store, [{ ...note, metin: enteredText }]));
    }
  } else if (note) {
    persist();
  }
}
function navigate(id, { push = true, focus = false } = {}) {
  cleanupBlank();
  current = id !== null && store.notlar.some(note => note.id === id) ? id : null;
  if (sheet.open) sheet.close();
  if (push) history.pushState({ note: current }, '', current === null ? location.pathname + location.search : `#not=${encodeURIComponent(current)}`);
  render();
  rememberNote();
  window.scrollTo(0, 0);
  if (focus) $('#note-text')?.focus();
}
function newBranch() {
  if (locked) { notice('Önce mevcut veriyi yedekle.'); return; }
  const existing = store.notlar.find(note => note.id === current);
  if (existing && !existing.metin.trim()) { $('#note-text')?.focus(); return; }
  if (existing && !persist()) return;
  clearUndo();
  const result = addNote(store, current);
  store = result.store;
  current = result.note.id;
  history.pushState({ note: current }, '', `#not=${encodeURIComponent(current)}`);
  render(); rememberNote(); window.scrollTo(0, 0); $('#note-text').focus();
}
function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
}
function themePreference() {
  try { return localStorage.getItem('dallanan-not-theme') || 'system'; } catch { return 'system'; }
}
function applyTheme(preference, save = true) {
  const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#11100e' : '#efebe2';
  if (save) { try { localStorage.setItem('dallanan-not-theme', preference); } catch {} }
}
function brandTap() {
  const now = Date.now();
  if (now - lastBrandTap < 300) { lastBrandTap = 0; toggleTheme(); }
  else lastBrandTap = now;
}
function countBadge(count) {
  const badge = el('span', 'branch-count'); badge.append(icon('brand'), document.createTextNode(String(count)));
  badge.querySelector('circle').setAttribute('fill', 'currentColor');
  badge.setAttribute('aria-label', `${count} dal`); return badge;
}
function render() {
  observer?.disconnect();
  const header = $('#header'); const content = $('#content'); const toolbar = $('#toolbar');
  header.replaceChildren(); content.replaceChildren(); toolbar.replaceChildren();
  const note = store.notlar.find(item => item.id === current);
  if (!note) {
    current = null;
    const heading = el('h1'); heading.id = 'brand-title'; heading.append(icon('brand'), document.createTextNode('Dallanan Not'));
    heading.addEventListener('click', brandTap); header.append(heading);
  } else {
    const nav = el('nav', 'breadcrumb'); nav.setAttribute('aria-label', 'Yol');
    const root = button('Kök', () => navigate(null), 'icon-button', 'brand');
    root.addEventListener('click', brandTap); nav.append(root);
    const path = ancestors(store, current).slice(0, -1);
    const shown = innerWidth < 400 ? 1 : 2;
    if (path.length > shown) {
      nav.append(button('…', () => openTree(), 'button quiet ellipsis'));
    }
    for (const ancestor of path.slice(-shown)) {
      nav.append(el('span', 'separator', '›'));
      const link = button(title(ancestor), () => navigate(ancestor.id), 'path-button');
      link.replaceChildren(el('span', '', title(ancestor))); nav.append(link);
    }
    header.append(nav);
  }
  const pill = el('div', 'toolbar-pill');
  pill.append(button('Ağaç', () => openTree(), 'icon-button', 'tree'),
    button(note ? 'Menü' : 'Ayarlar', note ? openMenu : openSettings, 'icon-button', note ? 'menu' : 'settings'));
  if (!note && backupDue()) pill.lastElementChild.classList.add('backup-due');
  header.append(pill);
  if (note) {
    enteredText = note.metin;
    const card = el('section', 'card note-card');
    const editor = el('textarea', 'editor'); editor.id = 'note-text'; editor.setAttribute('aria-label', 'Not');
    editor.placeholder = 'Yaz'; editor.spellcheck = false; editor.value = note.metin; editor.readOnly = locked;
    const fit = () => { editor.style.height = 'auto'; editor.style.height = `${editor.scrollHeight}px`; };
    editor.addEventListener('input', () => {
      store = editNote(store, current, editor.value); fit();
      clearTimeout(saveTimer); saveTimer = setTimeout(() => persist(), 300);
    });
    editor.addEventListener('focus', updateViewport); editor.addEventListener('blur', updateViewport);
    card.append(editor); content.append(card); fit();
    requestAnimationFrame(fit);
  }
  const branches = children(store, current);
  if (branches.length) {
    const list = el('section', 'card branches'); list.id = 'branches'; list.setAttribute('aria-label', 'Dallar');
    if (note) list.append(el('p', 'branch-label', 'Dallar'));
    for (const branch of branches) {
      const row = button(title(branch), () => navigate(branch.id), 'branch');
      row.replaceChildren(el('span', 'branch-name', title(branch)));
      const count = children(store, branch.id).length;
      if (count) row.append(countBadge(count));
      list.append(row);
    }
    content.append(list);
  } else if (!note) {
    const empty = el('div', 'empty');
    const create = button('Dal', newBranch, 'button accent', 'plus'); create.disabled = locked;
    const mark = icon('brand'); mark.classList.add('empty-brand');
    empty.append(mark, el('p', 'empty-label', 'Yaz'), create, button('Yükle', openImport, 'button quiet')); content.append(empty);
  }
  if (note) toolbar.append(button('Üst', () => navigate(note.ustId), 'button secondary', 'up'));
  else toolbar.append(el('span', 'spacer'));
  const jump = button(`${branches.length} dal`, () => $('#branches')?.scrollIntoView({ block: 'start' }), 'button quiet', 'down');
  jump.id = 'branch-jump'; jump.hidden = true; toolbar.append(jump);
  const create = button('Dal', newBranch, 'button accent', 'plus'); create.disabled = locked;
  if (!note && !branches.length) create.hidden = true;
  toolbar.append(create);
  if (note && branches.length) {
    observer = new IntersectionObserver(entries => { jump.hidden = entries[0].isIntersecting; }, { rootMargin: '0px 0px -110px 0px' });
    observer.observe($('#branches'));
  }
  updateViewport();
}

function openSheet(label, route = label) {
  const changedPanel = !sheet.open || panelRoute !== route;
  sheet.classList.remove('tall');
  $('#note-text')?.blur();
  clearTimeout(saveTimer);
  if (current !== null && store.notlar.find(note => note.id === current)?.metin.trim()) persist();
  if (!sheet.open) focusReturn = document.activeElement;
  if (!restoringPanel && (!sheet.open || panelRoute !== route)) {
    const replace = panelRoute === 'Menü' && ['Taşı', 'Sil'].includes(route);
    history[replace ? 'replaceState' : 'pushState']({ note: current, panel: route }, '', location.href);
  }
  panelRoute = route;
  $('#sheet-title').textContent = label;
  document.body.append($('#notice')); $('#notice').classList.remove('in-sheet');
  sheetContent.replaceChildren();
  $('#sheet-footer').replaceChildren(); $('#sheet-footer').hidden = true;
  if (!sheet.open) sheet.showModal();
  if (changedPanel) $('#sheet-title').focus({ preventScroll: true });
}
function closePanel() {
  if (history.state?.panel) history.back();
  else { sheet.close(); panelRoute = null; }
}
function row(label, action, extra) {
  const node = button(label, action, 'sheet-row');
  node.replaceChildren(el('span', 'row-text', label));
  if (extra) node.append(el('span', 'muted', extra));
  return node;
}
function clearUndo() {
  undoAction = null; clearTimeout(undoTimer);
  $('#notice').hidden = true;
}
function setUndo(action, message = '') {
  clearUndo(); clearTimeout(noticeTimer); undoAction = action;
  $('#notice').replaceChildren();
  if (message) $('#notice').append(el('span', 'undo-message', message));
  const undo = button('Geri al', () => {
    const next = undoAction?.();
    if (next && persist(next)) {
      clearUndo();
      if (current !== null && !store.notlar.some(note => note.id === current)) current = null;
      if (sheet.open) closePanel();
      render(); rememberNote(); notice('Geri alındı');
    }
  }, 'undo-button');
  $('#notice').append(undo); $('#notice').hidden = false;
  placeNotice();
  undoTimer = setTimeout(clearUndo, 6000);
}
function confirmAction(label, message, action, { backup = false } = {}) {
  openSheet(label);
  sheetContent.append(el('p', 'sheet-copy', message));
  const actions = el('div', 'confirmation');
  actions.append(button('Vazgeç', closePanel, 'button secondary'), button(label, action, label === 'Sil' ? 'button accent' : 'button'));
  sheetContent.append(actions);
  if (backup) sheetContent.append(row('Yedekle', exportBackup));
}
function openMenu() {
  openSheet(title(store.notlar.find(note => note.id === current)), 'Menü');
  sheetContent.append(row('Taşı', () => openTree(true)));
  const sort = el('div', 'sheet-row'); sort.append(el('span', 'row-text', 'Sırala'));
  const actions = el('div', 'inline-actions');
  const siblings = children(store, store.notlar.find(note => note.id === current).ustId);
  const index = siblings.findIndex(note => note.id === current);
  sort.append(el('span', 'muted', `${index + 1}/${siblings.length}`));
  for (const [label, direction, glyph] of [['Yukarı', -1, 'up'], ['Aşağı', 1, 'down']]) {
    const control = button(label, () => {
      const orders = new Map(siblings.map(note => [note.id, note.sira]));
      if (!persist(reorderNote(store, current, direction))) return;
      render(); openMenu();
      setUndo(() => ({ ...store, notlar: store.notlar.map(note => orders.has(note.id)
        ? { ...note, sira: orders.get(note.id) } : note) }));
    }, 'icon-button', glyph);
    control.disabled = locked || index + direction < 0 || index + direction >= siblings.length;
    actions.append(control);
  }
  sort.append(actions);
  sheetContent.append(sort, row('Paylaş', async () => {
    try { await shareFile(exportText(store, current), datedName('dal', 'txt'), 'text/plain;charset=utf-8'); }
    catch { notice('Paylaşılamadı. Yeniden dene.'); }
  }));
  const remove = row('Sil', () => {
    if (subtreeIds(store, current).size > 1) openDeleteConfirmation();
    else deleteCurrent();
  });
  remove.classList.add('danger'); remove.disabled = locked;
  sheetContent.append(remove);
  sheetContent.firstElementChild.disabled = locked;
}
function deleteCurrent() {
  const parent = store.notlar.find(note => note.id === current).ustId;
  const result = deleteNote(store, current);
  if (!persist(result.store)) return;
  navigate(parent);
  setUndo(() => restoreNotes(store, result.removed, result.links), `${result.removed.length} not silindi`);
}
function openDeleteConfirmation() {
  confirmAction('Sil', `${subtreeIds(store, current).size} notla birlikte silinsin mi?`, deleteCurrent);
}
function openTree(moving = false) {
  openSheet(moving ? 'Taşı' : 'Ağaç');
  sheet.classList.add('tall');
  const selected = store.notlar.find(note => note.id === current);
  const excluded = moving ? subtreeIds(store, current) : new Set();
  const expanded = new Set(ancestors(store, current).map(note => note.id));
  let target;
  const search = el('input', 'search'); search.type = 'search'; search.placeholder = 'Ara';
  search.setAttribute('aria-label', 'Ara'); search.autocomplete = 'off';
  const searchField = el('div', 'search-field'); searchField.append(icon('search'), search);
  const list = el('div', 'tree-list');
  sheetContent.append(searchField, list);
  const moveButton = button('Taşı', () => performMove(target), 'button wide', 'move');
  moveButton.disabled = true;
  if (moving) { $('#sheet-footer').append(moveButton); $('#sheet-footer').hidden = false; }
  const performMove = id => {
    const old = { ...selected };
    if (selected.ustId === id) { closePanel(); return; }
    if (!persist(moveNote(store, current, id))) return;
    closePanel(); render();
    setUndo(() => ({ ...store, notlar: store.notlar.map(note => note.id === old.id
      ? { ...note, ustId: old.ustId, sira: old.sira } : note) }));
  };
  const choose = id => {
    if (!moving) { navigate(id); return; }
    target = id; moveButton.disabled = false; draw();
  };
  const draw = () => {
    list.replaceChildren();
    if (moving) {
      const root = row('Kök', () => choose(null)); root.classList.add('tree-root');
      if (selected.ustId === null) { root.setAttribute('aria-current', 'true'); root.classList.add('current-parent'); }
      if (target === null) { root.classList.add('selected-target'); root.append(icon('check')); }
      list.append(root);
    }
    const searching = search.value.trim().length > 0;
    const queue = (searching ? searchNotes(store, search.value) : children(store))
      .map(note => ({ note, depth: 0 })).reverse();
    while (queue.length) {
      const { note, depth } = queue.pop();
      const nested = children(store, note.id);
      const entry = el('div', `tree-row${depth ? ' nested' : ''}`);
      entry.style.paddingLeft = `${Math.min(depth, 4) * 22}px`;
      const currentParent = moving && note.id === selected.ustId;
      if (currentParent || (!moving && note.id === current)) {
        entry.classList.add(moving ? 'current-parent' : 'current'); entry.setAttribute('aria-current', 'true');
      }
      if (moving && note.id === target) entry.classList.add('selected-target');
      if (nested.length && !searching) {
        const toggle = button(expanded.has(note.id) ? 'Katla' : 'Aç', () => {
          if (expanded.has(note.id)) expanded.delete(note.id); else expanded.add(note.id);
          draw();
        }, 'tree-toggle', expanded.has(note.id) ? 'down' : 'right');
        // Glyph buttons have their label in aria-label only.
        toggle.lastChild.nodeType === Node.TEXT_NODE && toggle.lastChild.remove();
        toggle.setAttribute('aria-expanded', String(expanded.has(note.id))); entry.append(toggle);
      } else entry.append(el('span', 'tree-toggle-placeholder'));
      const name = button(title(note), () => choose(note.id), 'tree-name');
      name.replaceChildren(el('span', '', title(note)));
      name.disabled = moving && excluded.has(note.id);
      if (searching) {
        name.classList.add('search-result');
        name.append(el('small', '', ancestors(store, note.id).slice(0, -1).map(title).join(' › ') || 'Kök'));
      }
      entry.append(name);
      if (nested.length && !currentParent) entry.append(countBadge(nested.length));
      if (moving && note.id === target) entry.append(icon('check'));
      if (moving && excluded.has(note.id)) entry.classList.add('excluded');
      list.append(entry);
      if (!searching && expanded.has(note.id)) {
        for (let i = nested.length - 1; i >= 0; i--) queue.push({ note: nested[i], depth: depth + 1 });
      }
    }
  };
  search.addEventListener('input', draw); draw();
  list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}

async function exportBackup() {
  clearTimeout(saveTimer);
  if (!locked) persist();
  const snapshot = JSON.stringify(store);
  try {
    const shared = await shareFile(rawBroken ?? backupJSON(store), datedName('yedek', 'json'), 'application/json');
    if (shared && !rawBroken && snapshot === JSON.stringify(store)) {
      meta.sonYedek = new Date().toISOString(); meta.yedektenSonraDegisti = false; saveMeta();
      $('#header .backup-due')?.classList.remove('backup-due');
      if ($('#sheet-title').textContent === 'Ayarlar') openSettings();
    }
  } catch { notice('Yedek alınamadı. Yeniden dene.'); }
}
function openSettings() {
  openSheet('Ayarlar');
  const days = meta.sonYedek ? Math.max(0, Math.floor((Date.now() - Date.parse(meta.sonYedek)) / 86400000)) : null;
  const themes = el('div', 'theme-controls'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', 'Tema');
  for (const [label, value] of [['Sistem', 'system'], ['Açık', 'light'], ['Koyu', 'dark']]) {
    const control = button(label, () => { applyTheme(value); openSettings(); }, 'theme-button');
    control.setAttribute('aria-pressed', String(themePreference() === value)); themes.append(control);
  }
  const backupRow = row('Yedek', () => openExport(true), days === null ? 'Hiç' : days === 0 ? 'Bugün' : `${days} gün önce`);
  if (backupDue()) backupRow.insertBefore(el('span', 'backup-dot'), backupRow.lastElementChild);
  const settingsRows = [[backupRow, 'backup'], [row('Metin', () => openExport(false)), 'text'], [row('Yükle', openImport), 'upload']];
  for (const [setting, glyph] of settingsRows) {
    setting.classList.add('settings-row'); setting.prepend(icon(glyph)); setting.append(icon('right'));
  }
  sheetContent.append(el('p', 'branch-label', 'Tema'), themes, el('hr', 'sheet-divider'),
    ...settingsRows.map(([setting]) => setting),
    el('p', 'sheet-copy', 'Notların yalnız bu telefonda saklanır. Telefon değişirse yedekten geri yüklenir.'));
}
function openExport(backup = true) {
  openSheet(backup ? 'Yedek' : 'Metin');
  sheetContent.append(el('p', 'sheet-copy', backup
    ? 'Bütün notlar tek dosyada. Cihaz değişirse bu dosyadan geri yüklenir.'
    : 'Bütün notlar numaralı düz metin olarak. Her yerde okunur, geri yüklenmez.'));
  const file = el('div', 'file-card');
  file.append(el('p', '', datedName(backup ? 'yedek' : 'notlar', backup ? 'json' : 'txt')),
    el('p', 'muted', `${store.notlar.length} not`));
  sheetContent.append(file);
  if (!backup) sheetContent.append(el('pre', 'text-preview', exportText(store).slice(0, 400)));
  sheetContent.append(button('Paylaş', backup ? exportBackup : async () => {
    try { await shareFile(exportText(store), datedName('notlar', 'txt'), 'text/plain;charset=utf-8'); }
    catch { notice('Dışa aktarılamadı. Yeniden dene.'); }
  }, 'button wide'));
}
function pickFile() { $('#import-file').value = ''; $('#import-file').click(); }
function openImport() {
  openSheet('Yükle');
  sheetContent.append(el('p', 'sheet-copy', 'Bir yedek dosyası seç. Var olan notların silinmez, aynı not iki kez eklenmez.'),
    button('Dosya', pickFile, 'button secondary wide'));
}
function openImportPreview() {
  if (!pendingImport) { openImport(); return; }
  const { incoming, name } = pendingImport;
  const preview = mergeStores(store, incoming);
  confirmAction('Ekle', `${incoming.notlar.length} not var, ${preview.added.length} yeni. Cihazındaki notlar korunur.`, () => {
    if (locked && rawBroken === null) { notice('Notlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return; }
    const merged = mergeStores(store, incoming);
    if (!persist(merged.store, rawBroken !== null)) return;
    const ids = new Set(merged.added.map(note => note.id));
    const linkIds = new Set(merged.links.map(link => link.id));
    navigate(null);
    setUndo(() => ({ ...store, notlar: store.notlar.filter(note => !ids.has(note.id)),
      baglar: store.baglar.filter(link => !linkIds.has(link.id)) }), `${merged.added.length} not eklendi`);
  }, { backup: backupDue() });
  $('#sheet-title').textContent = 'Yükle';
  sheetContent.prepend(el('div', 'file-card', name));
}
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (locked && rawBroken === null) {
    notice('Notlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return;
  }
  try {
    const incoming = parseBackup(await file.text(), false);
    pendingImport = { incoming, name: file.name }; openImportPreview();
  } catch {
    openSheet('Yükle', 'Yükle-hata');
    sheetContent.append(el('div', 'file-card', file.name),
      el('p', 'sheet-copy danger', 'Bu dosya yedek değil. Hiçbir not değişmedi.'),
      button('Seç', pickFile, 'button secondary wide'));
  }
});
function updateViewport() {
  const viewport = window.visualViewport;
  const bottom = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard', `${bottom}px`);
  document.body.classList.toggle('keyboard', bottom > 100);
}
function flush() {
  clearTimeout(saveTimer);
  const note = store.notlar.find(item => item.id === current);
  // A brand-new empty draft never reaches persistent storage.
  if (note && !note.metin.trim() && !children(store, current).length) {
    const inMemory = store;
    const next = deleteNote(store, current).store;
    persist(next); store = inMemory; rememberNote(); return;
  }
  persist(); rememberNote();
}
$('#close-sheet').append(icon('close'));
$('#close-sheet').addEventListener('click', closePanel);
sheet.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
sheet.addEventListener('close', () => {
  if (!sheet.open) panelRoute = null;
  placeNotice();
  if (focusReturn?.isConnected && focusReturn.tagName !== 'TEXTAREA') focusReturn.focus();
  updateViewport();
});
sheet.addEventListener('click', event => {
  if (event.target !== sheet) return;
  const rect = sheet.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
});
let dragY = 0;
$('#sheet-handle').addEventListener('pointerdown', event => {
  dragY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId);
});
$('#sheet-handle').addEventListener('pointerup', event => { if (event.clientY - dragY > 100) closePanel(); });
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
window.addEventListener('resize', updateViewport);
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('popstate', event => {
  const id = event.state?.note ?? null;
  navigate(id, { push: false });
  const route = event.state?.panel;
  if (!route || (current === null && ['Menü', 'Sil', 'Taşı'].includes(route))) return;
  restoringPanel = true;
  try {
    if (route === 'Ayarlar') openSettings();
    else if (route === 'Ağaç') openTree();
    else if (route === 'Taşı') openTree(true);
    else if (route === 'Menü') openMenu();
    else if (route === 'Sil') openDeleteConfirmation();
    else if (route === 'Yedek') openExport(true);
    else if (route === 'Metin') openExport(false);
    else if (route === 'Ekle') openImportPreview();
    else openImport();
  } finally { restoringPanel = false; }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themePreference() === 'system') applyTheme('system', false);
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && event.newValue !== lastSaved) {
    locked = true; clearTimeout(saveTimer);
    reportError('Notlar başka bir sekmede değişti. Önce yedek al, sonra sayfayı yenile.');
    $('#note-text')?.setAttribute('readonly', '');
  }
});
try {
  lastSaved = localStorage.getItem(STORAGE_KEY);
  store = loadStore(localStorage);
  const savedNote = localStorage.getItem('dallanan-not-last');
  const requested = new URLSearchParams(location.hash.slice(1)).get('not') || savedNote;
  current = store.notlar.some(note => note.id === requested) ? requested : null;
} catch {
  rawBroken = lastSaved;
  locked = true;
  reportError('Kayıt açılamadı. Yedek ile dosyanı koruyup yeniden yükleyebilirsin.');
}
history.replaceState({ note: current }, '', current === null ? location.pathname + location.search : `#not=${encodeURIComponent(current)}`);
render();
$('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#11100e' : '#efebe2';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => notice('Çevrimdışı hazırlık tamamlanamadı.'));
