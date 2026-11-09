import { app } from './app.js';
import { row, el, button, $ } from './ui.js';
import { backupWorkspace, workspaceText, mergeWorkspaces, deleteBoard, parseWorkspace } from './workspace.js';
import { exportPhotos, importPhotos, getPhoto } from './photos.js';
import { datedName, sharePrepared, downloadFile } from './files.js';
import { APP_NAME } from './brand.js';
import { emptyGraph } from './graph.js';
import { invalidatePNG } from './share-sheet.js';
import { addCopy, parseCopy } from './copy.js';

export function openSettings() {
  app.openSheet('Ayarlar');
  const days = app.meta.sonYedek ? Math.max(0, Math.floor((Date.now() - Date.parse(app.meta.sonYedek)) / 86400000)) : null;
  const backup = row('Yedek', () => openExport(true), { value: days === null ? 'Hiç' : days === 0 ? 'Bugün' : `${days} gün önce`, glyph: 'backup', arrow: true });
  backupSize().then(size => { const value = backup.querySelector('.muted'); if (value?.isConnected) value.textContent += ' · ' + bytesLabel(size); }).catch(() => {});
  app.sheetContent.append(backup,
    row('Metin', () => openExport(false), { glyph: 'text', arrow: true }), row('Yükle', openImport, { glyph: 'upload', arrow: true }),
    el('p', 'sheet-copy', 'Kartların yalnız bu telefonda saklanır. Telefon değişirse yedekten geri yüklenir.'));
}

