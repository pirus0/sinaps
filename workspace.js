import { emptyGraph, normalizeGraph, loadGraph, parseBackup as parseGraph, exportText as graphText } from './graph.js';
export const WORKSPACE_KEY = 'dallanan-not-data-v3';
export const WORKSPACE_VIEW_KEY = 'dallanan-not-view-v3';
export const emptyWorkspace = () => ({ surum: 3, tuvaller: [], kartlar: [], ipler: [] });
const stamp = () => new Date().toISOString();
export function fromGraph(graph) {
  if (!graph.kartlar.length) return emptyWorkspace();
  const time = stamp(), id = 'legacy-notlar';
  return { surum: 3, tuvaller: [{ id, ad: 'Notlar', olusturma: time, degisme: time, sonAcilma: time }],
    kartlar: graph.kartlar.map(card => ({ ...card, tuvalId: id })), ipler: graph.ipler };
}
export function normalizeWorkspace(input) {
  if (!input || input.surum !== 3 || !Array.isArray(input.tuvaller)) throw new Error('Bu dosya yedek değil.');
  const ids = new Set();
  const boards = input.tuvaller.map(board => {
    if (!board || typeof board.id !== 'string' || !board.id || ids.has(board.id) || typeof board.ad !== 'string'
      || ![board.olusturma, board.degisme, board.sonAcilma].every(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))) throw new Error('Geçersiz tuval.');
    if (board.silinme != null && !Number.isFinite(Date.parse(board.silinme))) throw new Error('Geçersiz çöp tarihi');
    if (board.kopyaKaynagi && (typeof board.kopyaKaynagi.tuvalId !== 'string' || !Number.isFinite(Date.parse(board.kopyaKaynagi.gonderim)))) throw new Error('Geçersiz kopya kaynağı');
    ids.add(board.id); return { id: board.id, ad: board.ad.trim(), olusturma: board.olusturma, degisme: board.degisme, sonAcilma: board.sonAcilma, ...(board.silinme ? { silinme: board.silinme } : {}), ...(board.kopyaKaynagi ? { kopyaKaynagi: { tuvalId: board.kopyaKaynagi.tuvalId, gonderim: board.kopyaKaynagi.gonderim } } : {}) };
  });
  if (!Array.isArray(input.kartlar) || !Array.isArray(input.ipler)) throw new Error('Geçersiz tuval verisi.');
  const owners = new Map(input.kartlar.map(card => {
    if (!card || !ids.has(card.tuvalId)) throw new Error('Kartın tuvali bulunamadı.');
    return [card.id, card.tuvalId];
  }));
  const graph = normalizeGraph({ surum: 2, kartlar: input.kartlar, ipler: input.ipler });
  return { surum: 3, tuvaller: boards,
    kartlar: graph.kartlar.map(card => ({ ...card, tuvalId: owners.get(card.id),
      kaynakId: owners.get(card.kaynakId) === owners.get(card.id) ? card.kaynakId : null })),
    ipler: graph.ipler.filter(ip => owners.get(ip.aId) === owners.get(ip.bId)) };
}
export function loadWorkspace(storage) {
  const raw = storage.getItem(WORKSPACE_KEY);
  return raw !== null ? normalizeWorkspace(JSON.parse(raw)) : fromGraph(loadGraph(storage));
}
export function boardGraph(workspace, id) {
  if (!id) return emptyGraph();
  const cards = workspace.kartlar.filter(card => card.tuvalId === id), ids = new Set(cards.map(card => card.id));
  return { surum: 2, kartlar: cards, ipler: workspace.ipler.filter(ip => ids.has(ip.aId) && ids.has(ip.bId)) };
}
export function putBoardGraph(workspace, id, graph) {
  if (!id) return workspace;
  const old = new Set(workspace.kartlar.filter(card => card.tuvalId === id).map(card => card.id));
  const own = new Set(graph.kartlar.map(card => card.id));
  return { ...workspace, kartlar: [...workspace.kartlar.filter(card => card.tuvalId !== id), ...graph.kartlar.map(card => ({ ...card, tuvalId: id,
    kaynakId: own.has(card.kaynakId) ? card.kaynakId : null }))],
    ipler: [...workspace.ipler.filter(ip => !old.has(ip.aId) && !old.has(ip.bId)), ...graph.ipler.filter(ip => own.has(ip.aId) && own.has(ip.bId))] };
}
export function newBoard(workspace, id = crypto.randomUUID()) {
  if (!id || workspace.tuvaller.some(board => board.id === id)) throw new Error('Tuval kimliği zaten var.');
  const time = stamp(), board = { id, ad: '', olusturma: time, degisme: time, sonAcilma: time };
  return { board, workspace: { ...workspace, tuvaller: [...workspace.tuvaller, board] } };
}
export function boardName(workspace, board) {
  return board.ad.trim() || workspace.kartlar.find(card => card.tuvalId === board.id)?.baslik.trim() || 'Adsız';
}
export function deleteBoard(workspace, id) {
  const graph = boardGraph(workspace, id), ids = new Set(graph.kartlar.map(card => card.id));
  return { ...workspace, tuvaller: workspace.tuvaller.filter(board => board.id !== id), kartlar: workspace.kartlar.filter(card => card.tuvalId !== id),
    ipler: workspace.ipler.filter(ip => !ids.has(ip.aId) && !ids.has(ip.bId)) };
}
export function backupWorkspace(workspace) {
  return JSON.stringify({ app: 'sinaps', tur: 'yedek', surum: 1, version: 3, exportedAt: stamp(),
    data: { ...workspace, tuvaller: workspace.tuvaller.map(board => ({ ...board, ad: boardName(workspace, board) })) } }, null, 2);
}
export function parseWorkspace(text) {
  const input = JSON.parse(text);
  if (input?.app !== 'dallanan-not' && !(input?.app === 'sinaps' && input.tur === 'yedek' && input.surum === 1)) throw new Error('Bu dosya yedek değil.');
  return input.version === 3 ? { ...normalizeWorkspace(input.data), fotolar: input.data.fotolar ?? [] } : { ...fromGraph(parseGraph(text)), fotolar: [] };
}
export function mergeWorkspaces(local, incoming) {
  const boards = new Set(local.tuvaller.map(board => board.id)), cards = new Set(local.kartlar.map(card => card.id)), edges = new Set(local.ipler.map(ip => ip.id));
  const addedBoards = incoming.tuvaller.filter(board => !boards.has(board.id)), addedCards = incoming.kartlar.filter(card => !cards.has(card.id));
  const workspace = normalizeWorkspace({ surum: 3, tuvaller: [...local.tuvaller, ...addedBoards], kartlar: [...local.kartlar, ...addedCards],
    ipler: [...local.ipler, ...incoming.ipler.filter(ip => !edges.has(ip.id))] });
  return { workspace, addedBoards, addedCards, addedEdges: workspace.ipler.filter(ip => !edges.has(ip.id)) };
}
export function workspaceText(workspace) {
  return workspace.tuvaller.filter(board => !board.silinme).map(board => boardName(workspace, board) + '\n\n' + graphText(boardGraph(workspace, board.id))).join('\n\n');
}

