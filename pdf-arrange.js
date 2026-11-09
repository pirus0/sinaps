// Print-only arrangement: moves cards in a copy of the board so the PDF needs fewer pages
// and no card is cut by a page edge. The board itself is never changed.
import { planPDF, intersects } from './pdf-layout.js';
import { cardHeight } from './graph.js';

const GAP = 44, PAD = 8, SPACE = 12;

const box = (card, width) => { const h = cardHeight(card, width); return { minX: card.x - width / 2, maxX: card.x + width / 2, minY: card.y - h / 2, maxY: card.y + h / 2 }; };
const inside = (rect, cell) => rect.minX >= cell.minX && rect.maxX <= cell.maxX && rect.minY >= cell.minY && rect.maxY <= cell.maxY;

/** Cards that no single page holds whole, so the print cuts them. */
export function cutCards(plan) {
  return plan.scene.cards.filter(card => {
    const rect = { minX: card.x - card.w / 2, maxX: card.x + card.w / 2, minY: card.y - card.h / 2, maxY: card.y + card.h / 2 };
    return !plan.cells.some(cell => inside(rect, cell));
  }).map(card => card.id);
}

// Shrinks empty bands wider than GAP along one axis; the band holding the board centre stays put.
function collapse(store, width, title, axis) {
  const lo = axis === 'x' ? 'minX' : 'minY', hi = axis === 'x' ? 'maxX' : 'maxY';
  const centerWidth = Math.min(260, Math.max(50, [...title].length * 8));
  const center = axis === 'x' ? { [lo]: -centerWidth / 2, [hi]: centerWidth / 2 } : { [lo]: -16, [hi]: 44 };
  const items = [...store.kartlar.map(card => ({ id: card.id, ...box(card, width) })), { id: null, ...center }].sort((a, b) => a[lo] - b[lo]);
  const clusters = [];
  for (const item of items) {
    const last = clusters.at(-1);
    if (last && item[lo] <= last.hi + GAP) { last.hi = Math.max(last.hi, item[hi]); last.items.push(item); }
    else clusters.push({ lo: item[lo], hi: item[hi], items: [item] });
  }
  const anchor = clusters.findIndex(cluster => cluster.items.some(item => item.id === null)), shift = new Map();
  for (let i = anchor + 1, total = 0; i < clusters.length; i++) { total += clusters[i].lo - clusters[i - 1].hi - GAP; for (const item of clusters[i].items) shift.set(item.id, -total); }
  for (let i = anchor - 1, total = 0; i >= 0; i--) { total += clusters[i + 1].lo - clusters[i].hi - GAP; for (const item of clusters[i].items) shift.set(item.id, total); }
  return { ...store, kartlar: store.kartlar.map(card => shift.has(card.id) ? { ...card, [axis]: card[axis] + shift.get(card.id) } : card) };
}

// Moves each cut card the shortest way into a page that can hold it, without covering another card.
function nudge(store, width, plan) {
  const cut = new Set(cutCards(plan)); if (!cut.size) return store;
  let cards = store.kartlar;
  for (const id of cut) {
    const card = cards.find(item => item.id === id), h = cardHeight(card, width), options = [];
    for (const cell of plan.cells) {
      const x = Math.min(Math.max(card.x, cell.minX + PAD + width / 2), cell.maxX - PAD - width / 2);
      const y = Math.min(Math.max(card.y, cell.minY + PAD + h / 2), cell.maxY - PAD - h / 2);
      options.push({ x, y, cost: Math.hypot(x - card.x, y - card.y) });
    }
    options.sort((a, b) => a.cost - b.cost);
    const fit = options.find(option => cards.every(other => other.id === id || !intersects(
      { minX: option.x - width / 2 - SPACE, maxX: option.x + width / 2 + SPACE, minY: option.y - h / 2 - SPACE, maxY: option.y + h / 2 + SPACE }, box(other, width))));
    if (fit) cards = cards.map(item => item.id === id ? { ...item, x: fit.x, y: fit.y } : item);
  }
  return { ...store, kartlar: cards };
}

const score = plan => [plan.total, cutCards(plan).length];
const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** Returns the best print copy found, or the original when nothing improves. */
export function arrangeForPrint(store, width = 158, title = 'Tuval') {
  const original = planPDF(store, width, title);
  let best = { store, plan: original, score: score(original) };
  for (const start of [collapse(collapse(store, width, title, 'x'), width, title, 'y'), store]) {
    let current = start;
    for (let round = 0; round < 4; round++) {
      const plan = planPDF(current, width, title), result = score(plan);
      if (better(result, best.score)) best = { store: current, plan, score: result };
      if (!result[1]) break;
      current = nudge(current, width, plan);
    }
  }
  const moved = best.store.kartlar.filter((card, index) => card.x !== store.kartlar[index].x || card.y !== store.kartlar[index].y).length;
  return { store: best.store, plan: best.plan, moved, improved: best.store !== store };
}
