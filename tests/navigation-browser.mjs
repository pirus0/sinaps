import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/gezinme/', import.meta.url));
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4183' }, stdio: ['ignore', 'pipe', 'pipe'] });
await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage(options), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const click = label => page.getByRole('button', { name: label, exact: true }).click();
      const checkNew = async () => {
        const button = page.locator('#toolbar').getByRole('button', { name: 'Yeni', exact: true });
        assert.equal(await button.textContent(), ''); assert.equal(await button.locator('svg').count(), 1);
        const box = await button.boundingBox(); assert.equal(box.width, 44); assert.equal(box.height, 44);
      };
      const checkLayout = async () => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        for (const button of await page.locator('#header button, #toolbar button').all()) {
          const box = await button.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.x >= 0 && box.x + box.width <= options.viewport.width);
        }
      };
      await page.goto('http://127.0.0.1:4183'); await click('Yeni');
      await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Gezinme'); await page.keyboard.press('Enter');
      await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('İlk kayıt');
      await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Geri ile hemen kaydedilir.');
      await checkLayout();
      const back = await page.getByRole('button', { name: 'Geri', exact: true }).boundingBox();
      const menu = await page.getByRole('button', { name: 'Menü', exact: true }).boundingBox(); assert.ok(back.x < menu.x);
      await page.screenshot({ path: output + name + '-yazi.png' });
      // Click immediately after editing, before the autosave debounce.
      await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Geri kaydı'); await click('Geri');
      await page.locator('#board').waitFor({ state: 'visible' }); await checkNew(); await checkLayout();
      const boardBack = page.getByRole('button', { name: 'Tuvaller', exact: true });
      const canHover = await page.evaluate(() => matchMedia('(hover:hover)').matches);
      if (canHover) await page.mouse.move(0, 0);
      const beforeHover = await boardBack.evaluate(node => getComputedStyle(node).backgroundColor);
      await boardBack.hover();
      const hoverBackground = await boardBack.evaluate(node => getComputedStyle(node).backgroundColor);
      if (canHover) assert.notEqual(hoverBackground, beforeHover);
      else {
        assert.equal(hoverBackground, beforeHover);
        const surface = await page.evaluate(() => {
          const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--surface)'; document.body.append(probe);
          const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color;
        });
        assert.equal(hoverBackground, surface);
      }
      let cards = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).kartlar, WORKSPACE_KEY);
      assert.equal(cards.length, 1); assert.equal(cards[0].baslik, 'Geri kaydı'); assert.equal(cards[0].aciklama, 'Geri ile hemen kaydedilir.');
      await page.screenshot({ path: output + name + '-tuval.png' });
      await page.locator('#canvas [data-card]').click();
      await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Tamam ile hemen kaydedilir.'); await click('Tamam');
      await page.locator('#board').waitFor({ state: 'visible' }); await click('Tuvaller'); await checkNew(); await checkLayout();
      await page.screenshot({ path: output + name + '-ana.png' }); await page.reload();
      cards = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).kartlar, WORKSPACE_KEY);
      assert.equal(cards[0].baslik, 'Geri kaydı'); assert.equal(cards[0].aciklama, 'Tamam ile hemen kaydedilir.');
      assert.deepEqual(errors, []); console.log('PASS ' + name + ': Geri/Tamam kayıt, Yeni 44px, hover, taşma ve yeniden yükleme');
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
