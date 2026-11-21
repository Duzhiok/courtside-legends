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
 *
 * ONE seating for everyone. Setup auto-fill, the CPU fives and the substitution re-seat used to be three different greedy loops
 * ("best player picks first, the last player takes whatever hole is left"), which is how a 194 cm guard (James Harden: strength 36,
 * rebounding 26) ended up at centre. Now every path asks `seatPlayers`, which tries every legal arrangement and keeps the cheapest.
 * When the five really have no big man, the cost makes the player with the best INSIDE game (size, strength, boards, paint, rim)
 * take the big slot, and the best OUTSIDE game (passing, shooting, speed) the guard slots, instead of whoever was seated last.
 */
import { positionFitScore } from "../data/franchises.js";
import { normalizePos } from "../data/positions.js";
import { clamp } from "../core/seededRandom.js";

export const SLOT_ORDER = Object.freeze(["PG", "SG", "SF", "PF", "C"]);

/** How much of a slot's job is inside (0 = PG, 1 = C). */
const BIGNESS = Object.freeze({ PG: 0, SG: 0.25, SF: 0.5, PF: 0.75, C: 1 });

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

/** 0-100: how much of an inside presence he is (size, strength, rebounding, finishing in the paint, rim protection). */
export function insideRating(p) {
  const height = clamp((((p.heightCm || 195) - 183) / (216 - 183)) * 100, 0, 100);
  return 0.3 * height + 0.2 * (p.strength || 50) + 0.2 * (p.rebound || 50) + 0.15 * (p.paint || 50) + 0.15 * (p.block || 40);
}

/** 0-100: how much of a perimeter player he is (passing, three-point and mid-range shooting, speed). */
export function outsideRating(p) {
  return 0.3 * (p.pass || 50) + 0.3 * (p.three || 50) + 0.2 * (p.speed || 50) + 0.2 * (p.mid || 50);
}

// Tall enough for a big slot. The engine's fit score gates PF/SF/SG -> C on strength, but strength on these cards sits at 35-58
// for nearly everyone (Giannis 41, Carmelo 46), so a 7-foot forward at centre scores the same 38 as a 6'3" guard. Height is what
// real positions follow, so a player this tall is not treated as unfit for the slot.
const MIN_HEIGHT_FOR_SLOT = Object.freeze({ PF: 201, C: 206 });
const TALL_ENOUGH_FIT = 72;

function slotFit(p, slot) {
  const fit = positionFitScore(normalizePos(p.pos), slot, p);
  const need = MIN_HEIGHT_FOR_SLOT[slot];
  return need && (p.heightCm || 0) >= need ? Math.max(fit, TALL_ENOUGH_FIT) : fit;
}

/**
 * What it costs to play `p` in `slot`: his position misfit (the engine's own fit score, natural position first) plus a smaller
 * term for how badly his game suits the slot (inside game for the big slots, outside game for the guard slots). The second term
 * is what decides who plays out of position when somebody has to, because every guard at centre shares the same position-fit floor.
 *
 * The misfit is SQUARED. With a plain sum, one disaster (a 6'4" guard at centre, misfit 68) is cheaper than three small shifts
 * (22 + 22 + 45), so the optimum happily wrecked one player to keep the others perfect. Squared, a big misfit costs far more than
 * several small ones, so a player only plays far out of position when every other arrangement is worse.
 */
export function slotCost(p, slot) {
  const big = BIGNESS[slot] ?? 0.5;
  const suit = big * insideRating(p) + (1 - big) * outsideRating(p);
  const misfit = 100 - slotFit(p, slot) + 0.25 * (100 - suit);
  return (misfit * misfit) / 100;
}

/** Cheapest way to give each of `players` a different one of `openSlots`. Ties keep the first arrangement found (stable). */
function cheapestSeating(players, openSlots, baseline = null) {
  const cost = (slots) => slots.reduce((n, slot, i) => n + slotCost(players[i], slot), 0);
  let best = baseline;
  let bestCost = baseline ? cost(baseline) : Infinity;
  const taken = new Set();
  const pick = [];
  (function place(i, running) {
    if (running >= bestCost) return; // can only get worse
    if (i === players.length) {
      best = [...pick];
      bestCost = running;
      return;
    }
    for (const slot of openSlots) {
      if (taken.has(slot)) continue;
      taken.add(slot);
      pick[i] = slot;
      place(i + 1, running + slotCost(players[i], slot));
      taken.delete(slot);
    }
  })(0, 0);
  return best;
}

/**
 * The best slot for every player, in the order given. Anyone the coach placed by hand (`playPosManual` with a `playPos`) keeps that
 * slot (the first of two who ask for the same one); everybody else is seated so the total cost is lowest. `keepCurrent` makes the
 * seating they already have win a tie, `reserved` slots belong to players not in this list. Pure: nothing is mutated. At most five.
 */
