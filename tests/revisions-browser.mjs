import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY, WORKSPACE_VIEW_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/duzeltme/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4182' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
const browsers = [], results = [];
try {
  for (const [engine, name, width, dark] of [[pw.chromium, 'mobil-375', 375, false], [pw.chromium, 'mobil-430-koyu', 430, true], [pw.webkit, 'iphone-390', 390, false], [pw.chromium, 'masaustu', 1440, false]]) {
    const browser = await engine.launch({ headless: true }); browsers.push(browser);
    const context = await browser.newContext({ ...(width < 600 ? pw.devices['iPhone 13'] : {}), viewport: { width, height: 844 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
    context.setDefaultTimeout(15000); const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if(m.type() === 'warning') console.log(name, m.text()); });
    const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
    const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
    const shot = tag => page.screenshot({ path: output + name + '-' + tag + '.png' });
    const center = async () => {
      await page.waitForFunction(width => {
        const rect = document.querySelector('.canvas-center circle')?.getBoundingClientRect();
        return rect && Math.abs((rect.left + rect.right) / 2 - width / 2) < .1 && Math.abs((rect.top + rect.bottom) / 2 - 422) < .1;
      }, width);
    };
    await page.goto('http://127.0.0.1:4182');
    assert.equal(await page.locator('#brand-title').textContent(), 'Sinaps');
    assert.equal(Math.round((await page.locator('#brand-title svg').boundingBox()).width), 28);
    await click('Yeni'); await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Kendi notlarım'); await page.keyboard.press('Enter');
    await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Korunan kart'); await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); await click('Tuvaller');
    const existingId = (await data()).tuvaller[0].id;
    await click('Ara'); assert.equal(await page.locator('dialog[open]').count(), 0); assert.equal(await page.locator('.header-search-input').evaluate(node => node === document.activeElement), true);
    await page.getByRole('searchbox').fill('Korunan'); assert.equal(await page.locator('.search-result-card').count(), 1); assert.equal((await data()).kartlar.length, 1); await shot('ana-ara'); await click('Kapat'); await page.locator('.header-search-bar').waitFor({ state: 'hidden' });
    // Demo import must append and open, then never duplicate itself when that URL is opened again.
    await page.goto('http://127.0.0.1:4182/?ornek=fotosentez'); await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).kartlar.length === 43, WORKSPACE_KEY); await page.locator('#board-name').filter({ hasText: 'Fotosentez' }).waitFor(); await center();
    let workspace = await data(); assert.ok(workspace.tuvaller.some(board => board.id === existingId)); assert.equal(workspace.ipler.length, 54);
    await page.goto('http://127.0.0.1:4182/?ornek=fotosentez'); await page.locator('#board-name').filter({ hasText: 'Fotosentez' }).waitFor(); assert.equal((await data()).kartlar.length, 43);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller); await shot('tam');
    await click('Sade'); await click('Paylaş'); await click('PDF');
    const generate = page.getByRole('button', { name: 'Oluştur', exact: true }); if (await generate.count()) await generate.click();
    await page.waitForFunction(() => !document.querySelector('dialog .wide')?.disabled); await shot('pdf');
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
    const [pdf] = await Promise.all([page.waitForEvent('download'), click('Paylaş')]); await writeFile(output + name + '-Fotosentez-A4.pdf', await readFile(await pdf.path()));
    await click('Kapat'); await page.getByRole('button', { name: 'Görsel', exact: true }).waitFor(); await click('Kapat'); await click('Tam');

    for (const card of await page.locator('#canvas [data-card]').all()) { assert.equal(await card.locator('[data-side="-1"]').count(), 1); assert.equal(await card.locator('[data-side="1"]').count(), 1); }
    await click('Ara'); await page.getByRole('searchbox').fill('Rubisco'); assert.equal(await page.locator('dialog[open]').count(), 0); await shot('tuval-ara'); await page.locator('.search-result-card').first().click();
    await page.waitForFunction(() => !document.querySelector('.header-search-bar')); const selectedId = await page.locator('.canvas-card.marked').getAttribute('data-card');
    // Each side gets the same direct-target gesture, with a curve starting on that side.
    for (const side of [-1, 1]) {
      const port = page.locator(`[data-port="${selectedId}"][data-side="${side}"]`), box = await port.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(width / 2 + 130, 610, { steps: 5 });
      const wire = await page.locator('#canvas .canvas-cards>path').last().getAttribute('d'); assert.ok(wire.startsWith('M')); const from = wire.match(/^M([^ ]+) ([^C]+)/); assert.ok(Math.abs(Number(from[1]) - (box.x + box.width / 2)) < .1); assert.ok(Math.abs(Number(from[2]) - (box.y + box.height / 2)) < .1);
      await page.mouse.up(); await page.getByRole('textbox', { name: 'Başlık', exact: true }).waitFor(); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Uç ' + side); await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
      if (side === -1) { await click('Ara'); await page.getByRole('searchbox').fill('Rubisco'); await page.locator('.search-result-card').first().click(); }
    }
    assert.equal((await data()).ipler.length, 56);
    const readCamera = () => page.evaluate(key => {const v=JSON.parse(localStorage.getItem(key));return v.tuvaller[v.sonTuvalId].camera;}, WORKSPACE_VIEW_KEY);
    const fullCamera = await readCamera(); await click('Sade'); if (engine === pw.chromium) { await page.mouse.move(width / 2, 180); await page.keyboard.down('Control'); await page.mouse.wheel(0,5000); await page.keyboard.up('Control'); } const simpleCamera = await readCamera(); assert.equal(simpleCamera.z,.38); assert.equal(simpleCamera.x,fullCamera.x); assert.equal(simpleCamera.y,fullCamera.y); await click('Tam');
    await click('Merkez'); await center(); await click('Sade'); await center();
    // Move the camera far away, then the red button must center even in Sade.
    await page.mouse.move(width / 2, 180); await page.mouse.down(); await page.mouse.move(width / 2 + 60, 225, { steps: 5 }); await page.mouse.up(); await click('Merkez'); await center();
    assert.equal(await page.locator('[data-port]').count(), 0); await shot('sade');
    const camera = await page.evaluate(key => { const v = JSON.parse(localStorage.getItem(key)); return v.tuvaller[v.sonTuvalId].camera; }, WORKSPACE_VIEW_KEY); assert.equal(camera.x, 0); assert.equal(camera.y, 0);
    await click('Tuvaller');
    for (const marker of await page.locator('[data-preview-center]').all()) assert.deepEqual(await marker.evaluate(node => [node.getAttribute('cx'), node.getAttribute('cy')]), ['80', '50']);
    await shot('ana'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errors, []);
    results.push({ name, width, pass: true }); console.log('PASS ' + name + ' üst arama/logo/iki uç/origin/örnek'); await context.close();
  }
} finally { await writeFile(output + 'sonuclar.json', JSON.stringify(results, null, 2)); for (const browser of browsers) await browser.close(); server.kill(); }
