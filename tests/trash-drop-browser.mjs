// Dragging a card onto the toolbar center deletes it with a swallow animation; Geri al restores it.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/cop-surukle/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4191' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
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
        const cards = () => page.evaluate(key => { const w = JSON.parse(localStorage.getItem(key)); return w.kartlar; }, WORKSPACE_KEY);
        const click = label => page.getByRole('button', { name: label, exact: true }).click();
        await page.goto('http://127.0.0.1:4191'); await click('Yeni');
        await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Çöp'); await page.keyboard.press('Enter');
        for (const title of ['Birinci', 'İkinci']) {
          await click('Yeni');
          await page.locator('#card-title').fill(title); await click('Tamam');
        }
        const count = await page.locator('#canvas [data-card]').count(); assert.equal(count, 2);
        const card = page.locator('#canvas [data-card]').first(), id = await card.getAttribute('data-card');
        const before = (await cards()).find(item => item.id === id);
        const box = await card.boundingBox(), start = { x: Math.max(box.x, 0) + 44, y: box.y + 22 };
        const center = page.locator('#toolbar .center-button'), target = await center.boundingBox();
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(start.x + 30, start.y + 30, { steps: 4 });
        assert.equal(await center.evaluate(node => node.classList.contains('trash-armed')), true, 'taşırken çöp hazır');
        assert.equal(await center.getAttribute('aria-label'), 'Sil');
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
        assert.equal(await center.evaluate(node => node.classList.contains('trash-hover')), true, 'üstünde vurgulu');
        await page.waitForTimeout(200); await page.screenshot({ path: `${output}${name}-${suffix}-ustunde.png` });
        await page.mouse.up();
        assert.equal(await page.locator('.swallow').count(), 1, 'yutma katmanı');
        const animated = await page.evaluate(() => document.querySelector('.swallow').getAnimations().flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k))).filter(key => !['offset', 'easing', 'composite', 'computedOffset'].includes(key)));
        assert.deepEqual([...new Set(animated)].sort(), ['opacity', 'transform'], 'yalnız kompozitör özellikleri');
        await page.waitForTimeout(120); await page.screenshot({ path: `${output}${name}-${suffix}-yutuyor.png` });
        await page.waitForTimeout(400);
        assert.equal(await page.locator('.swallow').count(), 0, 'katman temizlendi');
        assert.equal(await page.locator('#canvas [data-card]').count(), 1);
        assert.equal((await cards()).some(item => item.id === id), false, 'kayıttan silindi');
        assert.equal(await center.evaluate(node => node.classList.contains('trash-armed')), false);
        assert.equal(await center.getAttribute('aria-label'), 'Merkez');
        await page.getByRole('button', { name: 'Geri al', exact: true }).click();
        const back = (await cards()).find(item => item.id === id);
        assert.ok(back, 'geri alındı'); assert.equal(back.x, before.x); assert.equal(back.y, before.y);
        // Dropping elsewhere still just moves.
        const other = page.locator('#canvas [data-card]').first(), ob = await other.boundingBox();
        await page.mouse.move(Math.max(ob.x, 0) + 44, ob.y + 22); await page.mouse.down();
        await page.mouse.move(Math.max(ob.x, 0) + 104, ob.y + 80, { steps: 8 }); await page.mouse.up();
        assert.equal(await page.locator('#canvas [data-card]').count(), 2, 'boşluğa bırakınca silinmez');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log('geçti', name, suffix);
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
