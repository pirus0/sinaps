// Version-1 (tree) data: only what migration to the card graph still needs (graph.js migrateV1).
export const STORAGE_KEY = 'dallanan-not-data-v1';

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
