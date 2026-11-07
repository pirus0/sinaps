export const STORAGE_KEY = 'dallanan-not-data-v1';
export const emptyStore = () => ({ surum: 1, notlar: [], baglar: [] });
export const children = (store, parent = null) => store.notlar
  .filter(note => note.ustId === parent).sort((a, b) => a.sira - b.sira);
export const title = note => note.metin.split('\n').find(line => line.trim())?.trim() || '…';

export function ancestors(store, id) {
  const path = [];
  const seen = new Set();
  let note = store.notlar.find(item => item.id === id);
  while (note && !seen.has(note.id)) {
    path.unshift(note);
    seen.add(note.id);
    note = store.notlar.find(item => item.id === note.ustId);
  }
  return path;
}

export function subtreeIds(store, id) {
  const ids = new Set([id]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    for (const child of children(store, queue[i])) {
      if (!ids.has(child.id)) { ids.add(child.id); queue.push(child.id); }
    }
  }
  return ids;
}

export function addNote(store, parent = null, text = '', id = crypto.randomUUID()) {
  if (parent !== null && !store.notlar.some(note => note.id === parent)) throw new Error('Üst bulunamadı.');
  if (store.notlar.some(note => note.id === id)) throw new Error('Kimlik zaten var.');
  const time = new Date().toISOString();
  const siblings = children(store, parent);
  const note = { id, ustId: parent, sira: (siblings.at(-1)?.sira ?? 0) + 1024,
    metin: text, olusturma: time, degisme: time };
  return { store: { ...store, notlar: [...store.notlar, note] }, note };
}

export function editNote(store, id, text) {
  return { ...store, notlar: store.notlar.map(note => note.id === id
    ? { ...note, metin: text, degisme: new Date().toISOString() } : note) };
}

export function moveNote(store, id, parent) {
  if (!store.notlar.some(note => note.id === id)) throw new Error('Not bulunamadı.');
  if (parent !== null && !store.notlar.some(note => note.id === parent)) throw new Error('Üst bulunamadı.');
  if (subtreeIds(store, id).has(parent)) throw new Error('Bir dal kendi altına taşınamaz.');
  const order = (children(store, parent).at(-1)?.sira ?? 0) + 1024;
  return { ...store, notlar: store.notlar.map(note => note.id === id
    ? { ...note, ustId: parent, sira: order, degisme: new Date().toISOString() } : note) };
}

export function reorderNote(store, id, direction) {
  const note = store.notlar.find(item => item.id === id);
  if (!note) return store;
  const siblings = children(store, note.ustId);
  const index = siblings.findIndex(item => item.id === id);
  const next = index + direction;
  if (next < 0 || next >= siblings.length) return store;
  [siblings[index], siblings[next]] = [siblings[next], siblings[index]];
  const orders = new Map(siblings.map((item, i) => [item.id, (i + 1) * 1024]));
  return { ...store, notlar: store.notlar.map(item => orders.has(item.id)
    ? { ...item, sira: orders.get(item.id) } : item) };
}

export function deleteNote(store, id) {
  const ids = subtreeIds(store, id);
  const removed = store.notlar.filter(note => ids.has(note.id));
  const links = store.baglar.filter(link => ids.has(link.kaynakId) || ids.has(link.hedefId));
  return { store: { ...store, notlar: store.notlar.filter(note => !ids.has(note.id)),
    baglar: store.baglar.filter(link => !links.includes(link)) }, removed, links };
}

export function restoreNotes(store, removed, links = []) {
  const ids = new Set(store.notlar.map(note => note.id));
  return normalizeStore({ ...store, notlar: [...store.notlar, ...removed.filter(note => !ids.has(note.id))],
    baglar: [...store.baglar, ...links] });
}

