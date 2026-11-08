import { drawBranch } from './gestures.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/tema-baglar/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4184' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ ...options, colorScheme: 'light' }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const theme = () => page.locator('html').getAttribute('data-theme');
      const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
      const shot = nameSuffix => page.screenshot({ path: output + name + '-' + nameSuffix + '.png' });
      const layout = async () => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        for (const button of await page.locator('.sheet-header button, .connection-row .button').all()) {
          const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.x >= 0 && box.x + box.width <= options.viewport.width);
        }
      };
      const openSettings = async () => {
        if (!await page.locator('dialog[open]').count()) await click('Ayarlar');
        assert.equal(await page.locator('.theme-toggle, .theme-controls, .theme-button').count(), 0);
        assert.equal(await page.locator('.sheet-header button').count(), 1);
        assert.equal(await page.locator('#sheet-content > :first-child').getAttribute('aria-label'), 'Yedek');
        assert.equal(await page.locator('.theme-setting, #sheet-content .sheet-divider').count(), 0);
      };
      const toggleTheme = async () => {
        if (await page.locator('dialog[open]').count()) await click('Kapat');
        await page.locator('#brand-title').dblclick();
      };
      await page.goto('http://127.0.0.1:4184'); assert.equal(await theme(), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('dallanan-not-theme')), null);
      await openSettings(); await layout(); await shot('acik');
      await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await openSettings(); await layout(); await shot('koyu');
      await toggleTheme(); assert.equal(await theme(), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('dallanan-not-theme')), 'light');
      await page.emulateMedia({ colorScheme: 'light' }); await page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await theme(), 'light');
      await page.reload(); assert.equal(await theme(), 'light');
      await toggleTheme(); assert.equal(await theme(), 'dark'); await page.reload(); assert.equal(await theme(), 'dark');
      await toggleTheme();
      await click('Ara'); await page.locator('.header-search-prefix').dblclick(); assert.equal(await theme(), 'light'); await click('Kapat');
      await openSettings();
      for (const label of ['Sistem', 'Açık', 'Koyu']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 0);
      await click('Yedek'); assert.equal(await page.locator('.theme-toggle').count(), 0);
      await page.goBack(); await page.getByRole('heading', { name: 'Ayarlar', exact: true }).waitFor(); await openSettings();
      await click('Kapat'); await click('Yeni'); await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Bağ rengi'); await page.keyboard.press('Enter');
      await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Bir');
      await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); await drawBranch(page); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('İki'); await click('Menü'); await click('Bağlar');
      const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
      for (const [value, rgb] of [['light', 'rgb(184, 70, 43)'], ['dark', 'rgb(229, 96, 63)']]) {
        // Change through the real home heading, then reopen the same connections panel.
        if (await theme() !== value) {
          await click('Kapat'); await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); await click('Tuvaller');
          await toggleTheme();
          await page.locator('.board-tile').click(); await page.locator('#canvas [data-card]').first().click(); await click('Menü'); await click('Bağlar');
        }
        assert.equal(await page.getByRole('button', { name: 'Kaldır', exact: true }).evaluate(node => getComputedStyle(node).color), rgb);
        await layout(); await shot('baglar-' + value);
      }
      await click('Kaldır'); assert.equal((await stored()).ipler.length, 0); assert.equal((await stored()).kartlar.length, 2);
      await click('Geri al'); assert.equal((await stored()).ipler.length, 1); assert.equal((await stored()).kartlar.length, 2);
      assert.deepEqual(errors, []); console.log('PASS ' + name + ': yalnız ana başlıkta çift dokunuş/ikon yok/geri dönüş, sistem/tema geçişi/kalıcılık, kırmızı Kaldır/geri al, 44px/taşma');
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
