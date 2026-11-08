import { MM, SCALE, planPDF } from './pdf-layout.js';
import { previewLines, shorten } from './scene.js';
import { getPhoto } from './photos.js';
import { BRAND_PATHS } from './brand.js';
let libraries;
const script = path => new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=new URL(path,import.meta.url);node.onload=resolve;node.onerror=()=>{node.remove();reject(new Error('PDF aracı açılamadı'));};document.head.append(node);});
async function load() {
 if(!libraries)libraries=Promise.all([script('./vendor/pdf-lib-1.17.1.min.js'),script('./vendor/fontkit-1.1.1.min.js')]).catch(error=>{libraries=null;throw error;});
 await libraries;return globalThis.PDFLib;
}
function safeText(value) { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,''); }
export async function preparePDF(store,width,title,plan=planPDF(store,width,title)) {
 const P=await load(), doc=await P.PDFDocument.create();doc.registerFontkit(globalThis.fontkit);
 const [bodyBytes,headingBytes,boldBytes]=await Promise.all(['./fonts/Geist.ttf','./fonts/Bricolage-Bold.ttf','./fonts/Geist-SemiBold.ttf'].map(async url=>{const response=await fetch(new URL(url,import.meta.url));if(!response.ok)throw new Error('Yazı tipi açılamadı');return response.arrayBuffer();}));
 const font=await doc.embedFont(bodyBytes,{subset:true}), heading=await doc.embedFont(headingBytes,{subset:true}), bold=await doc.embedFont(boldBytes,{subset:true});
 const rgb=hex=>{const n=parseInt(hex.replace('#',''),16);return P.rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};
 const colors={ink:rgb('#1d1b18'),soft:rgb('#8f897e'),surface:rgb('#faf8f3'),line:rgb('#8a857c'),iris:rgb('#bd422c'),guide:rgb('#b5b0a6'),map:rgb('#4d4943')};
 const images=new Map();for(const id of new Set(store.kartlar.map(c=>c.fotoId).filter(Boolean))){const r=await getPhoto(id);if(!r)throw new Error('Fotoğraf açılamadı');images.set(id,await doc.embedJpg(await r.blob.arrayBuffer()));}
 const text=(page,value,x,y,size,color=colors.ink,f=font,max=Infinity)=>{value=shorten(safeText(value),max,v=>f.widthOfTextAtSize(v,size));page.drawText(value,{x,y,size,font:f,color});};
 const line=(page,a,b,color=colors.line,thickness=.3*MM,dashArray)=>page.drawLine({start:a,end:b,color,thickness,dashArray});
 const footer=(page,label,index)=>{const value=shorten(safeText(`${title} · ${label} · ${index}/${plan.total}`),page.getWidth()-20*MM,v=>font.widthOfTextAtSize(v,7));text(page,value,(page.getWidth()-font.widthOfTextAtSize(value,7))/2,3.6*MM,7,colors.soft);};
 const pageSize=[plan.pageW*MM,plan.pageH*MM], margin=10*MM;
 const roundedPath=(x,y,w,h,r)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
 const clip=(page,x,y,w,h)=>page.pushOperators(P.pushGraphicsState(),P.rectangle(x,y,w,h),P.clip(),P.endPath());
 const unclip=page=>page.pushOperators(P.popGraphicsState());
 // Overview uses the same tile origins; omitted cells retain their grid names.
 const overview=doc.addPage(pageSize), H=pageSize[1], W=pageSize[0];
 text(overview,title,margin,H-margin-22,20,colors.ink,heading,W-2*margin);
 text(overview,`${plan.total} sayfa · A4 ${plan.orientation==='portrait'?'dikey':'yatay'} · ${new Date().toLocaleDateString('tr-TR')}`,margin,H-margin-42,9,colors.soft);
 const spanW=(plan.cols-1)*plan.stepX+plan.printedW/(SCALE/MM),spanH=(plan.rows-1)*plan.stepY+plan.printedH/(SCALE/MM);
 const mini=Math.min((W-2*margin)/spanW,(H-2*margin-120)/spanH), left=(W-spanW*mini)/2, top=H-margin-68;
 const mx=x=>left+(x-plan.scene.bounds.minX)*mini,my=y=>top-(y-plan.scene.bounds.minY)*mini;
 for(const edge of plan.scene.edges)overview.drawSvgPath(`M${mx(edge.start.x)} ${-my(edge.start.y)}C${mx(edge.c1.x)} ${-my(edge.c1.y)} ${mx(edge.c2.x)} ${-my(edge.c2.y)} ${mx(edge.end.x)} ${-my(edge.end.y)}`,{x:0,y:0,borderColor:colors.line,borderWidth:.5});
 for(const card of plan.scene.cards)overview.drawCircle({x:mx(card.x),y:my(card.y),size:2,color:colors.soft});overview.drawCircle({x:mx(0),y:my(0),size:3,color:colors.iris});
 for(const cell of plan.cells){const w=(cell.own.maxX-cell.minX)*mini,h=(cell.own.maxY-cell.minY)*mini;overview.drawRectangle({x:mx(cell.minX),y:my(cell.minY)-h,width:w,height:h,borderColor:cell.active?colors.map:colors.guide,borderWidth:cell.active?.35*MM:.5,borderDashArray:cell.active?undefined:[2,2]});if(w>15&&h>15){const size=Math.min(18,w/3,h/3),tw=font.widthOfTextAtSize(cell.label,size);text(overview,cell.label,mx(cell.minX)+(w-tw)/2,my(cell.minY)-h/2-size/3,size,cell.active?colors.map:colors.guide);}}
 const instruction='%100 boyutta basın';text(overview,instruction,(W-font.widthOfTextAtSize(instruction,9))/2,top-spanH*mini-5*MM-9,9,colors.map);
 // Single brand source also supplies the PDF mark, rendered as local SVG paths.
 const mark=new DOMParser().parseFromString(`<svg>${BRAND_PATHS.replaceAll('ACCENT','#bd422c')}</svg>`,'image/svg+xml'),markScale=9*MM/24,markX=W-margin-9*MM,markY=margin+9*MM;
 for(const path of mark.querySelectorAll('path'))overview.drawSvgPath(path.getAttribute('d'),{x:markX,y:markY,scale:markScale,borderColor:colors.ink,borderWidth:1.5,opacity:.45,borderOpacity:.45});
 for(const circle of mark.querySelectorAll('circle'))overview.drawCircle({x:markX+Number(circle.getAttribute('cx'))*markScale,y:markY-Number(circle.getAttribute('cy'))*markScale,size:Number(circle.getAttribute('r'))*markScale,color:colors.iris,opacity:.45});
 footer(overview,'Harita',1);
 const active=new Set(plan.pages.map(c=>`${c.row}:${c.col}`));
 for(const [index,cell]of plan.pages.entries()){
  const page=doc.addPage(pageSize),x=wx=>margin+(wx-cell.minX)*SCALE,y=wy=>H-margin-(wy-cell.minY)*SCALE;
  clip(page,margin,margin,plan.printedW*MM,plan.printedH*MM);
  for(const edge of plan.scene.edges)page.drawSvgPath(`M${x(edge.start.x)} ${-y(edge.start.y)}C${x(edge.c1.x)} ${-y(edge.c1.y)} ${x(edge.c2.x)} ${-y(edge.c2.y)} ${x(edge.end.x)} ${-y(edge.end.y)}`,{x:0,y:0,borderColor:colors.line,borderWidth:.3*MM});
  for(const card of plan.scene.cards){
   const l=x(card.x-card.w/2),t=y(card.y-card.h/2),w=card.w*SCALE,h=card.h*SCALE;
   // SVG y points down; negate PDF y in the path to preserve its top-left geometry.
   page.drawSvgPath(roundedPath(l,-t,w,h,18*SCALE),{x:0,y:0,color:colors.surface,borderColor:colors.soft,borderWidth:.25*MM});
   const photoH=card.fotoId?card.w*.6*SCALE:0;
   if(card.fotoId){const image=images.get(card.fotoId),ratio=Math.max((w-1.5*SCALE)/image.width,photoH/image.height),iw=image.width*ratio,ih=image.height*ratio;
    // Rounded upper corners use the same card silhouette as the screen.
    page.pushOperators(P.pushGraphicsState());
    const cl=l+.75*SCALE,ct=t-.75*SCALE,cw=w-1.5*SCALE,ch=h-1.5*SCALE,r=16.5*SCALE,k=.55228475;
    page.pushOperators(P.moveTo(cl+r,ct),P.lineTo(cl+cw-r,ct),P.appendBezierCurve(cl+cw-r+k*r,ct,cl+cw,ct-r+k*r,cl+cw,ct-r),P.lineTo(cl+cw,ct-ch+r),P.appendBezierCurve(cl+cw,ct-ch+r-k*r,cl+cw-r+k*r,ct-ch,cl+cw-r,ct-ch),P.lineTo(cl+r,ct-ch),P.appendBezierCurve(cl+r-k*r,ct-ch,cl,ct-ch+r-k*r,cl,ct-ch+r),P.lineTo(cl,ct-r),P.appendBezierCurve(cl,ct-r+k*r,cl+r-k*r,ct,cl+r,ct),P.closePath(),P.clip(),P.endPath());
    clip(page,l+.75*SCALE,t-photoH,w-1.5*SCALE,photoH-.75*SCALE);
    page.drawImage(image,{x:l+(w-iw)/2,y:t-photoH+(photoH-ih)/2,width:iw,height:ih});unclip(page);unclip(page);
   }
   text(page,card.label,l+14*SCALE,t-photoH-28*SCALE,14,colors.ink,bold,w-28*SCALE);
   if(card.baslik){const lines=previewLines(safeText(card.aciklama),(w-28*SCALE)/SCALE,v=>font.widthOfTextAtSize(v,12)/SCALE);for(const[n,value]of lines.entries())text(page,value,l+14*SCALE,t-photoH-(49+n*19.5)*SCALE,12,colors.soft);}
  }
  page.drawCircle({x:x(0),y:y(0),size:9*SCALE,color:colors.iris});const centerLabel=shorten(title,260,v=>font.widthOfTextAtSize(v,12)/SCALE);text(page,centerLabel,x(0)-font.widthOfTextAtSize(centerLabel,12)/2,y(0)-36*SCALE,12,colors.iris);
  unclip(page);
  const right=margin+plan.printedW*MM,top=H-margin,bottom=margin;
  if(active.has(`${cell.row}:${cell.col+1}`))line(page,{x:right-10*MM,y:bottom},{x:right-10*MM,y:top},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row}:${cell.col-1}`))line(page,{x:margin+10*MM,y:bottom},{x:margin+10*MM,y:top},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row+1}:${cell.col}`))line(page,{x:margin,y:bottom+10*MM},{x:right,y:bottom+10*MM},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row-1}:${cell.col}`))line(page,{x:margin,y:top-10*MM},{x:right,y:top-10*MM},colors.guide,.35*MM,[3,3]);
  for(const [cx,cy,sx,sy] of [[margin,top,-1,1],[right,top,1,1],[margin,bottom,-1,-1],[right,bottom,1,-1]]){line(page,{x:cx+sx*1.2*MM,y:cy},{x:cx+sx*5.2*MM,y:cy},colors.ink,.25*MM);line(page,{x:cx,y:cy+sy*1.2*MM},{x:cx,y:cy+sy*5.2*MM},colors.ink,.25*MM);}
  footer(page,cell.label,index+2);
  // Yield between pages to keep mobile controls responsive.
  if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
 }
 doc.setTitle(title);doc.setCreator('Sinaps');const bytes=await doc.save();
 return {file:new File([bytes],`${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,100)||'Sinaps'}-A4.pdf`,{type:'application/pdf'}),plan};
}
