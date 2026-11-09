// Leaving a board frees its decoded photos; only the open board's stay in memory. Needs `npm start` on 4173.
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process'; import assert from 'node:assert/strict';
const pw = createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/package.json')('playwright');
const browser=await pw.chromium.launch({headless:true}); const ctx=await browser.newContext({viewport:{width:390,height:844}}); const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://127.0.0.1:4173');
// Two boards, each with 3 photo cards, photos written straight into IndexedDB.
await page.evaluate(async()=>{ const {putPhoto}=await import('./photos.js'); const t=new Date().toISOString(); const kartlar=[];
 for(const b of ['A','B']) for(let i=0;i<3;i++){ const c=document.createElement('canvas'); c.width=400;c.height=300; const g=c.getContext('2d'); g.fillStyle=['#a33','#3a3','#33a'][i]; g.fillRect(0,0,400,300);
   const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.7)); const id=b+i; await putPhoto({id,blob,en:400,boy:300}); kartlar.push({id:'k'+b+i,baslik:'Foto '+b+i,aciklama:'',x:i*220,y:120,kaynakId:null,fotoId:id,olusturma:t,degisme:t,tuvalId:'t'+b}); }
 localStorage.setItem('dallanan-not-data-v3',JSON.stringify({surum:3,tuvaller:['A','B'].map(b=>({id:'t'+b,ad:'Tuval '+b,olusturma:t,degisme:t,sonAcilma:t})),kartlar,ipler:[]})); });
await page.reload();
const cached=()=>page.evaluate(async()=>{const {photoURL}=await import('./photos.js'); return ['A0','A1','A2','B0','B1','B2'].filter(id=>photoURL(id));});
const click=l=>page.getByRole('button',{name:l,exact:true}).first().click();
await click('Tuval A'); await page.locator('#board').waitFor({state:'visible'}); await page.waitForTimeout(500); const a=await cached();
await click('Tuvaller'); await page.waitForTimeout(300); const home=await cached();
await click('Tuval B'); await page.locator('#board').waitFor({state:'visible'}); await page.waitForTimeout(500); const b=await cached();
const shown=await page.locator('#canvas image').count();
console.log({a,home,b,shown}); assert.deepEqual(a,['A0','A1','A2']); assert.deepEqual(home,[]); assert.deepEqual(b,['B0','B1','B2']); assert.ok(shown>=1); assert.deepEqual(errs,[]); console.log('PASS'); await browser.close();
