// Cards show their whole title and description: no ellipsis. Lines are wrapped here once and the
// same lines are used by the canvas, card heights (layout, snapping, PDF pages) and the PDF itself.
// Metrics are screen px; the PDF scales them, so a printed card breaks lines exactly like the screen.
export const TEXT = Object.freeze({ inset: 14, titleTop: 28, titleLine: 20, bodyGap: 21, bodyLine: 19.5, bottom: 19.5, min: 88 });

// Until the page supplies real font metrics (and in Node tests) an average glyph width is used.
const approx = size => text => [...text].length * size * .55;
let measures = { title: approx(15.5), body: approx(13.5) }, cache = new Map();

export function setTextMeasure(title, body) { measures = { title, body }; cache = new Map(); }

// Breaks one paragraph at spaces; a word wider than the card is broken between letters.
function wrapParagraph(text, width, measure) {
  const lines = []; let line = '';
  for (const word of text.split(' ').filter(Boolean)) {
    const candidate = line ? line + ' ' + word : word;
    if (measure(candidate) <= width) { line = candidate; continue; }
    if (line) lines.push(line);
    if (measure(word) <= width) { line = word; continue; }
    line = '';
    for (const char of word) { if (line && measure(line + char) > width) { lines.push(line); line = char; } else line += char; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Wraps text into lines no wider than `width`; line breaks are kept, runs of blank lines become one. */
export function wrapText(text, width, measure) {
  const lines = [];
  for (const paragraph of text.split('\n').map(part => part.replace(/\s+/g, ' ').trim())) {
    if (!paragraph) { if (lines.length && lines.at(-1) !== '') lines.push(''); continue; }
    lines.push(...wrapParagraph(paragraph, width, measure));
  }
  while (lines.at(-1) === '') lines.pop();
  return lines;
}

/** Title and description lines of a card and the text block's height (at least the classic 88). */
export function cardLayout(title, body, width) {
  const key = width + '\u0000' + title + '\u0000' + body;
  const hit = cache.get(key); if (hit) return hit;
  const inner = width - TEXT.inset * 2;
  const titleLines = wrapText(title.replace(/\s+/g, ' '), inner, measures.title), bodyLines = body ? wrapText(body, inner, measures.body) : [];
  const titles = Math.max(1, titleLines.length);
  const height = Math.max(TEXT.min, TEXT.titleTop + (titles - 1) * TEXT.titleLine
    + (bodyLines.length ? TEXT.bodyGap + (bodyLines.length - 1) * TEXT.bodyLine : 0) + TEXT.bottom);
  const result = { title: titleLines, body: bodyLines, height,
    bodyTop: TEXT.titleTop + (titles - 1) * TEXT.titleLine + TEXT.bodyGap };
  if (cache.size > 4000) cache = new Map();
  cache.set(key, result); return result;
}
