// Branches: the oldest card of a board is its main card (the first card sits on the red centre dot).
// Links have no direction, so "the cards coming out of a card" are read outwards from the main card:
// a card's children are its linked cards one step further from the main card. Cards not linked to the
// main card at all are read out from their own oldest card. Tapping a side port hides (or shows again)
// every card in the branches that leave through that side. Hiding is a view setting; the board is unchanged.
const age = (a, b) => (a.olusturma || '').localeCompare(b.olusturma || '') || a.id.localeCompare(b.id);

/** The board's main card: its oldest card. */
export function mainCardId(store) { return [...store.kartlar].sort(age)[0]?.id ?? null; }

// Parent of every card, walking outwards (breadth first) from the main card, then from each remaining oldest card.
function parents(store) {
  const near = new Map(store.kartlar.map(card => [card.id, []]));
  for (const ip of store.ipler) if (near.has(ip.aId) && near.has(ip.bId)) { near.get(ip.aId).push(ip.bId); near.get(ip.bId).push(ip.aId); }
  const parent = new Map();
  for (const root of [...store.kartlar].sort(age)) {
    if (parent.has(root.id)) continue;
    parent.set(root.id, null); const queue = [root.id];
    for (let i = 0; i < queue.length; i++) for (const next of near.get(queue[i])) if (!parent.has(next)) { parent.set(next, queue[i]); queue.push(next); }
  }
  return parent;
}

/** The side port (-1 left, 1 right) the link `a`-`b` uses at `from`; the same rule as scene.js curveBetween:
 *  cards side by side join facing sides, cards in one column join on the side b leans to. */
export function portSide(from, a, b, width = 158) {
  const dx = b.x - a.x, lean = dx >= 0 ? 1 : -1;
  if (Math.abs(dx) < width * .9) return lean;
  return from === a ? lean : -lean;
}

/** Ids of the cards in the branches leaving `id` through `side`, with all their descendants. */
export function branchCards(store, id, side, width = 158, parent = parents(store)) {
  const byId = new Map(store.kartlar.map(card => [card.id, card])), from = byId.get(id), children = new Map();
  if (!from) return new Set();
  for (const [child, up] of parent) if (up) (children.get(up) || children.set(up, []).get(up)).push(child);
  const sideOf = child => { const ip = store.ipler.find(item => (item.aId === id && item.bId === child) || (item.bId === id && item.aId === child));
    return ip ? portSide(from, byId.get(ip.aId), byId.get(ip.bId), width) : 0; };
  const hidden = new Set(), queue = (children.get(id) || []).filter(child => sideOf(child) === side);
  for (let i = 0; i < queue.length; i++) { if (hidden.has(queue[i])) continue; hidden.add(queue[i]); queue.push(...(children.get(queue[i]) || [])); }
  return hidden;
}

/** All hidden ids for a list of collapsed ports ("id:side"); a collapsed port inside a hidden branch still counts. */
export function hiddenCards(store, collapsed, width = 158) {
  if (!collapsed?.length) return new Set();
  const parent = parents(store), hidden = new Set();
  for (const key of collapsed) { const cut = key.lastIndexOf(':'); for (const id of branchCards(store, key.slice(0, cut), Number(key.slice(cut + 1)), width, parent)) hidden.add(id); }
  return hidden;
}

/** Collapsed ports that hide `id`, so they can be opened when that card is reached another way. */
export function portsHiding(store, collapsed, id, width = 158) {
  const parent = parents(store);
  return (collapsed || []).filter(key => { const cut = key.lastIndexOf(':'); return branchCards(store, key.slice(0, cut), Number(key.slice(cut + 1)), width, parent).has(id); });
}

/** Does this side of the card lead anywhere (so tapping its port can hide something)? */
export const hasBranch = (store, id, side, width = 158) => branchCards(store, id, side, width).size > 0;
