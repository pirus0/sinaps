import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY } from '../workspace.js';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright'); }
const output = fileURLToPath(new URL('../../ekran/sinaps/', import.meta.url)); await mkdir(output, { recursive: true });
const browser = await pw.chromium.launch({ headless: true });
const context = await browser.newContext({ ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); context.setDefaultTimeout(10000);
const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
const click = label => page.getByRole('button', { name: label, exact: true }).click();
async function createBoard(name, card) {
  await click('Yeni'); await page.getByRole('textbox', { name: 'Ad', exact: true }).fill(name); await page.keyboard.press('Enter');
  await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill(card);
  await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Sinaps notu');
  await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
}
try {
  await page.goto('http://127.0.0.1:4173');
  assert.equal(await page.title(), 'Sinaps');
  await createBoard('Dersler', 'Fizik');
  const source = await page.locator('#canvas [data-card]').first().getAttribute('data-card');
  const port = await page.locator('#canvas [data-port][data-side="1"]').first().boundingBox();
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.down();
  await page.mouse.move(230, 600, { steps: 5 }); await page.mouse.up();
  await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Kuvvet');
  await click('Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
  let data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
  assert.equal(data.kartlar.length, 2); assert.equal(data.ipler.length, 1);
  const box = await page.locator(`#canvas [data-card="${source}"]`).boundingBox();
  const before = data.kartlar.find(card => card.id === source);
  await page.mouse.move(box.x + box.width / 2, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 31, box.y + 54, { steps: 5 }); await page.mouse.up();
  data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
  const moved = data.kartlar.find(card => card.id === source); assert.ok(moved.x !== before.x || moved.y !== before.y);
  await click('Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Enerji'); await click('Tamam');
  await page.locator('#board').waitFor({ state: 'visible' });
  await page.mouse.move(195, 180); await page.mouse.down(); await page.mouse.move(35, 180, { steps: 5 }); await page.mouse.up();
  data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
  const energy = data.kartlar.find(card => card.baslik === 'Enerji').id;
  const connectExisting = async () => {
    const from = await page.locator(`[data-port="${energy}"][data-side="1"]`).boundingBox();
    const to = await page.locator(`[data-card="${source}"]`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 }); await page.mouse.up();
  };
  await connectExisting();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).ipler.length, WORKSPACE_KEY), 2);
  await connectExisting();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).ipler.length, WORKSPACE_KEY), 2);
  assert.notEqual(await page.locator('#board').evaluate(node => getComputedStyle(node).backgroundImage), 'none');
  await page.screenshot({ path: output + 'tuval.png' });
  await click('Tuvaller'); await createBoard('Şiirler', 'Bahçe'); await click('Tuvaller');
  assert.equal(await page.locator('.board-tile').count(), 2);
  for (const tile of await page.locator('.board-tile').all()) { const rect = await tile.boundingBox(); assert.ok(Math.abs(rect.width - rect.height) < 2); }
  await page.screenshot({ path: output + 'ana-menu.png' });
  await click('Dersler'); assert.equal(await page.locator('#canvas [data-card]').count(), 3);
  assert.deepEqual(errors, []); console.log('PASS Sinaps: iki kare tuval, ayrı veri, Tamam, anında taşıma, uçtan mevcut karta ip + boşluğa dal, yinelenen ip yok, nokta ızgarası');
} catch (error) { await page.screenshot({ path: output + 'hata.png' }); console.error(errors); throw error; }
finally { await context.close(); await browser.close(); }