export function seatPlayers(players, { keepCurrent = false, reserved = [] } = {}) {
  const list = (players || []).slice(0, SLOT_ORDER.length);
  const slots = new Array(list.length).fill(null);
  const taken = new Set(reserved.map(normalizePos)); // slots somebody else already holds
  list.forEach((p, i) => {
    if (!(p.playPosManual && p.playPos)) return;
    const slot = normalizePos(p.playPos);
    if (taken.has(slot)) return;
    taken.add(slot);
    slots[i] = slot;
  });
  const free = list.map((p, i) => i).filter((i) => slots[i] === null);
  if (!free.length) return slots;
  const open = SLOT_ORDER.filter((s) => !taken.has(s));
  const people = free.map((i) => list[i]);
  const current = people.map((p) => normalizePos(p.playPos || p.pos));
  // The seating they already have is only a valid baseline when it uses each open slot exactly once.
  const baseline = keepCurrent && new Set(current).size === current.length && current.every((s) => open.includes(s)) ? current : null;
  const seated = cheapestSeating(people, open, baseline);
  free.forEach((i, k) => { slots[i] = seated[k]; });
  return slots;
}

/**
 * Re-seat a five-man lineup in place so the total misfit is the lowest, keeping the current seating on ties.
 * Players the coach placed by hand (`playPosManual`) keep their slot. Returns the players whose slot changed.
 * Anything other than five on the floor (3v3, a short-handed side) is left alone.
 */
export function reseatLineup(onCourt) {
  if (!Array.isArray(onCourt) || onCourt.length !== SLOT_ORDER.length) return [];
  const free = onCourt.filter((p) => !(p.playPosManual && p.playPos));
  if (free.length < 2) return [];
  const slots = seatPlayers(onCourt, { keepCurrent: true });
  const moved = [];
  onCourt.forEach((p, i) => {
    if (p.playPos !== slots[i]) {
      p.playPos = slots[i];
      moved.push(p);
    }
  });
  return moved;
}

/**
 * Which five to START when nobody has chosen yet. "Top five by rating" put five centres in one lineup (two of them seated at PG and
 * SG) with guards sitting on the bench. Every five among the best `pool` is scored as its total rating minus what seating it costs
 * (the same `slotCost` the seating uses), so a lineup only plays men far out of position when no better-balanced five is close in
 * rating. With no guards to choose from, it is simply the best five. `keep` are players already chosen (the coach's own picks when
 * one of his five is hurt): they stay and only the empty places are filled. Pure; ties keep the higher-rated players.
 */
export function bestStarters(players, rate, { pool = 9, keep = [] } = {}) {
  const kept = keep.slice(0, SLOT_ORDER.length);
  const need = SLOT_ORDER.length - kept.length;
  const top = (players || []).filter((p) => !kept.includes(p)).sort((a, b) => rate(b) - rate(a)).slice(0, Math.max(pool - kept.length, need));
  if (top.length <= need) return [...kept, ...top];
  let best = null;
  let bestScore = -Infinity;
  const pick = [];
  (function choose(from) {
    if (pick.length === need) {
      const five = [...kept, ...pick.map((i) => top[i])];
      const seats = seatPlayers(five);
      const score = five.reduce((n, p, k) => n + rate(p) - slotCost(p, seats[k]), 0);
      if (score > bestScore) { bestScore = score; best = five; }
      return;
    }
    for (let i = from; i <= top.length - (need - pick.length); i++) {
      pick.push(i);
      choose(i + 1);
      pick.pop();
    }
  })(0);
  return best;
}

/**
 * The five on the pre-game screen. The coach's last five (`starterIds`) stay the five, with the slots he gave them, while all of them
 * can still play. If some are hurt or gone the others stay and only the empty places are filled; with no history it is the balanced
 * first pick. `fresh` says the seating was not his, so the caller should seat them. Pure.
 */
export function setupStarters(starterIds, available, rate) {
  const kept = (available || []).filter((p) => (starterIds || []).includes(p.id)).slice(0, SLOT_ORDER.length);
  if (kept.length === SLOT_ORDER.length) return { five: kept, fresh: false };
  return { five: bestStarters(available, rate, { keep: kept }), fresh: true };
}

/**
 * The five checked on the pre-game screen for a saved rotation. A starter who is not in `available`
 * (hurt, or gone) is left unchecked; the others stay and only the empty places are filled. The saved
 * plan is not rewritten here — confirming the screen is what stores the five the coach actually sees.
 */
export function screenFiveFromPlan(starterIds, available, rate) {
  const { five, fresh } = setupStarters(starterIds, available, rate);
  return { five: five || [], fresh: !!fresh };
}
