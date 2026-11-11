// Print-only arrangement: a card cut by a page edge is moved into the page that already holds
// most of it, so every card prints whole. Works on a copy; the board itself is never changed.
import { planPDF, intersects, BODY_PT } from './pdf-layout.js';
import { cardHeight } from './graph.js';

const PAD = 8, SPACE = 12, ROUNDS = 6;

const box = (card, width) => { const h = cardHeight(card, width); return { minX: card.x - width / 2, maxX: card.x + width / 2, minY: card.y - h / 2, maxY: card.y + h / 2 }; };
const inside = (rect, cell) => rect.minX >= cell.minX && rect.maxX <= cell.maxX && rect.minY >= cell.minY && rect.maxY <= cell.maxY;
const shared = (a, b) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/** Cards that no single page holds whole, so the print cuts them. */
export function cutCards(plan) {
  return plan.scene.cards.filter(card => {
    const rect = { minX: card.x - card.w / 2, maxX: card.x + card.w / 2, minY: card.y - card.h / 2, maxY: card.y + card.h / 2 };
    return !plan.cells.some(cell => inside(rect, cell));
  }).map(card => card.id);
}

// Each cut card goes into the page holding the largest share of it; if it would cover another
// card there, the page with the next largest share is tried.
function settle(store, width, plan) {
  const cut = new Set(cutCards(plan)); if (!cut.size) return store;
  let cards = store.kartlar;
  for (const id of cut) {
    const card = cards.find(item => item.id === id), h = cardHeight(card, width), rect = box(card, width);
    const options = plan.cells.map(cell => ({ cell, share: shared(rect, cell) })).filter(option => option.share > 0)
      .sort((a, b) => b.share - a.share).map(({ cell }) => ({
        x: clamp(card.x, cell.minX + PAD + width / 2, cell.maxX - PAD - width / 2),
        y: clamp(card.y, cell.minY + PAD + h / 2, cell.maxY - PAD - h / 2) }));
    const free = options.find(option => cards.every(other => other.id === id || !intersects(
      { minX: option.x - width / 2 - SPACE, maxX: option.x + width / 2 + SPACE, minY: option.y - h / 2 - SPACE, maxY: option.y + h / 2 + SPACE }, box(other, width))));
    const pick = free || options[0];
    if (pick) cards = cards.map(item => item.id === id ? { ...item, x: pick.x, y: pick.y } : item);
  }
  return { ...store, kartlar: cards };
}

/** The print copy and its page plan at `pt` points: no card left on a page edge where possible. */
export function printPlan(store, width = 158, title = 'Tuval', pt = BODY_PT) {
  let current = store, plan = planPDF(current, width, title, pt), best = { store, plan, cut: cutCards(plan).length };
  for (let round = 0; round < ROUNDS && best.cut; round++) {
    current = settle(current, width, plan); plan = planPDF(current, width, title, pt);
    const cut = cutCards(plan).length;
    if (cut < best.cut || (cut === best.cut && plan.total < best.plan.total)) best = { store: current, plan, cut };
    if (!cut) break;
  }
  const moved = best.store.kartlar.filter((card, index) => card.x !== store.kartlar[index].x || card.y !== store.kartlar[index].y).length;
  return { store: best.store, plan: best.plan, moved };
}
