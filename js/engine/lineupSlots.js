/**
 * Lineup slots: keep every player on the floor in a slot that suits him.
 *
 * GameSim.substitute() hands the leaver's slot label to whoever checks in. The fatigue / minutes / garbage-time
 * rotations pick that replacement by rest, not by position, so a rested centre could take a point guard's slot
 * (and the guard, coming back later, a centre's). Measured over 100 auto-rotated games: ~42% of substitutions left the
 * newcomer two or more positions from his slot, ~20% three or four (PG<->C).
 *
 * The cure is not to refuse those substitutions (rest still matters) but to re-seat the five afterwards so the
 * TOTAL misfit is smallest. The score is the engine's own `positionFitScore` (what chemistry / lineup fit already
 * use), so "better seated" means exactly "better chemistry", never a second opinion. Pure and deterministic.
 */
import { positionFitScore } from "../data/franchises.js";
import { normalizePos } from "../data/positions.js";

export const SLOT_ORDER = Object.freeze(["PG", "SG", "SF", "PF", "C"]);

/** Steps between two positions on PG-SG-SF-PF-C (0 = same, 4 = PG vs C). */
export function positionGap(a, b) {
  return Math.abs(SLOT_ORDER.indexOf(normalizePos(a)) - SLOT_ORDER.indexOf(normalizePos(b)));
}

/** Comparator: candidates closest (in positions) to the slot `leaver` is giving up come first. */
export const nearestToSlot = (leaver) => (a, b) =>
  positionGap(a.pos, leaver.playPos || leaver.pos) - positionGap(b.pos, leaver.playPos || leaver.pos);

/** Comparator: a candidate within one position of the slot `leaver` gives up beats one two or more steps away; otherwise equal. */
export const compatibleFirst = (leaver) => (a, b) =>
  Number(positionGap(a.pos, leaver.playPos || leaver.pos) >= 2) - Number(positionGap(b.pos, leaver.playPos || leaver.pos) >= 2);

const misfit = (p, slot) => 100 - positionFitScore(normalizePos(p.pos), slot, p);

/** All orderings of `items` (n <= 5 here, so at most 120). */
function* permutations(items) {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

/**
 * Re-seat a five-man lineup in place so the total misfit is the lowest, keeping the current seating on ties.
 * Players the coach placed by hand (`playPosManual`) keep their slot. Returns the players whose slot changed.
 * Anything other than five on the floor (3v3, a short-handed side) is left alone.
 */
export function reseatLineup(onCourt) {
  if (!Array.isArray(onCourt) || onCourt.length !== SLOT_ORDER.length) return [];
  const slotOf = (p) => normalizePos(p.playPos || p.pos);
  const fixed = onCourt.filter((p) => p.playPosManual && p.playPos);
  const free = onCourt.filter((p) => !fixed.includes(p));
  const taken = new Set(fixed.map(slotOf));
  const open = SLOT_ORDER.filter((s) => !taken.has(s));
  if (free.length < 2 || open.length !== free.length) return [];

  const total = (seating) => seating.reduce((n, slot, i) => n + misfit(free[i], slot), 0);
  let best = free.map(slotOf);
  // The current seating is only a valid baseline when it uses each open slot exactly once.
  if (new Set(best).size !== free.length || best.some((s) => !open.includes(s))) best = open;
  let bestCost = total(best);
  for (const seating of permutations(open)) {
    const cost = total(seating);
    if (cost < bestCost) {
      best = seating;
      bestCost = cost;
    }
  }
  const moved = [];
  free.forEach((p, i) => {
    if (p.playPos !== best[i]) {
      p.playPos = best[i];
      moved.push(p);
    }
  });
  return moved;
}
