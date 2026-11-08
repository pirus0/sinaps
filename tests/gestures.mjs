// Branching is now a canvas gesture; the writing toolbar only adds images.
export async function drawBranch(page, sourceId) {
  const port = page.locator(sourceId ? `[data-port="${sourceId}"][data-side="1"]` : '[data-port][data-side="1"]').first();
  const box = await port.boundingBox(), viewport = page.viewportSize();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(Math.min(viewport.width - 24, x + 72), Math.min(viewport.height - 150, y + 150), { steps: 8 });
  await page.mouse.up();
  await page.getByRole('textbox', { name: 'Başlık', exact: true }).waitFor();
}
