import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGraph, addCard, editCard, positionCard, connectCards, disconnect, deleteCard, restoreDeleted,
  normalizeGraph, migrateV1, loadGraph, saveGraph, STORAGE_KEY, LEGACY_KEY, backupJSON, parseBackup,
  mergeGraphs, searchCards, exportText, cardText, cardHeight, isImageCard } from '../graph.js';
import { emptyStore, addNote } from '../model.js';

function fixture() {
  let graph = addCard(emptyGraph(), { baslik: 'Fizik', aciklama: 'Ders notları' }, 'a').store;
  graph = addCard(graph, { sourceId: 'a', baslik: 'Sürtünme', aciklama: 'F = μ·N' }, 'b').store;
  return addCard(graph, { baslik: 'Şiir', aciklama: '\n  dize\n\ndize  ', x: 500, y: 300 }, 'c').store;
}
test('v2 dal: yeni kart ve yönsüz ip; kardeşler alta, diğer konumlar sabit', () => {
  const graph = fixture();
  const result = addCard(graph, { sourceId: 'a', baslik: 'Kuvvet' }, 'd');
  assert.equal(result.card.x, graph.kartlar[1].x);
  assert.ok(result.card.y > graph.kartlar[1].y);
  assert.deepEqual(result.store.kartlar.slice(0, 3), graph.kartlar);
  assert.equal(result.store.ipler.length, 2);
  assert.equal(result.card.kaynakId, 'a');
});
test('v2 aynı yere Yeni: boş yer bulunur, mevcut kartlar yeniden dizilmez', () => {
  const graph = fixture();
  const added = addCard(graph, { x: 0, y: 0 }, 'd');
  assert.ok(added.card.x !== 0 || added.card.y !== 0);
  assert.deepEqual(added.store.kartlar.slice(0, 3), graph.kartlar);
});
test('v2 başlık tek satır; açıklamanın şiir boşlukları korunur', () => {
  const graph = editCard(fixture(), 'c', '  Şiir\nAdı ', '\n  dize\n\ndize  ');
  assert.equal(graph.kartlar[2].baslik, 'Şiir Adı');
  assert.equal(graph.kartlar[2].aciklama, '\n  dize\n\ndize  ');
  assert.equal(cardText(graph.kartlar[2]), 'Şiir Adı\n\n  dize\n\ndize  ');
});
test('v2 ipler yönsüzdür; ters/aynı bağlantı yinelenmez; kendine/kayıp karta ip yok', () => {
  const graph = connectCards(fixture(), 'b', 'c', 'bc');
  assert.equal(connectCards(graph, 'c', 'b').ipler.length, 2);
  assert.throws(() => connectCards(graph, 'a', 'a'));
  assert.throws(() => connectCards(graph, 'a', 'yok'));
  assert.equal(disconnect(graph, 'bc').ipler.length, 1);
});
test('v2 kart silme: yalnız kart+ip gider, kaynak çocukları kalır; geri al eksiksizdir', () => {
  const graph = connectCards(fixture(), 'a', 'c');
  const deleted = deleteCard(graph, 'a');
  assert.equal(deleted.store.kartlar.length, 2);
  assert.equal(deleted.store.ipler.length, 0);
  assert.equal(deleted.store.kartlar.find(card => card.id === 'b').kaynakId, null);
  const edited = editCard(deleted.store, 'b', 'Yeni metin', 'korunur');
  const restored = restoreDeleted(edited, deleted);
  assert.equal(restored.kartlar.length, 3); assert.equal(restored.ipler.length, 2);
  assert.equal(restored.kartlar.find(card => card.id === 'b').kaynakId, 'a');
  assert.equal(restored.kartlar.find(card => card.id === 'b').aciklama, 'korunur');
});
test('v2 kart hareketi: çakışma çözülür, diğer kartlar yerinde kalır', () => {
  const graph = fixture();
  const moved = positionCard(graph, 'c', 0, 0);
  const card = moved.kartlar.find(item => item.id === 'c');
  assert.ok(Math.abs(card.x) >= 174 || Math.abs(card.y) >= 104);
  assert.deepEqual(moved.kartlar.slice(0, 2), graph.kartlar.slice(0, 2));
  assert.throws(() => positionCard(graph, 'c', NaN, 0));
});
test('v1→v2: kimlik, metin boşlukları, zaman ve üst ipi korunur', () => {
  let legacy = addNote(emptyStore(), null, 'Fizik\nDers notları', 'a').store;
  legacy = addNote(legacy, 'a', 'Şiir\n\n  dize\n\ndize  ', 'b').store;
  const graph = migrateV1(legacy);
  assert.equal(graph.surum, 2);
  assert.deepEqual(graph.kartlar.map(card => card.id), ['a', 'b']);
  assert.equal(graph.kartlar[1].aciklama, '\n  dize\n\ndize  ');
  assert.equal(graph.kartlar[1].kaynakId, 'a');
  assert.equal(graph.kartlar[1].olusturma, legacy.notlar[1].olusturma);
  assert.equal(graph.ipler[0].aId, 'a'); assert.equal(graph.ipler[0].bId, 'b');
});
test('v1→v2: ilk dolu satır başlık, öndeki boş satırlar ve eski ham depo kaybolmaz', () => {
  const legacy = addNote(emptyStore(), null, '\n\nŞiir\n  dize', 'a').store;
  const values = new Map([[LEGACY_KEY, JSON.stringify(legacy)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const graph = loadGraph(storage);
  assert.equal(graph.kartlar[0].baslik, 'Şiir'); assert.equal(graph.kartlar[0].aciklama, '\n\n  dize');
  saveGraph(storage, graph);
  assert.equal(values.get(LEGACY_KEY), JSON.stringify(legacy));
  assert.deepEqual(loadGraph(storage), graph);
});
test('v2 JSON gidiş-dönüş; kamera/görünüm yedeğe girmez', () => {
  const graph = fixture();
  const json = backupJSON({ ...graph, gorunum: { kamera: { x: 900 }, sade: true } });
  assert.equal(JSON.parse(json).data.gorunum, undefined);
  assert.deepEqual(parseBackup(json), graph);
  assert.throws(() => parseBackup('{"app":"başka","version":2}'));
  assert.throws(() => parseBackup('{"app":"dallanan-not","version":3}'));
});
test('v2 birleştirme: cihaz kazanır, aynı yedek iki kez kart/ip eklemez', () => {
  const local = fixture();
  let incoming = editCard(local, 'a', 'Eski yedek', 'dokunma');
  incoming = addCard(incoming, { baslik: 'Yeni' }, 'd').store;
  incoming = connectCards(incoming, 'd', 'c');
  const merged = mergeGraphs(local, incoming);
  assert.equal(merged.added.length, 1);
  assert.equal(merged.store.kartlar[0].baslik, 'Fizik');
  assert.equal(mergeGraphs(merged.store, incoming).added.length, 0);
  assert.equal(mergeGraphs(merged.store, incoming).edges.length, 0);
});
test('v2 kartsız/kendine/yinelenen ip atlanır; kartlar korunur', () => {
  const graph = fixture();
  const time = new Date().toISOString();
  graph.ipler.push({ id: 'bad', aId: 'a', bId: 'yok', olusturma: time },
    { id: 'same', aId: 'a', bId: 'a', olusturma: time },
    { id: 'reverse', aId: 'b', bId: 'a', olusturma: time });
  const fixed = normalizeGraph(graph);
  assert.equal(fixed.kartlar.length, 3); assert.equal(fixed.ipler.length, 1);
});
test('v2 kaynak döngüsü metin sıralaması için onarılır; gerçek ağ döngüsü korunur', () => {
  let graph = connectCards(connectCards(fixture(), 'b', 'c'), 'c', 'a');
  graph.kartlar[0].kaynakId = 'b';
  graph = normalizeGraph(graph);
  assert.equal(graph.kartlar[0].kaynakId, null);
  assert.equal(graph.ipler.length, 3);
  assert.match(exportText(graph), /Bağlar/);
});
test('v2 bozuk/uyumsuz depo eski verinin üstüne yazılmaz', () => {
  const storage = { getItem: key => key === STORAGE_KEY ? '{bozuk' : null, setItem() { assert.fail('Yazmamalı'); } };
  assert.throws(() => loadGraph(storage));
  assert.throws(() => normalizeGraph({ ...fixture(), kartlar: [...fixture().kartlar, fixture().kartlar[0]] }));
  assert.throws(() => normalizeGraph({ ...fixture(), kartlar: [{ ...fixture().kartlar[0], x: Infinity }] }));
});
test('v2 arama Türkçe harfleri sadeleştirir; numaralı metin ve serbest ipler çıkartılır', () => {
  const graph = connectCards(fixture(), 'b', 'c');
  assert.equal(searchCards(graph, 'SURTUNME')[0].id, 'b');
  assert.equal(searchCards(graph, 'DERS')[0].id, 'a');
  assert.match(exportText(graph), /1\.1 Sürtünme\nF = μ·N/);
  assert.match(exportText(graph), /Bağlar\n1\.1 Sürtünme — 2 Şiir/);
});

test('fotoğraf kimliği JSON turunda korunur, foto yüksekliği yeni kart boşluğuna katılır', () => {
  const graph = fixture(); graph.kartlar[0].fotoId = 'foto-1';
  const parsed = parseBackup(backupJSON(graph)); assert.equal(parsed.kartlar[0].fotoId, 'foto-1');
  const added = addCard(graph, { x: graph.kartlar[0].x, y: graph.kartlar[0].y }, 'photo-new');
  for (const card of graph.kartlar) assert.ok(Math.abs(card.x - added.card.x) >= 174 || Math.abs(card.y - added.card.y) >= (88 + (card.fotoId ? 158 * .6 : 0) + 88) / 2 + 28);
});
test('yeni kart merkez çevresindeki 60px alanı kapatmaz', () => {
  const { card } = addCard(emptyGraph()); assert.ok(Math.abs(card.x) >= 158 / 2 + 60 || Math.abs(card.y) >= 104);
});
test('yazısız görselin yüksekliği gerçek boyuyla yerleşime ve yedeğe katılır', () => {
  let graph = addCard(emptyGraph(), { x: 0, y: 200 }, 'photo').store;
  graph.kartlar[0].fotoId = 'foto';
  assert.equal(isImageCard(graph.kartlar[0]), true);
  assert.equal(cardHeight(graph.kartlar[0], 164), 123);
  assert.ok(Math.abs(cardHeight({ ...graph.kartlar[0], aciklama: 'Yazı' }, 164) - 186.4) < 1e-9);
  const added = addCard(graph, { x: 0, y: 200, width: 164 }, 'new').card;
  assert.ok(Math.abs(added.x) >= 180 || Math.abs(added.y - 200) >= (123 + 88) / 2 + 28);
  assert.equal(parseBackup(backupJSON(graph)).kartlar[0].fotoId, 'foto');
  assert.deepEqual(searchCards(graph, 'görsel'), []);
});
