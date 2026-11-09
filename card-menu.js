import { app } from './app.js';
import { cardTitle, deleteCard, connections, cardText, disconnect, mergeGraphs } from './graph.js';
import { row, el, button } from './ui.js';
import { retirePhotos } from './photo-flow.js';
import { shareFile, datedName } from './files.js';
import { APP_NAME } from './brand.js';

export function openMenu() {
  const card = app.store.kartlar.find(item => item.id === app.current); if (!card) return;
  app.openSheet(cardTitle(card), 'Menü');

  const remove = row('Sil', () => {
    app.openSheet(cardTitle(card), 'Kart-sil'); app.sheetContent.append(el('p', 'sheet-copy', 'Kart silinsin mi?'));
    const actions = el('div', 'confirmation'); actions.append(button('Vazgeç', app.closePanel, 'button secondary'), button('Sil', () => {
      app.clearUndo(); const record = deleteCard(app.store, app.current); if (!app.persist(record.store)) return;
      app.current = null; app.entryCard = null; app.showCanvas({ replace: true }); retirePhotos([record.card], 0);
    }, 'button accent', 'delete')); app.sheetContent.append(actions);
  }); remove.classList.add('danger'); remove.disabled = app.locked;
  app.sheetContent.append(row('Bağlar', openConnections, { value: String(connections(app.store, app.current).length), arrow: true }),
    row('Paylaş', async () => {
      try { await shareFile(cardText(app.store.kartlar.find(item => item.id === app.current)), datedName('kart', 'txt'), 'text/plain;charset=utf-8', APP_NAME); }
      catch { app.notice('Paylaşılamadı. Yeniden dene.'); }
    }, { glyph: 'share' }), el('hr', 'sheet-divider'), remove);
}

export function openConnections() {
  app.openSheet('Bağlar');
  for (const ip of connections(app.store, app.current)) {
    const otherId = ip.aId === app.current ? ip.bId : ip.aId;
    const other = app.store.kartlar.find(card => card.id === otherId); if (!other) continue;
    const entry = el('div', 'connection-row');
    const name = button(cardTitle(other), () => app.openCard(other.id, { replace: true }), 'connection-name');
    name.replaceChildren(el('span', '', cardTitle(other)), el('small', '', other.aciklama.replace(/\s+/g, ' ').slice(0, 100)));
    const remove = button('Kaldır', () => {
      if (!app.persist(disconnect(app.store, ip.id))) return;
      openConnections(); app.setUndo(() => mergeGraphs(app.store, { surum: 2, kartlar: [], ipler: [ip] }).store, 'Bağ kaldırıldı');
    }, 'button quiet danger'); remove.disabled = app.locked; entry.append(name, remove); app.sheetContent.append(entry);
  }
}
