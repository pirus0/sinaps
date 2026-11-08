import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
import { drawBranch } from './gestures.mjs';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/gorsel-kart/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4186' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [scheme, suffix] of [['light', 'acik'], ['dark', 'koyu']]) {
        const context = await browser.newContext({ ...options, colorScheme: scheme }), page = await context.newPage(), errors = [];
        page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
        const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
        const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
        const shot = tag => page.screenshot({ path: output + name + '-' + suffix + '-' + tag + '.png' });
        const layout = async () => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          for (const control of await page.locator('#toolbar button, #header button').all()) {
            const box = await control.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
            assert.ok(box.x >= 0 && box.x + box.width <= options.viewport.width);
            assert.ok(box.y >= 0 && box.y + box.height <= options.viewport.height, JSON.stringify({ box, name, suffix, label: await control.getAttribute('aria-label') }));
          }
        };
        await page.goto('http://127.0.0.1:4186'); await click('Yeni');
        await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Görsel notlar'); await page.keyboard.press('Enter');
        await page.mouse.move(40, 650); await page.mouse.down(); await page.mouse.move(40, 470, { steps: 8 }); await page.mouse.up();
        await click('Yeni'); await page.locator('#card-title').blur();
        const plus = page.locator('#toolbar').getByRole('button', { name: 'Görsel', exact: true });
        assert.equal(await plus.textContent(), ''); assert.equal(await page.getByRole('button', { name: 'Dal', exact: true }).count(), 0);
        const box = await plus.boundingBox(); assert.equal(box.width, 44); assert.equal(box.height, 44);
        const plainColor = await plus.evaluate(node => getComputedStyle(node).color);
        await layout(); await shot('yazi-bos');
        const buffer = await page.evaluate(async () => {
          const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
          const g = x.createLinearGradient(0, 0, 600, 400); g.addColorStop(0, '#8fa7a0'); g.addColorStop(1, '#2f3f37');
          x.fillStyle = g; x.fillRect(0, 0, 600, 400);
          return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()));
        });
        const [picker] = await Promise.all([page.waitForEvent('filechooser'), plus.click()]);
        await picker.setFiles({ name: 'gorsel.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
        await page.locator('.writing-photo img').waitFor();
        assert.notEqual(await plus.evaluate(node => getComputedStyle(node).color), plainColor);
        await layout(); await shot('yazi-gorselli');
        await click('Görsel'); await page.getByRole('heading', { name: 'Görsel', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Değiştir', exact: true }).count(), 1);
        await shot('gorsel-menu'); await click('Kapat'); await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
        const imageId = (await data()).kartlar[0].id, photoId = (await data()).kartlar[0].fotoId;
        const imageCard = page.locator(`[data-card="${imageId}"]`), rect = imageCard.locator('.card-surface > rect');
        assert.equal(await rect.getAttribute('height'), String(Number(await rect.getAttribute('width')) * .75));
        assert.equal(await imageCard.locator('text').count(), 0); assert.equal(await imageCard.locator('[data-port]').count(), 2);
        const dims = await imageCard.locator('image').evaluate(node => ({ h: +node.getAttribute('height'), w: +node.getAttribute('width') }));
        assert.ok(Math.abs((dims.h + 1.5) / (dims.w + 1.5) - .75) < 1e-9);
        await layout(); await shot('tam');
        await click('Sade'); assert.equal(await rect.getAttribute('width'), '40'); assert.equal(await rect.getAttribute('height'), '40');
        assert.equal(await imageCard.locator('text').count(), 0); assert.equal(await imageCard.locator('image').getAttribute('width'), '30');
        await layout(); await shot('sade');
        // Inspect actual raster output and real PDF rather than only their layout plans.
        const artifacts = await page.evaluate(async () => {
          const { boardGraph, WORKSPACE_KEY } = await import('./workspace.js'), workspace = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
          const graph = boardGraph(workspace, workspace.tuvaller[0].id), width = Math.round(Math.min(innerWidth, 448) * .42);
          const { preparePNG } = await import('./png.js'), { makeScene } = await import('./scene.js');
          const scene = makeScene(graph, width), { file, plan } = await preparePNG(graph, width);
          const image = new Image(); image.src = URL.createObjectURL(file); await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const x = canvas.getContext('2d'); x.drawImage(image, 0, 0); URL.revokeObjectURL(image.src);
          const card = scene.cards[0], cx = Math.round((card.x + plan.offsetX) * plan.scale), cy = Math.round((card.y + plan.offsetY) * plan.scale);
          const pixel = [...x.getImageData(cx, cy, 1, 1).data];
          const png = Array.from(new Uint8Array(await file.arrayBuffer()));
          const { preparePDF } = await import('./pdf.js'), pdf = await preparePDF(graph, width, 'Görsel notlar');
          return { png, pdf: Array.from(new Uint8Array(await pdf.file.arrayBuffer())), pixel, card: { w: card.w, h: card.h, label: card.label } };
        });
        assert.deepEqual(artifacts.card, { w: 40, h: 40, label: '' });
        assert.ok(artifacts.pixel[1] > artifacts.pixel[0] && artifacts.pixel[3] === 255, 'PNG ortasında gerçek yeşil görsel');
        await writeFile(output + name + '-' + suffix + '.png', Buffer.from(artifacts.png));
        await writeFile(output + name + '-' + suffix + '.pdf', Buffer.from(artifacts.pdf));
        await click('Tam'); await page.reload(); await page.locator('#canvas image').waitFor(); assert.equal((await data()).kartlar[0].fotoId, photoId);
        await click('Yeni'); await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); assert.equal((await data()).kartlar.length, 1, 'görselsiz boş taslak saklanmaz');
        await drawBranch(page, imageId); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Bağlı kart');
        await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); assert.equal((await data()).ipler.length, 1);
        await imageCard.click(); await click('Görsel'); await click('Kaldır');
        assert.equal((await data()).kartlar.length, 1); assert.equal((await data()).ipler.length, 0);
        await click('Geri al'); assert.equal((await data()).kartlar.length, 2); assert.equal((await data()).ipler.length, 1);
        assert.equal((await data()).kartlar.find(card => card.id === imageId).fotoId, photoId);
        await page.locator(`[data-photo="${imageId}"]`).click(); await click('Kaldır'); await click('Geri al');
        await page.waitForTimeout(6600);
        assert.equal(await page.evaluate(async id => !!await (await import('./photos.js')).getPhoto(id), photoId), true);
        await page.reload(); await page.locator('#canvas image').waitFor(); assert.equal((await data()).kartlar.length, 2);
        assert.deepEqual(errors, []); console.log('PASS ' + name + ' ' + suffix + ': yazı artısı, boş/görsel kart, PNG/PDF, ipli sil/geri al, fotoğraf kalıcılığı, 44px/taşma');
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
