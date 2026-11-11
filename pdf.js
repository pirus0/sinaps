import { MM, planPDF } from './pdf-layout.js';
import { previewLines, shorten } from './scene.js';
import { getPhoto } from './photos.js';
import { isImageCard } from './graph.js';
let libraries;
const script = path => new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=new URL(path,import.meta.url);node.onload=resolve;node.onerror=()=>{node.remove();reject(new Error('PDF aracı açılamadı'));};document.head.append(node);});
async function load() {
 if(!libraries)libraries=Promise.all([script('./vendor/pdf-lib-1.17.1.min.js'),script('./vendor/fontkit-1.1.1.min.js')]).catch(error=>{libraries=null;throw error;});
 await libraries;return globalThis.PDFLib;
}
function safeText(value) { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,''); }
export async function preparePDF(store,width,title,plan=planPDF(store,width,title)) {
 const P=await load(), doc=await P.PDFDocument.create();doc.registerFontkit(globalThis.fontkit);
 const [bodyBytes,boldBytes]=await Promise.all(['./fonts/Geist.ttf','./fonts/Geist-SemiBold.ttf'].map(async url=>{const response=await fetch(new URL(url,import.meta.url));if(!response.ok)throw new Error('Yazı tipi açılamadı');return response.arrayBuffer();}));
 const font=await doc.embedFont(bodyBytes,{subset:true}), bold=await doc.embedFont(boldBytes,{subset:true});
 const rgb=hex=>{const n=parseInt(hex.replace('#',''),16);return P.rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};
 const colors={ink:rgb('#1d1b18'),soft:rgb('#8f897e'),surface:rgb('#faf8f3'),line:rgb('#8a857c'),iris:rgb('#bd422c'),guide:rgb('#b5b0a6')};
 const images=new Map();for(const id of new Set(store.kartlar.map(c=>c.fotoId).filter(Boolean))){const r=await getPhoto(id);if(!r)throw new Error('Fotoğraf açılamadı');images.set(id,await doc.embedJpg(await r.blob.arrayBuffer()));}
 const text=(page,value,x,y,size,color=colors.ink,f=font,max=Infinity)=>{value=shorten(safeText(value),max,v=>f.widthOfTextAtSize(v,size));page.drawText(value,{x,y,size,font:f,color});};
 const line=(page,a,b,color=colors.line,thickness=.3*MM,dashArray)=>page.drawLine({start:a,end:b,color,thickness,dashArray});
 const footer=(page,label,index)=>{const value=shorten(safeText(`${title} · ${label} · ${index}/${plan.total}`),page.getWidth()-20*MM,v=>font.widthOfTextAtSize(v,7));text(page,value,(page.getWidth()-font.widthOfTextAtSize(value,7))/2,3.6*MM,7,colors.soft);};
 const pageSize=[plan.pageW*MM,plan.pageH*MM], margin=10*MM, H=pageSize[1], SCALE=plan.scale, BODY=plan.pt, TITLE=15.5*SCALE;
 const roundedPath=(x,y,w,h,r)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
 const clip=(page,x,y,w,h)=>page.pushOperators(P.pushGraphicsState(),P.rectangle(x,y,w,h),P.clip(),P.endPath());
 const unclip=page=>page.pushOperators(P.popGraphicsState());
 const active=new Set(plan.pages.map(c=>`${c.row}:${c.col}`));
 for(const [index,cell]of plan.pages.entries()){
  const page=doc.addPage(pageSize),x=wx=>margin+(wx-cell.minX)*SCALE,y=wy=>H-margin-(wy-cell.minY)*SCALE;
  clip(page,margin,margin,plan.printedW*MM,plan.printedH*MM);
  for(const edge of plan.scene.edges)page.drawSvgPath(`M${x(edge.start.x)} ${-y(edge.start.y)}C${x(edge.c1.x)} ${-y(edge.c1.y)} ${x(edge.c2.x)} ${-y(edge.c2.y)} ${x(edge.end.x)} ${-y(edge.end.y)}`,{x:0,y:0,borderColor:colors.line,borderWidth:.3*MM});
  for(const card of plan.scene.cards){
   const l=x(card.x-card.w/2),t=y(card.y-card.h/2),w=card.w*SCALE,h=card.h*SCALE;
   // SVG y points down; negate PDF y in the path to preserve its top-left geometry.
   page.drawSvgPath(roundedPath(l,-t,w,h,18*SCALE),{x:0,y:0,color:colors.surface,borderColor:colors.soft,borderWidth:.25*MM});
   const imageOnly=isImageCard(card),photoH=card.fotoId?(imageOnly?card.h:card.w*.6)*SCALE:0;
   if(card.fotoId){const image=images.get(card.fotoId),ratio=Math.max((w-1.5*SCALE)/image.width,photoH/image.height),iw=image.width*ratio,ih=image.height*ratio;
    // Rounded upper corners use the same card silhouette as the screen.
    page.pushOperators(P.pushGraphicsState());
    const cl=l+.75*SCALE,ct=t-.75*SCALE,cw=w-1.5*SCALE,ch=h-1.5*SCALE,r=16.5*SCALE,k=.55228475;
    page.pushOperators(P.moveTo(cl+r,ct),P.lineTo(cl+cw-r,ct),P.appendBezierCurve(cl+cw-r+k*r,ct,cl+cw,ct-r+k*r,cl+cw,ct-r),P.lineTo(cl+cw,ct-ch+r),P.appendBezierCurve(cl+cw,ct-ch+r-k*r,cl+cw-r+k*r,ct-ch,cl+cw-r,ct-ch),P.lineTo(cl+r,ct-ch),P.appendBezierCurve(cl+r-k*r,ct-ch,cl,ct-ch+r-k*r,cl,ct-ch+r),P.lineTo(cl,ct-r),P.appendBezierCurve(cl,ct-r+k*r,cl+r-k*r,ct,cl+r,ct),P.closePath(),P.clip(),P.endPath());
    clip(page,l+.75*SCALE,t-photoH,w-1.5*SCALE,photoH-.75*SCALE);
    page.drawImage(image,{x:l+(w-iw)/2,y:t-photoH+(photoH-ih)/2,width:iw,height:ih});unclip(page);unclip(page);
   }
   if(!imageOnly)text(page,card.label,l+14*SCALE,t-photoH-28*SCALE,TITLE,colors.ink,bold,w-28*SCALE);
   if(card.baslik){const lines=previewLines(safeText(card.aciklama),(w-28*SCALE)/SCALE,v=>font.widthOfTextAtSize(v,BODY)/SCALE);for(const[n,value]of lines.entries())text(page,value,l+14*SCALE,t-photoH-(49+n*19.5)*SCALE,BODY,colors.soft);}
  }
  page.drawCircle({x:x(0),y:y(0),size:9*SCALE,color:colors.iris});const centerLabel=shorten(title,260,v=>font.widthOfTextAtSize(v,BODY)/SCALE);text(page,centerLabel,x(0)-font.widthOfTextAtSize(centerLabel,BODY)/2,y(0)-36*SCALE,BODY,colors.iris);
  unclip(page);
  const right=margin+plan.printedW*MM,top=H-margin,bottom=margin;
  if(active.has(`${cell.row}:${cell.col+1}`))line(page,{x:right-10*MM,y:bottom},{x:right-10*MM,y:top},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row}:${cell.col-1}`))line(page,{x:margin+10*MM,y:bottom},{x:margin+10*MM,y:top},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row+1}:${cell.col}`))line(page,{x:margin,y:bottom+10*MM},{x:right,y:bottom+10*MM},colors.guide,.35*MM,[3,3]);
  if(active.has(`${cell.row-1}:${cell.col}`))line(page,{x:margin,y:top-10*MM},{x:right,y:top-10*MM},colors.guide,.35*MM,[3,3]);
  for(const [cx,cy,sx,sy] of [[margin,top,-1,1],[right,top,1,1],[margin,bottom,-1,-1],[right,bottom,1,-1]]){line(page,{x:cx+sx*1.2*MM,y:cy},{x:cx+sx*5.2*MM,y:cy},colors.ink,.25*MM);line(page,{x:cx,y:cy+sy*1.2*MM},{x:cx,y:cy+sy*5.2*MM},colors.ink,.25*MM);}
  footer(page,cell.label,index+1);
  // Yield between pages to keep mobile controls responsive.
  if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
 }
 doc.setTitle(title);doc.setCreator('Sinaps');const bytes=await doc.save();
 return {file:new File([bytes],`${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,100)||'Sinaps'}-A4.pdf`,{type:'application/pdf'}),plan};
}
