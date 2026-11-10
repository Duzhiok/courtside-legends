/**
 * Legend Duel D3 — 2D takeover court model (pure, no DOM, no RNG).
 *
 * This module is the PRESENTATION state for the 2D half-court: where the two
 * players stand, which zone the ball is in, and what the court suggests.
 * It is deliberately NOT a second sim:
 *
 * - The ONLY outcome path stays DuelSim.playPossession() (js/duel/duelSim.js).
 *   Nothing here rolls dice, computes a make probability, or changes a score.
 * - D3.1 — positions now enter the sim ONLY through the bounded spacing
 *   terms below (spacingForShot): each term |≤0.03|, total |≤0.06|, and the
 *   caller passes them explicitly as playPossession's opts.spacing map.
 *   With no spacing passed, a duel resolves EXACTLY as before D3.1.
 * - The 4 offense buttons map 1:1 onto OFFENSE_CHOICES (drive / midrange /
 *   outside / post) and the 3 defense buttons map 1:1 onto DEFENSE_CHOICES
 *   (balanced / perimeter / paint). No new choice types are introduced; the
 *   court only suggests which existing choice matches the current spot.
 * - The defender's "shadow" is a deterministic function of the ball position
 *   (no randomness, no per-frame state): the defender stands on the segment
 *   ball -> basket, between the ball-handler and the rim.
 * - After a possession resolves, applyPossession() records the shot spot and
 *   the defense stance from the REAL event and resets the live positions for
 *   the next possession. The view animates the ball from the shot spot to the
 *   rim; that flight is cosmetic — the event (made/missed, points) already
 *   happened inside DuelSim.
 *
 * Court space (viewBox 0 0 100 50; y grows away from the basket):
 * - basket at (50, 4); 3-pt arc radius 24 around the basket; paint is the
 *   rect x 38..62, y 0..14; the half-court line is y = 50.
 * - zones: "paint" (inside the paint rect), "outside" (beyond the arc),
 *   "midrange" (inside the arc, outside the paint).
 */
import { OFFENSE_CHOICES, DEFENSE_CHOICES, SPACING_TOTAL_MAX } from "./duelSim.js";
import { clamp } from "../core/seededRandom.js";

/** Court geometry (presentation units; the SVG viewBox is 0 0 100 50). */
export const COURT = Object.freeze({
  W: 100,
  H: 50,
  BASKET: Object.freeze({ x: 50, y: 4 }),
  ARC_R: 24,
  PAINT: Object.freeze({ x0: 38, x1: 62, y0: 0, y1: 14 }),
  /** Ball-handler's start spot: top of the arc, where a possession begins. */
  TOP_OF_ARC: Object.freeze({ x: 50, y: 32 }),
  /** Keyboard / drag step, in court units. */
  MOVE_STEP: 4,
});

/** Bounds a point must stay inside (a small margin from the court edge). */
export const COURT_BOUNDS = Object.freeze({ x0: 4, x1: 96, y0: 3, y1: 48 });

/**
 * Choice labels, shared by the select/duel screens so the court buttons and
 * the old strategy buttons can never drift apart. [zh, en, sub-hint].
 * The lists are exactly OFFENSE_CHOICES / DEFENSE_CHOICES — no extras.
 */
export const OFFENSE_LABEL = Object.freeze({
  drive: ["突破上篮", "Drive", "速度 · 控球 · 终结"],
  midrange: ["中距离单打", "Midrange", "投篮 · 创造空间"],
  outside: ["外线投射", "Outside Shot", "三分 · 抗干扰"],
  post: ["背身强打", "Post Up", "力量 · 低位技术"],
});

export const DEFENSE_LABEL = Object.freeze({
  balanced: ["均衡防守", "Balanced", "全面，无明显弱点"],
  perimeter: ["贴身防投", "Perimeter", "锁三分，放突破"],
  paint: ["收缩防突破", "Protect Paint", "锁内线，放三分"],
});

/** Zone of a court point: "paint" | "midrange" | "outside". */
export function zoneAt(x, y) {
  const { PAINT, BASKET, ARC_R } = COURT;
  if (x >= PAINT.x0 && x <= PAINT.x1 && y >= PAINT.y0 && y <= PAINT.y1) return "paint";
  const dx = x - BASKET.x;
  const dy = y - BASKET.y;
  return Math.hypot(dx, dy) > ARC_R ? "outside" : "midrange";
}

/**
 * Where each offense choice is taken from, for presentation. The spot is
 * where the court shows the shooter standing when the possession resolves —
 * it does not change the shot. drive/post go to the paint, midrange to the
 * elbow, outside beyond the arc.
 */
export const OFFENSE_SPOT = Object.freeze({
  drive: Object.freeze({ x: 50, y: 9 }),
  midrange: Object.freeze({ x: 68, y: 16 }),
  outside: Object.freeze({ x: 50, y: 32 }),
  post: Object.freeze({ x: 58, y: 7 }),
});

