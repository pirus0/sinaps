import test from 'node:test'; import assert from 'node:assert/strict';
import { wrapText, cardLayout, TEXT } from '../card-text.js';
import { cardHeight, cardLines, spaceCards } from '../graph.js';
const mono = text => [...text].length * 8;

test('kart metni: üç nokta yok, her kelime bir satırda, satır sonları korunur', () => {
  const text = 'Bir iki üç dört beş altı yedi sekiz dokuz on onbir onikiüçdörtbeşaltıyedisekiz\n\n\nSon satır';
  const lines = wrapText(text, 80, mono);
  assert.ok(lines.every(line => mono(line) <= 80), JSON.stringify(lines));
  assert.ok(!lines.join('').includes('…'));
  assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.equal(lines.filter(line => line === '').length, 1, 'boş satırlar teke iner');
});

test('kart yüksekliği metinle büyür, kısa kart klasik 88 kalır', () => {
  assert.equal(cardHeight({ baslik: 'Kısa', aciklama: 'Açıklama' }, 158), 88);
  const long = { baslik: 'Uzun bir başlık ki iki satıra taşar elbette', aciklama: 'kelime '.repeat(60) };
  const layout = cardLines(long, 158);
  assert.ok(layout.title.length >= 2 && layout.body.length > 4);
  assert.equal(layout.height, TEXT.titleTop + (layout.title.length - 1) * TEXT.titleLine + TEXT.bodyGap + (layout.body.length - 1) * TEXT.bodyLine + TEXT.bottom);
  assert.ok(cardHeight(long, 158) > 88);
  // Untitled card: first description line becomes the title, the rest stays visible.
  const untitled = cardLines({ baslik: '', aciklama: '\nİlk satır\nikinci\nüçüncü' }, 158);
  assert.deepEqual(untitled.title, ['İlk satır']); assert.deepEqual(untitled.body, ['ikinci', 'üçüncü']);
});

test('uzayan kart alttakini iter; yan sütun ve sıra değişmez; çakışma yoksa aynı tuval döner', () => {
  const long = 'kelime '.repeat(80), card = (id, x, y, aciklama = 'A') => ({ id, baslik: 'K' + id, aciklama, x, y });
  const store = { kartlar: [card('a', 0, 0, long), card('b', 0, 116), card('c', 0, 232), card('d', 400, 116)], ipler: [] };
  const next = spaceCards(store, 158), at = id => next.kartlar.find(item => item.id === id);
  const bottom = id => at(id).y + cardHeight(at(id), 158) / 2, top = id => at(id).y - cardHeight(at(id), 158) / 2;
  assert.ok(top('b') >= bottom('a') + 28 - 1e-9); assert.ok(top('c') >= bottom('b') + 28 - 1e-9);
  assert.equal(at('a').y, 0); assert.equal(at('d').y, 116); assert.ok(at('b').y < at('c').y);
  assert.equal(spaceCards(next, 158), next);
});
