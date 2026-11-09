// Version-1 store builders, kept for migration tests only (the app no longer creates v1 data).
export const emptyStore = () => ({ surum: 1, notlar: [], baglar: [] });
export const children = (store, parent = null) => store.notlar
  .filter(note => note.ustId === parent).sort((a, b) => a.sira - b.sira);

export function addNote(store, parent = null, text = '', id = crypto.randomUUID()) {
  if (parent !== null && !store.notlar.some(note => note.id === parent)) throw new Error('Üst bulunamadı.');
  if (store.notlar.some(note => note.id === id)) throw new Error('Kimlik zaten var.');
  const time = new Date().toISOString();
  const siblings = children(store, parent);
  const note = { id, ustId: parent, sira: (siblings.at(-1)?.sira ?? 0) + 1024,
    metin: text, olusturma: time, degisme: time };
  return { store: { ...store, notlar: [...store.notlar, note] }, note };
}
