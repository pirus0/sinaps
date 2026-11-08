import { normalizeStore as normalizeV1, STORAGE_KEY as V1_KEY } from './model.js';

export const STORAGE_KEY = 'dallanan-not-data-v2';
export const LEGACY_KEY = V1_KEY;
export const VIEW_KEY = 'dallanan-not-view-v2';
export const emptyGraph = () => ({ surum: 2, kartlar: [], ipler: [] });
const now = () => new Date().toISOString();
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const validId = id => typeof id === 'string' && id.length > 0;
const validTime = time => typeof time === 'string' && Number.isFinite(Date.parse(time));
export const cardTitle = card => card.baslik.trim() || card.aciklama.split('\n').find(line => line.trim())?.trim() || '…';
export const cardText = card => card.baslik ? card.baslik + (card.aciklama ? '\n' + card.aciklama : '') : card.aciklama;
export const hasCardText = card => !!(card.baslik.trim() || card.aciklama.trim());
export const isImageCard = card => !!card.fotoId && !hasCardText(card);
export const linked = (store, a, b) => store.ipler.some(ip => pairKey(ip.aId, ip.bId) === pairKey(a, b));
export const connections = (store, id) => store.ipler.filter(ip => ip.aId === id || ip.bId === id);
export const cardHeight = (card, width = 158) => isImageCard(card) ? width * .75 : 88 + (card.fotoId ? width * .6 : 0);

export function normalizeGraph(input, repair = true) {
  if (!input || input.surum !== 2 || !Array.isArray(input.kartlar) || !Array.isArray(input.ipler)) throw new Error('Bu dosya yedek değil.');
  const ids = new Set();
  const cards = input.kartlar.map(card => {
    if (!card || !validId(card.id) || ids.has(card.id) || typeof card.baslik !== 'string'
      || typeof card.aciklama !== 'string' || !Number.isFinite(card.x) || !Number.isFinite(card.y)
      || !(card.kaynakId === null || validId(card.kaynakId)) || !validTime(card.olusturma) || !validTime(card.degisme)) {
      throw new Error('Yedekte geçersiz veya yinelenen kart var.');
    }
    ids.add(card.id);
    if (card.fotoId != null && !validId(card.fotoId)) throw new Error('Geçersiz fotoğraf kimliği.');
    return { id: card.id, baslik: card.baslik.replace(/[\r\n]+/g, ' ').trim(), aciklama: card.aciklama,
      x: card.x, y: card.y, kaynakId: card.kaynakId, olusturma: card.olusturma, degisme: card.degisme,
      ...(card.fotoId ? { fotoId: card.fotoId } : {}) };
  });
  if (repair) {
    const map = new Map(cards.map(card => [card.id, card]));
    for (const card of cards) {
      const seen = new Set([card.id]);
      let parent = card.kaynakId;
      while (parent !== null) {
        if (!map.has(parent) || seen.has(parent)) { card.kaynakId = null; break; }
        seen.add(parent); parent = map.get(parent).kaynakId;
      }
    }
  }
  const edgeIds = new Set(); const pairs = new Set(); const edges = [];
  for (const ip of input.ipler) {
    if (!ip || !validId(ip.id) || !validId(ip.aId) || !validId(ip.bId) || !validTime(ip.olusturma)) throw new Error('Yedekte geçersiz ip var.');
    const pair = pairKey(ip.aId, ip.bId);
    if (ip.aId === ip.bId || (repair && (!ids.has(ip.aId) || !ids.has(ip.bId))) || pairs.has(pair) || edgeIds.has(ip.id)) continue;
    edgeIds.add(ip.id); pairs.add(pair);
    edges.push({ id: ip.id, aId: ip.aId, bId: ip.bId, olusturma: ip.olusturma });
  }
  return { surum: 2, kartlar: cards, ipler: edges };
}

