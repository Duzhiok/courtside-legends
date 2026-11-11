/**
 * My Home layout (Home 2.0, H1/H2). Pure rules + one save. Ownership stays in the shop
 * (`account.shop.owned`); this file only decides WHERE an owned piece stands.
 *
 *   account.homeLayout = { v: 1, items: { [furnitureId]: { x, y, rot } | { slot } } }
 *
 * Rules (all enforced here, never in the UI):
 * - Only furniture the account owns is ever placed; stale ids in a save are dropped.
 * - Floor pieces live on a HOME_GRID x HOME_GRID floor, `rot` (0|1) swaps their footprint.
 *   Solid pieces never overlap each other or the reserved avatar podium; the rug is flat
 *   and may sit under anything.
 * - Wall pieces (poster, hoop) hang in WALL_SLOTS, one piece per slot.
 * - A piece the saved layout does not mention (just bought, or its saved spot is no longer
 *   valid) is auto-placed in the first free spot — so a purchase shows up immediately.
 * - Decoration is cosmetic: nothing here touches a player rating or a match.
 */
import { saveAccount } from "./account.js";

export const HOME_GRID = 6;

/** Wall hooks. `u` / `w` are in floor-tile units along the wall (left wall: along y, right wall: along x). */
export const WALL_SLOTS = Object.freeze({
  L1: Object.freeze({ side: "left", u: 4.8, w: 1.1 }),
  R1: Object.freeze({ side: "right", u: 3.6, w: 1.1 }),
  R2: Object.freeze({ side: "right", u: 4.9, w: 1.1 }),
});
const SLOT_ORDER = ["L1", "R1", "R2"];

/** The avatar podium owns this floor cell (front-left corner). */
export const RESERVED_CELLS = Object.freeze([[0, 5]]);

/** Footprint (unrotated) of every placeable furniture id. `flat` pieces never block anything. */
const PIECES = Object.freeze({
  rug: { kind: "floor", w: 3, d: 2, flat: true },
  "trophy-cabinet": { kind: "floor", w: 1, d: 1 },
  bookshelf: { kind: "floor", w: 2, d: 1 },
  sofa: { kind: "floor", w: 2, d: 1 },
  "floor-lamp": { kind: "floor", w: 1, d: 1 },
  "display-stand": { kind: "floor", w: 1, d: 1 },
  "star-poster": { kind: "wall" },
  hoop: { kind: "wall" },
});
const AUTO_ORDER = Object.keys(PIECES);
/** Where a freshly bought piece goes first: a sensible lived-in layout. [x, y, rot]; anything that no longer fits falls back to the scan. */
const DEFAULT_SPOT = Object.freeze({
  rug: [2, 2, 0],
  "trophy-cabinet": [0, 0, 0],
  bookshelf: [1, 0, 0],
  sofa: [3, 0, 0],
  "floor-lamp": [5, 0, 0],
  "display-stand": [0, 2, 0],
});

export const placementKind = (id) => PIECES[id]?.kind || null;
export const isFlat = (id) => !!PIECES[id]?.flat;

/** Footprint with rotation applied. */
export function footprint(id, rot = 0) {
  const p = PIECES[id];
  if (!p || p.kind !== "floor") return null;
  return rot === 1 ? { w: p.d, d: p.w } : { w: p.w, d: p.d };
}

const cellKey = (x, y) => `${x},${y}`;
const reservedKeys = new Set(RESERVED_CELLS.map(([x, y]) => cellKey(x, y)));

function cellsOf(id, x, y, rot) {
  const f = footprint(id, rot);
  const out = [];
  for (let i = 0; i < f.w; i++) for (let j = 0; j < f.d; j++) out.push([x + i, y + j]);
  return out;
}

const inBounds = (cells) => cells.every(([x, y]) => x >= 0 && y >= 0 && x < HOME_GRID && y < HOME_GRID);

/** Stored layout, normalized. Unknown shapes become an empty layout. */
export function getHomeLayout(account) {
  const raw = account?.homeLayout;
  const items = raw && typeof raw === "object" && raw.items && typeof raw.items === "object" ? raw.items : {};
  const clean = {};
  for (const id of Object.keys(items)) {
    if (!Object.hasOwn(PIECES, id)) continue;
    const it = items[id];
    if (!it || typeof it !== "object") continue;
    if (PIECES[id].kind === "wall") {
      if (typeof it.slot === "string" && Object.hasOwn(WALL_SLOTS, it.slot)) clean[id] = { slot: it.slot };
    } else if (Number.isInteger(it.x) && Number.isInteger(it.y)) {
      clean[id] = { x: it.x, y: it.y, rot: it.rot === 1 ? 1 : 0 };
    }
  }
  return { v: 1, items: clean };
}

