import { parseCopy, addCopy } from './copy.js';

/** Explicit demo link imports once and preserves every existing board. */
export async function loadSample(workspace, name) {
  if (name !== 'fotosentez') throw new Error('Örnek bulunamadı');
  const response = await fetch(new URL('./examples/fotosentez.sinaps', import.meta.url));
  if (!response.ok) throw new Error('Örnek açılamadı');
  const payload = parseCopy(await response.text());
  const previous = workspace.tuvaller.find(board => !board.silinme && board.kopyaKaynagi?.tuvalId === payload.tuval.id);
  if (previous) return { workspace, board: previous };
  return addCopy(workspace, payload);
}
