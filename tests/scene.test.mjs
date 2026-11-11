import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGraph, addCard, connectCards } from '../graph.js';
import { makeScene, sceneBounds, exportPlan, fitCamera, worldToScreen, screenToWorld, zoomAt, curveBetween, shorten } from '../scene.js';
const viewport = { width: 390, height: 844 };
const measure = text => text.length * 8;
test('yazısız görsel Sade/PNG için yazısız 40×40, Tam için yüzde 75 alan kaplar', () => {
  const graph = addCard(emptyGraph(), { x: 250, y: 200 }, 'photo').store;
  graph.kartlar[0].fotoId = 'foto';
  const scene = makeScene(graph, 164, measure);
  assert.equal(scene.cards[0].label, ''); assert.equal(scene.cards[0].w, 40); assert.equal(scene.cards[0].h, 40);
  const bounds = sceneBounds(scene, true); assert.equal(bounds.width, 164); assert.equal(bounds.height, 123);
  assert.equal(sceneBounds(scene).width, 40);
});
test('kamera dünya/ekran dönüşümü ve iki parmak merkezinin sabitliği', () => {
  const camera = { x: -100, y: 200, z: .7 }, world = { x: 300, y: -80 };
  const screen = worldToScreen(world, camera, viewport);
  const round = screenToWorld(screen, camera, viewport);
  assert.ok(Math.abs(round.x - world.x) < 1e-9); assert.ok(Math.abs(round.y - world.y) < 1e-9);
  const next = zoomAt(camera, screen, { x: 100, y: 300 }, 2, viewport);
  const fixed = worldToScreen(world, next, viewport);
  assert.ok(Math.abs(fixed.x - 100) < 1e-9); assert.ok(Math.abs(fixed.y - 300) < 1e-9);
});
test('PNG tek kart: 360×152 mantıksal, 720×304 dosya, ayrı filigran bandı', () => {
  const store = addCard(emptyGraph(), { baslik: 'Şiir', x: -100, y: -200 }, 'a').store;
  const scene = makeScene(store, 158, measure), plan = exportPlan(scene);
  assert.equal(plan.width, 360); assert.equal(plan.height, 152);
  assert.equal(plan.pixelWidth, 720); assert.equal(plan.pixelHeight, 304);
  assert.equal(plan.watermark, 24); assert.equal(plan.band, 72);
  assert.equal(plan.offsetY + plan.bounds.maxY, plan.height - plan.band);
});
test('PNG kopuk ve uzak kartlar dahil tüm grafiği ve eğri kontrol noktalarını kapsar', () => {
  let store = addCard(emptyGraph(), { baslik: 'A', x: -500, y: -300 }, 'a').store;
  store = addCard(store, { baslik: 'B', x: 700, y: 500 }, 'b').store;
  store = addCard(store, { baslik: 'Kopuk', x: 3000, y: 2000 }, 'c').store;
  store = connectCards(store, 'a', 'b');
  const scene = makeScene(store, 158, measure), bounds = sceneBounds(scene), plan = exportPlan(scene);
  assert.ok(bounds.minX < -500 && bounds.maxX > 3000 && bounds.maxY > 2000);
  for (const edge of scene.edges) for (const point of [edge.start, edge.end, edge.c1, edge.c2]) {
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY);
  }
  assert.ok(plan.offsetX + bounds.minX >= 40);
  assert.ok(plan.offsetY + bounds.maxY <= plan.height - plan.band);
});
test('büyük PNG kenar ve alan bütçesine kırpmadan sığar', () => {
  let store = addCard(emptyGraph(), { baslik: 'Sol', x: -100_000 }, 'a').store;
  store = addCard(store, { baslik: 'Sağ', x: 100_000, y: 20_000 }, 'b').store;
  const plan = exportPlan(makeScene(store, 158, measure), { maxSide: 2048, maxPixels: 1_000_000 });
  assert.ok(plan.pixelWidth <= 2048 && plan.pixelHeight <= 2048);
  assert.ok(plan.pixelWidth * plan.pixelHeight <= 1_000_000);
  assert.ok(plan.bounds.minX < -100_000 && plan.bounds.maxX > 100_000);
  assert.ok(plan.scale < 1);
});
test('Sade sığdırmada sabit boyutlu haplar kullanılabilir ekran içinde kalır', () => {
  let store = emptyGraph();
  for (let i = 0; i < 12; i++) store = addCard(store, { baslik: 'Uzun başlık ' + i, x: i * 200, y: i * 100 }, String(i)).store;
  const scene = makeScene(store, 158, measure), camera = fitCamera(scene, viewport);
  for (const card of scene.cards) {
    const point = worldToScreen(card, camera, viewport);
    assert.ok(point.x - card.w / 2 >= 15.9 && point.x + card.w / 2 <= viewport.width - 15.9);
    assert.ok(point.y - 20 >= 111.9 && point.y + 20 <= viewport.height - 117.9);
  }
  assert.equal(exportPlan(makeScene(emptyGraph())), null);
});
test('ip yalnız yan yuvarlaklardan çıkar; üst üste kartlarda aynı yandan, dışa kıvrılarak', () => {
  const horizontal = curveBetween({ x: 0, y: 0, w: 100, h: 88 }, { x: 300, y: 80, w: 100, h: 88 });
  assert.deepEqual([horizontal.start, horizontal.end], [{ x: 50, y: 0 }, { x: 250, y: 80 }]);
  for (const [bx, side] of [[0, 1], [30, 1], [-30, -1]]) {
    const stacked = curveBetween({ x: 0, y: 0, w: 100, h: 88 }, { x: bx, y: 300, w: 100, h: 88 });
    assert.deepEqual([stacked.start, stacked.end], [{ x: 50 * side, y: 0 }, { x: bx + 50 * side, y: 300 }], 'yan orta noktalar');
    assert.ok(side > 0 ? stacked.c1.x > Math.max(stacked.start.x, stacked.end.x) : stacked.c1.x < Math.min(stacked.start.x, stacked.end.x), 'dışa kıvrılır');
    assert.equal(stacked.c1.y, 0); assert.equal(stacked.c2.y, 300);
  }
});
test('başlık kesme Unicode kod noktasını bölmez ve ölçüyü aşmaz', () => {
  assert.equal(shorten('Sürtünme', 200, measure), 'Sürtünme');
  assert.ok(measure(shorten('Çok uzun başlık', 56, measure)) <= 56);
  assert.equal(shorten('Başlık', 1, measure), '');
});

