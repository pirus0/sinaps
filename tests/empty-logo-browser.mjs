// Empty board: no empty-state box, toolbar in place, faint logo whose dot sits exactly under the
// center dot; it fades out over 2 s once the first card exists.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/bos-tuval/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4192' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [scheme, suffix] of [['light', 'acik'], ['dark', 'koyu']]) {
        const context = await browser.newContext({ ...options, colorScheme: scheme }), page = await context.newPage(), errors = [];
        page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
        const click = label => page.getByRole('button', { name: label, exact: true }).click();
        await page.goto('http://127.0.0.1:4192'); await click('Yeni');
        await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Boş'); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.empty-board, .empty-label').count(), 0, 'boş kutusu yok');
        for (const label of ['Sade', 'Merkez', 'Yeni']) assert.ok(await page.locator('#toolbar').getByRole('button', { name: label, exact: true }).isVisible(), label);
        const ghost = page.locator('.ghost-logo'); assert.ok(await ghost.isVisible(), 'logo görünür');
        const fit = await page.evaluate(() => {
          const logo = document.querySelector('.ghost-logo circle').getBoundingClientRect();
          const dot = document.querySelector('#canvas .canvas-center circle:nth-child(2)').getBoundingClientRect();
          const c = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 });
          return { logo: c(logo), dot: c(dot) };
        });
        for (const key of ['x', 'y', 'r']) assert.ok(Math.abs(fit.logo[key] - fit.dot[key]) < .5, `${key} ${JSON.stringify(fit)}`);
        await page.screenshot({ path: `${output}${name}-${suffix}-bos.png` });
        // Pan: logo stays with the center.
        await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(260, 360, { steps: 6 }); await page.mouse.up();
        const moved = await page.evaluate(() => { const a = document.querySelector('.ghost-logo circle').getBoundingClientRect(), b = document.querySelector('#canvas .canvas-center circle:nth-child(2)').getBoundingClientRect(); return Math.hypot(a.left - b.left, a.top - b.top); });
        assert.ok(moved < .5, 'kaydırınca birlikte');
        // Empty card abandoned: logo stays.
        await click('Yeni'); await click('Geri'); assert.ok(await ghost.isVisible(), 'boş taslakta kalır');
        await click('Sade'); assert.ok(await ghost.isVisible()); await click('Tam');
        await click('Yeni'); await page.locator('#card-title').fill('İlk'); await click('Tamam');
        await page.waitForTimeout(1000);
        const mid = await ghost.evaluate(node => Number(getComputedStyle(node).opacity));
        assert.ok(mid > .2 && mid < .95, 'yarıda solukluyor ' + mid);
        await page.screenshot({ path: `${output}${name}-${suffix}-soluyor.png` });
        await page.waitForTimeout(1300);
        assert.equal(await ghost.isVisible(), false, '2 sn sonra yok');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log('geçti', name, suffix); await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
