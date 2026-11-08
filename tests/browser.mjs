import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { WORKSPACE_KEY, WORKSPACE_VIEW_KEY } from '../workspace.js';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding:'utf8' }).trim() + '/package.json')('playwright'); }
const root = fileURLToPath(new URL('../', import.meta.url)), output = fileURLToPath(new URL('../../ekran/sinaps/', import.meta.url)); await mkdir(output, {recursive:true});
async function startServer() { const child = spawn(process.execPath, ['server.mjs'], {cwd:root, env:{...process.env, PORT:'4174'}, stdio:['ignore','pipe','pipe']}); await once(child.stdout,'data'); return child; }
let server = await startServer(); const base = 'http://127.0.0.1:4174', results = [], browsers = [];
async function run(browser, name, width, dark, mobile = true) {
  const context = await browser.newContext({...(mobile ? pw.devices['iPhone 13'] : {}), viewport:{width,height:844}, deviceScaleFactor:1, colorScheme:dark?'dark':'light', reducedMotion:'reduce', acceptDownloads:true}); context.setDefaultTimeout(10000);
  await context.addInitScript(() => Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
  const page = await context.newPage(), errors=[]; page.on('pageerror', error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='warning')console.log(name,m.text());});
  const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button',{name:label,exact:true}).click();
  const title = page.getByRole('textbox',{name:'Başlık',exact:true}), body = page.getByRole('textbox',{name:'Açıklama',exact:true});
  const stored = () => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),WORKSPACE_KEY);
  const camera = () => page.evaluate(key=>{const v=JSON.parse(localStorage.getItem(key));return v.tuvaller[v.sonTuvalId].camera;},WORKSPACE_VIEW_KEY);
  const download = async action => {const [file]=await Promise.all([page.waitForEvent('download'),action()]);return {buffer:await readFile(await file.path()),name:file.suggestedFilename()};};
  const geometry = async () => assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false,'yatay taşma');
  const shot = suffix => page.screenshot({path:output+name+'-'+suffix+'.png'});
  const done = async () => {await click('Tamam');await page.locator('#board').waitFor({state:'visible'});};
  const find = async text => {await click('Ara');await page.getByRole('searchbox').fill(text);await page.locator('.search-result-card').filter({hasText:text}).click();};
  try {
    await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await click('Yeni');await page.getByRole('textbox',{name:'Ad',exact:true}).fill('Dersler');await page.keyboard.press('Enter');
    await click('Yeni');await title.fill('Fizik');await title.press('Enter');assert.equal(await body.evaluate(n=>n===document.activeElement),true);
    await body.fill('  İlk dize\n\nSon dize');await body.press('End');await body.press('Enter');await body.press('x');
    await click('Dal');await title.fill('Kuvvet');await body.fill('F = m · a');await done();
    let data=await stored();assert.equal(data.kartlar.length,2);assert.equal(data.ipler.length,1);assert.match(data.kartlar[0].aciklama,/\nx$/);
    await click('Yeni');await done();assert.equal((await stored()).kartlar.length,2,'boş taslak silinir');
    await find('Fizik');const id=data.kartlar[0].id;
    // Every file, including small files, passes through JPEG encoding; original is never persisted.
    const raw=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1600;c.height=900;const x=c.getContext('2d');x.fillStyle='#dc3428';x.fillRect(0,0,c.width,c.height);return (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer().then(b=>Array.from(new Uint8Array(b)));});
    const chooser=page.waitForEvent('filechooser');await page.locator(`[data-photo="${id}"]`).click();await (await chooser).setFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from(raw)});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).kartlar.some(c=>c.fotoId),WORKSPACE_KEY);
    data=await stored();const photoId=data.kartlar.find(c=>c.id===id).fotoId;
    const record=await page.evaluate(async id=>{const m=await import('./photos.js');const r=await m.getPhoto(id);return {en:r.en,boy:r.boy,type:r.blob.type,bytes:r.blob.size};},photoId);
    assert.deepEqual([record.en,record.boy,record.type],[1080,608,'image/jpeg']);
    const small=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=16;c.height=10;const b=await new Promise(r=>c.toBlob(r,'image/png'));const p=await (await import('./photos.js')).encodePhoto(b);return {en:p.en,boy:p.boy,type:p.blob.type,different:p.blob!==b};});assert.deepEqual(small,{en:16,boy:10,type:'image/jpeg',different:true});assert.equal(JSON.stringify(data).includes('base64'),false);
    await page.waitForFunction(()=>!!document.querySelector('#canvas image'));await geometry();await shot('foto-tuval');
    await page.locator(`[data-card="${id}"]`).click();await click('Fotoğraf');await page.locator('.full-photo').waitFor();assert.equal(await page.locator('.full-photo').evaluate(n=>n.naturalWidth),1080);await shot('foto-tam');await click('Kapat');await done();await find('Fizik');
    // Remove and undo must recover the same stored photo.
    await page.locator(`[data-photo="${id}"]`).click();assert.equal(await page.locator('dialog img').count(),0);await shot('foto-menu');await click('Kaldır');assert.equal((await stored()).kartlar.find(c=>c.id===id).fotoId,undefined);await click('Geri al');
    assert.equal((await stored()).kartlar.find(c=>c.id===id).fotoId,photoId);
    if(name==='iphone-390') {
      const before=JSON.stringify(await stored()), session=await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:30,y:180,id:1}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:30,y:180,id:1},{x:200,y:180,id:2}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:20,y:180,id:1},{x:250,y:180,id:2}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(80);
      assert.notEqual((await camera()).z,1);assert.equal(JSON.stringify(await stored()),before);await session.detach();
    }
    await click('Merkez');assert.deepEqual(await camera(),{x:0,y:0,z:1});assert.equal(await page.locator('.canvas-center').count(),1);assert.equal(await page.locator('.canvas-card.marked').count(),0);await shot('merkez');
    await click('Sade');await page.getByRole('button',{name:'Paylaş',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('#toolbar button:last-child').disabled);
    assert.equal(await page.locator('#canvas .card-description').count(),0);assert.equal(await page.locator('[data-photo]').count(),0);await geometry();await shot('sade');
    await click('Paylaş');const png=await download(()=>click('Görsel'));await click('Kapat');assert.match(png.name,/^sinaps-.*\.png$/);assert.equal(png.buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const pixels=await page.evaluate(async raw=>{const image=new Image();image.src='data:image/png;base64,'+raw;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let red=0;for(let i=0;i<d.length;i+=4)if(d[i]>170&&d[i+1]<100&&d[i+2]<90)red++;return red;},png.buffer.toString('base64'));assert.ok(pixels>100,'JPEG minyatürü PNG içinde');
    await writeFile(output+name+'-paylas.png',png.buffer);
    await click('Dersler');assert.equal(await page.locator('#canvas').getAttribute('class'),'sade');await click('Tam');
    await find('Kuvvet');await page.locator(`#canvas [data-card="${data.kartlar[1].id}"]`).click();await click('Menü');await click('Sil');assert.equal(await page.getByText('Kart silinsin mi?',{exact:true}).count(),1);await click('Vazgeç');await page.getByRole('button',{name:'Bağlar',exact:true}).waitFor();await click('Kapat');await done();assert.equal((await stored()).kartlar.length,2);
    await click('Tuvaller');await geometry();await shot('ana');await click('Ayarlar');await click('Yedek');
    const backup=await download(()=>click('Paylaş'));assert.match(backup.name,/^sinaps-yedek-.*\.json$/);const json=JSON.parse(backup.buffer);assert.equal(json.version,3);assert.equal(json.data.fotolar.length,1);assert.equal(json.data.fotolar[0].type,'image/jpeg');assert.equal(json.data.fotolar[0].en,1080);assert.equal(JSON.stringify(json).includes('camera'),false);
    await click('Kapat');await click('Kapat');
    await page.locator('#import-file').setInputFiles({name:'same.json',mimeType:'application/json',buffer:backup.buffer});await click('Ekle');await page.locator('dialog').waitFor({state:'hidden'});assert.equal((await stored()).kartlar.length,2);await click('Geri al');assert.equal((await stored()).kartlar.length,2);
    // Fresh browser has no local blobs: JSON must restore the JPEG too.
    const fresh=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const restored=await fresh.newPage();
    await restored.goto(base);await restored.locator('#import-file').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:backup.buffer});await restored.getByRole('button',{name:'Ekle',exact:true}).click();await restored.getByRole('button',{name:'Dersler',exact:true}).click();
    await restored.waitForFunction(()=>!!document.querySelector('#canvas image'));assert.equal(await restored.evaluate(async id=>(await (await import('./photos.js')).getPhoto(id)).en,photoId),1080);await fresh.close();
    await click('Dersler');await page.reload();assert.equal(await page.locator('#canvas [data-card]').count(),2);await page.waitForFunction(()=>!!document.querySelector('#canvas image'));
    await server.kill();await once(server,'exit');server=null;await page.reload();assert.equal(await page.locator('#canvas [data-card]').count(),2);await page.waitForFunction(()=>!!document.querySelector('#canvas image'));server=await startServer();
    assert.deepEqual(errors,[]);results.push({name,width,dark,pass:true});console.log('PASS '+name+' photo/PNG/JSON/offline/center');
  } catch(error){await shot('hata');throw error;} finally {await context.close();}
}
try {
  const chrome=await pw.chromium.launch({headless:true});browsers.push(chrome);
  for(const width of (process.env.WEBKIT_ONLY || process.env.IPHONE_ONLY ? [] : [375,430]))for(const dark of [false,true])await run(chrome,`mobil-${width}-${dark?'koyu':'acik'}`,width,dark);
  if(!process.env.WEBKIT_ONLY){await run(chrome,'iphone-390',390,false);if(!process.env.IPHONE_ONLY)await run(chrome,'masaustu',1440,false,false);}
  if(process.env.IPHONE_ONLY){} else { const webkit=await pw.webkit.launch({headless:true});browsers.push(webkit);await run(webkit,'webkit-390',390,true); }
} finally {await writeFile(output+(process.env.IPHONE_ONLY||process.env.WEBKIT_ONLY?'tarayici-ek-testleri.json':'tarayici-testleri.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));for(const b of browsers)await b.close();server?.kill();}
