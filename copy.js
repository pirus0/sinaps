import { normalizeWorkspace, boardGraph, boardName } from './workspace.js';
export function copyPayload(workspace,id,photos=[],sent=new Date().toISOString()) {
 const board=workspace.tuvaller.find(b=>b.id===id&&!b.silinme);if(!board)throw new Error('Tuval bulunamadı');
 const graph=boardGraph(workspace,id),tuval={...board,ad:boardName(workspace,board)};delete tuval.silinme;
 return {app:'sinaps',tur:'tuval',surum:1,gonderim:sent,tuval,kartlar:graph.kartlar,ipler:graph.ipler,fotolar:photos.map(p=>({id:p.id,mime:p.type,veri:p.data}))};
}
export function parseCopy(text) {
 const payload=JSON.parse(text);if(payload?.app!=='sinaps'||payload.tur!=='tuval'||payload.surum!==1||!Number.isFinite(Date.parse(payload.gonderim))||!Array.isArray(payload.fotolar))throw new Error('Geçersiz Sinaps dosyası');
 const workspace=normalizeWorkspace({surum:3,tuvaller:[payload.tuval],kartlar:payload.kartlar,ipler:payload.ipler});
 // Copy files cannot silently lose dangling/self/duplicate links while validating.
 if(workspace.kartlar.length!==payload.kartlar.length||workspace.ipler.length!==payload.ipler.length)throw new Error('Geçersiz kopya bağı');
 const ids=new Set();for(const p of payload.fotolar){if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||p.mime!=='image/jpeg'||typeof p.veri!=='string')throw new Error('Geçersiz kopya fotoğrafı');ids.add(p.id);}
 if(workspace.kartlar.some(card=>card.fotoId&&!ids.has(card.fotoId)))throw new Error('Kopyada fotoğraf eksik');
 return {...payload,tuval:workspace.tuvaller[0],kartlar:workspace.kartlar,ipler:workspace.ipler};
}
export function addCopy(workspace,payload,uuid=()=>crypto.randomUUID(),now=new Date().toISOString()) {
 const boardId=uuid(),cardIds=new Map(payload.kartlar.map(card=>[card.id,uuid()])),photoIds=new Map(payload.fotolar.map(p=>[p.id,uuid()]));
 const names=new Set(workspace.tuvaller.map(board=>boardName(workspace,board))),base=payload.tuval.ad||'Adsız';let name=base,n=2;while(names.has(name))name=base+' '+n++;
 const board={id:boardId,ad:name,olusturma:now,degisme:now,sonAcilma:now,kopyaKaynagi:{tuvalId:payload.tuval.id,gonderim:payload.gonderim}};
 const cards=payload.kartlar.map(card=>({...card,id:cardIds.get(card.id),tuvalId:boardId,kaynakId:cardIds.get(card.kaynakId)||null,...(card.fotoId?{fotoId:photoIds.get(card.fotoId)}:{})}));
 const edges=payload.ipler.map(ip=>({...ip,id:uuid(),aId:cardIds.get(ip.aId),bId:cardIds.get(ip.bId)}));
 return {workspace:{...workspace,tuvaller:[board,...workspace.tuvaller],kartlar:[...workspace.kartlar,...cards],ipler:[...workspace.ipler,...edges]},board,
  photos:payload.fotolar.map(p=>({id:photoIds.get(p.id),type:p.mime,data:p.veri}))};
}
