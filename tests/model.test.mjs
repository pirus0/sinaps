import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStore } from '../model.js';
import { emptyStore, addNote } from './v1-fixture.mjs';

const fixture = () => {
  let store = emptyStore();
  for (const [id, parent, text] of [['a', null, 'Fizik\nders notları'],
    ['b', 'a', 'Kuvvet\nF = m·a'], ['c', 'b', 'Sürtünme'], ['d', null, 'Şiir\n  dize\n\ndize']]) {
    store = addNote(store, parent, text, id).store;
  }
  return store;
};

test('yetim ve döngülü notlar metinleriyle köke alınır', () => {
  const store = fixture();
  store.notlar[0].ustId = 'c';
  store.notlar[3].ustId = 'yok';
  const fixed = normalizeStore(store);
  assert.equal(fixed.notlar.length, 4);
  assert.equal(fixed.notlar[0].ustId, null);
  assert.equal(fixed.notlar[3].ustId, null);
  assert.equal(store.notlar[0].ustId, 'c');
});
test('bozuk notlar sessizce kaybedilmez', () => {
  const store = fixture();
  assert.throws(() => normalizeStore({ ...store, notlar: [...store.notlar, store.notlar[0]] }));
  assert.throws(() => normalizeStore({ ...store, notlar: [{ ...store.notlar[0], metin: null }] }));
  assert.throws(() => normalizeStore({ ...store, notlar: [{ ...store.notlar[0], sira: Infinity }] }));
});