/** Candidate floor cells, wall-hugging first (back corner outwards), so auto-placement looks arranged. */
const SCAN = (() => {
  const cells = [];
  for (let x = 0; x < HOME_GRID; x++) for (let y = 0; y < HOME_GRID; y++) cells.push([x, y]);
  return cells.sort((a, b) => Math.min(a[0], a[1]) - Math.min(b[0], b[1]) || a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
})();

/**
 * The full set of placed pieces for the owned furniture: saved spots where still valid, the
 * rest auto-placed. Returns [{ id, kind, x, y, rot, w, d } | { id, kind, slot }], rug first.
 */
export function resolveHome(ownedIds, layout) {
  const owned = AUTO_ORDER.filter((id) => (ownedIds || []).includes(id));
  const saved = layout?.items || {};
  const blocked = new Set(reservedKeys);
  const slots = new Set();
  const placed = new Map();

  const tryFloor = (id, x, y, rot) => {
    const cells = cellsOf(id, x, y, rot);
    if (!inBounds(cells)) return false;
    if (!isFlat(id) && cells.some(([cx, cy]) => blocked.has(cellKey(cx, cy)))) return false;
    if (!isFlat(id)) cells.forEach(([cx, cy]) => blocked.add(cellKey(cx, cy)));
    const f = footprint(id, rot);
    placed.set(id, { id, kind: "floor", x, y, rot, w: f.w, d: f.d });
    return true;
  };
  const trySlot = (id, slot) => {
    if (!Object.hasOwn(WALL_SLOTS, slot) || slots.has(slot)) return false;
    slots.add(slot);
    placed.set(id, { id, kind: "wall", slot });
    return true;
  };

  for (const id of owned) {
    const s = saved[id];
    if (!s) continue;
    if (PIECES[id].kind === "wall") trySlot(id, s.slot);
    else tryFloor(id, s.x, s.y, s.rot);
  }
  for (const id of owned) {
    if (placed.has(id)) continue;
    if (PIECES[id].kind === "wall") {
      SLOT_ORDER.some((slot) => trySlot(id, slot));
    } else {
      const d = DEFAULT_SPOT[id];
      if (!(d && tryFloor(id, d[0], d[1], d[2]))) SCAN.some(([x, y]) => tryFloor(id, x, y, 0));
    }
  }
  return owned.filter((id) => placed.has(id)).map((id) => placed.get(id));
}

/** Layout object that pins exactly where `placed` stands (so later purchases cannot reshuffle it). */
export function layoutOf(placed) {
  const items = {};
  for (const p of placed) items[p.id] = p.kind === "wall" ? { slot: p.slot } : { x: p.x, y: p.y, rot: p.rot };
  return { v: 1, items };
}

/**
 * Move one owned piece. target = { x, y } for a floor piece, { slot } for a wall piece.
 * Returns { ok: true, layout } or { ok: false, reason }.
 */
export function movePiece(ownedIds, layout, id, target) {
  if (!(ownedIds || []).includes(id)) return { ok: false, reason: "not-owned" };
  const kind = placementKind(id);
  if (!kind) return { ok: false, reason: "unknown" };
  const placed = resolveHome(ownedIds, layout);
  const rest = placed.filter((p) => p.id !== id);
  const current = placed.find((p) => p.id === id);
  const others = layoutOf(rest);
  if (kind === "wall") {
    if (!target || !Object.hasOwn(WALL_SLOTS, target.slot)) return { ok: false, reason: "wrong-spot" };
    if (rest.some((p) => p.slot === target.slot)) return { ok: false, reason: "occupied" };
    others.items[id] = { slot: target.slot };
    return { ok: true, layout: others };
  }
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return { ok: false, reason: "wrong-spot" };
  const rot = current?.kind === "floor" ? current.rot : 0;
  return placeFloor(rest, others, id, target.x, target.y, rot);
}

function placeFloor(rest, others, id, x, y, rot) {
  const cells = cellsOf(id, x, y, rot);
  if (!inBounds(cells)) return { ok: false, reason: "out-of-room" };
  if (!isFlat(id)) {
    const taken = new Set(reservedKeys);
    for (const p of rest) if (p.kind === "floor" && !isFlat(p.id)) cellsOf(p.id, p.x, p.y, p.rot).forEach(([cx, cy]) => taken.add(cellKey(cx, cy)));
    if (cells.some(([cx, cy]) => taken.has(cellKey(cx, cy)))) return { ok: false, reason: "occupied" };
  }
  others.items[id] = { x, y, rot };
  return { ok: true, layout: others };
}

/** Rotate a floor piece in place (swaps its footprint); refused when the rotated piece would not fit. */
export function rotatePiece(ownedIds, layout, id) {
  if (!(ownedIds || []).includes(id)) return { ok: false, reason: "not-owned" };
  if (placementKind(id) !== "floor") return { ok: false, reason: "wall-piece" };
  const placed = resolveHome(ownedIds, layout);
  const current = placed.find((p) => p.id === id);
  if (!current) return { ok: false, reason: "unknown" };
  const rest = placed.filter((p) => p.id !== id);
  return placeFloor(rest, layoutOf(rest), id, current.x, current.y, current.rot === 1 ? 0 : 1);
}

/** Persist a layout on the account. Returns false when there is no account to save to (a guest). */
export function saveHomeLayout(account, layout) {
  if (!account?.id) return false;
  account.homeLayout = getHomeLayout({ homeLayout: layout });
  saveAccount(account);
  return true;
}

/** Forget the saved arrangement: owned pieces fall back to the automatic one. */
export function resetHomeLayout(account) {
  if (!account?.id) return false;
  delete account.homeLayout;
  saveAccount(account);
  return true;
}
