// Dragging a card onto the toolbar's center button deletes it: the button turns into a trash
// target while a card moves, and a dropped card is swallowed with a short whoosh.
// Motion is transform + opacity on one small HTML-level layer, so it runs on the compositor;
// the clone is rasterised once and nothing repaints during the 300 ms.

const PAD = 14; // forgiving hit area around the 52 px button
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const trashButton = () => document.querySelector('#toolbar .center-button');

export function overTrash(clientX, clientY) {
  const node = trashButton(); if (!node) return false;
  const rect = node.getBoundingClientRect();
  return clientX >= rect.left - PAD && clientX <= rect.right + PAD && clientY >= rect.top - PAD && clientY <= rect.bottom + PAD;
}

export function armTrash(dragging, hovering) {
  const node = trashButton(); if (!node) return;
  node.classList.toggle('trash-armed', dragging); node.classList.toggle('trash-hover', dragging && hovering);
  node.setAttribute('aria-label', dragging ? 'Sil' : 'Merkez');
}

// Copies the card's drawn group (with any photo clip paths) into a fixed svg the size of the card.
function cloneCard(svg, id) {
  const group = svg.querySelector(`[data-card="${CSS.escape(id)}"]`), surface = group?.querySelector('.card-surface');
  if (!surface) return null;
  const box = surface.getBoundingClientRect(), base = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const layer = document.createElementNS(svg.namespaceURI, 'svg');
  layer.setAttribute('class', 'swallow'); layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('viewBox', `${box.left - base.left} ${box.top - base.top} ${box.width} ${box.height}`);
  Object.assign(layer.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
  const clips = [...surface.querySelectorAll('[clip-path]')].map(node => node.getAttribute('clip-path').match(/#([^)]+)/)?.[1]).filter(Boolean);
  if (clips.length) {
    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    for (const clipId of clips) { const clip = svg.querySelector(`#${CSS.escape(clipId)}`); if (clip) defs.append(clip.cloneNode(true)); }
    layer.append(defs);
  }
  const copy = group.cloneNode(false); copy.removeAttribute('tabindex'); copy.removeAttribute('role'); copy.append(surface.cloneNode(true));
  layer.append(copy);
  return { layer, box };
}

export function swallow(svg, id) {
  const target = trashButton();
  playWhoosh();
  const clone = cloneCard(svg, id);
  if (!target) return;
  const end = target.getBoundingClientRect();
  if (clone) {
    document.body.append(clone.layer);
    const { box } = clone, dx = end.left + end.width / 2 - (box.left + box.width / 2), dy = end.top + end.height / 2 - (box.top + box.height / 2);
    const fit = Math.min(.08, 16 / Math.max(box.width, box.height));
    const motion = reduced()
      ? clone.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'linear' })
      : clone.layer.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * .35}px,${dy * .35}px) scale(.62)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px,${dy}px) scale(${fit})`, opacity: 0 }
      ], { duration: 300, easing: 'cubic-bezier(.55,0,.8,.2)' });
    motion.finished.catch(() => {}).then(() => clone.layer.remove());
  }
  if (!reduced()) target.animate([
    { transform: 'scale(1.14)' }, { transform: 'scale(1.14)', offset: .55 }, { transform: 'scale(.86)', offset: .75 }, { transform: 'scale(1.05)', offset: .9 }, { transform: 'scale(1)' }
  ], { duration: 520, easing: 'ease-out' });
}

// Synthesised, so nothing is downloaded or cached: band-passed noise sweeping down (whoosh),
// then a short low thump when the card disappears. One context and one noise buffer are reused.
let audio = null, noise = null;
export function playWhoosh() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
    audio ??= new Context(); if (audio.state === 'suspended') audio.resume().catch(() => {});
    const now = audio.currentTime + .01;
    if (!noise) {
      noise = audio.createBuffer(1, Math.floor(audio.sampleRate * .4), audio.sampleRate);
      const data = noise.getChannelData(0); for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource(), band = audio.createBiquadFilter(), whoosh = audio.createGain();
    source.buffer = noise; band.type = 'bandpass'; band.Q.value = 1.4;
    band.frequency.setValueAtTime(2600, now); band.frequency.exponentialRampToValueAtTime(320, now + .32);
    whoosh.gain.setValueAtTime(.0001, now); whoosh.gain.exponentialRampToValueAtTime(.32, now + .1); whoosh.gain.exponentialRampToValueAtTime(.0001, now + .36);
    source.connect(band).connect(whoosh).connect(audio.destination); source.start(now); source.stop(now + .4);
    const thump = audio.createOscillator(), body = audio.createGain(), at = now + .28;
    thump.type = 'sine'; thump.frequency.setValueAtTime(150, at); thump.frequency.exponentialRampToValueAtTime(55, at + .14);
    body.gain.setValueAtTime(.0001, at); body.gain.exponentialRampToValueAtTime(.35, at + .012); body.gain.exponentialRampToValueAtTime(.0001, at + .16);
    thump.connect(body).connect(audio.destination); thump.start(at); thump.stop(at + .18);
  } catch {}
}