export function vacantPosition(store, x, y, width = 158, exclude = null) {
  const moving = store.kartlar.find(card => card.id === exclude), height = cardHeight(moving || {}, width);
  const clear = (cx, cy) => (Math.abs(cx) >= width / 2 + 60 || Math.abs(cy) >= height / 2 + 60) && store.kartlar.every(card => card.id === exclude || Math.abs(card.x - cx) >= width + 16
    || Math.abs(card.y - cy) >= (cardHeight(card, width) + height) / 2 + 28);
  if (clear(x, y)) return { x, y };
  for (let radius = 1; radius <= store.kartlar.length + 1; radius++) {
    for (let row = -radius; row <= radius; row++) {
      for (let col = -radius; col <= radius; col++) {
        if (Math.max(Math.abs(row), Math.abs(col)) !== radius) continue;
        const cx = x + col * (width + 44), cy = y + row * (height + 28);
        if (clear(cx, cy)) return { x: cx, y: cy };
      }
    }
  }
  throw new Error('Kart için boş yer bulunamadı.');
}

export function addCard(store, { sourceId = null, x = 0, y = 0, width = 158, baslik = '', aciklama = '' } = {}, id = crypto.randomUUID()) {
  if (store.kartlar.some(card => card.id === id)) throw new Error('Kimlik zaten var.');
  const source = store.kartlar.find(card => card.id === sourceId);
  if (sourceId !== null && !source) throw new Error('Kaynak kart bulunamadı.');
  let position;
  if (source) {
    x = source.x + width + 44;
    const siblings = store.kartlar.filter(card => card.kaynakId === sourceId);
    y = siblings.length ? Math.max(...siblings.map(card => card.y + cardHeight(card, width) / 2)) + 44 + 28 : source.y;
    while ((Math.abs(x) < width / 2 + 60 && Math.abs(y) < 104) || store.kartlar.some(card => Math.abs(card.x - x) < width + 16 && Math.abs(card.y - y) < (cardHeight(card, width) + 88) / 2 + 28)) y += 116;
    position = { x, y };
  } else position = vacantPosition(store, x, y, width);
  const time = now();
  const card = { id, baslik: baslik.replace(/[\r\n]+/g, ' ').trim(), aciklama, ...position,
    kaynakId: sourceId, olusturma: time, degisme: time };
  let next = { ...store, kartlar: [...store.kartlar, card] };
  if (source) next = connectCards(next, sourceId, id);
  return { store: next, card };
}

export function editCard(store, id, baslik, aciklama) {
  return { ...store, kartlar: store.kartlar.map(card => card.id === id
    ? { ...card, baslik: baslik.replace(/[\r\n]+/g, ' ').trim(), aciklama, degisme: now() } : card) };
}
export function positionCard(store, id, x, y, width = 158) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Geçersiz konum.');
  const position = vacantPosition(store, x, y, width, id);
  return { ...store, kartlar: store.kartlar.map(card => card.id === id ? { ...card, ...position, degisme: now() } : card) };
}
export function connectCards(store, aId, bId, id = crypto.randomUUID()) {
  const ids = new Set(store.kartlar.map(card => card.id));
  if (aId === bId || !ids.has(aId) || !ids.has(bId)) throw new Error('Bu kartlar bağlanamaz.');
  if (linked(store, aId, bId)) return store;
  return { ...store, ipler: [...store.ipler, { id, aId, bId, olusturma: now() }] };
}
export const disconnect = (store, id) => ({ ...store, ipler: store.ipler.filter(ip => ip.id !== id) });
export function deleteCard(store, id) {
  const card = store.kartlar.find(item => item.id === id);
  const edges = connections(store, id);
  const sources = store.kartlar.filter(item => item.kaynakId === id).map(item => item.id);
  return { card, edges, sources, store: { ...store,
    kartlar: store.kartlar.filter(item => item.id !== id).map(item => item.kaynakId === id ? { ...item, kaynakId: null } : item),
    ipler: store.ipler.filter(ip => ip.aId !== id && ip.bId !== id) } };
}
export function restoreDeleted(store, record) {
  if (!record.card) return store;
  const next = mergeGraphs(store, { surum: 2, kartlar: [record.card], ipler: record.edges }).store;
  return normalizeGraph({ ...next, kartlar: next.kartlar.map(card => record.sources.includes(card.id) && card.kaynakId === null
    ? { ...card, kaynakId: record.card.id } : card) });
}

