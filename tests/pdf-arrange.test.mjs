import test from 'node:test'; import assert from 'node:assert/strict';
import { planPDF } from '../pdf-layout.js';
import { arrangeForPrint, cutCards } from '../pdf-arrange.js';
import { cardHeight } from '../graph.js';
const card = (id, x, y) => ({ id, baslik: 'Kart ' + id, aciklama: 'Açıklama', x, y });
const overlaps = (store, width = 158) => store.kartlar.some((a, i) => store.kartlar.slice(i + 1).some(b =>
  Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < (cardHeight(a, width) + cardHeight(b, width)) / 2));

test('baskı düzeni: uzak kartlar arasındaki boşluk daralır, sayfa azalır, kaynak tuval değişmez', () => {
  const store = { kartlar: [card('a', 0, 120), card('b', 2600, 120), card('c', 0, 2400)], ipler: [{ id: 'ab', aId: 'a', bId: 'b' }] };
  const before = JSON.stringify(store), original = planPDF(store, 158, 'T'), result = arrangeForPrint(store, 158, 'T');
  assert.equal(JSON.stringify(store), before);
  assert.ok(result.plan.total < original.total, `${result.plan.total} < ${original.total}`);
  assert.ok(result.improved); assert.ok(result.moved > 0); assert.equal(overlaps(result.store), false);
  // Left-to-right and top-to-bottom order is preserved.
  const at = id => result.store.kartlar.find(item => item.id === id);
  assert.ok(at('a').x < at('b').x); assert.ok(at('a').y < at('c').y);
});

test('baskı düzeni: sayfa çizgisinde kalan kart bir sayfanın içine alınır', () => {
  // x=1650 straddles a page edge in both portrait and landscape grids of this board.
  const store = { kartlar: [card('a', 0, 120), card('c', 3000, 120), card('b', 1650, 120)], ipler: [] };
  const plan = planPDF(store, 158, 'T'); assert.ok(cutCards(plan).includes('b'));
  const result = arrangeForPrint(store, 158, 'T');
  assert.equal(cutCards(result.plan).length, 0); assert.ok(result.plan.total <= plan.total); assert.equal(overlaps(result.store), false);
});

test('baskı düzeni: iyileşme yoksa tuval aynen döner', () => {
  const store = { kartlar: [card('a', 0, 120)], ipler: [] }, result = arrangeForPrint(store, 158, 'T');
  assert.equal(result.improved, false); assert.equal(result.moved, 0); assert.equal(result.store, store);
});
