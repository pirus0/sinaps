import { cardHeight, cardTitle } from './graph.js';
import { curveBetween } from './scene.js';
export const MM = 72 / 25.4, SCALE = 12 / 13.5, PX_MM = SCALE / MM;
export const PDF_RULES = Object.freeze({ margin:10, overlap:10, body:12, title:14 });
const minmax = points => ({minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))});
export function gridLabel(row,col) { let text='',n=row+1;while(n){n--;text=String.fromCharCode(65+n%26)+text;n=Math.floor(n/26);}return text+(col+1); }
export function intersects(a,b) { return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY; }
export function curvePoint(edge,t) { const u=1-t;return {x:u**3*edge.start.x+3*u*u*t*edge.c1.x+3*u*t*t*edge.c2.x+t**3*edge.end.x,y:u**3*edge.start.y+3*u*u*t*edge.c1.y+3*u*t*t*edge.c2.y+t**3*edge.end.y}; }
function split(edge) { const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),a=mid(edge.start,edge.c1),b=mid(edge.c1,edge.c2),c=mid(edge.c2,edge.end),d=mid(a,b),e=mid(b,c),f=mid(d,e);return [{start:edge.start,c1:a,c2:d,end:f},{start:f,c1:e,c2:c,end:edge.end}]; }
export function curveIntersects(edge, rect, depth=0) {
  const bounds=minmax([edge.start,edge.c1,edge.c2,edge.end]);
  // Include the stroke footprint; recurse conservatively, never drop a visible curve.
  const pad=.6; if(!intersects({minX:bounds.minX-pad,minY:bounds.minY-pad,maxX:bounds.maxX+pad,maxY:bounds.maxY+pad},rect))return false;
  if(depth>=18 || (bounds.maxX-bounds.minX<.2&&bounds.maxY-bounds.minY<.2))return true;
  return split(edge).some(part=>curveIntersects(part,rect,depth+1));
}
function makeGrid(scene, orientation) {
  const [pageW,pageH]=orientation==='portrait'?[210,297]:[297,210], printedW=pageW-20,printedH=pageH-20,stepX=(printedW-10)/PX_MM,stepY=(printedH-10)/PX_MM;
  const spanW=scene.bounds.maxX-scene.bounds.minX,spanH=scene.bounds.maxY-scene.bounds.minY;
  const tileW=printedW/PX_MM,tileH=printedH/PX_MM, cols=Math.max(1,Math.ceil((spanW-tileW)/stepX)+1),rows=Math.max(1,Math.ceil((spanH-tileH)/stepY)+1);
  if(cols*rows>25000)throw new Error('Tuval PDF için çok geniş. Kartları birbirine yaklaştır.');
  const cells=[];
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
    const minX=scene.bounds.minX+col*stepX,minY=scene.bounds.minY+row*stepY;
    const own={minX,minY,maxX:minX+(col===cols-1?tileW:stepX),maxY:minY+(row===rows-1?tileH:stepY)};
    const active=scene.items.some(item=>intersects(item,own)) || scene.edges.some(edge=>curveIntersects(edge,own));
    cells.push({row,col,label:gridLabel(row,col),minX,minY,maxX:minX+tileW,maxY:minY+tileH,own,active});
  }
  return {orientation,pageW,pageH,printedW,printedH,stepX,stepY,cols,rows,cells,pages:cells.filter(cell=>cell.active)};
}
export function planPDF(store,width=158,title='Tuval') {
  const cards=store.kartlar.map(card=>({...card,label:cardTitle(card),w:width,h:cardHeight(card,width)})),map=new Map(cards.map(card=>[card.id,card]));
  const edges=store.ipler.filter(ip=>map.has(ip.aId)&&map.has(ip.bId)).map(ip=>({...ip,...curveBetween(map.get(ip.aId),map.get(ip.bId),width)}));
  const centerWidth=Math.min(260,Math.max(50,[...title].length*8));
  const items=[...cards.map(c=>({minX:c.x-c.w/2-.5,minY:c.y-c.h/2-.5,maxX:c.x+c.w/2+.5,maxY:c.y+c.h/2+.5})),{minX:-centerWidth/2,minY:-16,maxX:centerWidth/2,maxY:44}];
  const points=items.flatMap(r=>[{x:r.minX,y:r.minY},{x:r.maxX,y:r.maxY}]);for(const edge of edges)points.push(edge.start,edge.c1,edge.c2,edge.end);
  const bounds=minmax(points);bounds.minX-=1;bounds.minY-=1;bounds.maxX+=1;bounds.maxY+=1;
  const scene={cards,edges,items,bounds,title,width},portrait=makeGrid(scene,'portrait'),landscape=makeGrid(scene,'landscape');
  const grid=landscape.pages.length<portrait.pages.length?landscape:portrait;
  return {...grid,scene,total:grid.pages.length+1,scale:SCALE};
}