test('merkez: uzak grafikte origin ve ad PNG sınırında, Sade merkez noktasını da sığdırır', () => {
  const scene = makeScene({ kartlar: [{ id: 'far', baslik: 'Uzak', aciklama: '', x: 5000, y: 3000 }], ipler: [] }, 158, text => text.length * 8, 'Tuval');
  const plan = exportPlan(scene); assert.ok(plan.bounds.minX < 0); assert.ok(plan.bounds.maxX >= 5000);
  const camera = fitCamera(scene, { width: 390, height: 844 });
  const origin = worldToScreen({ x: 0, y: 0 }, camera, { width: 390, height: 844 }); assert.ok(origin.x >= 16 && origin.y >= 112);
});

test('Sade küçük asimetrik grafikte origin tam ekran ortasında, bütün kartlar sığar', () => {
  const viewport = { width: 390, height: 844 };
  const store = { kartlar: [ { id: 'a', baslik: 'Yakın', aciklama: '', x: -50, y: 90 }, { id: 'b', baslik: 'Uzak', aciklama: '', x: 120, y: -60 } ], ipler: [] };
  const scene = makeScene(store, 164, text => text.length * 8, 'Tuval');
  const camera = fitCamera(scene, viewport);
  assert.deepEqual(worldToScreen({ x: 0, y: 0 }, camera, viewport), { x: 195, y: 422 });
  for (const card of scene.cards) { const point = worldToScreen(card, camera, viewport); assert.ok(point.x - card.w / 2 >= 16); assert.ok(point.x + card.w / 2 <= 374); assert.ok(point.y >= 132 && point.y <= 706); assert.ok(card.w >= 72); }
});

test('Sade büyük tuvalde en az .38: Tam odağı korunur, merkez isteği origin döndürür', () => {
  const scene = makeScene({kartlar:[{id:'a',baslik:'Uzak',aciklama:'',x:5000,y:3000}],ipler:[]},164,measure,'Tuval');
  assert.deepEqual(fitCamera(scene,viewport,{x:720,y:-200}),{x:720,y:-200,z:.38});
  assert.deepEqual(fitCamera(scene,viewport),{x:0,y:0,z:.38});assert.ok(116*.38>=44);assert.equal(zoomAt({x:0,y:0,z:.38},{x:195,y:422},{x:195,y:422},.01,viewport,.38).z,.38);
});

test('mıknatıslı hizalama: yalnız yakın komşulara çeker, uzaktaki karta değil', async () => {
  const { snapPosition, snapNeighbours } = await import('../scene.js');
  const card = (id, x, y) => ({ id, x, y, baslik: id, aciklama: '' });
  const store = { kartlar: [card('a', 0, 0), card('b', 300, 300)], ipler: [] };
  const near = snapPosition(store, 'b', 7, 120, 164, 12);
  assert.equal(near.x, 0); assert.equal(near.guides.length, 1);
  const both = snapPosition(store, 'b', 5, -9, 164, 12);
  assert.deepEqual([both.x, both.y], [0, 0]); assert.equal(both.guides.length, 2);
  const free = snapPosition(store, 'b', 40, 120, 164, 12);
  assert.deepEqual([free.x, free.y, free.guides.length], [40, 120, 0]);
  const edge = snapPosition(store, 'b', 164 + 5, 120, 164, 12);
  assert.equal(edge.x, 164);
  // Far below (gap > one card width): no pull even on an exactly matching line.
  const far = snapPosition(store, 'b', 7, 600, 164, 12);
  assert.deepEqual([far.x, far.guides.length], [7, 0]);
  // Only the 4 nearest count: a fifth card further away is ignored.
  const many = { kartlar: [card('m', 0, 0), card('n1', 0, -116), card('n2', 0, 116), card('n3', -200, 0), card('n4', 200, 0), card('f', 37, 150)], ipler: [] };
  const ids = snapNeighbours(many, 'm', 0, 0, 164, 88).map(item => item.card.id);
  assert.deepEqual(ids.sort(), ['n1', 'n2', 'n3', 'n4'], 'f (5. yakın) dışarıda');
  assert.deepEqual(snapNeighbours(many, 'm', 0, 0, 164, 88).map(item => item.gap), [...snapNeighbours(many, 'm', 0, 0, 164, 88).map(item => item.gap)].sort((p, q) => p - q));
});
