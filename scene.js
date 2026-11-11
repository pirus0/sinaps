import { cardTitle, cardHeight, isImageCard } from './graph.js';

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
// Links always leave and enter a card through its side ports (the circles on the left and right
// edges), never its top or bottom. Cards side by side join facing sides; cards stacked in one column
// join on the same side with a curve that bows outwards, away from both cards.
export function curveBetween(a, b, orientationWidth = 158) {
  const dx = b.x - a.x;
  let start, end, c1, c2;
  if (Math.abs(dx) >= orientationWidth * .9) {
    const sign = dx >= 0 ? 1 : -1;
    start = { x: a.x + a.w / 2 * sign, y: a.y }; end = { x: b.x - b.w / 2 * sign, y: b.y };
    const mid = (start.x + end.x) / 2;
    c1 = { x: mid, y: start.y }; c2 = { x: mid, y: end.y };
  } else {
    const sign = dx >= 0 ? 1 : -1;
    start = { x: a.x + a.w / 2 * sign, y: a.y }; end = { x: b.x + b.w / 2 * sign, y: b.y };
    const bow = Math.min(90, 28 + Math.abs(b.y - a.y) * .2), out = sign > 0 ? Math.max(start.x, end.x) + bow : Math.min(start.x, end.x) - bow;
    c1 = { x: out, y: start.y }; c2 = { x: out, y: end.y };
  }
  return { start, end, c1, c2, d: `M${start.x} ${start.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}` };
}
export function makeScene(store, width = 158, measure = text => [...text].length * 8, title = '') {
  const cards = store.kartlar.map(card => ({ ...card, label: isImageCard(card) ? '' : cardTitle(card),
    w: isImageCard(card) ? 40 : Math.min(width, Math.max(card.fotoId ? 74 : 72, measure(cardTitle(card)) + 24 + (card.fotoId ? 31 : 0))), h: 40 }));
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

// Magnetic alignment while dragging: the moved card's left/centre/right and top/middle/bottom
// lines are pulled onto another card's matching lines when within `limit` world units.
// Outside that range the card follows the finger freely. Returns the snapped centre and guides.
// Magnetic alignment only looks at the card's neighbourhood: the SNAP_NEIGHBOURS cards whose edges
// are closest to it, and none further than one card width away (gap between the boxes, not centres).
// One pass over the board keeps the four best in a tiny sorted list, so large boards stay cheap.
export const SNAP_NEIGHBOURS = 4;
export function snapNeighbours(store, id, x, y, width, h, count = SNAP_NEIGHBOURS) {
  const near = [];
  for (const card of store.kartlar) {
    if (card.id === id) continue;
    const oh = cardHeight(card, width);
    const gap = Math.hypot(Math.max(0, Math.abs(card.x - x) - width), Math.max(0, Math.abs(card.y - y) - (h + oh) / 2));
    if (gap > width || (near.length === count && gap >= near[count - 1].gap)) continue;
    near.push({ card, gap, h: oh }); near.sort((a, b) => a.gap - b.gap); if (near.length > count) near.pop();
  }
  return near;
}
export function snapPosition(store, id, x, y, width, limit) {
  const moved = store.kartlar.find(card => card.id === id); if (!moved) return { x, y, guides: [] };
  const lines = (cx, cy, h) => ({ xs: [cx - width / 2, cx, cx + width / 2], ys: [cy - h / 2, cy, cy + h / 2] });
  const h = cardHeight(moved, width), mine = lines(x, y, h);
  let bestX = null, bestY = null;
  for (const { card, h: oh } of snapNeighbours(store, id, x, y, width, h)) {
    const other = lines(card.x, card.y, oh);
    for (const own of mine.xs) for (const at of other.xs) {
      const d = at - own; if (Math.abs(d) <= limit && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at, card, oh };
    }
    for (const own of mine.ys) for (const at of other.ys) {
      const d = at - own; if (Math.abs(d) <= limit && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at, card };
    }
  }
  const nx = x + (bestX?.d ?? 0), ny = y + (bestY?.d ?? 0), guides = [];
  if (bestX) guides.push({ x1: bestX.at, x2: bestX.at, y1: Math.min(ny - h / 2, bestX.card.y - bestX.oh / 2), y2: Math.max(ny + h / 2, bestX.card.y + bestX.oh / 2) });
  if (bestY) guides.push({ y1: bestY.at, y2: bestY.at, x1: Math.min(nx, bestY.card.x) - width / 2, x2: Math.max(nx, bestY.card.x) + width / 2 });
  return { x: nx, y: ny, guides };
}
