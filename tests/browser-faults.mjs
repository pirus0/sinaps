import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_KEY as STORAGE_KEY } from '../workspace.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); }
catch { pw = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright'); }
const output = fileURLToPath(new URL('../../ekran/sinaps/', import.meta.url));
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, PORT: '4175' }, stdio: ['ignore', 'pipe', 'pipe'] });
await once(server.stdout, 'data');
const browser = await pw.chromium.launch({ headless: true });
const context = await browser.newContext({ ...pw.devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
context.setDefaultTimeout(10000);
const page = await context.newPage();
const results = [];
const click = async (target, label) => {
  const scope = await target.locator('dialog[open]').count() ? target.locator('dialog[open]') : target;
  await scope.getByRole('button', { name: label, exact: true }).click();
};
const download = async action => {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  return readFile(await file.path(), 'utf8');
};
try {
  await page.goto('http://127.0.0.1:4175');
  const beforeTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#brand-title').dblclick();
  assert.notEqual(await page.locator('html').getAttribute('data-theme'), beforeTheme);
  await page.locator('#brand-title').dblclick();
  await click(page, 'Yeni'); await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('Dersler'); await page.keyboard.press('Enter'); await click(page, 'Yeni'); await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Korunacak not'); await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('  satır');
  await click(page, 'Tamam'); await page.locator('#board').waitFor({ state: 'visible' });
  await click(page, 'Tuvaller');
  await page.evaluate(() => {
    window.shareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => files.length === 1 && files[0] instanceof File });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Vazgeçildi', 'AbortError'); } });
  });
  await click(page, 'Ayarlar'); await click(page, 'Yedek'); await click(page, 'Paylaş');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dallanan-not-meta-v1'))?.sonYedek ?? null), null);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
    window.shareCalls.push({ name: files[0].name, type: files[0].type, text: await files[0].text() });
  } }));
  await click(page, 'Paylaş');
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('dallanan-not-meta-v1'))?.sonYedek);
  const shared = await page.evaluate(() => window.shareCalls[0]);
  assert.equal(shared.type, 'application/json');
  assert.equal(JSON.parse(shared.text).data.kartlar[0].baslik, 'Korunacak not');
  results.push('Web Share: gerçek File sözleşmesi; iptal yedek işaretini silmez, başarı siler');
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('Paylaşım yok'); } }));
  assert.equal(JSON.parse(await download(() => click(page, 'Paylaş'))).data.kartlar.length, 1);
  results.push('Web Share hatasında dosya indirme alternatifi');
  while (await page.locator('dialog[open]').count()) await click(page, 'Kapat');
  await click(page, 'Dersler'); await click(page, 'Korunacak not');
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Dolu', 'QuotaExceededError');
      return original.call(this, name, value);
    };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  }, STORAGE_KEY);
  await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Bellekte kalan yeni metin');
  await page.waitForFunction(() => !document.querySelector('#save-error').hidden);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), saved);
  await page.screenshot({ path: output + 'hata-depo-dolu.png' });
  await click(page, 'Tamam'); await page.locator('#board').waitFor({ state: 'visible' }); await click(page, 'Tuvaller'); await click(page, 'Ayarlar'); await click(page, 'Yedek');
  const rescue = JSON.parse(await download(() => click(page, 'Paylaş')));
  assert.equal(rescue.data.kartlar[0].aciklama, 'Bellekte kalan yeni metin');
  results.push('Depo dolu: eski kayıt korunur, kaydedilemeyen metin yedekten kurtarılır');
  await page.reload();
  await click(page, 'Dersler'); await click(page, 'Korunacak not');
  assert.equal(await page.getByRole('textbox', { name: 'Açıklama', exact: true }).inputValue(), '  satır');
  const second = await context.newPage(); await second.goto('http://127.0.0.1:4175'); await click(second, 'Korunacak not');
  await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Birinci sekmenin kaydı');
  await second.waitForFunction(() => !document.querySelector('#save-error').hidden);
  assert.equal(await second.getByRole('textbox', { name: 'Açıklama', exact: true }).getAttribute('readonly'), '');
  await second.screenshot({ path: output + 'hata-iki-sekme.png' });
  await click(second, 'Tamam'); await second.locator('#board').waitFor({ state: 'visible' }); await click(second, 'Tuvaller'); await click(second, 'Ayarlar');
  await second.locator('#import-file').setInputFiles({ name: 'eski.json', mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).kartlar[0].aciklama, STORAGE_KEY), 'Birinci sekmenin kaydı');
  await second.close();
  results.push('İki sekme: yeni veri üzerine eski veri yazılması durdurulur');
  const brokenContext = await browser.newContext({ ...pw.devices['iPhone 13'], deviceScaleFactor: 1 });
  await brokenContext.addInitScript(key => {
    localStorage.setItem(key, '{bozuk-veri');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  }, STORAGE_KEY);
  const broken = await brokenContext.newPage(); await broken.goto('http://127.0.0.1:4175');
  assert.equal(await broken.evaluate(key => localStorage.getItem(key), STORAGE_KEY), '{bozuk-veri');
  assert.equal(await broken.getByRole('button', { name: 'Yeni', exact: true }).first().isDisabled(), true);
  await click(broken, 'Ayarlar'); await click(broken, 'Yedek');
  const [rawFile] = await Promise.all([broken.waitForEvent('download'), click(broken, 'Paylaş')]);
  assert.equal(await readFile(await rawFile.path(), 'utf8'), '{bozuk-veri');
  await broken.screenshot({ path: output + 'hata-bozuk-kayit.png' });
  await brokenContext.close();
  results.push('Bozuk kayıt: üzerine yazılmaz, ham dosya dışa aktarılabilir');
  console.log(`PASS ${results.length} tarayıcı hata/kurtarma senaryosu`);
} finally {
  await writeFile(output + 'hata-testleri.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  await context.close(); await browser.close(); server.kill();
}