export function bytesLabel(size) { return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`; }

export async function backupContent() {
  if (app.rawBroken) return app.rawBroken;
  const result = JSON.parse(backupWorkspace(app.library)); result.data.fotolar = await exportPhotos(app.library.kartlar);
  return JSON.stringify(result, null, 2);
}

export async function backupSize() { return new Blob([await backupContent()]).size; }

export function openExport(backup) {
  app.openSheet(backup ? 'Yedek' : 'Metin');
  app.sheetContent.append(el('p', 'sheet-copy', backup ? 'Bütün tuvaller, kartlar ve fotoğraflar tek dosyada.' : 'Kartlar düz metin olarak. Her yerde okunur, geri yüklenmez.'));
  const file = el('div', 'file-card'), details = el('p', 'muted', 'Hazırlanıyor');
  file.append(el('p', '', datedName(backup ? 'yedek' : 'kartlar', backup ? 'json' : 'txt')), details); app.sheetContent.append(file);
  if (!backup) app.sheetContent.append(el('pre', 'text-preview', workspaceText(app.library).slice(0, 500)));
  let ready, snapshot, retry = false;
  const send = button('Paylaş', async () => {
    if (!ready) return;
    let result = await sharePrepared(ready, APP_NAME);
    if (result === 'activation') { if (retry) { downloadFile(ready); result = 'downloaded'; } else { retry = true; send.replaceChildren(document.createTextNode('Gönder')); send.setAttribute('aria-label', 'Gönder'); return; } }
    if (backup && ['shared', 'downloaded'].includes(result) && !app.rawBroken && snapshot === JSON.stringify(app.library)) {
      app.meta.sonYedek = new Date().toISOString(); app.saveMeta();
    }
  }, 'button wide', 'share'); send.disabled = true; app.sheetContent.append(send);
  (async () => {
    if (!app.locked) app.persist(); snapshot = JSON.stringify(app.library);
    const content = backup ? await backupContent() : workspaceText(app.library);
    ready = new File([content], datedName(backup ? 'yedek' : 'kartlar', backup ? 'json' : 'txt'), { type: backup ? 'application/json' : 'text/plain;charset=utf-8' });
    details.textContent = `${bytesLabel(ready.size)} · ${app.library.kartlar.length} kart · ${app.meta.sonYedek ? 'son yedek ' + app.meta.sonYedek.slice(0, 10) : 'son yedek yok'}`; send.disabled = false;
  })().catch(() => { details.textContent = 'Yedek hazırlanamadı'; });
}

export function exportBackup() { openExport(true); }

export function pickFile() { $('#import-file').value = ''; $('#import-file').click(); }

export function openImport() {
  app.openSheet('Yükle'); app.sheetContent.append(el('p', 'sheet-copy', 'Bir yedek seç. Var olan kartların silinmez, aynı kart iki kez eklenmez.'),
    button('Dosya', pickFile, 'button secondary wide', 'upload'));
}

export function openImportPreview() {
  if (!app.pendingImport) { openImport(); return; }
  if (app.pendingImport.copy) { openCopyPreview(); return; }
  const { graph, name } = app.pendingImport, preview = mergeWorkspaces(app.library, graph);
  app.openSheet('Yükle', 'Ekle'); app.sheetContent.append(el('div', 'file-card', name),
    el('p', 'sheet-copy', `${graph.tuvaller.length} tuval, ${graph.kartlar.length} kart var; ${preview.addedCards.length} kart yeni.`));
  const actions = el('div', 'confirmation');
  actions.append(button('Vazgeç', app.closePanel, 'button secondary'), button('Ekle', async () => {
    if (app.locked && app.rawBroken === null) { app.notice('Kartlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return; }
    const merged = mergeWorkspaces(app.library, graph);
    try {
      const ids = new Set(merged.workspace.kartlar.map(card => card.fotoId).filter(Boolean));
      await importPhotos(graph.fotolar || [], ids);
      for (const id of ids) if (!await getPhoto(id)) throw new Error('Fotoğraf eksik');
    } catch { app.notice('Fotoğraf yedeği geçersiz. Kartlar değişmedi.'); return; }
    app.library = merged.workspace; if (!app.persist(app.store, app.rawBroken !== null)) return;
    const ids = new Set(merged.addedCards.map(card => card.id)), edgeIds = new Set(merged.addedEdges.map(ip => ip.id)), boards = new Set(merged.addedBoards.map(board => board.id));
    app.activeBoard = null; app.store = emptyGraph(); app.view.sade = false; app.view.target = null; app.current = null;
    app.sheet.close(); app.pushRoute({ card: null, panel: null, target: null }, true); invalidatePNG(); app.render(); app.saveView();
    app.setUndo(() => ({ surum: 3, tuvaller: app.library.tuvaller.filter(board => !boards.has(board.id)), kartlar: app.library.kartlar.filter(card => !ids.has(card.id)),
      ipler: app.library.ipler.filter(ip => !edgeIds.has(ip.id)) }), `${merged.addedCards.length} kart eklendi`);
  }, 'button'));
  app.sheetContent.append(actions, row('Yedekle', exportBackup, { glyph: 'backup' }));
}

export function openCopyPreview() {
  const payload = app.pendingImport.payload; app.openSheet('Kopya', 'Kopya-al');
  const previewWorkspace = { surum: 3, tuvaller: [payload.tuval], kartlar: payload.kartlar, ipler: payload.ipler };
  const summary = el('div', 'copy-summary'), mini = app.previewBoard(payload.tuval, previewWorkspace), details = el('div');
  details.append(el('strong', '', payload.tuval.ad), el('small', '', `${payload.kartlar.length} kart${payload.fotolar.length ? ` · ${payload.fotolar.length} fotoğraf` : ''}`)); summary.append(mini, details); app.sheetContent.append(summary);
  const previous = app.library.tuvaller.find(board => board.kopyaKaynagi?.tuvalId === payload.tuval.id);
  if (previous) details.append(el('p', 'copy-duplicate', `Zaten var · ${new Date(previous.kopyaKaynagi.gonderim).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`));
  const actions = el('div', 'confirmation'); const add = button('Ekle', async () => {
    if (app.locked) return; add.disabled = true;
    try {
      const result = addCopy(app.library, payload), ids = new Set(result.photos.map(photo => photo.id)); await importPhotos(result.photos, ids);
      const before = app.library; app.library = result.workspace;
      if (!app.persist()) { app.library = before; app.retirePhotos(result.workspace.kartlar.filter(card => card.tuvalId === result.board.id)); add.disabled = false; return; }
      app.sheet.close(); app.pushRoute({ card: null, panel: null, target: null }, true); app.render();
      app.setUndo(() => { const next = deleteBoard(app.library, result.board.id); app.retirePhotos(result.workspace.kartlar.filter(card => card.tuvalId === result.board.id)); return next; }, 'Tuval eklendi');
    } catch { app.notice('Kopya eklenemedi. Hiçbir kart değişmedi.'); add.disabled = false; }
  }, 'button'); actions.append(button('Vazgeç', app.closePanel, 'button secondary'), add); app.sheetContent.append(actions);
}

$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (app.locked && app.rawBroken === null) { app.notice('Kartlar başka bir yerde değişti. Yedek alıp sayfayı yenile.'); return; }
  try { const text = await file.text(), data = JSON.parse(text); app.pendingImport = data?.app === 'sinaps' && data.tur === 'tuval' ? { copy: true, payload: parseCopy(text), name: file.name } : { graph: parseWorkspace(text), name: file.name }; openImportPreview(); }
  catch {
    app.openSheet('Yükle', 'Yükle-hata'); app.sheetContent.append(el('div', 'file-card', file.name),
      el('p', 'sheet-copy danger', 'Bu dosya yedek değil. Hiçbir kart değişmedi.'), button('Seç', pickFile, 'button secondary wide', 'upload'));
  }
});
