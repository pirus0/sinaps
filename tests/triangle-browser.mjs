import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY, WORKSPACE_VIEW_KEY } from '../workspace.js';
const pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright');
const output = fileURLToPath(new URL('../../ekran/ucgen/', import.meta.url)); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4185' }, stdio: ['ignore', 'pipe', 'pipe'] }); await once(server.stdout, 'data');
try {
  for (const [engine, name, options] of [
    [pw.webkit, 'iphone-390', { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    [pw.chromium, 'masaustu', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ ...options, colorScheme: 'light' }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const click = async label => (await page.locator('dialog[open]').count() ? page.locator('dialog[open]') : page).getByRole('button', { name: label, exact: true }).click();
      const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
      await page.goto('http://127.0.0.1:4185');
      await click('Yeni'); await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Üçgen'); await page.keyboard.press('Enter');
      await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Fotosentez');
      await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Işık enerjisi kimyasal enerjiye');
      await click('Dal'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Klorofil');
      await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Kırmızı ve maviyi soğurur');
      await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
      const ids = (await data()).kartlar.map(card => card.id), control = id => page.locator(`[data-photo="${id}"]`);
      const buffer = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 96; const x = c.getContext('2d');
        const gradient = x.createLinearGradient(0, 0, 160, 96); gradient.addColorStop(0, '#8fa7a0'); gradient.addColorStop(1, '#2f3f37');
        x.fillStyle = gradient; x.fillRect(0, 0, 160, 96);
        return Array.from(new Uint8Array(await (await new Promise(resolve => c.toBlob(resolve, 'image/png'))).arrayBuffer()));
      });
      // The transparent edge of the 44px target must still open the native picker.
      const hit = await control(ids[1]).locator('circle').boundingBox();
      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height - 3)]);
      await picker.setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
      await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).kartlar.find(card => card.id === id)?.fotoId, { key: WORKSPACE_KEY, id: ids[1] });
      const workspace = await data();
      await page.goto('about:blank'); // Let the app flush before installing the screenshot fixture.
      await page.addInitScript(({ key, viewKey, workspace }) => {
        Object.assign(workspace.kartlar[0], { x: -90, y: -80 }); Object.assign(workspace.kartlar[1], { x: 90, y: 60 });
        localStorage.setItem(key, JSON.stringify(workspace));
        const camera = { x: 0, y: 0, z: 1 };
        localStorage.setItem(viewKey, JSON.stringify({ sonTuvalId: workspace.tuvaller[0].id, tuvaller: { [workspace.tuvaller[0].id]: { camera, tamCamera: camera, sade: false } } }));
      }, { key: WORKSPACE_KEY, viewKey: WORKSPACE_VIEW_KEY, workspace });
      await page.goto('http://127.0.0.1:4185'); await page.locator('#canvas image').waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const [scheme, suffix] of [['light', 'acik'], ['dark', 'koyu']]) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForFunction(value => document.documentElement.dataset.theme === value, scheme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        for (const [index, id] of ids.entries()) {
          const target = control(id), path = target.locator('path'), box = await target.locator('circle').boundingBox();
          assert.equal(box.width, 44); assert.equal(box.height, 44);
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= options.viewport.width && box.y + box.height <= options.viewport.height, JSON.stringify({ name, index, box }));
          const colors = await path.evaluate(node => {
            const style = getComputedStyle(node), root = getComputedStyle(document.documentElement);
            return { fill: style.fill, stroke: style.stroke, paper: root.getPropertyValue('--paper').trim(), iris: root.getPropertyValue('--iris').trim() };
          });
          const expected = await page.evaluate(color => { const n = document.createElement('span'); n.style.color = color; document.body.append(n); const rgb = getComputedStyle(n).color; n.remove(); return rgb; }, index ? colors.iris : colors.paper);
          assert.equal(colors.fill, expected); if (index) assert.equal(colors.stroke, expected);
          const shape = await path.boundingBox(), card = await page.locator(`[data-card="${id}"] .card-surface > rect`).boundingBox();
          assert.ok(shape.y >= card.y + card.height - 1, 'üçgen dışa bakar: ' + JSON.stringify({ shape, card }));
          assert.equal(await target.locator('rect').count(), 0);
        }
        await page.screenshot({ path: output + name + '-' + suffix + '.png' });
      }
      await control(ids[1]).click(); await click('Kaldır');
      await page.waitForFunction(({ key, id }) => !JSON.parse(localStorage.getItem(key)).kartlar.find(card => card.id === id)?.fotoId, { key: WORKSPACE_KEY, id: ids[1] });
      await click('Geri al'); assert.ok((await data()).kartlar[1].fotoId);
      assert.equal((await data()).kartlar.length, 2); assert.equal((await data()).ipler.length, 1);
      assert.deepEqual(errors, []); console.log('PASS ' + name + ': dışa üçgen, iki tema, 44px kenar dokunuşu, fotoğraf ekle/kaldır/geri al, taşma');
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
