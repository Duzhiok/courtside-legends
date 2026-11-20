/**
 * Name-plate legibility (S4), pure maths: who gets a full plate, how big it is on screen, and which plates must give way.
 *
 * court3d projects every figure's plate to screen pixels, hands the boxes here, and applies the answer (hide / nudge up).
 * Nothing here knows about THREE; it is plain numbers, so the overlap rules are unit-tested.
 */

export const PLATE_WORLD = Object.freeze({
  full: Object.freeze({ w: 3.4, h: 0.85 }), // the ball handler / the shooter: always readable
  compact: Object.freeze({ w: 1.7, h: 0.425 }), // everyone else: a short surname, out of the way
});

/** A plate smaller than this on screen cannot be read (a phone shows the whole court in 390 px), so it is enlarged up to MAX_BOOST. */
export const PLATE_MIN_PX = Object.freeze({ full: 34, compact: 17 });
export const PLATE_MAX_BOOST = 5;
/** Still shorter than this after the boost (a player at the far end of a portrait court): not a name, a speck. It is hidden instead. */
export const PLATE_LEGIBLE_PX = 11;
/** How much to enlarge a plate that would be `heightPx` tall so it reaches `minPx` (never shrinks, never beyond `maxBoost`). */
export const readableBoost = (heightPx, minPx, maxBoost = PLATE_MAX_BOOST) => (heightPx > 0 ? Math.min(maxBoost, Math.max(1, minPx / heightPx)) : 1);

/** Size in screen pixels of something `worldW x worldH` metres big, `dist` metres from a camera with vertical fov `fovDeg`. */
export function plateScreenSize(worldW, worldH, dist, fovDeg, viewH) {
  const pxPerMetre = viewH / (2 * Math.tan((fovDeg * Math.PI) / 360) * Math.max(0.1, dist));
  return { w: worldW * pxPerMetre, h: worldH * pxPerMetre, pxPerMetre };
}

/** Higher = keeps its plate when plates collide. The focus (ball handler or shooter) is never hidden or moved. */
export function platePriority({ isFocus = false, isOffense = false, distToFocus = Infinity } = {}) {
  if (isFocus) return 100;
  return (isOffense ? 20 : 10) - Math.min(9, distToFocus / 3); // teammates/opponents nearest the action beat far-away ones
}

const overlaps = (a, b, gap) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

/**
 * Greedy, highest priority first. A plate that collides jumps to just above the plate blocking it (up to `maxShifts` times, so a
 * pile stacks neatly); if it still collides it is hidden. The focus plate is placed first and never moves or hides.
 * @param items [{ id, x, y, w, h, priority }]  screen-space boxes, centre x/y
 * @returns Map<id, { visible: boolean, dy: number }>  dy in pixels (negative = up)
 */
export function placeLabels(items, { maxShifts = 2, gap = 3 } = {}) {
  const order = [...items].sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id)));
  const placed = [];
  const out = new Map();
  for (const item of order) {
    if (item.priority >= 100) { // the ball handler / shooter: always shown exactly where he is
      placed.push(item);
      out.set(item.id, { visible: true, dy: 0 });
      continue;
    }
    let y = item.y;
    let result = { visible: false, dy: 0 };
    for (let shifts = 0; ; shifts++) {
      const box = { ...item, y };
      const blocker = placed.find((p) => overlaps(box, p, gap));
      if (!blocker) {
        placed.push(box);
        result = { visible: true, dy: y === item.y ? 0 : y - item.y };
        break;
      }
      if (shifts >= maxShifts) break;
      y = blocker.y - blocker.h / 2 - gap - item.h / 2; // straight above the plate in the way
    }
    out.set(item.id, result);
  }
  return out;
}

/** "Ibaka" -> "Ibaka"; long names are cut so a compact plate stays compact. */
export const compactName = (name, max = 7) => {
  const s = String(name || "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}.` : s;
};
