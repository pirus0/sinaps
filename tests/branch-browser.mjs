// First card sits on the red centre dot; one tap on a side port hides that side's branches (again: shows),
// a double tap opens the linking tool. Folds survive a reload; a hidden card reached by search is shown.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/dal-gizle/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4198' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext(options), page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
      const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
      const shown = () => page.locator('#canvas [data-card]').count();
      const tap = async locator => { const b = await locator.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
      await page.goto('http://127.0.0.1:4198'); await click('Yeni');
      await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Dallar'); await page.keyboard.press('Enter');
      await click('Yeni'); await page.locator('#card-title').fill('Ana'); await click('Tamam');
      // On the dot: card centre equals the centre marker.
      const centre = await page.evaluate(() => { const c = document.querySelector('#canvas .canvas-center circle:nth-child(2)').getBoundingClientRect(), k = document.querySelector('#canvas [data-card] .card-surface').getBoundingClientRect();
        return [c.x + c.width / 2 - (k.x + k.width / 2), c.y + c.height / 2 - (k.y + k.height / 2)]; });
      assert.ok(Math.abs(centre[0]) < 1 && Math.abs(centre[1]) < 1, 'ilk kart merkezde ' + centre);
      // Two branch cards out of the right port (drag), one more from the second.
      const main = await page.locator('#canvas [data-card]').first().getAttribute('data-card');
      for (const title of ['Dal 1', 'Dal 2']) {
        const port = await page.locator(`[data-port="${main}"][data-side="1"]`).boundingBox(), vp = page.viewportSize();
        await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.down();
        await page.mouse.move(Math.min(vp.width - 30, port.x + 140), port.y + (title === 'Dal 1' ? -120 : 150), { steps: 8 }); await page.mouse.up();
        await page.locator('#card-title').fill(title); await click('Tamam');
      }
      await click('Merkez'); await page.waitForTimeout(200);
      assert.equal(await shown(), 3);
      const port = page.locator(`[data-port="${main}"][data-side="1"]`);
      assert.equal(await port.getAttribute('aria-label'), 'Gizle');
      await tap(port); await page.waitForTimeout(450);
      assert.equal(await shown(), 1, 'tek basış dalları gizler');
      assert.equal(await port.getAttribute('aria-label'), 'Göster'); assert.equal(await page.locator('.canvas-edges path').count(), 0, 'ipleri de gizli');
      await page.waitForFunction(() => document.querySelector('.ghost-logo')?.hidden === true, null, { timeout: 4000 });
      await page.screenshot({ path: `${output}${name}-gizli.png` });
      await page.reload(); await page.waitForTimeout(500); assert.equal(await shown(), 1, 'yeniden yüklemede kalır');
      await tap(page.locator(`[data-port="${main}"][data-side="1"]`)); await page.waitForTimeout(450);
      assert.equal(await shown(), 3, 'tekrar basış gösterir');
      // Left side has no branch: a tap changes nothing.
      await tap(page.locator(`[data-port="${main}"][data-side="-1"]`)); await page.waitForTimeout(450);
      assert.equal(await shown(), 3); assert.equal(await page.locator(`[data-port="${main}"][data-side="-1"]`).getAttribute('aria-label'), 'Gizle');
      // Double tap: linking tool (target header), nothing hidden.
      const b = await page.locator(`[data-port="${main}"][data-side="1"]`).boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(120); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.locator('.target-header').waitFor(); await page.waitForTimeout(400);
      assert.equal(await shown(), 3, 'çift basış gizlemez');
      await page.screenshot({ path: `${output}${name}-bagla.png` });
      await click('Vazgeç'); await page.locator('.target-header').waitFor({ state: 'detached' });
      // Hidden card found by search is revealed.
      await tap(page.locator(`[data-port="${main}"][data-side="1"]`)); await page.waitForTimeout(450); assert.equal(await shown(), 1);
      await click('Ara'); await page.locator('.header-search-input').fill('Dal 2');
      await page.locator('.header-search-results button').first().click();
      await page.waitForTimeout(400); assert.equal(await shown(), 3, 'aramayla açılan kart görünür');
      for (const control of await page.locator('[data-port]').all()) { const box = await control.boundingBox(); assert.ok(box.width >= 43 && box.height >= 43, 'port 44px'); }
      assert.deepEqual(errors, []);
      console.log('PASS', name, 'ilk kart merkezde, tek basış gizle/göster, çift basış bağla, kalıcılık, arama açar');
      await context.close();
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
