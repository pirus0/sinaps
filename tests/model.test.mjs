import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addNote, editNote, children, ancestors, moveNote, reorderNote,
  deleteNote, restoreNotes, normalizeStore, loadStore, saveStore, STORAGE_KEY,
  backupJSON, parseBackup, exportText, title, mergeStores, searchNotes } from '../model.js';

const fixture = () => {
  let store = emptyStore();
  for (const [id, parent, text] of [['a', null, 'Fizik\nders notları'],
    ['b', 'a', 'Kuvvet\nF = m·a'], ['c', 'b', 'Sürtünme'], ['d', null, 'Şiir\n  dize\n\ndize']]) {
    store = addNote(store, parent, text, id).store;
  }
  return store;
};

test('ağaç sırası, yol ve şiir satırları korunur', () => {
  const store = fixture();
  assert.deepEqual(children(store).map(n => n.id), ['a', 'd']);
  assert.deepEqual(ancestors(store, 'c').map(n => n.id), ['a', 'b', 'c']);
  assert.equal(store.notlar[3].metin, 'Şiir\n  dize\n\ndize');
});
test('düzenleme kaynak veriyi değiştirmez', () => {
  const store = fixture();
  assert.equal(editNote(store, 'b', '<script>\nYeni').notlar[1].metin, '<script>\nYeni');
  assert.equal(store.notlar[1].metin, 'Kuvvet\nF = m·a');
});
test('taşıma alt dalları korur, döngü ve kayıp üst reddedilir', () => {
  const store = moveNote(fixture(), 'b', 'd');
  assert.deepEqual(ancestors(store, 'c').map(n => n.id), ['d', 'b', 'c']);
  assert.throws(() => moveNote(store, 'd', 'c'));
  assert.throws(() => moveNote(store, 'b', 'b'));
  assert.throws(() => moveNote(store, 'b', 'yok'));
  assert.throws(() => addNote(store, 'yok'));
});
test('sıralama sınırları ve aynı sıra sayıları', () => {
  const store = fixture();
  assert.deepEqual(children(reorderNote(store, 'd', -1)).map(n => n.id), ['d', 'a']);
  assert.deepEqual(reorderNote(store, 'a', -1), store);
  store.notlar[3].sira = store.notlar[0].sira;
  assert.deepEqual(children(reorderNote(store, 'd', -1)).map(n => n.id), ['d', 'a']);
});
test('silme ve geri alma bütün alt dalları korur', () => {
  const original = fixture();
  const { store, removed, links } = deleteNote(original, 'a');
  assert.deepEqual(store.notlar.map(n => n.id), ['d']);
  const restored = restoreNotes(store, removed, links);
  assert.equal(restored.notlar.length, 4);
  assert.deepEqual(ancestors(restored, 'c').map(n => n.id), ['a', 'b', 'c']);
  assert.equal(restoreNotes(restored, removed).notlar.length, 4);
});
test('yedek turu ve bilinmeyen sürümler', () => {
  const store = fixture();
  assert.deepEqual(parseBackup(backupJSON(store)), store);
  assert.throws(() => parseBackup('{"app":"başka","version":1}'));
  assert.throws(() => parseBackup(backupJSON({ ...store, surum: 2 })));
  assert.throws(() => parseBackup('bozuk'));
});
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
test('cihaz kaydı, bozuk JSON ve dolu depo hataları aktarılır', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(loadStore(storage), emptyStore());
  const original = fixture();
  saveStore(storage, original);
  assert.deepEqual(loadStore(storage), original);
  values.set(STORAGE_KEY, '{bozuk');
  assert.throws(() => loadStore(storage));
  assert.equal(values.get(STORAGE_KEY), '{bozuk');
  assert.throws(() => saveStore({ setItem() { throw new Error('QuotaExceededError'); } }, fixture()));
});
test('metin dışa aktarma numaraları ve şiir boşlukları', () => {
  const store = fixture();
  assert.equal(exportText(store), '1 Fizik\nders notları\n\n1.1 Kuvvet\nF = m·a\n\n1.1.1 Sürtünme\n\n2 Şiir\n  dize\n\ndize');
  assert.equal(exportText(store, 'b'), '1 Kuvvet\nF = m·a\n\n1.1 Sürtünme');
  assert.equal(exportText(emptyStore()), '');
});
test('ilk dolu satır başlıktır; dalsız not yalnız metniyle paylaşılır', () => {
  const store = fixture();
  assert.equal(title({ metin: '\n  \n  Şiir\nDize' }), 'Şiir');
  assert.equal(title({ metin: '  \n' }), '…');
  assert.equal(exportText(store, 'd'), 'Şiir\n  dize\n\ndize');
});
test('arama Türkçe harfleri sadeleştirir ve bütün metni tarar', () => {
  let store = fixture();
  store = addNote(store, null, '\nİSTANBUL IŞIK ÇÖĞÜŞ\nAnkara', 'e').store;
  assert.deepEqual(searchNotes(store, 'istanbul isik cogus').map(n => n.id), ['e']);
  assert.deepEqual(searchNotes(store, 'SÜRTÜNME').map(n => n.id), ['c']);
  assert.deepEqual(searchNotes(store, 'ankara').map(n => n.id), ['e']);
  assert.deepEqual(searchNotes(store, '  '), []);
});
test('birleştirme cihazı korur ve aynı yedek tekrar eklenmez', () => {
  const original = fixture();
  const incoming = editNote(addNote(original, 'b', 'Yeni', 'e').store, 'a', 'Eski yedek');
  const merged = mergeStores(original, incoming);
  assert.equal(merged.added.length, 1);
  assert.equal(merged.store.notlar.find(n => n.id === 'a').metin, 'Fizik\nders notları');
  assert.equal(mergeStores(merged.store, incoming).added.length, 0);
  assert.deepEqual(mergeStores(emptyStore(), parseBackup(backupJSON(original))).store, original);
});
test('birleştirme döngüleri onarır, cihazdaki üstü tanır', () => {
  const local = fixture();
  const incoming = { ...emptyStore(), notlar: [{ ...local.notlar[0], id: 'e', ustId: 'b', metin: 'Ek' }] };
  const merged = mergeStores(local, parseBackup(backupJSON(incoming), false));
  assert.equal(merged.store.notlar.find(n => n.id === 'e').ustId, 'b');
  const cycle = { ...emptyStore(), notlar: [{ ...local.notlar[0], id: 'e', ustId: 'a' }] };
  local.notlar[0].ustId = 'e';
  const fixed = mergeStores(local, cycle).store;
  assert.equal(fixed.notlar.length, 5);
  assert.equal(ancestors(fixed, 'e').length, 2);
});
test('bağlar yedek, silme ve geri almada korunur', () => {
  const store = fixture();
  store.baglar.push({ id: 'link', kaynakId: 'a', hedefId: 'd', olusturma: new Date().toISOString() });
  assert.deepEqual(parseBackup(backupJSON(store)).baglar, store.baglar);
  const deleted = deleteNote(store, 'a');
  assert.equal(deleted.store.baglar.length, 0);
  assert.equal(restoreNotes(deleted.store, deleted.removed, deleted.links).baglar.length, 1);
  assert.throws(() => normalizeStore({ ...store, baglar: [{ ...store.baglar[0], hedefId: 'yok' }] }));
});
test('çok derin ağaç dışa aktarma ve silmede çağrı yığınını aşmaz', () => {
  const date = new Date().toISOString();
  const store = { ...emptyStore(), notlar: Array.from({ length: 300 }, (_, i) => ({
    id: String(i), ustId: i ? String(i - 1) : null, sira: 1024, metin: `Not ${i}`, olusturma: date, degisme: date })) };
  assert.equal(ancestors(store, '299').length, 300);
  assert.match(exportText(store), /Not 299/);
  assert.equal(deleteNote(store, '0').removed.length, 300);
});