/**
 * Where the defender stands for each defense choice, for presentation.
 * perimeter plays up high near the arc, paint drops down low, balanced
 * holds the middle. The stance is shown after the call is made; it does
 * not change the matchup — MATCHUP in duelSim.js already did that.
 */
export const DEFENSE_SPOT = Object.freeze({
  balanced: Object.freeze({ x: 50, y: 20 }),
  perimeter: Object.freeze({ x: 50, y: 30 }),
  paint: Object.freeze({ x: 50, y: 10 }),
});

/**
 * The offense the current spot suggests (a hint only — all four choices
 * stay enabled). Post is never "suggested": it is a strength move, not a
 * spot move, and the player picks it deliberately.
 */
export function suggestedOffense(zone) {
  if (zone === "paint") return "drive";
  if (zone === "outside") return "outside";
  return "midrange";
}

/** The defense the defender's current spot suggests (hint only). */
export function suggestedDefense(zone) {
  if (zone === "paint") return "paint";
  if (zone === "outside") return "perimeter";
  return "balanced";
}

/** D3.1 — bound on a single spatial term. */
export const SPACING_TERM_MAX = 0.03;

/**
 * D3.1 — spatial modifier labels, [zh, en], shared by the court view so the
 * breakdown reads the same everywhere. The four terms:
 * - open: the shooter has separation (defender ≥ 14 units away) — jump shots.
 * - contest: the defender is right on the shooter (< 6 units) — jump shots.
 * - rim: the ball is at the rim (≤ 10 units) — drive / post.
 * - beaten: the defender is not between the shooter and the basket (off to
 *   the side, under the rim, or chasing from behind) — drive / post.
 */
export const SPACING_LABEL = Object.freeze({
  open: ["空位", "Open look"],
  contest: ["贴防", "Tight contest"],
  rim: ["篮下", "At the rim"],
  beaten: ["失位", "Beaten defender"],
});

/** Distance between two court points. */
function courtDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Is the defender beaten — i.e. NOT between the shooter (ball) and the
 * basket? The defender is "set" when they sit on the ball -> basket segment
 * (projection t in [0.1, 0.9]) within 8 units of it; anything else leaves a
 * lane: off to the side (lateral > 8), camped under the rim (t > 0.9), or
 * chasing from behind (t < 0.1 with real separation). A defender standing
 * right on the ball (t ~ 0, distance < 6) is NOT beaten — they are in the
 * shooter's jersey, which the contest term already prices.
 * The automatic shadow (t = 0.45, lateral 0) is always set, so on offense
 * "beaten" only ever fires when the PLAYER mispositions the defender.
 */
export function isDefenderBeaten(ball, defender) {
  const bx = COURT.BASKET.x - ball.x;
  const by = COURT.BASKET.y - ball.y;
  const rimDist = Math.hypot(bx, by) || 1;
  const wx = defender.x - ball.x;
  const wy = defender.y - ball.y;
  const t = (wx * bx + wy * by) / (rimDist * rimDist);
  const lateral = Math.abs(wx * by - wy * bx) / rimDist;
  const defDist = Math.hypot(wx, wy);
  if (lateral > 8) return true;
  if (t > 0.9) return true;
  if (t < 0.1 && defDist >= 6) return true;
  return false;
}

/**
 * D3.1 — the spatial modifiers for one shot, from the LIVE court state at
 * the moment the choice is made. Pure: same takeover + offense in, same
 * terms out. Each term is bounded (|value| ≤ 0.03) and the total is bounded
 * (|total| ≤ 0.06); at most two terms can co-apply (rim + beaten), and
 * open/contest are mutually exclusive. Jump shots read defender distance
 * (separation helps, a tight defender hurts); inside shots read rim
 * distance (get to the basket) and whether the defender holds the lane.
 * Returns { terms: [{ key, value }], total }.
 */
export function spacingForShot(takeover, offense) {
  const ball = takeover.ball;
  const defender = takeover.defender;
  const defDist = courtDist(ball, defender);
  const rimDist = courtDist(ball, COURT.BASKET);
  const terms = [];
  if (offense === "midrange" || offense === "outside") {
    if (defDist >= 14) terms.push({ key: "open", value: 0.03 });
    else if (defDist < 6) terms.push({ key: "contest", value: -0.03 });
  } else {
    if (rimDist <= 10) terms.push({ key: "rim", value: 0.03 });
    if (isDefenderBeaten(ball, defender)) terms.push({ key: "beaten", value: 0.03 });
  }
  const total = clamp(
    terms.reduce((sum, term) => sum + term.value, 0),
    -SPACING_TOTAL_MAX,
    SPACING_TOTAL_MAX,
  );
  return { terms, total };
}

