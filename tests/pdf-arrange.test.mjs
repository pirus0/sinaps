import test from 'node:test'; import assert from 'node:assert/strict';
import { planPDF } from '../pdf-layout.js';
import { printPlan, cutCards } from '../pdf-arrange.js';
import { cardHeight } from '../graph.js';
const card = (id, x, y) => ({ id, baslik: 'Kart ' + id, aciklama: 'Açıklama', x, y });
const overlaps = (store, width = 158) => store.kartlar.some((a, i) => store.kartlar.slice(i + 1).some(b =>
  Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < (cardHeight(a, width) + cardHeight(b, width)) / 2));
const rect = (c, width = 158) => ({ minX: c.x - width / 2, maxX: c.x + width / 2, minY: c.y - cardHeight(c, width) / 2, maxY: c.y + cardHeight(c, width) / 2 });
const area = (a, b) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
const within = (r, cell) => r.minX >= cell.minX && r.maxX <= cell.maxX && r.minY >= cell.minY && r.maxY <= cell.maxY;

// Finds an x where the card straddles the first vertical page edge, mostly on the given side.
function straddling(side) {
  const probe = planPDF({ kartlar: [card('a', 0, 0), card('far', 6000, 0)], ipler: [] }, 158, 'T');
  const first = probe.cells.find(cell => cell.row === 0 && cell.col === 0), second = probe.cells.find(cell => cell.row === 0 && cell.col === 1);
  // Right edge of page 1 is first.maxX; left edge of page 2 is second.minX. A card wider than the
  // overlap that crosses first.maxX is cut; shift it by a third of its width to one side.
  return { x: first.maxX + (side === 'left' ? -158 / 6 : 158 / 6) + (side === 'left' ? 0 : 0), first, second };
}

test('çizgide kalan kart, alanının çoğunun bulunduğu sayfaya taşınır; tuval değişmez', () => {
  for (const side of ['left', 'right']) {
    const { x } = straddling(side);
    const store = { kartlar: [card('a', 0, 0), card('far', 6000, 0), card('b', x, 300)], ipler: [] }, before = JSON.stringify(store);
    const plan = planPDF(store, 158, 'T'); assert.ok(cutCards(plan).includes('b'), 'başta kesik ' + side);
    const majority = plan.cells.map(cell => ({ cell, share: area(rect(store.kartlar[2]), cell) })).sort((p, q) => q.share - p.share)[0].cell;
    const result = printPlan(store, 158, 'T');
    assert.equal(JSON.stringify(store), before);
    assert.equal(cutCards(result.plan).length, 0, side);
    const moved = result.store.kartlar.find(item => item.id === 'b');
    const home = result.plan.cells.find(cell => within(rect(moved), cell));
    assert.ok(home, 'bir sayfanın içinde');
    // Same page column as the majority cell (the grid origin does not move here).
    assert.equal(home.col, majority.col, `${side}: ${home.col} vs ${majority.col}`);
    assert.ok(Math.abs(moved.x - x) < 158, 'kısa yol'); assert.equal(moved.y, 300);
    assert.equal(overlaps(result.store), false);
  }
});

test('çizgide kalan kart yoksa tuval aynen döner', () => {
  const store = { kartlar: [card('a', 0, 120)], ipler: [] }, result = printPlan(store, 158, 'T');
  assert.equal(result.moved, 0); assert.equal(result.store, store);
});

test('her puntoda kesik kart kalmaz (seyrek rastgele tuvaller)', () => {
  let seed = 11; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 8; n++) {
    const store = { kartlar: Array.from({ length: 10 }, (_, i) => card(String(i), Math.round(random() * 4000), Math.round(random() * 3000))), ipler: [] };
    if (overlaps(store)) continue;
    for (const pt of [8, 11, 16]) assert.equal(cutCards(printPlan(store, 158, 'T', pt).plan).length, 0, `${n}/${pt}`);
  }
});
