import { cardTitle, cardHeight } from './graph.js';

export const cardWidth = width => Math.round(Math.min(width, 448) * .42);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const worldToScreen = (point, camera, viewport) => ({ x: (point.x - camera.x) * camera.z + viewport.width / 2,
  y: (point.y - camera.y) * camera.z + viewport.height / 2 });
export const screenToWorld = (point, camera, viewport) => ({ x: camera.x + (point.x - viewport.width / 2) / camera.z,
  y: camera.y + (point.y - viewport.height / 2) / camera.z });

export function shorten(text, width, measure) {
  if (width <= 0) return '';
  if (measure(text) <= width) return text;
  if (measure('…') > width) return '';
  let low = 0, high = [...text].length;
  const chars = [...text];
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, middle).join('') + '…') <= width) low = middle; else high = middle - 1;
  }
  return chars.slice(0, low).join('') + '…';
}
export function previewLines(text, width, measure, limit = 2) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = []; let line = '';
  for (let i = 0; i < words.length; i++) {
    const candidate = line ? line + ' ' + words[i] : words[i];
    if (measure(candidate) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; i--; }
    else { lines.push(shorten(words[i], width, measure)); }
    if (lines.length === limit) {
      lines[limit - 1] = shorten(lines[limit - 1] + ' …', width, measure); return lines;
    }
  }
  if (line && lines.length < limit) lines.push(line);
  return lines;
}
export function curveBetween(a, b, orientationWidth = 158) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let start, end, c1, c2;
  if (Math.abs(dx) >= orientationWidth * .9) {
    const sign = dx >= 0 ? 1 : -1;
    start = { x: a.x + a.w / 2 * sign, y: a.y }; end = { x: b.x - b.w / 2 * sign, y: b.y };
    const mid = (start.x + end.x) / 2;
    c1 = { x: mid, y: start.y }; c2 = { x: mid, y: end.y };
  } else {
    const sign = dy >= 0 ? 1 : -1;
    start = { x: a.x, y: a.y + a.h / 2 * sign }; end = { x: b.x, y: b.y - b.h / 2 * sign };
    const mid = (start.y + end.y) / 2;
    c1 = { x: start.x, y: mid }; c2 = { x: end.x, y: mid };
  }
  return { start, end, c1, c2, d: `M${start.x} ${start.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}` };
}
export function makeScene(store, width = 158, measure = text => [...text].length * 8, title = '') {
  const cards = store.kartlar.map(card => ({ ...card, label: cardTitle(card), w: Math.min(width, Math.max(card.fotoId ? 74 : 72, measure(cardTitle(card)) + 24 + (card.fotoId ? 31 : 0))), h: 40 }));
  const map = new Map(cards.map(card => [card.id, card]));
  const edges = store.ipler.filter(ip => map.has(ip.aId) && map.has(ip.bId))
    .map(ip => ({ ...ip, ...curveBetween(map.get(ip.aId), map.get(ip.bId), width) }));
  return { cards, edges, width, center: title ? { label: title, w: Math.min(260, measure(title) + 16) } : null };
}
export function sceneBounds(scene, full = false) {
  if (!scene.cards.length && !scene.center) return null;
  const points = scene.center ? [{ x: -scene.center.w / 2, y: -15 }, { x: scene.center.w / 2, y: 40 }] : [];
  for (const card of scene.cards) {
    const w = full ? scene.width : card.w, h = full ? cardHeight(card, scene.width) : card.h;
    points.push({ x: card.x - w / 2, y: card.y - h / 2 }, { x: card.x + w / 2, y: card.y + h / 2 });
  }
  if (!full) for (const edge of scene.edges) points.push(edge.start, edge.end, edge.c1, edge.c2);
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
export function fitCamera(scene, viewport, focus = { x: 0, y: 0 }) {
  if (!scene.cards.length) return { x: 0, y: 0, z: 1 };
  if (scene.center) {
    const maxX = Math.max(1, ...scene.cards.map(card => Math.abs(card.x)));
    const maxY = Math.max(1, ...scene.cards.map(card => Math.abs(card.y)));
    const label = Math.max(scene.center.w, ...scene.cards.map(card => card.w));
    const z = Math.max(.001, Math.min(1, (viewport.width / 2 - 16 - label / 2) / maxX, (viewport.height / 2 - 138) / maxY));
    return z < .38 ? { x: focus.x, y: focus.y, z: .38 } : { x: 0, y: 0, z };
  }
  const xs = [...(scene.center ? [0] : []), ...scene.cards.map(card => card.x)], ys = [...(scene.center ? [0] : []), ...scene.cards.map(card => card.y)];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const maxLabel = Math.max(scene.center?.w || 0, ...scene.cards.map(card => card.w));
  const z = Math.max(.001, Math.min(1, (viewport.width - 32 - maxLabel) / Math.max(1, maxX - minX),
    (viewport.height - 112 - 118 - 40) / Math.max(1, maxY - minY)));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 3 / z, z };
}
export function zoomAt(camera, oldPoint, newPoint, factor, viewport, minZoom = .001) {
  const fixed = screenToWorld(oldPoint, camera, viewport);
  const z = clamp(camera.z * factor, minZoom, 4);
  return { x: fixed.x - (newPoint.x - viewport.width / 2) / z,
    y: fixed.y - (newPoint.y - viewport.height / 2) / z, z };
}
export function clampCamera(camera, scene, viewport) {
  const bounds = sceneBounds(scene, true);
  if (!bounds) return { x: 0, y: 0, z: 1 };
  return { ...camera, x: clamp(camera.x, bounds.minX - viewport.width / camera.z / 2, bounds.maxX + viewport.width / camera.z / 2),
    y: clamp(camera.y, bounds.minY - viewport.height / camera.z / 2, bounds.maxY + viewport.height / camera.z / 2) };
}
export function exportPlan(scene, { scale = 2, maxSide = 4096, maxPixels = 8_000_000 } = {}) {
  const bounds = sceneBounds(scene);
  if (!bounds) return null;
  const width = Math.max(360, Math.ceil(bounds.width + 80));
  let watermark = 24, height;
  for (let i = 0; i < 4; i++) {
    height = Math.ceil(bounds.height + 40 + 48 + watermark);
    watermark = Math.round(clamp(Math.min(width, height) * .06, 24, 56));
  }
  height = Math.ceil(bounds.height + 40 + 48 + watermark);
  if (![width, height].every(Number.isFinite)) throw new Error('Görüntü boyutu hesaplanamadı.');
  const fits = factor => width * factor <= maxSide && height * factor <= maxSide && width * height * factor * factor <= maxPixels;
  let factor = scale;
  if (!fits(factor)) factor = 1;
  if (!fits(factor)) factor = Math.min(1, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  return { bounds, width, height, watermark, band: 48 + watermark, scale: factor,
    pixelWidth: Math.max(1, Math.floor(width * factor)), pixelHeight: Math.max(1, Math.floor(height * factor)),
    offsetX: (width - bounds.width) / 2 - bounds.minX, offsetY: 40 - bounds.minY };
}