/** D3.1 — the spacing total for every offense choice, from one court state. */
export function spacingByOffense(takeover) {
  const out = {};
  for (const offense of OFFENSE_CHOICES) out[offense] = spacingForShot(takeover, offense).total;
  return out;
}

/**
 * Deterministic defender shadow: the defender stands on the segment from
 * the ball to the basket, 45% of the way toward the rim — between the
 * ball-handler and the basket, never behind. Same ball in, same spot out.
 */
export function shadowDefender(ball) {
  const { BASKET } = COURT;
  const t = 0.45;
  return clampPoint({
    x: ball.x + (BASKET.x - ball.x) * t,
    y: ball.y + (BASKET.y - ball.y) * t,
  });
}

export function clampPoint({ x, y }) {
  return {
    x: clamp(x, COURT_BOUNDS.x0, COURT_BOUNDS.x1),
    y: clamp(y, COURT_BOUNDS.y0, COURT_BOUNDS.y1),
  };
}

/**
 * Fresh takeover state for a duel. `ball` is the ball-handler's spot,
 * `defender` the defender's spot; both are the LIVE positions for the
 * ongoing possession. `lastShot` is the just-resolved possession (null
 * before the first shot) — the view uses it for the ball-flight flash.
 */
export function createTakeover() {
  const ball = { ...COURT.TOP_OF_ARC };
  // A duel opens on the challenger's ball (createDuel: possession "a").
  return { ball, defender: shadowDefender(ball), lastShot: null, myBall: true };
}

/** Start spots for the next possession, given who has the ball. */
export function resetPositions(myBall) {
  const ball = { ...COURT.TOP_OF_ARC };
  return { ball, defender: shadowDefender(ball), myBall };
}

/**
 * Move the controlled player (ball-handler on offense, defender on defense)
 * by dx/dy court units, clamped to the court. Returns a NEW takeover
 * object; the input is not mutated. On offense the shadowing defender
 * follows the ball automatically (deterministic, see shadowDefender).
 */
export function moveControlled(takeover, dx, dy) {
  const next = { ...takeover, lastShot: takeover.lastShot };
  if (takeover.myBall) {
    next.ball = clampPoint({ x: takeover.ball.x + dx, y: takeover.ball.y + dy });
    next.defender = shadowDefender(next.ball);
  } else {
    next.defender = clampPoint({ x: takeover.defender.x + dx, y: takeover.defender.y + dy });
    next.ball = { ...takeover.ball };
  }
  return next;
}

/** Move the controlled player straight to a court point (touch drag). */
export function moveControlledTo(takeover, x, y) {
  return moveControlled(takeover, x - controlledPoint(takeover).x, y - controlledPoint(takeover).y);
}

/** The point the player currently controls (ball-handler or defender). */
export function controlledPoint(takeover) {
  return takeover.myBall ? takeover.ball : takeover.defender;
}

/**
 * Record a resolved possession (a real playPossession event) and reset the
 * live positions for the next possession. `state` is the DuelSim state AFTER
 * the possession (possession already flipped, scores already updated).
 * The shot spot + defense stance come from the event, so the court shows
 * where the shot really came from; the outcome itself is the event's.
 */
export function applyPossession(takeover, state, event) {
  const myBall = state.possession === "a";
  const fresh = resetPositions(myBall);
  return {
    ...fresh,
    myBall,
    lastShot: {
      turn: event.turn,
      shooter: event.shooter,
      offense: event.offense,
      defense: event.defense,
      made: event.made,
      points: event.points,
      spot: { ...OFFENSE_SPOT[event.offense] },
      defenseSpot: { ...DEFENSE_SPOT[event.defense] },
      scoreA: event.scoreA,
      scoreB: event.scoreB,
    },
  };
}

/** Arrow keys / WASD -> a movement delta (court units), or null. */
export function keyToMove(key) {
  const step = COURT.MOVE_STEP;
  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { dx: step, dy: 0 };
    case "ArrowUp":
    case "w":
    case "W":
      return { dx: 0, dy: -step };
    case "ArrowDown":
    case "s":
    case "S":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

/**
 * Number keys -> a DuelSim choice, or null. On your ball 1-4 are the four
 * offense choices; on the legend's ball 1-3 are the three defense choices.
 * The returned value is always a member of OFFENSE_CHOICES / DEFENSE_CHOICES.
 */
export function keyToChoice(key, myBall) {
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1) return null;
  if (myBall) return OFFENSE_CHOICES[n - 1] || null;
  return DEFENSE_CHOICES[n - 1] || null;
}

/** The court's choice buttons, in order — pinned to the DuelSim lists. */
export function courtChoices(myBall) {
  return myBall ? [...OFFENSE_CHOICES] : [...DEFENSE_CHOICES];
}
