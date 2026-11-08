import { boardGraph } from './workspace.js';

/** World origin stays at the visual center even for very asymmetric canvases. */
export function previewBoard(board, workspace) {
  const graph = boardGraph(workspace, board.id), ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attributes) => {
    const result = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    return result;
  };
  const svg = node('svg', { viewBox: '0 0 160 100', 'aria-hidden': 'true', class: 'board-preview' });
  const radiusX = Math.max(1, ...graph.kartlar.map(card => Math.abs(card.x)));
  const radiusY = Math.max(1, ...graph.kartlar.map(card => Math.abs(card.y)));
  const scale = Math.min(70 / radiusX, 40 / radiusY);
  const points = new Map(graph.kartlar.map(card => [card.id, { x: 80 + card.x * scale, y: 50 + card.y * scale }]));
  for (const ip of graph.ipler) {
    const a = points.get(ip.aId), b = points.get(ip.bId); if (!a || !b) continue;
    svg.append(node('path', { d: `M${a.x} ${a.y}C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`,
      fill: 'none', stroke: 'var(--ip)', 'stroke-width': 1 }));
  }
  for (const point of points.values()) svg.append(node('circle', { cx: point.x, cy: point.y, r: 2.6, fill: 'var(--ink-soft)', stroke: 'none' }));
  svg.append(node('circle', { cx: 80, cy: 50, r: 3.5, fill: 'var(--iris)', stroke: 'none', 'data-preview-center': '' }));
  return svg;
}
