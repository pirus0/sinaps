import { app } from './app.js';
import { el, button, icon, $ } from './ui.js';
import { HeaderSearch } from './search-view.js';
import { searchCards, cardTitle } from './graph.js';
import { searchWorkspace, boardName, boardGraph } from './workspace.js';

export function openHeaderSearch(global = false) {
  app.searchController?.destroy();
  const kind = global ? 'Genel' : 'Ara';
  if (!app.restoring) { app.searchQueries[kind] = ''; app.pushRoute({ card: null, target: null, panel: kind }); }
  const prefix = global ? el('span', 'icon-button') : button('Tuvaller', app.goHome, 'icon-button', 'left');
  if (global) prefix.append(icon('brand'));
  app.searchController = new HeaderSearch({
    header: $('#header'), query: app.searchQueries[kind], close: app.closePanel, prefix,
    change: query => { app.searchQueries[kind] = query; },
    results: query => {
      if (!global) return searchCards(app.store, query).map(card => ({ label: cardTitle(card), detail: card.aciklama.replace(/\s+/g, ' ').slice(0, 120), cardId: card.id }));
      const found = searchWorkspace(app.library, query);
      return [
        ...found.boards.map(board => ({ label: boardName(app.library, board), detail: `${boardGraph(app.library, board.id).kartlar.length} kart`, boardId: board.id, glyph: 'full' })),
        ...found.cards.map(card => ({ label: cardTitle(card), detail: boardName(app.library, app.library.tuvaller.find(board => board.id === card.tuvalId)), boardId: card.tuvalId, cardId: card.id }))
      ];
    },
    select: entry => {
      if (entry.boardId) app.activateWorkspace(entry.boardId, { replace: true });
      if (entry.cardId) {
        app.current = null; app.view.target = null; app.view.sade = false; app.focusCard(entry.cardId); app.view.highlight = entry.cardId;
        app.pushRoute({ card: null, panel: null, target: null }, true); app.render();
      }
    }
  });
}

export function openSearch() { openHeaderSearch(false); }

export function openGlobalSearch() { openHeaderSearch(true); }