/** Reject malformed records, repair orphan/cyclic parents without dropping their text. */
export function normalizeStore(input, repairParents = true) {
  if (!input || input.surum !== 1 || !Array.isArray(input.notlar) || !Array.isArray(input.baglar)) {
    throw new Error('Bu yedek tanınmıyor.');
  }
  const ids = new Set();
  const notes = input.notlar.map(note => {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id)
      || typeof note.metin !== 'string' || !Number.isFinite(note.sira)
      || (note.ustId !== null && typeof note.ustId !== 'string')
      || typeof note.olusturma !== 'string' || !Number.isFinite(Date.parse(note.olusturma))
      || typeof note.degisme !== 'string' || !Number.isFinite(Date.parse(note.degisme))) {
      throw new Error('Yedekte geçersiz veya yinelenen not var.');
    }
    ids.add(note.id);
    return { id: note.id, ustId: note.ustId, sira: note.sira, metin: note.metin,
      olusturma: note.olusturma, degisme: note.degisme };
  });
  const byId = new Map(notes.map(note => [note.id, note]));
  for (const note of repairParents ? notes : []) {
    const seen = new Set([note.id]);
    let parent = note.ustId;
    while (parent !== null) {
      if (!byId.has(parent) || seen.has(parent)) { note.ustId = null; break; }
      seen.add(parent);
      parent = byId.get(parent).ustId;
    }
  }
  // Cross-links are reserved for later versions; preserve valid links in backups.
  const linkIds = new Set();
  const links = input.baglar.map(link => {
    if (!link || typeof link.id !== 'string' || !link.id || linkIds.has(link.id)
      || !ids.has(link.kaynakId) || !ids.has(link.hedefId)
      || typeof link.olusturma !== 'string' || !Number.isFinite(Date.parse(link.olusturma))) {
      throw new Error('Yedekte geçersiz bağ var.');
    }
    linkIds.add(link.id);
    return { id: link.id, kaynakId: link.kaynakId, hedefId: link.hedefId, olusturma: link.olusturma };
  });
  return { surum: 1, notlar: notes, baglar: links };
}

export function loadStore(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? emptyStore() : normalizeStore(JSON.parse(raw));
}

export function saveStore(storage, store) {
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function backupJSON(store) {
  return JSON.stringify({ app: 'dallanan-not', version: 1,
    exportedAt: new Date().toISOString(), data: store }, null, 2);
}

export function parseBackup(text, repairParents = true) {
  const payload = JSON.parse(text);
  if (payload?.app !== 'dallanan-not' || payload.version !== 1) throw new Error('Bu yedek tanınmıyor.');
  return normalizeStore(payload.data, repairParents);
}

export function mergeStores(local, incoming) {
  const ids = new Set(local.notlar.map(note => note.id));
  const linkIds = new Set(local.baglar.map(link => link.id));
  const added = incoming.notlar.filter(note => !ids.has(note.id));
  const links = incoming.baglar.filter(link => !linkIds.has(link.id));
  return { store: normalizeStore({ ...local, notlar: [...local.notlar, ...added],
    baglar: [...local.baglar, ...links] }), added, links };
}

export function searchNotes(store, query) {
  const fold = value => value.toLocaleLowerCase('tr').replaceAll('ı', 'i').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const term = fold(query.trim());
  return term ? store.notlar.filter(note => fold(note.metin).includes(term)) : [];
}

export function exportText(store, id = null) {
  if (id !== null && children(store, id).length === 0) return store.notlar.find(note => note.id === id)?.metin ?? '';
  const result = [];
  const queue = (id === null ? children(store) : store.notlar.filter(note => note.id === id))
    .map((note, index) => ({ note, number: String(index + 1) })).reverse();
  while (queue.length) {
    const { note, number } = queue.pop();
    result.push(`${number} ${note.metin}`);
    const nested = children(store, note.id);
    for (let i = nested.length - 1; i >= 0; i--) {
      queue.push({ note: nested[i], number: `${number}.${i + 1}` });
    }
  }
  return result.join('\n\n');
}
