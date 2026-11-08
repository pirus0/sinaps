import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { brandSVG, APP_NAME } from '../brand.js';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/package.json')('playwright'); }
const browser = await playwright.chromium.launch({ headless: true });
try {
  await writeFile(new URL('../icons/app.svg', import.meta.url), brandSVG({ size: 512, paper: '#efebe2' }));
  await writeFile(new URL('../icons/favicon.svg', import.meta.url), brandSVG({ size: 32, paper: '#efebe2' }));
  await writeFile(new URL('../icons/brand.svg', import.meta.url), brandSVG());
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  manifest.name = APP_NAME; manifest.short_name = APP_NAME;
  await writeFile(new URL('../manifest.webmanifest', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
  for (const size of [16, 32, 180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const source = brandSVG({ size, paper: '#efebe2' });
    await page.setContent(`<style>html,body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${source}`);
    const name = size === 180 ? 'apple-touch-icon.png' : size <= 32 ? `favicon-${size}.png` : `icon-${size}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(`../icons/${name}`, import.meta.url)) });
    await page.close();
  }
} finally { await browser.close(); }
