import { cardTitle, linked, cardHeight, isImageCard } from './graph.js';
import { cardWidth, snapPosition, curveBetween, worldToScreen, screenToWorld, clampCamera, zoomAt, shorten, previewLines } from './scene.js';
import { textMeasure } from './png.js';
import { photoURL } from './photos.js';
import { overTrash, armTrash, swallow } from './trash-drop.js';
import { brandSVG } from './brand.js';
// Screen width (px) a card needs before each part is drawn; parts vanish in this order when zooming out.
// Print is unaffected: pdf.js draws every part at full size.
const GHOST = 24 * 9 / 2.6; // px; logo dot radius equals the center dot's 9 px
const LOD = Object.freeze({ description: 120, controls: 90, photo: 64, title: 40, edges: 16, outline: 16, dot: 8 });

const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class CanvasView {
  constructor(svg, callbacks) {
    this.svg = svg; this.callbacks = callbacks; this.points = new Map(); this.mode = 'idle';
    this.lastTap = null; this.longTimer = null; this.edgeFrame = null; this.drawFrame = null;
    // iOS Safari keeps sending a touch's events to the element first touched; if a redraw
    // detaches it, the moves never reach the svg. Held targets stay attached until release.
    this.held = new Map();
    svg.addEventListener('pointerdown', event => this.down(event));
    svg.addEventListener('pointermove', event => this.move(event));
    svg.addEventListener('pointerup', event => this.up(event));
    svg.addEventListener('pointercancel', () => this.cancel());
    svg.addEventListener('lostpointercapture', event => { if (this.points.has(event.pointerId)) this.cancel(); });
    svg.addEventListener('contextmenu', event => event.preventDefault());
    svg.addEventListener('keydown', event => {
      const photo = event.target.closest('[data-photo]')?.dataset.photo;
      const port = event.target.closest('[data-port]')?.dataset.port;
      if (['Enter', ' '].includes(event.key) && (photo || port)) {
        event.preventDefault(); if (photo) this.callbacks.onPhoto?.(photo); else this.callbacks.onWireTap?.(port); return;
      }
      const id = event.target.closest('[data-card]')?.dataset.card;
      if (id && ['Enter', ' '].includes(event.key)) { event.preventDefault(); this.callbacks.onCard(id); }
    });
    svg.addEventListener('wheel', event => {
      event.preventDefault();
      const camera = this.callbacks.state().camera, viewport = this.viewport();
      const next = event.ctrlKey ? zoomAt(camera, this.point(event), this.point(event), Math.exp(-event.deltaY / 200), viewport, this.callbacks.state().sade ? .38 : .001)
        : { ...camera, x: camera.x + event.deltaX / camera.z, y: camera.y + event.deltaY / camera.z };
      this.setCamera(next, true);
    }, { passive: false });
  }
  viewport() { const rect = this.svg.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }
  point(event) { const rect = this.svg.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  scene() { return this.callbacks.scene(); }
  setCamera(camera, done = false) {
    this.callbacks.onCamera(clampCamera(camera, this.scene(), this.viewport()), done); this.requestDraw();
  }
  requestDraw() {
    if (!this.drawFrame) this.drawFrame = requestAnimationFrame(() => { this.drawFrame = null; this.draw(); });
  }
  draw() {
    const store = this.callbacks.store(), state = this.callbacks.state(), viewport = this.viewport();
    if (!viewport.width || !viewport.height) return;
    const { camera, sade, target, highlight } = state, width = cardWidth(viewport.width);
    const measureTitle = textMeasure('600 15.5px Geist'), measureBody = textMeasure('400 13.5px Geist'), measurePill = textMeasure();
    this.svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    this.ghostLogo(store.kartlar.length === 0, state.board, worldToScreen({ x: 0, y: 0 }, camera, viewport));
    const step = Math.max(4, 22 * camera.z);
    const origin = worldToScreen({ x: 0, y: 0 }, camera, viewport);
    this.svg.parentElement.style.backgroundSize = `${step}px ${step}px`;
    this.svg.parentElement.style.backgroundPosition = `${origin.x % step}px ${origin.y % step}px`;
    const defs = svgNode('defs'); let clipIndex = 0;
    const edgeLayer = svgNode('g', { class: 'canvas-edges', 'aria-hidden': 'true' });
    const cardLayer = svgNode('g', { class: 'canvas-cards' });
    const rects = new Map(store.kartlar.map(card => {
      const pill = isImageCard(card) ? 40 : Math.max(card.fotoId ? 74 : 72, Math.min(width, measurePill(cardTitle(card)) + 24 + (card.fotoId ? 31 : 0), (width + 44) * camera.z - 8));
      return [card.id, { ...card, w: sade ? pill / camera.z : width, h: sade ? 40 / camera.z : cardHeight(card, width) }];
    }));
    const cull = 48, edgesShown = sade || width * camera.z >= LOD.edges;
    for (const ip of edgesShown ? store.ipler : []) {
      const a = rects.get(ip.aId), b = rects.get(ip.bId); if (!a || !b) continue;
      const curve = curveBetween(a, b, width);
      const points = [curve.start, curve.c1, curve.c2, curve.end].map(point => worldToScreen(point, camera, viewport));
      // A Bezier curve stays inside its control points' box; skip curves wholly off screen.
      const xs = points.map(point => point.x), ys = points.map(point => point.y);
      if (Math.max(...xs) < -cull || Math.min(...xs) > viewport.width + cull || Math.max(...ys) < -cull || Math.min(...ys) > viewport.height + cull) continue;
      edgeLayer.append(svgNode('path', { d: `M${points[0].x} ${points[0].y}C${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`,
        fill: 'none', stroke: 'var(--ip)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round' }));
    }
    if (this.mode === 'drag' && this.original) {
      const point = worldToScreen(this.original, camera, viewport);
      cardLayer.append(svgNode('rect', { x: point.x - width * camera.z / 2, y: point.y - cardHeight(this.original, width) / 2 * camera.z,
        width: width * camera.z, height: cardHeight(this.original, width) * camera.z, rx: 18 * camera.z,
        class: 'drag-ghost', fill: 'none', stroke: 'var(--ink-faint)', 'stroke-dasharray': '4 4' }));
    }
    for (const card of store.kartlar) {
      const rect = rects.get(card.id), point = worldToScreen(card, camera, viewport);
      const scale = sade ? 1 : camera.z, w = sade ? rect.w * camera.z : width, h = sade ? 40 : cardHeight(card, width);
      // Only cards on screen are built; panning a large board stays cheap.
      const halfW = w * scale / 2 + cull, halfH = h * scale / 2 + cull, moving0 = this.mode === 'drag' && card.id === this.original?.id;
      if (!moving0 && (point.x + halfW < 0 || point.x - halfW > viewport.width || point.y + halfH < 0 || point.y - halfH > viewport.height)) continue;
      // Level of detail (LOD): as a card shrinks on screen its parts fade out in a fixed order.
      const screenW = w * scale, shows = part => sade || screenW >= LOD[part];
      const imageOnly = isImageCard(card), photoHeight = !sade && card.fotoId ? imageOnly ? h - 1.5 : w * .6 : 0;
      const unavailable = target && (card.id === target || linked(store, card.id, target));
      const wireTarget = this.wire?.target === card.id && card.id !== this.start?.id && !linked(store, this.start?.id, card.id);
      const marked = card.id === target || card.id === highlight || wireTarget;
      const moving = this.mode === 'drag' && card.id === this.original?.id;
      const group = svgNode('g', { 'data-card': card.id, role: 'button', tabindex: unavailable ? -1 : 0,
        'aria-label': imageOnly ? 'Görsel' : cardTitle(card), 'aria-disabled': unavailable ? 'true' : 'false',
        class: `canvas-card${marked ? ' marked' : ''}${unavailable ? ' unavailable' : ''}${moving ? ' moving' : ''}`,
        transform: `translate(${point.x} ${point.y}) scale(${scale})` });
      const hitW = Math.max(w, 44 / scale), hitH = Math.max(h, 44 / scale);
      group.append(svgNode('rect', { x: -hitW / 2, y: -hitH / 2, width: hitW, height: hitH, fill: 'transparent', class: 'card-hit' }));
      const surface = svgNode('g', { class: 'card-surface', transform: moving ? 'scale(1.04)' : 'scale(1)' });
      if (!shows('dot')) {
        surface.append(svgNode('circle', { r: Math.min(3, Math.max(1, screenW / 3)) / scale, fill: marked ? 'var(--iris)' : 'var(--ink-soft)', stroke: 'none' }));
        group.append(surface); cardLayer.append(group); continue;
      }
      surface.append(svgNode('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: sade ? 14 : 18,
        fill: shows('outline') || marked ? 'var(--surface)' : 'var(--ink-faint)', stroke: marked ? 'var(--iris)' : !sade && shows('outline') ? 'var(--cerceve)' : 'none',
        'stroke-width': wireTarget ? 2.5 : marked ? 2 : 1.5, 'vector-effect': 'non-scaling-stroke' }));
      const imageURL = shows('photo') && card.fotoId && photoURL(card.fotoId);
      if (imageURL) {
        const clipId = 'photo-clip-' + clipIndex++, clip = svgNode('clipPath', { id: clipId });
        if (sade) clip.append(svgNode('circle', { cx: -w / 2 + 20, cy: 0, r: 15, fill: '#000', stroke: 'none' }));
        else if (imageOnly) clip.append(svgNode('rect', { x: -w / 2 + .75, y: -h / 2 + .75, width: w - 1.5, height: h - 1.5, rx: 16.5, fill: '#000', stroke: 'none' }));
        else clip.append(svgNode('path', { d: `M${-w / 2 + 17} ${-h / 2 + .75}H${w / 2 - 17}Q${w / 2 - .75} ${-h / 2 + .75} ${w / 2 - .75} ${-h / 2 + 17}V${-h / 2 + photoHeight}H${-w / 2 + .75}V${-h / 2 + 17}Q${-w / 2 + .75} ${-h / 2 + .75} ${-w / 2 + 17} ${-h / 2 + .75}Z`, fill: '#000', stroke: 'none' }));
        defs.append(clip);
        surface.append(svgNode('image', { href: imageURL, x: sade ? -w / 2 + 5 : -w / 2 + .75, y: sade ? -15 : -h / 2 + .75,
          width: sade ? 30 : w - 1.5, height: sade ? 30 : photoHeight, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` }));
      }
      const titleText = shows('title') && !imageOnly ? shorten(cardTitle(card), w - (sade ? card.fotoId ? 55 : 24 : 28), sade ? measurePill : measureTitle) : '';
      if (!imageOnly && shows('title')) surface.append(svgNode('text', { x: sade ? card.fotoId ? -w / 2 + 43 : 0 : -w / 2 + 14, y: sade ? 5 : -h / 2 + photoHeight + 28,
        'text-anchor': sade && !card.fotoId ? 'middle' : 'start', class: `card-title${!card.baslik ? ' fallback' : ''}` }, titleText));
      if (!sade && card.baslik && shows('description')) {
        for (const [index, line] of previewLines(card.aciklama, w - 28, measureBody).entries()) {
          surface.append(svgNode('text', { x: -w / 2 + 14, y: -h / 2 + photoHeight + 49 + index * 19.5, class: 'card-description' }, line));
        }
      }
      group.append(surface);
      if (!sade && !target && !state.locked && shows('controls')) {
        for (const side of [-1, 1]) {
          const port = svgNode('g', { 'data-port': card.id, 'data-side': side, class: 'card-port', transform: `translate(${side * w / 2} 0)`, 'aria-label': 'Bağla', role: 'button', tabindex: 0 });
          port.append(svgNode('circle', { r: 22 / scale, fill: 'transparent', stroke: 'none' }),
            svgNode('circle', { r: 6 / scale, fill: this.wire && this.start?.id === card.id && this.start.side === side ? 'var(--iris)' : 'var(--surface)',
              stroke: this.wire && this.start?.id === card.id && this.start.side === side ? 'var(--iris)' : 'var(--ink-soft)', 'stroke-width': 1.5 / scale }));
          group.append(port);
        }
        const photo = svgNode('g', { 'data-photo': card.id, class: 'photo-control', role: 'button', tabindex: 0,
          'aria-label': 'Fotoğraf', transform: `translate(0 ${h / 2})` });
        photo.append(svgNode('circle', { cy: 5.5 / scale, r: 22 / scale, fill: 'transparent', stroke: 'none' }),
          svgNode('path', { d: `M${-7 / scale} ${1 / scale}L${7 / scale} ${1 / scale}L0 ${10 / scale}Z`,
            fill: card.fotoId ? 'var(--iris)' : 'var(--paper)', stroke: card.fotoId ? 'var(--iris)' : 'var(--ink-soft)',
            'stroke-width': 1.5 / scale, 'stroke-linejoin': 'round' }));
        group.append(photo);
      }
      cardLayer.append(group);
    }
    if (this.mode === 'drag' && this.guides?.length) {
      for (const guide of this.guides) {
        const a = worldToScreen({ x: guide.x1, y: guide.y1 }, camera, viewport), b = worldToScreen({ x: guide.x2, y: guide.y2 }, camera, viewport);
        edgeLayer.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'snap-guide', stroke: 'var(--iris)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'pointer-events': 'none' }));
      }
    }
    if (this.wire && this.start) {
      const source = store.kartlar.find(card => card.id === this.start.id);
      if (source) {
        const from = worldToScreen({ x: source.x + (this.start.side || 1) * width / 2, y: source.y }, camera, viewport), to = this.wire.point, mid = (from.x + to.x) / 2;
        const line = svgNode('path', { d: `M${from.x} ${from.y}C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`, fill: 'none', stroke: 'var(--iris)', 'stroke-width': 2, 'pointer-events': 'none' });
        cardLayer.append(line);
        if (!this.wire.target) cardLayer.append(svgNode('rect', { x: to.x - width * camera.z / 2, y: to.y - 44 * camera.z,
          width: width * camera.z, height: 88 * camera.z, rx: 18 * camera.z, fill: 'none', stroke: 'var(--iris)',
          'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }));
      }
    }
    const centerLayer = svgNode('g', { class: 'canvas-center', transform: `translate(${origin.x} ${origin.y})`, 'pointer-events': 'none', 'aria-hidden': 'true' });
    centerLayer.append(svgNode('circle', { r: 15, fill: 'var(--iris-soft)', stroke: 'none' }), svgNode('circle', { r: 9, fill: 'var(--iris)', stroke: 'none' }));
    const label = shorten(state.title || '', Math.min(260, viewport.width - 32), measureBody), labelWidth = measureBody(label) + 12;
    centerLayer.append(svgNode('rect', { x: -labelWidth / 2, y: 22, width: labelWidth, height: 22, rx: 4, fill: 'var(--paper)', stroke: 'none' }), svgNode('text', { x: 0, y: 37, 'text-anchor': 'middle', fill: 'var(--iris)', stroke: 'none', 'font-size': 13, 'font-weight': 600 }, label));
    const keep = svgNode('g', { class: 'canvas-held', visibility: 'hidden', 'pointer-events': 'none', 'aria-hidden': 'true' });
    for (const node of this.held.values()) if (!cardLayer.contains(node)) keep.append(node);
    this.svg.replaceChildren(defs, edgeLayer, centerLayer, cardLayer, keep);
  }
  // An empty board shows the logo faintly behind the center dot, its dot exactly under it
  // (logo dot r 2.6 of 24 -> scaled so it matches the center dot's r 9). It is one persistent
  // element moved by transform; when the first card appears it fades out over 2 s (opacity only).
  ghostLogo(empty, board, origin) {
    if (!this.ghost) {
      this.ghost = document.createElement('div'); this.ghost.className = 'ghost-logo'; this.ghost.setAttribute('aria-hidden', 'true');
      this.ghost.innerHTML = brandSVG({ size: GHOST, ink: 'var(--ink)', accent: 'var(--iris)' });
      Object.assign(this.ghost.firstElementChild.style, { width: GHOST + 'px', height: GHOST + 'px' });
      this.svg.before(this.ghost);
    }
    const node = this.ghost;
    node.style.transform = `translate(${origin.x - GHOST / 2}px,${origin.y - GHOST / 2}px)`;
    if (board !== this.ghostBoard) { this.ghostBoard = board; this.ghostFade?.cancel(); this.ghostFade = null; node.hidden = !empty; this.ghostShown = empty; return; }
    if (empty) { if (!this.ghostShown) { this.ghostFade?.cancel(); this.ghostFade = null; node.hidden = false; this.ghostShown = true; } return; }
    if (!this.ghostShown) return;
    this.ghostShown = false;
    const fade = this.ghostFade = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 2000, easing: 'ease-in', fill: 'forwards' });
    fade.finished.then(() => { if (this.ghostFade === fade) { node.hidden = true; fade.cancel(); this.ghostFade = null; } }).catch(() => {});
  }
  down(event) {
    if (event.button !== 0 || this.points.size >= 2) return;
    event.preventDefault();
    const point = this.point(event); this.points.set(event.pointerId, point);
    if (event.target !== this.svg && event.target instanceof SVGElement) this.held.set(event.pointerId, event.target);
    this.svg.setPointerCapture(event.pointerId);
    clearTimeout(this.longTimer);
    if (this.points.size === 2) {
      if (this.mode === 'drag') { this.callbacks.onMoveCancel(this.original); armTrash(false, false); this.trashHover = false; }
      const [a, b] = [...this.points.values()];
      this.wire = null; this.mode = 'pinch'; this.pinch = { camera: { ...this.callbacks.state().camera }, point: middle(a, b), distance: Math.max(1, distance(a, b)) };
      this.requestDraw(); return;
    }
    const id = event.target.closest('[data-card]')?.dataset.card ?? null;
    this.start = { point, camera: { ...this.callbacks.state().camera }, id, side: Number(event.target.closest('[data-port]')?.dataset.side || 1) };
    const state = this.callbacks.state();
    if (event.target.closest('[data-photo]') && !state.locked) { this.mode = 'photo-pending'; return; }
    if (event.target.closest('[data-port]') && !state.locked) { this.mode = 'wire-pending'; return; }
    if (!id && this.lastTap && Date.now() - this.lastTap.time < 300 && distance(point, this.lastTap.point) < 24) {
      this.mode = 'one-zoom'; this.lastTap = null; return;
    }
    this.mode = 'pending';
  }
  move(event) {
    if (!this.points.has(event.pointerId)) return;
    event.preventDefault(); const point = this.point(event); this.points.set(event.pointerId, point);
    if (this.mode === 'pinch') {
      const [a, b] = [...this.points.values()]; if (!b) return;
      this.setCamera(zoomAt(this.pinch.camera, this.pinch.point, middle(a, b), distance(a, b) / this.pinch.distance, this.viewport(), this.callbacks.state().sade ? .38 : .001)); return;
    }
    if (this.mode === 'wire-pending' && distance(point, this.start.point) > 8) this.mode = 'wire';
    if (this.mode === 'photo-pending' && distance(point, this.start.point) > 8) this.mode = 'pan';
    if (this.mode === 'wire') {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-card]')?.dataset.card ?? null;
      this.wire = { point, target: hit }; this.requestDraw(); return;
    }
    if (this.mode === 'pending' && distance(point, this.start.point) > 8) {
      const state = this.callbacks.state(), card = this.callbacks.store().kartlar.find(card => card.id === this.start.id);
      if (card && !state.sade && !state.target && !state.locked) {
        this.original = { ...card }; this.mode = 'drag';
        const world = screenToWorld(this.start.point, this.start.camera, this.viewport());
        this.dragOffset = { x: world.x - card.x, y: world.y - card.y }; this.trashHover = false; armTrash(true, false); this.callbacks.onDragStart?.(); this.autoEdge();
      } else this.mode = 'pan';
    }
    if (this.mode === 'pan') {
      this.setCamera({ ...this.start.camera, x: this.start.camera.x - (point.x - this.start.point.x) / this.start.camera.z,
        y: this.start.camera.y - (point.y - this.start.point.y) / this.start.camera.z });
    } else if (this.mode === 'one-zoom') {
      this.setCamera(zoomAt(this.start.camera, this.start.point, this.start.point, Math.exp(-(point.y - this.start.point.y) / 160), this.viewport(), this.callbacks.state().sade ? .38 : .001));
    } else if (this.mode === 'drag') {
      const hover = overTrash(event.clientX, event.clientY);
      if (hover !== this.trashHover) { this.trashHover = hover; armTrash(true, hover); }
      this.previewDrag(point);
    }
  }
  previewDrag(point) {
    const camera = this.callbacks.state().camera, viewport = this.viewport(), world = screenToWorld(point, camera, viewport);
    // 12 screen px of pull, whatever the zoom.
    const snap = snapPosition(this.callbacks.store(), this.original.id, world.x - this.dragOffset.x, world.y - this.dragOffset.y, cardWidth(viewport.width), 12 / camera.z);
    this.guides = snap.guides; this.callbacks.onMovePreview(this.original.id, snap.x, snap.y); this.requestDraw();
  }
  autoEdge() {
    if (this.mode !== 'drag') return;
    const point = [...this.points.values()][0];
    if (point) {
      const viewport = this.viewport(), camera = this.callbacks.state().camera;
      const velocity = (value, max, low = 36, high = max - 36) => value < low ? -(low - value) / 5 : value > high ? (value - high) / 5 : 0;
      const short = viewport.height < 500, dx = velocity(point.x, viewport.width), dy = velocity(point.y, viewport.height, short ? 56 : 112, viewport.height - (short ? 64 : 118));
      if ((dx || dy) && !this.trashHover) { this.setCamera({ ...camera, x: camera.x + dx / camera.z, y: camera.y + dy / camera.z }); this.previewDrag(point); }
    }
    this.edgeFrame = requestAnimationFrame(() => this.autoEdge());
  }
  up(event) {
    if (!this.points.has(event.pointerId)) return;
    const point = this.point(event), mode = this.mode, start = this.start, original = this.original, wire = this.wire;
    this.points.delete(event.pointerId); this.held.delete(event.pointerId); clearTimeout(this.longTimer);
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    if (this.points.size) {
      const remaining = [...this.points.values()][0];
      this.mode = 'pan'; this.start = { point: remaining, camera: { ...this.callbacks.state().camera }, id: null }; return;
    }
    this.mode = 'idle'; this.wire = null; this.guides = null; cancelAnimationFrame(this.edgeFrame); this.edgeFrame = null;
    if (mode === 'photo-pending') this.callbacks.onPhoto?.(start.id);
    else if (mode === 'wire-pending') this.callbacks.onWireTap?.(start.id);
    else if (mode === 'wire') {
      const viewport = this.viewport();
      if (wire?.target || (point.y >= 112 && point.y <= viewport.height - 118 && point.x >= 0 && point.x <= viewport.width)) {
        this.callbacks.onWireDrop?.(start.id, wire?.target ?? null, screenToWorld(point, this.callbacks.state().camera, viewport));
      }
    } else if (mode === 'drag') {
      armTrash(false, false);
      if (this.trashHover && this.callbacks.onTrashDrop) { swallow(this.svg, original.id); this.callbacks.onTrashDrop(original); }
      else this.callbacks.onMoveDone(original);
      this.original = null; this.trashHover = false;
    }
    else if (mode === 'pending' && start.id) this.callbacks.onCard(start.id);
    else if (mode === 'pending') this.lastTap = { point, time: Date.now() };
    if (['pan', 'pinch', 'one-zoom', 'drag'].includes(mode)) this.callbacks.onCamera(this.callbacks.state().camera, true);
    this.requestDraw();
  }
  cancel() {
    clearTimeout(this.longTimer); cancelAnimationFrame(this.edgeFrame); this.edgeFrame = null;
    if (this.mode === 'drag' && this.original) { this.callbacks.onMoveCancel(this.original); armTrash(false, false); }
    this.trashHover = false; this.mode = 'idle'; this.wire = null; this.guides = null; this.original = null; this.points.clear(); this.held.clear(); this.requestDraw();
  }
}
