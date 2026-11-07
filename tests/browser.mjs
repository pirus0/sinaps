import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { emptyStore, addNote, backupJSON, STORAGE_KEY } from '../model.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); }
catch { pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright'); }
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../ekran/', import.meta.url));
await mkdir(output, { recursive: true });
async function startServer() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: appRoot, env: { ...process.env, PORT: '4174' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverError = '';
  child.stderr.on('data', chunk => { serverError += chunk; });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error(serverError || 'Sunucu açılmadı'); })]);
  return child;
}
let server = await startServer();
const base = 'http://127.0.0.1:4174';
const filter = process.env.CASE_FILTER;
const results = filter ? JSON.parse(await readFile(output + 'test-sonuclari.json', 'utf8')).results.filter(result => !new RegExp(filter).test(result.name)) : [];
const browsers = [];

async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY); }
async function count(page, n) { await page.waitForFunction(([key, size]) => JSON.parse(localStorage.getItem(key) || '{"notlar":[]}').notlar.length === size, [STORAGE_KEY, n]); }
async function screenshot(page, name) { await page.screenshot({ path: output + name + '.png', fullPage: false }); }
async function geometry(page) {
  const issues = await page.evaluate(() => {
    const width = innerWidth;
    const root = document.documentElement;
    const visible = [...document.querySelectorAll('button,input:not([type=file])')].filter(node => {
      const r = node.getBoundingClientRect();
      return r.width && r.height && getComputedStyle(node).visibility !== 'hidden'
        && (!document.querySelector('dialog[open]') || node.closest('dialog'));
    });
    return {
      overflow: root.scrollWidth > width + 1,
      small: visible.filter(node => { const r = node.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map(n => n.getAttribute('aria-label') || n.textContent),
      outside: visible.filter(node => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > width + 1; }).map(n => n.textContent)
    };
  });
  assert.deepEqual(issues, { overflow: false, small: [], outside: [] });
}
async function downloadText(page, action) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return readFile(await download.path(), 'utf8');
}
async function run(browser, config) {
  const { name, width, dark, mobile } = config;
  const errors = [];
  const requests = [];
  let serverStopped = false;
  const context = await browser.newContext({ ...(mobile ? pw.devices['iPhone 13'] : {}),
    viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1,
    colorScheme: dark ? 'dark' : 'light', acceptDownloads: true, reducedMotion: 'reduce' });
  context.setDefaultTimeout(10000);
  // Native OS share sheets are outside browser automation; exercise the actual download fallback here.
  await context.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('blob:')) requests.push(request.url()); });
  const note = page.getByRole('textbox', { name: 'Not', exact: true });
  const click = async label => {
    const scope = await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page;
    await scope.getByRole('button', { name: label, exact: true }).click();
  };
  try {
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await geometry(page);
    await screenshot(page, `${name}-bos`);
    await click('Dal');
    await note.fill('Fizik\nDers notları');
    await click('Dal'); // navigation must flush the 300 ms write immediately
    await note.fill('Sürtünme\nF = μ · N');
    await note.press('End'); await note.press('Enter'); await note.press('x');
    await count(page, 2);
    assert.equal((await stored(page)).notlar.length, 2, 'Enter dal açmamalı');
    await click('Üst'); await click('Üst');
    await screenshot(page, `${name}-kok`);
    await click('Dal'); await note.fill('Şiir\n\n  İlk dize\n\nSon dize  ');
    await click('Üst'); await count(page, 3);
    await click('Dal'); await click('Üst'); await count(page, 3); // abandoned empty draft
    await click('Şiir');
    const leafText = await note.inputValue();
    await click('Menü');
    const sharedText = await downloadText(page, () => click('Paylaş'));
    assert.equal(sharedText, leafText);
    await click('Kapat');
    await click('Ağaç'); await page.getByRole('searchbox', { name: 'Ara' }).fill('surtunme');
    await geometry(page);
    await screenshot(page, `${name}-arama`);
    const result = page.locator('.tree-name').filter({ hasText: 'Sürtünme' });
    assert.equal(await result.count(), 1);
    await result.click();
    await click('Menü'); await click('Taşı');
    await geometry(page);
    assert.equal(await page.locator('.tree-name:disabled').count(), 1);
    await page.locator('.tree-name').filter({ hasText: /^Şiir$/ }).click();
    await geometry(page); await screenshot(page, `${name}-tasi`);
    await click('Taşı');
    assert.match(await page.locator('.breadcrumb').innerText(), /Şiir/);
    await click('Geri al');
    assert.match(await page.locator('.breadcrumb').innerText(), /Fizik/);
    await click('Menü'); await click('Sil'); await click('Geri al'); await count(page, 3);
    await click('Kök'); await click('Fizik');
    await click('Menü'); await click('Sil');
    assert.match(await page.locator('.sheet-copy').innerText(), /2 notla birlikte/);
    await click('Vazgeç'); await click('Menü'); await click('Sil'); await click('Sil');
    await count(page, 1); await click('Geri al'); await count(page, 3);
    await click('Şiir'); await click('Menü');
    const beforeOrder = (await stored(page)).notlar.find(n => n.metin.startsWith('Şiir')).sira;
    await click('Yukarı');
    assert.ok((await stored(page)).notlar.find(n => n.metin.startsWith('Şiir')).sira < beforeOrder);
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await click('Geri al'); await click('Kök');
    await click('Ayarlar'); await geometry(page); await screenshot(page, `${name}-ayarlar`); await click('Yedek');
    const backup = await downloadText(page, () => click('Paylaş'));
    const payload = JSON.parse(backup); assert.equal(payload.data.notlar.length, 3);
    await page.locator('#import-file').setInputFiles({ name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.getByRole('button', { name: 'Ekle', exact: true }).waitFor({ state: 'visible' });
    assert.match(await page.locator('.sheet-copy').innerText(), /0 yeni/);
    await click('Ekle'); await count(page, 3);
    let incoming = addNote(payload.data, null, 'Yedekten gelen', 'imported').store;
    await click('Ayarlar');
    await page.locator('#import-file').setInputFiles({ name: 'ek.json', mimeType: 'application/json', buffer: Buffer.from(backupJSON(incoming)) });
    await click('Ekle'); await count(page, 4); await click('Geri al'); await count(page, 3);
    await click('Ayarlar');
    await page.locator('#import-file').setInputFiles({ name: 'yanlis.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"başka"}') });
    assert.equal((await stored(page)).notlar.length, 3);
    while (await page.locator('dialog[open]').count()) await click('Kapat');
    await click('Fizik'); await page.reload();
    assert.equal(await note.inputValue(), 'Fizik\nDers notları');
    // Seed deep and long content through the public import flow.
    let deep = emptyStore();
    for (let i = 0; i < 9; i++) deep = addNote(deep, i ? `deep${i - 1}` : null, `Çok uzun başlıklı not ${i} ${'uzun '.repeat(14)}`, `deep${i}`).store;
    deep = addNote(deep, 'deep8', 'Uzun şiir\n' + 'Bir dize\n\n'.repeat(70), 'long').store;
    deep = addNote(deep, 'long', 'Şiirin dalı', 'poem-child').store;
    await click('Kök'); await click('Ayarlar');
    await page.locator('#import-file').setInputFiles({ name: 'derin.json', mimeType: 'application/json', buffer: Buffer.from(backupJSON(deep)) });
    await click('Ekle');
    await click('Ağaç'); await page.getByRole('searchbox', { name: 'Ara' }).fill('Uzun şiir');
    await page.locator('.tree-name').filter({ hasText: /^Uzun şiir/ }).click();
    await page.waitForFunction(() => !document.querySelector('#branch-jump').hidden);
    await geometry(page); await screenshot(page, `${name}-uzun`);
    await click('Ağaç'); await geometry(page); await screenshot(page, `${name}-agac`);
    await click('Kapat');
    await click('Menü'); await click('Taşı');
    const footerBefore = await page.locator('#sheet-footer').boundingBox();
    const scrollable = await page.locator('#sheet-content').evaluate(node => {
      node.scrollTop = 0; return node.scrollHeight > node.clientHeight;
    });
    assert.equal(scrollable, true, 'Derin taşıma listesi kaydırılabilir olmalı');
    const footerAtTop = await page.locator('#sheet-footer').boundingBox();
    await page.locator('#sheet-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const footerAtEnd = await page.locator('#sheet-footer').boundingBox();
    assert.equal(footerBefore.y, footerAtTop.y);
    assert.equal(footerAtTop.y, footerAtEnd.y, 'Taşı onayı listeyle kaymamalı');
    await geometry(page); await screenshot(page, `${name}-tasi-uzun`);
    await click('Kapat');
    if (name.startsWith('iphone13')) {
      // WebKit's emulated offline flag produces an internal navigation error with SWs.
      // Stop the actual HTTP server to test a real network failure instead.
      server.kill(); await once(server, 'exit'); serverStopped = true;
    } else await context.setOffline(true);
    await page.reload();
    assert.match(await note.inputValue(), /^Uzun şiir/);
    await note.fill('Çevrimdışı şiir\n  dize');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).notlar.some(n => n.metin.startsWith('Çevrimdışı şiir')), STORAGE_KEY);
    await context.setOffline(false);
    if (serverStopped) { server = await startServer(); serverStopped = false; }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    results.push({ name, pass: true, checks: 'oluştur, Enter, boş taslak, paylaş, arama, taşı/geri al, sil/onay/geri al, sırala, yedek/yükle/birleştir/geri al, yeniden aç, derin/uzun, çevrimdışı, 44px/taşma, dış istek' });
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
    if (serverStopped) server = await startServer();
  }
}
try {
  const chromium = await pw.chromium.launch({ headless: true }); browsers.push(chromium);
  for (const width of [375, 430]) {
    for (const dark of [false, true]) {
      const name = `mobil-${width}-${dark ? 'koyu' : 'acik'}`;
      if (!filter || new RegExp(filter).test(name)) await run(chromium, { name, width, dark, mobile: true });
    }
  }
  if (!filter || new RegExp(filter).test('masaustu-acik')) await run(chromium, { name: 'masaustu-acik', width: 1440, dark: false, mobile: false });
  const webkit = await pw.webkit.launch({ headless: true }); browsers.push(webkit);
  for (const dark of [false, true]) {
    const name = `iphone13-${dark ? 'koyu' : 'acik'}`;
    if (!filter || new RegExp(filter).test(name)) await run(webkit, { name, width: 390, dark, mobile: true });
  }
} finally {
  await writeFile(output + 'test-sonuclari.json', JSON.stringify({ at: new Date().toISOString(), complete: results.length === 7, results }, null, 2));
  for (const browser of browsers) await browser.close();
  server.kill();
}
