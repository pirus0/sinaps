// Print-only arrangement: cards never cover each other, and a card cut by a page edge is moved into
// the page that already holds most of it, so every card prints whole. Works on a copy; the board is never changed.
import { planPDF, BODY_PT } from './pdf-layout.js';
import { cardHeight, spaceCards } from './graph.js';

const PAD = 8, SPACE = 14, ROUNDS = 6;

const inside = (rect, cell) => rect.minX >= cell.minX && rect.maxX <= cell.maxX && rect.minY >= cell.minY && rect.maxY <= cell.maxY;

/** Cards that no single page holds whole, so the print cuts them. */
export function cutCards(plan) {
  return plan.scene.cards.filter(card => {
    const rect = { minX: card.x - card.w / 2, maxX: card.x + card.w / 2, minY: card.y - card.h / 2, maxY: card.y + card.h / 2 };
    return !plan.cells.some(cell => inside(rect, cell));
  }).map(card => card.id);
}

// Moves a span [pos - size/2, pos + size/2] the shorter way into one page band: the band that
// already holds most of it. Bands start every `step` and are `tile` long (pages overlap).
function fitAxis(pos, size, origin, step, tile) {
  const a = pos - size / 2, b = pos + size / 2, k = Math.max(0, Math.floor((a - origin) / step));
  for (const band of [k - 1, k]) if (band >= 0 && a >= origin + band * step - 1e-6 && b <= origin + band * step + tile + 1e-6) return { pos, cut: false };
  if (size + 2 * PAD > tile) return { pos, cut: true };
  const back = b - (origin + k * step + tile - PAD), ahead = origin + (k + 1) * step + PAD - a;
  return { pos, cut: true, back: pos - back, ahead: pos + ahead, prefer: back <= ahead ? 'back' : 'ahead' };
}

// One pass, top to bottom: x snaps into the page column holding most of the card; y keeps the card
// clear of the cards above (as spaceCards does) and, if a page edge cuts it, moves it into the page
// holding most of it - upwards only when that leaves room above, otherwise to the next page's top.
function paginate(store, width, plan) {
  const first = plan.cells[0], tileW = first.maxX - first.minX, tileH = first.maxY - first.minY;
  const originX = first.minX, originY = first.minY, placed = [], at = new Map();
  for (const card of [...store.kartlar].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const h = cardHeight(card, width), fx = fitAxis(card.x, width, originX, plan.stepX, tileW);
    const x = fx.cut && fx.prefer ? fx[fx.prefer] : card.x;
    const floor = placed.filter(other => Math.abs(other.x - x) < width + 8).reduce((low, other) => Math.max(low, other.y + other.h / 2 + SPACE * 2 + h / 2), -Infinity);
    let y = Math.max(card.y, floor);
    const fy = fitAxis(y, h, originY, plan.stepY, tileH);
    if (fy.cut && fy.prefer) y = fy.prefer === 'back' && fy.back >= floor ? fy.back : fy.ahead;
    placed.push({ x, y, h }); if (x !== card.x || y !== card.y) at.set(card.id, { x, y });
  }
  return at.size ? { ...store, kartlar: store.kartlar.map(card => at.has(card.id) ? { ...card, ...at.get(card.id) } : card) } : store;
}

/** The print copy and its page plan at `pt` points: no card covers another, none is left on a page edge where possible. */
export function printPlan(store, width = 158, title = 'Tuval', pt = BODY_PT) {
  // Cards are as tall as their text at this width; none may cover another.
  let current = spaceCards(store, width, SPACE * 2), plan = planPDF(current, width, title, pt);
  for (let round = 0; round < ROUNDS && cutCards(plan).length; round++) {
    const next = paginate(current, width, plan); if (next === current) break;
    current = next; plan = planPDF(current, width, title, pt);
  }
  const moved = current.kartlar.filter((card, index) => card.x !== store.kartlar[index].x || card.y !== store.kartlar[index].y).length;
  return { store: current, plan, moved };
}
