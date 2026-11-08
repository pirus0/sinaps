import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { LEGACY_KEY, emptyGraph, addCard, connectCards, backupJSON } from '../graph.js';
import { WORKSPACE_KEY as STORAGE_KEY, fromGraph } from '../workspace.js';
import { emptyStore, addNote } from '../model.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); }
catch { pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright'); }
const output = fileURLToPath(new URL('../../ekran/sinaps/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, PORT: '4176' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
const results = [], browsers = [];
let graph = addCard(emptyGraph(), { baslik: 'A', aciklama: 'Gizli açıklama A', x: -300, y: -200 }, 'a').store;
graph = addCard(graph, { baslik: 'B', aciklama: 'Gizli açıklama B', x: 800, y: 0 }, 'b').store;
graph = addCard(graph, { baslik: 'C', aciklama: 'Gizli açıklama C', x: 2500, y: 600 }, 'c').store;
graph = connectCards(graph, 'a', 'b', 'ab');
async function click(page, label) {
  const scope = await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page;
  await scope.getByRole('button', { name: label, exact: true }).click();
}
async function download(page, action) {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  return readFile(await file.path());
}
async function ready(page) { await page.waitForFunction(() => !document.querySelector('#toolbar button:last-child').disabled); }
async function run(browser, name) {
  const context = await browser.newContext({ ...pw.devices['iPhone 13'], deviceScaleFactor: 1, colorScheme: 'light' });
  context.setDefaultTimeout(10000);
  await context.addInitScript(({ key, graph }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(graph));
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  }, { key: STORAGE_KEY, graph: fromGraph(graph) });
  const page = await context.newPage(), errors = [], downloads = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('download', file => downloads.push(file.suggestedFilename()));
  try {
    await page.goto('http://127.0.0.1:4176'); await click(page, 'Notlar');
    const originalData = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    await page.evaluate(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      window.waitingBlob = []; window.failBlob = false;
      HTMLCanvasElement.prototype.toBlob = function(callback) {
        if (window.failBlob) setTimeout(() => callback(null), 0); else window.waitingBlob.push(callback);
      };
    });
    await click(page, 'Sade'); await click(page, 'Paylaş');
    await page.waitForFunction(() => window.waitingBlob.length > 0);
    assert.equal(await page.getByRole('button', { name: 'Görsel', exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.failBlob = true; for (const callback of window.waitingBlob) callback(null); });
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Görüntü hazırlanamadı'));
    assert.equal(await page.getByRole('button', { name: 'Görsel', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), originalData);
    await page.screenshot({ path: output + `${name}-png-hata.png` });
    results.push({ name, check: 'null Blob: görünür hata, Paylaş pasif, veri korunur', pass: true });
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
    await click(page, 'Kapat'); await click(page, 'Tam'); await click(page, 'Sade'); await ready(page); await click(page, 'Paylaş');
    assert.equal(await page.locator('#canvas .card-description').count(), 0);
    const buffer = await download(page, () => click(page, 'Görsel'));
    assert.equal(buffer.readUInt32BE(16), 2924); assert.equal(buffer.readUInt32BE(20), 984);
    await writeFile(output + `${name}-png-butun.png`, buffer);
    const pixels = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixel = (x, y) => [...data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)];
      const background = pixel(0, 0); let mark = 0;
      for (let y = canvas.height - 80; y < canvas.height - 24; y++) for (let x = canvas.width - 80; x < canvas.width - 24; x++) {
        const sample = pixel(x, y); if (sample.slice(0, 3).some((value, index) => Math.abs(value - background[index]) > 5)) mark++;
      }
      return { width: image.width, height: image.height, background,
        cards: [[62, 50], [1162, 250], [2862, 850]].map(([x, y]) => pixel(x, y)), mark,
        corner: pixel(canvas.width - 1, canvas.height - 1) };
    }, buffer.toString('base64'));
    assert.deepEqual(pixels.background, [239, 235, 226, 255]);
    for (const card of pixels.cards) assert.deepEqual(card, [250, 248, 243, 255]);
    assert.ok(pixels.mark > 20); assert.deepEqual(pixels.corner, pixels.background);
    results.push({ name, check: 'PNG decode: negatif/uzak/kopuk 3 kart, tüm sınır, 2x→1x, ayrı sağ-alt filigran', pass: true, size: [2924, 984] });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => files.length === 1 && files[0] instanceof File && files[0].type === 'image/png' });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('İzin', 'NotAllowedError'); } });
    });
    const count = downloads.length; await click(page, 'Görsel'); await page.getByRole('button', { name: 'Gönder', exact: true }).waitFor();
    assert.equal(downloads.length, count);
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
      window.pngSent = { name: files[0].name, type: files[0].type, signature: [...new Uint8Array(await files[0].arrayBuffer()).slice(0, 8)] };
    } }));
    await click(page, 'Gönder'); await page.waitForFunction(() => !!window.pngSent);
    const sent = await page.evaluate(() => window.pngSent);
    assert.equal(sent.type, 'image/png'); assert.match(sent.name, /^sinaps-\d{4}-\d{2}-\d{2}\.png$/);
    assert.deepEqual(sent.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
    results.push({ name, check: 'Web Share: hazır gerçek PNG File, NotAllowed→Gönder→yeni dokunuş', pass: true });
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('İptal', 'AbortError'); } }));
    await click(page, 'Gönder'); assert.equal(downloads.length, count);
    results.push({ name, check: 'PNG paylaşım iptali indirme başlatmaz', pass: true });
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
    await click(page, 'Kapat'); await click(page, 'Tam'); await click(page, 'Ara'); await page.getByRole('searchbox', { name: 'Ara' }).fill('C');
    await click(page, 'C'); await page.locator('#canvas').getByRole('button', { name: 'C', exact: true }).tap();
    await page.getByRole('textbox', { name: 'Açıklama' }).fill('Başka bir açıklama; PNG aynı kalmalı');
    await click(page, 'Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
    await click(page, 'Sade'); await ready(page); await click(page, 'Paylaş');
    const changedBody = await download(page, () => click(page, 'Görsel'));
    assert.equal(changedBody.equals(buffer), true);
    results.push({ name, check: 'Açıklama değişimi sade PNG içeriğine sızmaz', pass: true });
    assert.deepEqual(errors, []); console.log(`PASS ${name} PNG`);
  } finally { await context.close(); }
  let legacy = addNote(emptyStore(), null, 'Eski şiir\n\n  dize\n\ndize  ', 'old-a').store;
  legacy = addNote(legacy, 'old-a', 'Eski dal\nMetin', 'old-b').store;
  const migratedContext = await browser.newContext({ ...pw.devices['iPhone 13'], deviceScaleFactor: 1 });
  migratedContext.setDefaultTimeout(10000);
  await migratedContext.addInitScript(({ key, graph }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(graph)); }, { key: LEGACY_KEY, graph: legacy });
  const migrated = await migratedContext.newPage();
  try {
    await migrated.goto('http://127.0.0.1:4176'); await click(migrated, 'Notlar');
    assert.equal(await migrated.locator('#canvas [data-card]').count(), 2);
    await migrated.locator('#canvas').getByRole('button', { name: 'Eski şiir', exact: true }).tap();
    assert.equal(await migrated.getByRole('textbox', { name: 'Açıklama' }).inputValue(), '\n  dize\n\ndize  ');
    await migrated.getByRole('textbox', { name: 'Açıklama' }).fill('\n  Güncel şiir\n\ndize  ');
    await click(migrated, 'Tamam'); await migrated.locator('#board').waitFor({ state: 'visible' });
    const source = await migrated.evaluate(key => localStorage.getItem(key), LEGACY_KEY);
    assert.equal(source, JSON.stringify(legacy));
    const graph = await migrated.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(graph.kartlar[0].id, 'old-a'); assert.equal(graph.ipler.length, 1);
    await click(migrated, 'Tuvaller'); await click(migrated, 'Ayarlar');
    await migrated.locator('#import-file').setInputFiles({ name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'dallanan-not', version: 1, data: legacy })) });
    await click(migrated, 'Ekle');
    const merged = await migrated.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(merged.kartlar.length, 2); assert.equal(merged.ipler.length, 1);
    assert.equal(merged.kartlar[0].aciklama, '\n  Güncel şiir\n\ndize  ');
    results.push({ name, check: 'Gerçek açılışta v1→v2 göç, eski ham veri, şiir boşlukları, v1 yedek yereli ezmeden birleştirilir', pass: true });
    console.log(`PASS ${name} migration`);
  } finally { await migratedContext.close(); }
}
try {
  for (const [engine, name] of [[pw.chromium, 'chromium'], [pw.webkit, 'webkit']]) {
    const browser = await engine.launch({ headless: true }); browsers.push(browser); await run(browser, name);
  }
} finally {
  await writeFile(output + 'png-testleri.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  for (const browser of browsers) await browser.close(); server.kill();
}