export function migrateV1(input, width = 158) {
  const legacy = normalizeV1(input);
  const graph = emptyGraph();
  const roots = legacy.notlar.filter(note => note.ustId === null).sort((a, b) => a.sira - b.sira);
  const queue = roots.map(note => ({ note, depth: 0 })).reverse();
  const rows = new Map();
  while (queue.length) {
    const { note, depth } = queue.pop();
    const lines = note.metin.split('\n');
    const index = lines.findIndex(line => line.trim());
    const baslik = index < 0 ? '' : lines[index].trim();
    const aciklama = index < 0 ? note.metin : [...lines.slice(0, index), ...lines.slice(index + 1)].join('\n');
    const row = rows.get(depth) ?? 0; rows.set(depth, row + 1);
    graph.kartlar.push({ id: note.id, baslik, aciklama, x: depth * (width + 44), y: row * 104,
      kaynakId: note.ustId, olusturma: note.olusturma, degisme: note.degisme });
    if (note.ustId !== null) graph.ipler.push({ id: `v1-dal:${note.id}`, aId: note.ustId, bId: note.id, olusturma: note.olusturma });
    const nested = legacy.notlar.filter(item => item.ustId === note.id).sort((a, b) => a.sira - b.sira);
    for (let i = nested.length - 1; i >= 0; i--) queue.push({ note: nested[i], depth: depth + 1 });
  }
  graph.ipler.push(...legacy.baglar.map(link => ({ id: link.id, aId: link.kaynakId, bId: link.hedefId, olusturma: link.olusturma })));
  return normalizeGraph(graph);
}
export function loadGraph(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null) return normalizeGraph(JSON.parse(raw));
  const legacy = storage.getItem(LEGACY_KEY);
  return legacy === null ? emptyGraph() : migrateV1(JSON.parse(legacy));
}
export const saveGraph = (storage, store) => storage.setItem(STORAGE_KEY, JSON.stringify(store));
export const backupJSON = store => JSON.stringify({ app: 'dallanan-not', version: 2, exportedAt: now(),
  data: { surum: 2, kartlar: store.kartlar, ipler: store.ipler } }, null, 2);
export function parseBackup(text) {
  const payload = JSON.parse(text);
  if (payload?.app !== 'dallanan-not') throw new Error('Bu dosya yedek değil.');
  if (payload.version === 1) return migrateV1(payload.data);
  if (payload.version !== 2) throw new Error('Bu yedek sürümü tanınmıyor.');
  return normalizeGraph(payload.data, false);
}
export function mergeGraphs(local, incoming) {
  const ids = new Set(local.kartlar.map(card => card.id)), edgeIds = new Set(local.ipler.map(ip => ip.id));
  const added = incoming.kartlar.filter(card => !ids.has(card.id));
  const graph = normalizeGraph({ surum: 2, kartlar: [...local.kartlar, ...added],
    ipler: [...local.ipler, ...incoming.ipler.filter(ip => !edgeIds.has(ip.id))] });
  return { store: graph, added, edges: graph.ipler.filter(ip => !edgeIds.has(ip.id)) };
}
export function searchCards(store, query) {
  const fold = text => text.toLocaleLowerCase('tr').replaceAll('ı', 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = fold(query.trim());
  return term ? store.kartlar.filter(card => fold(card.baslik + '\n' + card.aciklama).includes(term)) : [];
}
export function exportText(store) {
  const numbers = new Map(), result = [], seen = new Set();
  const roots = store.kartlar.filter(card => card.kaynakId === null || !store.kartlar.some(item => item.id === card.kaynakId));
  const append = (cards, prefix = '') => cards.map((card, i) => ({ card, number: prefix + (i + 1) })).reverse();
  const queue = append(roots);
  const walk = () => {
    while (queue.length) {
      const { card, number } = queue.pop();
      if (seen.has(card.id)) continue;
      seen.add(card.id); numbers.set(card.id, number); result.push(`${number} ${cardText(card)}`);
      queue.push(...append(store.kartlar.filter(item => item.kaynakId === card.id), number + '.'));
    }
  };
  walk();
  for (const card of store.kartlar) if (!seen.has(card.id)) { queue.push({ card, number: String(numbers.size + 1) }); walk(); }
  const extras = store.ipler.filter(ip => !store.kartlar.some(card => card.id === ip.aId && card.kaynakId === ip.bId || card.id === ip.bId && card.kaynakId === ip.aId));
  if (extras.length) result.push('Bağlar\n' + extras.map(ip => `${numbers.get(ip.aId)} ${cardTitle(store.kartlar.find(card => card.id === ip.aId))} — ${numbers.get(ip.bId)} ${cardTitle(store.kartlar.find(card => card.id === ip.bId))}`).join('\n'));
  return result.join('\n\n');
}
