let database;
const images = new Map(), loading = new Map();
function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('sinaps-fotograflar', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('fotolar', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}
export async function getPhoto(id) {
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction('fotolar').objectStore('fotolar').get(id);
    request.onsuccess = () => { const value = request.result; if (value?.bytes) { value.blob = new Blob([value.bytes], { type: 'image/jpeg' }); delete value.bytes; } resolve(value); }; request.onerror = () => reject(request.error); });
}
export async function putPhoto(record) {
  const database = await db();
  const write = value => new Promise((resolve, reject) => {
    const transaction = database.transaction('fotolar', 'readwrite');
    const request = transaction.objectStore('fotolar').put(value); let failure;
    request.onerror = () => { failure = request.error; };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || failure || new Error('Fotoğraf kaydedilemedi'));
  });
  try { await write(record); }
  catch (error) {
    // Some WebKit environments cannot materialize Blob backing files. Keep the
    // same compressed JPEG bytes in IndexedDB; callers still receive a Blob.
    if (error.name !== 'UnknownError') throw error;
    const { blob, ...metadata } = record; await write({ ...metadata, bytes: await blob.arrayBuffer() });
  }
}
export async function removePhoto(id) {
  const database = await db();
  await new Promise((resolve, reject) => { const transaction = database.transaction('fotolar', 'readwrite'); transaction.objectStore('fotolar').delete(id);
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  const cached = images.get(id); if (cached) { URL.revokeObjectURL(cached.url); images.delete(id); }
}
async function decoded(blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Fotoğraf açılamadı')); image.src = url; });
    return { image, url };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
export async function encodePhoto(file) {
  const source = await decoded(file), canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 1080 / Math.max(source.image.naturalWidth, source.image.naturalHeight));
    const en = Math.max(1, Math.round(source.image.naturalWidth * scale)), boy = Math.max(1, Math.round(source.image.naturalHeight * scale));
    canvas.width = en; canvas.height = boy; const context = canvas.getContext('2d'); if (!context) throw new Error('Fotoğraf işlenemedi');
    context.fillStyle = '#fff'; context.fillRect(0, 0, en, boy); context.drawImage(source.image, 0, 0, en, boy);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .7));
    if (!blob || blob.type !== 'image/jpeg') throw new Error('JPEG oluşturulamadı');
    // Final user decision: only this JPEG is kept, never the uploaded original.
    return { id: crypto.randomUUID(), blob, en, boy };
  } finally { canvas.width = 1; canvas.height = 1; URL.revokeObjectURL(source.url); }
}
export const photoImage = id => images.get(id)?.image;
export const photoURL = id => images.get(id)?.url;
export async function warmPhotos(cards) {
  const ids = [...new Set(cards.map(card => card.fotoId).filter(Boolean))];
  for (const id of ids) if (!images.has(id)) {
    if (!loading.has(id)) loading.set(id, (async () => {
      const record = await getPhoto(id); if (!record) throw new Error('Fotoğraf bulunamadı');
      const source = await decoded(record.blob); images.set(id, { ...source, record });
    })().finally(() => loading.delete(id)));
    await loading.get(id);
  }
}
export function releasePhotos(keep = []) {
  const ids = new Set(keep);
  for (const [id, cached] of images) if (!ids.has(id)) { URL.revokeObjectURL(cached.url); images.delete(id); }
}
function base64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
export async function exportPhotos(cards) {
  const result = [];
  for (const id of new Set(cards.map(card => card.fotoId).filter(Boolean))) {
    const record = await getPhoto(id); if (!record) throw new Error('Fotoğraf yedeği okunamadı');
    result.push({ id, en: record.en, boy: record.boy, type: 'image/jpeg', data: await base64(record.blob) });
  }
  return result;
}
export async function importPhotos(records, usedIds) {
  if (!Array.isArray(records)) throw new Error('Fotoğraf yedeği geçersiz');
  const staged = [];
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || typeof record.data !== 'string' || record.type !== 'image/jpeg') throw new Error('Fotoğraf yedeği geçersiz');
    if (!usedIds.has(record.id) || await getPhoto(record.id)) continue;
    const binary = atob(record.data), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('JPEG yedeği geçersiz');
    const blob = new Blob([bytes], { type: 'image/jpeg' }), source = await decoded(blob);
    try {
      if ((record.en != null && source.image.naturalWidth !== record.en) || (record.boy != null && source.image.naturalHeight !== record.boy) || Math.max(source.image.naturalWidth, source.image.naturalHeight) > 1080) throw new Error('Fotoğraf ölçüsü geçersiz');
      staged.push({ id: record.id, blob, en: source.image.naturalWidth, boy: source.image.naturalHeight });
    } finally { URL.revokeObjectURL(source.url); }
  }
  for (const record of staged) await putPhoto(record);
}
