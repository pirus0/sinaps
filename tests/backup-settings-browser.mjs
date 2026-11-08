import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyGraph, addCard } from '../graph.js';
import { fromGraph, backupWorkspace, WORKSPACE_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/ayarlar-yedek/', import.meta.url)); await mkdir(output, { recursive: true });
let graph = emptyGraph(); for (let i = 0; i < 12; i++) graph = addCard(graph, { baslik: 'Not ' + (i + 1) }, 'not-' + i).store;
const workspace = fromGraph(graph), backup = backupWorkspace(workspace), metaKey = 'dallanan-not-meta-v1';
const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4187' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [scheme, suffix] of [['light', 'acik'], ['dark', 'koyu']]) {
        const context = await browser.newContext({ ...options, colorScheme: scheme });
        await context.addInitScript(({ key, workspace, metaKey, oldDate }) => {
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify(workspace));
            localStorage.setItem(metaKey, JSON.stringify({ sonYedek: oldDate, yedektenSonraDegisti: true, fotoYedekGerekli: true }));
          }
        }, { key: WORKSPACE_KEY, workspace, metaKey, oldDate });
        const page = await context.newPage(), errors = [], downloads = [];
        page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); page.on('download', file => downloads.push(file));
        const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
        const meta = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), metaKey);
        const closeAll = async () => { while (await page.locator('dialog[open]').count()) await click('Kapat'); };
        const shot = tag => page.screenshot({ path: output + name + '-' + suffix + '-' + tag + '.png' });
        const noMarkers = async () => {
          assert.equal(await page.locator('.backup-dot, .backup-due, .theme-toggle').count(), 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const settings = page.getByRole('button', { name: 'Ayarlar', exact: true });
          assert.equal(await settings.evaluate(node => getComputedStyle(node, '::after').content), 'none');
          for (const control of await page.locator('#header button, dialog[open] button').all()) {
            const b = await control.boundingBox(); assert.ok(b.width >= 44 && b.height >= 44); assert.ok(b.x >= 0 && b.x + b.width <= options.viewport.width);
          }
        };
        const importPreview = async () => {
          await page.locator('#import-file').setInputFiles({ name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
          await page.getByRole('button', { name: 'Ekle', exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Yedekle', exact: true }).count(), 1);
        };
        await page.goto('http://127.0.0.1:4187'); await noMarkers(); await shot('ana');
        await click('Ayarlar'); assert.equal(await page.locator('.sheet-header button').count(), 1);
        assert.match(await page.getByRole('button', { name: 'Yedek', exact: true }).locator('.muted').textContent(), /90 gün önce/);
        await page.waitForFunction(() => document.querySelector('button[aria-label="Yedek"] .muted').textContent.includes('KB'));
        await noMarkers(); await shot('ayarlar');
        await importPreview(); await noMarkers(); await shot('yukle'); await closeAll();
        await click('Ayarlar'); await click('Yedek');
        await page.getByRole('button', { name: 'Paylaş', exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector('dialog .wide').disabled);
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
          Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('İptal', 'AbortError'); } });
        });
        await click('Paylaş'); assert.equal((await meta()).sonYedek, oldDate); assert.equal(downloads.length, 0);
        await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => { window.backupShared = files[0] instanceof File; } }));
        await click('Paylaş'); await page.waitForFunction(({ key, old }) => JSON.parse(localStorage.getItem(key)).sonYedek !== old, { key: metaKey, old: oldDate });
        const sharedDate = (await meta()).sonYedek; assert.equal(await page.evaluate(() => window.backupShared), true);
        await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('İptal', 'AbortError'); } }));
        await click('Paylaş'); assert.equal((await meta()).sonYedek, sharedDate); assert.equal(downloads.length, 0);
        // Recent backup and no legacy flags must still offer Yedekle on import.
        await page.evaluate(({ key, date }) => localStorage.setItem(key, JSON.stringify({ sonYedek: date })), { key: metaKey, date: sharedDate });
        await page.reload(); assert.equal((await meta()).sonYedek, sharedDate); await noMarkers();
        await click('Ayarlar'); await page.waitForFunction(() => document.querySelector('button[aria-label="Yedek"] .muted').textContent.includes('Bugün'));
        await noMarkers(); await shot('yedek-sonrasi'); await importPreview(); await noMarkers(); await closeAll();
        await click('Ayarlar'); await click('Yedek'); await page.waitForFunction(() => !document.querySelector('dialog .wide').disabled);
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
          Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Etkinlik', 'NotAllowedError'); } });
        });
        await click('Paylaş'); await page.getByRole('button', { name: 'Gönder', exact: true }).waitFor(); assert.equal((await meta()).sonYedek, sharedDate); assert.equal(downloads.length, 0);
        const [file] = await Promise.all([page.waitForEvent('download'), click('Gönder')]);
        assert.equal(JSON.parse(await readFile(await file.path(), 'utf8')).data.kartlar.length, 12);
        await page.waitForFunction(({ key, old }) => JSON.parse(localStorage.getItem(key)).sonYedek !== old, { key: metaKey, old: sharedDate });
        const downloadedDate = (await meta()).sonYedek;
        await page.reload(); assert.equal((await meta()).sonYedek, downloadedDate); await noMarkers();
        assert.deepEqual(errors, []); console.log('PASS ' + name + ' ' + suffix + ': tema/nokta yok, tarih/boyut, koşulsuz Yedekle, iptal/başarı/indirme/yeniden yükleme');
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
