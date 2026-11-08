import { drawBranch } from './gestures.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
const pw=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/package.json')('playwright');
const server=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:'4177'},stdio:['ignore','pipe','pipe']});await once(server.stdout,'data');
const browser=await pw.chromium.launch({headless:true}), context=await browser.newContext({...pw.devices['iPhone 13'],viewport:{width:390,height:844}}), page=await context.newPage();page.setDefaultTimeout(10000);
const click=async label=>(await page.locator('dialog[open]').count()?page.locator('dialog[open]'):page).getByRole('button',{name:label,exact:true}).click();
try{
 await page.goto('http://127.0.0.1:4177');
 const checks=await page.evaluate(async()=>{
  const m=await import('./photos.js'),c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');x.fillStyle='#246893';x.fillRect(0,0,80,40);
  const source=await new Promise(r=>c.toBlob(r,'image/png')),photo=await m.encodePhoto(source);await m.putPhoto(photo);
  const exported=await m.exportPhotos([{fotoId:photo.id}]);const duplicate={...exported[0],en:1};await m.importPhotos([duplicate],new Set([photo.id]));
  const local=(await m.getPhoto(photo.id)).en;await m.removePhoto(photo.id);await m.importPhotos(exported,new Set([photo.id]));
  const recovered=await m.getPhoto(photo.id);const same=Array.from(new Uint8Array(await photo.blob.arrayBuffer())).join(',')===Array.from(new Uint8Array(await recovered.blob.arrayBuffer())).join(',');
  let invalid=false;try{await m.importPhotos([{...exported[0],id:'valid-staged'},{id:'bad',en:1,boy:1,type:'image/jpeg',data:'not-jpeg'}],new Set(['valid-staged','bad']));}catch{invalid=true;}
  const atomic=!await m.getPhoto('valid-staged');let badImage=false;try{await m.encodePhoto(new Blob(['garbage'],{type:'image/png'}));}catch{badImage=true;}
  await m.removePhoto(photo.id);return {local,same,invalid,atomic,badImage,sourceType:source.type,resultType:photo.blob.type,en:photo.en,boy:photo.boy};
 });
 assert.deepEqual(checks,{local:80,same:true,invalid:true,atomic:true,badImage:true,sourceType:'image/png',resultType:'image/jpeg',en:80,boy:40});
 await click('Yeni');await page.getByRole('textbox',{name:'Ad',exact:true}).fill('Foto');await page.keyboard.press('Enter');await click('Yeni');await page.getByRole('textbox',{name:'Başlık',exact:true}).fill('Kart');await click('Tamam');await page.locator('#board').waitFor({state:'visible'});
 const buffer=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=100;c.height=100;return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer()));});
 await page.locator('[data-photo]').click();await page.locator('#photo-file').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(buffer)});
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).kartlar[0].fotoId,WORKSPACE_KEY);
 const id=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).kartlar[0].fotoId,WORKSPACE_KEY);
 await page.locator('[data-card]').click();await page.getByRole('textbox',{name:'Başlık',exact:true}).fill('');await click('Tamam');await page.locator('#board').waitFor({state:'visible'});await drawBranch(page);await page.getByRole('textbox',{name:'Başlık',exact:true}).waitFor();await click('Tamam');await page.locator('#board').waitFor({state:'visible'});assert.equal(await page.locator('[data-card]').count(),1,'yalnız fotoğraflı kart korunur ve dal açabilir');
 await page.locator('[data-photo]').click();await click('Kaldır');await click('Geri al');
 await page.waitForTimeout(6600);assert.ok(await page.evaluate(async id=>!!await(await import('./photos.js')).getPhoto(id),id),'geri alınan kartın fotoğrafı silinmez');
 await page.locator('[data-card]').click();await click('Menü');await click('Sil');await click('Sil');await page.waitForTimeout(300);
 assert.equal(await page.evaluate(async id=>!!await(await import('./photos.js')).getPhoto(id),id),false,'onaylı kart silme fotoğrafı da siler');
 console.log('PASS fotoğraf: küçük görsel yeniden JPEG, byte gidiş-dönüş, cihaz kazanır, bozuk yedek atomik, bozuk görsel, foto kaldır/geri al ve onaylı kart silme temizliği');
}finally{await context.close();await browser.close();server.kill();}
