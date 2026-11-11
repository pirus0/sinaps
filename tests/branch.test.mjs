import test from 'node:test'; import assert from 'node:assert/strict';
import { mainCardId, branchCards, hiddenCards, portsHiding, portSide, hasBranch } from '../branch.js';
const card = (id, x, y, n) => ({ id, baslik: id, aciklama: '', x, y, olusturma: `2026-11-11T00:00:0${n}.000Z` });
const ip = (aId, bId) => ({ id: aId + bId, aId, bId });
// main card m at the centre; right branch r -> r1, r2 (r2 -> r21); left branch l; r1 also stacked under r (same column)
const store = { kartlar: [card('m', 0, 0, 0), card('r', 300, 0, 1), card('l', -300, 0, 2), card('r1', 560, -60, 3), card('r2', 560, 60, 4), card('r21', 820, 60, 5), card('s', 300, 200, 6)],
  ipler: [ip('m', 'r'), ip('l', 'm'), ip('r', 'r1'), ip('r2', 'r'), ip('r2', 'r21'), ip('r', 's')] };

test('ana kart tuvalin en eski kartıdır', () => assert.equal(mainCardId(store), 'm'));

test('yan noktadan çıkan dallar torunlarıyla gizlenir; ana karta doğru olan taraf gizlenmez', () => {
  assert.deepEqual([...branchCards(store, 'm', 1)].sort(), ['r', 'r1', 'r2', 'r21', 's']);
  assert.deepEqual([...branchCards(store, 'm', -1)], ['l']);
  // From r: right side holds r1, r2 (and r21); s is stacked under r and uses r's right side too.
  assert.deepEqual([...branchCards(store, 'r', 1)].sort(), ['r1', 'r2', 'r21', 's']);
  // r's left side leads back to the main card: nothing to hide.
  assert.equal(hasBranch(store, 'r', -1), false);
  assert.deepEqual([...branchCards(store, 'r2', 1)], ['r21']);
});

test('ipin yönü ne olursa olsun taraf, çizilen ipin tarafıyla aynıdır', () => {
  const a = { x: 0 }, b = { x: 300 };
  assert.equal(portSide(a, a, b), 1); assert.equal(portSide(b, a, b), -1);
  const top = { x: 0 }, under = { x: 20 };
  assert.equal(portSide(top, top, under), 1); assert.equal(portSide(under, top, under), 1);
});

test('kapalı noktalar birleşir; gizli kartı açan noktalar bulunur', () => {
  const hidden = hiddenCards(store, ['r2:1', 'm:-1']);
  assert.deepEqual([...hidden].sort(), ['l', 'r21']);
  assert.deepEqual(portsHiding(store, ['r2:1', 'm:-1', 'm:1'], 'r21').sort(), ['m:1', 'r2:1']);
  assert.equal(hiddenCards(store, []).size, 0);
});

test('ana karta bağlı olmayan küme kendi en eski kartından okunur', () => {
  const extra = { kartlar: [...store.kartlar, card('x', 0, 900, 7), card('x1', 300, 900, 8)], ipler: [...store.ipler, ip('x1', 'x')] };
  assert.deepEqual([...branchCards(extra, 'x', 1)], ['x1']);
  assert.equal(hasBranch(extra, 'x1', -1), false);
});
