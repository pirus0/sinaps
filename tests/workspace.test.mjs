import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWorkspace } from '../workspace.js';
import { emptyGraph, addCard, connectCards, STORAGE_KEY as GRAPH_KEY } from '../graph.js';
import { emptyWorkspace, newBoard, boardGraph, putBoardGraph, normalizeWorkspace, deleteBoard, fromGraph,
  backupWorkspace, parseWorkspace, mergeWorkspaces, loadWorkspace, WORKSPACE_KEY, workspaceText, boardName } from '../workspace.js';
test('adsız tuval görsel kartı atlar, ilk yazılı karttan ad alır', () => {
  let graph = addCard(emptyGraph(), {}, 'photo').store; graph.kartlar[0].fotoId = 'foto';
  graph = addCard(graph, { aciklama: '\n  İlk yazı' }, 'text').store;
  const space = fromGraph(graph), board = { ...space.tuvaller[0], ad: '' };
  assert.equal(boardName(space, board), 'İlk yazı');
  assert.equal(boardName({ ...space, kartlar: space.kartlar.slice(0, 1) }, board), 'Adsız');
});
function fixture() {
  let space = newBoard(emptyWorkspace(), 'ders').workspace;
  space = newBoard(space, 'siir').workspace;
  let graph = addCard(emptyGraph(), { baslik: 'Fizik' }, 'a').store;
  graph = addCard(graph, { sourceId: 'a', baslik: 'Kuvvet' }, 'b').store;
  space = putBoardGraph(space, 'ders', graph);
  return putBoardGraph(space, 'siir', addCard(emptyGraph(), { baslik: 'Bahçe', aciklama: '\n  dize\n' }, 'c').store);
}
test('v3 iki tuval: kart/ip ve düzenleme birbirine karışmaz', () => {
  const space = fixture(), poem = boardGraph(space, 'siir');
  assert.equal(boardGraph(space, 'ders').kartlar.length, 2); assert.equal(poem.kartlar.length, 1);
  assert.equal(boardGraph(space, 'ders').ipler.length, 1); assert.equal(poem.ipler.length, 0);
  const changed = putBoardGraph(space, 'siir', { ...poem, kartlar: [{ ...poem.kartlar[0], aciklama: 'Yeni dize' }] });
  assert.deepEqual(boardGraph(changed, 'ders'), boardGraph(space, 'ders'));
  assert.equal(changed.kartlar.find(card => card.id === 'c').tuvalId, 'siir');
});
test('v3 tuvaller arasında ip/kaynak ilişkisi kurulamaz', () => {
  const space = fixture(), time = new Date().toISOString();
  const graph = boardGraph(space, 'siir'); graph.kartlar[0].kaynakId = 'a';
  graph.ipler.push({ id: 'cross', aId: 'c', bId: 'a', olusturma: time });
  const saved = putBoardGraph(space, 'siir', graph);
  assert.equal(saved.ipler.length, 1); assert.equal(saved.kartlar.find(card => card.id === 'c').kaynakId, null);
  const incoming = { ...space, ipler: [...space.ipler, { id: 'cross2', aId: 'c', bId: 'b', olusturma: time }] };
  assert.equal(normalizeWorkspace(incoming).ipler.length, 1);
});
test('v3 tuval silme yalnız seçilen tuvali siler, birleştirerek geri alınabilir', () => {
  const space = fixture(), deleted = deleteBoard(space, 'ders');
  assert.equal(deleted.tuvaller.length, 1); assert.equal(deleted.kartlar.length, 1); assert.equal(deleted.ipler.length, 0);
  const record = { surum: 3, tuvaller: [space.tuvaller[0]], kartlar: space.kartlar.filter(card => card.tuvalId === 'ders'), ipler: space.ipler };
  const restored = mergeWorkspaces(deleted, record).workspace;
  assert.equal(restored.kartlar.length, 3); assert.equal(restored.ipler.length, 1);
  assert.deepEqual(boardGraph(restored, 'ders'), boardGraph(space, 'ders'));
});
test('v2→v3: bütün kartlar ve ipler Notlar tuvaline taşınır', () => {
  let graph = addCard(emptyGraph(), { baslik: 'A', x: -30, y: 90 }, 'a').store;
  graph = addCard(graph, { sourceId: 'a', baslik: 'B' }, 'b').store;
  const space = fromGraph(graph);
  assert.equal(space.surum, 3); assert.equal(space.tuvaller[0].ad, 'Notlar');
  assert.equal(space.kartlar[0].x, graph.kartlar[0].x); assert.equal(space.ipler.length, 1);
  assert.ok(space.kartlar.every(card => card.tuvalId === space.tuvaller[0].id));
});
test('v3 JSON turu, tekrar yükleme, yerel başlık kazanır, görünüm dışarı çıkmaz', () => {
  const space = fixture(), json = backupWorkspace(space);
  assert.equal(JSON.parse(json).version, 3); assert.equal(JSON.parse(json).data.gorunum, undefined);
  const incoming = parseWorkspace(json), merged = mergeWorkspaces(space, incoming);
  assert.equal(merged.addedCards.length, 0); assert.equal(merged.addedBoards.length, 0); assert.equal(merged.addedEdges.length, 0);
  incoming.tuvaller[0].ad = 'Eski ad';
  assert.equal(mergeWorkspaces({ ...space, tuvaller: [{ ...space.tuvaller[0], ad: 'Yeni ad' }, space.tuvaller[1]] }, incoming).workspace.tuvaller[0].ad, 'Yeni ad');
});
test('v3 yüklenirken eski v2 kaynak silinmez; bozuk v3 kayıtta geriye sessiz dönüş yok', () => {
  const graph = addCard(emptyGraph(), { baslik: 'A' }, 'a').store;
  const values = new Map([[GRAPH_KEY, JSON.stringify(graph)]]);
  const storage = { getItem: key => values.get(key) ?? null };
  assert.equal(loadWorkspace(storage).tuvaller[0].ad, 'Notlar');
  assert.equal(values.get(GRAPH_KEY), JSON.stringify(graph));
  values.set(WORKSPACE_KEY, '{bozuk'); assert.throws(() => loadWorkspace(storage));
});
test('v3 doğrulama sahipsiz kartı/yinelenen tuvali reddeder, aynı tuval iki kez oluşturulmaz', () => {
  const space = fixture();
  assert.throws(() => normalizeWorkspace({ ...space, kartlar: [{ ...space.kartlar[0], tuvalId: 'yok' }] }));
  assert.throws(() => normalizeWorkspace({ ...space, tuvaller: [...space.tuvaller, space.tuvaller[0]] }));
  assert.throws(() => newBoard(space, 'ders'));
  assert.match(workspaceText(space), /Fizik/); assert.match(workspaceText(space), /Bahçe/);
});

test('genel arama: Türkçe sadeleştirme, tuval adı ve kart açıklaması, çöp hariç', () => {
  const a=newBoard(emptyWorkspace(),'search-a');a.board.ad='Şiirler';let w=putBoardGraph(a.workspace,a.board.id,addCard(emptyGraph(),{baslik:'Başlık',aciklama:'IŞIK şiiri'},'search-card').store);
  const b=newBoard(w,'search-b');b.board.ad='Diğer';b.board.silinme=new Date().toISOString();w=b.workspace;
  assert.equal(searchWorkspace(w,'siir').boards[0].id,'search-a');assert.equal(searchWorkspace(w,'isik').cards[0].id,'search-card');assert.equal(searchWorkspace(w,'Diğer').boards.length,0);assert.deepEqual(searchWorkspace(w,''),{boards:[],cards:[]});
});