const fold = text => text.toLocaleLowerCase('tr').replaceAll('ı','i').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function searchWorkspace(workspace,query) {
  const term=fold(query.trim()),boards=workspace.tuvaller.filter(board=>!board.silinme),ids=new Set(boards.map(board=>board.id));
  if(!term)return {boards:[],cards:[]};
  return {boards:boards.filter(board=>fold(boardName(workspace,board)).includes(term)),cards:workspace.kartlar.filter(card=>ids.has(card.tuvalId)&&fold(card.baslik+'\n'+card.aciklama).includes(term))};
}

export const TRASH_DAYS = 30;
export function trashBoard(workspace,id,time=stamp()) {
 if(!workspace.tuvaller.some(board=>board.id===id))throw new Error('Tuval bulunamadı');
 return {...workspace,tuvaller:workspace.tuvaller.map(board=>board.id===id?{...board,silinme:time}:board)};
}
export function restoreBoard(workspace,id,time=stamp()) {
 return {...workspace,tuvaller:workspace.tuvaller.map(board=>{if(board.id!==id)return board;const next={...board,sonAcilma:time};delete next.silinme;return next;})};
}
export function purgeExpired(workspace,time=Date.now()) {
 const expired=workspace.tuvaller.filter(board=>board.silinme&&time-Date.parse(board.silinme)>=TRASH_DAYS*86400000),removedCards=[];
 for(const board of expired){removedCards.push(...boardGraph(workspace,board.id).kartlar);workspace=deleteBoard(workspace,board.id);}
 return {workspace,removedCards,expired};
}
