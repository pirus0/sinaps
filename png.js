import { brandSVG } from './brand.js';
import { makeScene, exportPlan, shorten } from './scene.js';
import { photoImage } from './photos.js';
import { isImageCard } from './graph.js';

export function textMeasure(font = '600 14px Geist') {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Görüntü hazırlanamadı');
  context.font = font;
  return text => context.measureText(text).width;
}
export function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['paper', 'surface', 'ink', 'ink-soft', 'iris', 'ip', 'line'].map(key => [key, style.getPropertyValue('--' + key).trim()]));
}
function rounded(context, x, y, width, height, radius) {
  context.beginPath(); context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath();
}
async function brandImage(colors) {
  const url = URL.createObjectURL(new Blob([brandSVG({ size: 128, ink: colors.ink, accent: colors.iris })], { type: 'image/svg+xml' }));
  const image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Simge açılamadı')); image.src = url; });
    return image;
  } finally { URL.revokeObjectURL(url); }
}
export async function preparePNG(store, width, options = {}) {
  await document.fonts.load('600 14px Geist'); await document.fonts.ready;
  const measure = textMeasure(), scene = makeScene(store, width, measure, options.title), colors = palette();
  let plan = exportPlan(scene, options);
  if (!plan) return null;
  const mark = await brandImage(colors);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const canvas = document.createElement('canvas');
    try {
      canvas.width = plan.pixelWidth; canvas.height = plan.pixelHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Görüntü hazırlanamadı');
      context.scale(plan.scale, plan.scale);
      context.fillStyle = colors.paper; context.fillRect(0, 0, plan.width, plan.height);
      context.save(); context.translate(plan.offsetX, plan.offsetY);
      context.strokeStyle = colors.ip; context.lineWidth = 1.5; context.lineCap = 'round';
      for (const edge of scene.edges) {
        context.beginPath(); context.moveTo(edge.start.x, edge.start.y);
        context.bezierCurveTo(edge.c1.x, edge.c1.y, edge.c2.x, edge.c2.y, edge.end.x, edge.end.y); context.stroke();
      }
      context.font = '600 14px Geist'; context.textAlign = 'center'; context.textBaseline = 'middle';
      for (const card of scene.cards) {
        rounded(context, card.x - card.w / 2, card.y - 20, card.w, 40, 14);
        context.shadowColor = 'rgba(0,0,0,.09)'; context.shadowBlur = 10; context.shadowOffsetY = 4;
        context.fillStyle = colors.surface; context.fill(); context.shadowColor = 'transparent';
        const photo = card.fotoId && photoImage(card.fotoId);
        if (photo) {
          const left = card.x - card.w / 2 + 5; context.save(); context.beginPath(); context.arc(left + 15, card.y, 15, 0, Math.PI * 2); context.clip();
          const side = Math.min(photo.naturalWidth, photo.naturalHeight);
          context.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, left, card.y - 15, 30, 30); context.restore();
        }
        context.fillStyle = colors.ink; context.textAlign = photo ? 'left' : 'center';
        if (!isImageCard(card)) context.fillText(shorten(card.label, card.w - (photo ? 55 : 24), measure), photo ? card.x - card.w / 2 + 43 : card.x, card.y + .5);
      }
      if (scene.center) {
        context.fillStyle = colors.iris; context.beginPath(); context.arc(0, 0, 7, 0, Math.PI * 2); context.fill();
        context.font = '600 12px Geist'; context.textAlign = 'center'; context.fillText(shorten(scene.center.label, scene.center.w - 8, measure), 0, 24);
      }
      context.restore(); context.globalAlpha = .3;
      context.drawImage(mark, plan.width - 24 - plan.watermark, plan.height - 24 - plan.watermark, plan.watermark, plan.watermark);
      context.globalAlpha = 1;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || !blob.size) throw new Error('Görüntü hazırlanamadı');
      const file = new File([blob], `sinaps-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
      return { file, plan };
    } catch (error) {
      lastError = error;
      plan = { ...plan, scale: plan.scale / 2, pixelWidth: Math.max(1, Math.floor(plan.pixelWidth / 2)), pixelHeight: Math.max(1, Math.floor(plan.pixelHeight / 2)) };
    } finally { canvas.width = 1; canvas.height = 1; }
  }
  throw lastError;
}
