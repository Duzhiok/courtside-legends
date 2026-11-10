/**
 * Legend Duel D3 (2D takeover): the court model is pure + deterministic.
 * Pins: court geometry, zone classification, clamped movement, the
 * deterministic defender shadow, spot -> choice suggestions, the shot-spot
 * and stance maps, possession application, keyboard mapping, and — the
 * load-bearing one — that moving on the court NEVER changes DuelSim odds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  COURT,
  COURT_BOUNDS,
  OFFENSE_LABEL,
  DEFENSE_LABEL,
  OFFENSE_SPOT,
  DEFENSE_SPOT,
  SPACING_LABEL,
  zoneAt,
  suggestedOffense,
  suggestedDefense,
  spacingForShot,
  spacingByOffense,
  shadowDefender,
  clampPoint,
  createTakeover,
  resetPositions,
  moveControlled,
  moveControlledTo,
  controlledPoint,
  applyPossession,
  keyToMove,
  keyToChoice,
  courtChoices,
} from "../js/duel/duelTakeover.js";
import {
  createDuel,
  playPossession,
  makeProb,
  OFFENSE_CHOICES,
  DEFENSE_CHOICES,
} from "../js/duel/duelSim.js";

function duelist(overrides = {}) {
  return {
    id: "test-1",
    name: "测试球员",
    bref: "testpl01",
    season: 2020,
    pos: "SG",
    ovr: 80,
    shooting: 80,
    finishing: 80,
    handles: 80,
    defense: 80,
    strength: 80,
    speed: 80,
    stamina: 50,
    skills: [],
    ...overrides,
  };
}

function evenDuel(seed = "takeover-test") {
  return createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty: "pro", seed });
}

test("court geometry: basket inside, arc beyond the paint, sane bounds", () => {
  assert.ok(COURT.BASKET.x > 0 && COURT.BASKET.x < COURT.W);
  assert.ok(COURT.BASKET.y >= 0 && COURT.BASKET.y < COURT.H);
  assert.ok(COURT.ARC_R > COURT.PAINT.y1, "the arc reaches past the free-throw line");
  assert.ok(COURT.PAINT.x0 < COURT.PAINT.x1 && COURT.PAINT.y0 < COURT.PAINT.y1);
  assert.ok(COURT_BOUNDS.x0 < COURT_BOUNDS.x1 && COURT_BOUNDS.y0 < COURT_BOUNDS.y1);
  assert.ok(COURT.TOP_OF_ARC.y > COURT.PAINT.y1, "a possession starts beyond the paint");
});

test("zoneAt classifies paint / midrange / outside", () => {
  assert.equal(zoneAt(50, 7), "paint");
  assert.equal(zoneAt(40, 13), "paint");
  assert.equal(zoneAt(50, 20), "midrange");
  assert.equal(zoneAt(68, 16), "midrange");
  assert.equal(zoneAt(50, 32), "outside");
  assert.equal(zoneAt(90, 45), "outside");
  // On the arc (distance exactly 24) is still midrange, not outside.
  assert.equal(zoneAt(50, 28), "midrange");
});

test("createTakeover starts the ball at the top of the arc, defender shadowing", () => {
  const t = createTakeover();
  assert.deepEqual(t.ball, COURT.TOP_OF_ARC);
  assert.equal(t.myBall, true, "a duel opens on the challenger's ball");
  assert.equal(t.lastShot, null);
  assert.ok(t.defender.y < t.ball.y, "the defender stands between the ball and the basket");
  assert.ok(t.defender.y > COURT.BASKET.y, "the defender never crosses the rim");
});

test("moveControlled moves the right side and clamps to the court", () => {
  const t = createTakeover();
  const moved = moveControlled(t, 10, 0);
  assert.equal(moved.ball.x, t.ball.x + 10);
  // The shadow follows the ball: (60,32) -> 45% toward the basket (50,4)
  // is (55.5, 19.4), not the old defender spot.
  assert.equal(moved.defender.x, 55.5, "the shadow follows the ball toward the basket");
  assert.equal(moved.defender.y, t.defender.y, "the shadow's depth follows the ball's depth");
  assert.notEqual(moved, t, "movement returns a new object");
  assert.deepEqual(t.ball, COURT.TOP_OF_ARC, "the input is not mutated");

  const far = moveControlled(t, 1000, -1000);
  assert.equal(far.ball.x, COURT_BOUNDS.x1);
  assert.equal(far.ball.y, COURT_BOUNDS.y0);

  // On the legend's ball the controlled player is the defender.
  const def = { ...t, myBall: false };
  const movedDef = moveControlled(def, -6, 4);
  assert.equal(movedDef.defender.x, def.defender.x - 6);
  assert.equal(movedDef.defender.y, def.defender.y + 4);
  assert.deepEqual(movedDef.ball, def.ball, "the ball-handler does not move on defense");
});

test("moveControlledTo jumps the controlled player to a point, clamped", () => {
  const t = createTakeover();
  const to = moveControlledTo(t, 20, 40);
  assert.deepEqual(to.ball, { x: 20, y: 40 });
  const outside = moveControlledTo(t, -50, 999);
  assert.deepEqual(outside.ball, { x: COURT_BOUNDS.x0, y: COURT_BOUNDS.y1 });
});

test("controlledPoint is the ball-handler on offense, the defender on defense", () => {
  const t = createTakeover();
  assert.deepEqual(controlledPoint(t), t.ball);
  assert.deepEqual(controlledPoint({ ...t, myBall: false }), t.defender);
});

test("shadowDefender is deterministic and stays on the ball -> basket segment", () => {
  const ball = { x: 20, y: 40 };
  const a = shadowDefender(ball);
  const b = shadowDefender(ball);
  assert.deepEqual(a, b, "same ball in, same spot out — no randomness");
  // On the segment: the defender is between the ball and the basket.
  assert.ok(a.x > ball.x && a.x < COURT.BASKET.x, "shadow x sits between ball and basket");
  assert.ok(a.y < ball.y && a.y > COURT.BASKET.y, "shadow y sits between ball and basket");
  assert.ok(a.x >= COURT_BOUNDS.x0 && a.x <= COURT_BOUNDS.x1);
  assert.ok(a.y >= COURT_BOUNDS.y0 && a.y <= COURT_BOUNDS.y1);
});

test("clampPoint keeps any point inside the court", () => {
  assert.deepEqual(clampPoint({ x: -5, y: 100 }), { x: COURT_BOUNDS.x0, y: COURT_BOUNDS.y1 });
  assert.deepEqual(clampPoint({ x: 50, y: 25 }), { x: 50, y: 25 });
});

test("suggestedOffense / suggestedDefense follow the zone (hint only)", () => {
  assert.equal(suggestedOffense("paint"), "drive");
  assert.equal(suggestedOffense("midrange"), "midrange");
  assert.equal(suggestedOffense("outside"), "outside");
  assert.equal(suggestedDefense("paint"), "paint");
  assert.equal(suggestedDefense("midrange"), "balanced");
  assert.equal(suggestedDefense("outside"), "perimeter");
});

test("every offense choice has a shot spot in its own zone", () => {
  assert.equal(zoneAt(OFFENSE_SPOT.drive.x, OFFENSE_SPOT.drive.y), "paint");
  assert.equal(zoneAt(OFFENSE_SPOT.midrange.x, OFFENSE_SPOT.midrange.y), "midrange");
  assert.equal(zoneAt(OFFENSE_SPOT.outside.x, OFFENSE_SPOT.outside.y), "outside");
  assert.equal(zoneAt(OFFENSE_SPOT.post.x, OFFENSE_SPOT.post.y), "paint");
});

test("defense stances are distinct spots; perimeter is highest, paint lowest", () => {
  const spots = Object.values(DEFENSE_SPOT);
  const keys = new Set(spots.map((s) => `${s.x},${s.y}`));
  assert.equal(keys.size, 3, "each defense has its own stance");
  assert.ok(DEFENSE_SPOT.perimeter.y > DEFENSE_SPOT.balanced.y);
  assert.ok(DEFENSE_SPOT.balanced.y > DEFENSE_SPOT.paint.y);
});

test("applyPossession records the real event and resets for the next possession", () => {
  const state = evenDuel();
  const before = createTakeover();
  const event = playPossession(state, { offense: "outside" });
  const after = applyPossession(before, state, event);
  assert.equal(after.lastShot.shooter, "a");
  assert.equal(after.lastShot.offense, "outside");
  assert.equal(after.lastShot.made, event.made);
  assert.equal(after.lastShot.points, event.points);
  assert.deepEqual(after.lastShot.spot, OFFENSE_SPOT.outside);
  assert.deepEqual(after.lastShot.defenseSpot, DEFENSE_SPOT[event.defense]);
  assert.equal(after.lastShot.scoreA, event.scoreA);
  assert.equal(after.myBall, false, "possession flipped to the legend");
  assert.deepEqual(after.ball, COURT.TOP_OF_ARC, "the next possession starts at the top of the arc");
  assert.equal(before.lastShot, null, "the input is not mutated");
});

test("applyPossession on the legend's ball records the legend's shot", () => {
  const state = evenDuel();
  playPossession(state, { offense: "drive" }); // challenger shoots, ball flips
  const event = playPossession(state, { defense: "balanced" });
  const after = applyPossession(createTakeover(), state, event);
  assert.equal(after.lastShot.shooter, "b");
  assert.equal(after.myBall, true, "possession is back with the challenger");
});

test("resetPositions always opens at the top of the arc with a shadow", () => {
  const r = resetPositions(true);
  assert.deepEqual(r.ball, COURT.TOP_OF_ARC);
  assert.ok(r.defender.y < r.ball.y);
  assert.equal(r.myBall, true);
});

test("the court's choice lists are exactly the DuelSim lists — no new choices", () => {
  assert.deepEqual(courtChoices(true), OFFENSE_CHOICES);
  assert.deepEqual(courtChoices(false), DEFENSE_CHOICES);
  assert.deepEqual(Object.keys(OFFENSE_LABEL).sort(), [...OFFENSE_CHOICES].sort());
  assert.deepEqual(Object.keys(DEFENSE_LABEL).sort(), [...DEFENSE_CHOICES].sort());
});

test("keyToMove maps arrows and WASD, nothing else", () => {
  assert.deepEqual(keyToMove("ArrowLeft"), { dx: -4, dy: 0 });
  assert.deepEqual(keyToMove("ArrowRight"), { dx: 4, dy: 0 });
  assert.deepEqual(keyToMove("ArrowUp"), { dx: 0, dy: -4 });
  assert.deepEqual(keyToMove("ArrowDown"), { dx: 0, dy: 4 });
  assert.deepEqual(keyToMove("a"), { dx: -4, dy: 0 });
  assert.deepEqual(keyToMove("d"), { dx: 4, dy: 0 });
  assert.deepEqual(keyToMove("w"), { dx: 0, dy: -4 });
  assert.deepEqual(keyToMove("s"), { dx: 0, dy: 4 });
  assert.equal(keyToMove("Enter"), null);
  assert.equal(keyToMove("1"), null);
  assert.equal(keyToMove(" "), null);
});

test("keyToChoice maps 1-4 to offense on my ball, 1-3 to defense on the legend's", () => {
  assert.equal(keyToChoice("1", true), "drive");
  assert.equal(keyToChoice("2", true), "midrange");
  assert.equal(keyToChoice("3", true), "outside");
  assert.equal(keyToChoice("4", true), "post");
  assert.equal(keyToChoice("5", true), null);
  assert.equal(keyToChoice("1", false), "balanced");
  assert.equal(keyToChoice("2", false), "perimeter");
  assert.equal(keyToChoice("3", false), "paint");
  assert.equal(keyToChoice("4", false), null, "there is no fourth defense choice");
  assert.equal(keyToChoice("0", true), null);
  assert.equal(keyToChoice("x", true), null);
});

test("D3.1: movement changes odds ONLY through the defined spacing terms", () => {
  const state = evenDuel();
  const a = state.a.duelist;
  const b = state.b.duelist;
  const before = makeProb(a, b, "drive", "balanced", { stamina: state.a.stamina });
  // Dribble all over the court: with no spacing passed, the odds are still
  // identical — positions never enter the sim implicitly.
  let t = createTakeover();
  t = moveControlled(t, 30, 10);
  t = moveControlled(t, -40, -5);
  t = moveControlledTo(t, 90, 45);
  const after = makeProb(a, b, "drive", "balanced", { stamina: state.a.stamina });
  assert.equal(after, before, "no spacing passed — the odds are identical");
  // But the same positions DO produce spacing terms, and passing them moves
  // the odds by exactly the defined total — and only that. A drive from the
  // far corner has no spacing term (too far from the rim, defender set).
  const map = spacingByOffense(t);
  assert.equal(map.drive, 0, "corner drive has no spacing term");
  const spaced = makeProb(a, b, "drive", "balanced", { stamina: state.a.stamina, spacing: map.drive });
  assert.equal(spaced, before, "zero spacing — same odds");
  // An open corner three is +0.03, and makeProb moves by exactly that.
  const open = spacingForShot(moveControlledTo(createTakeover(), 12, 44), "outside");
  assert.equal(open.total, 0.03, "corner outside is an open look");
  const plain = makeProb(a, b, "outside", "balanced", { stamina: state.a.stamina });
  const boosted = makeProb(a, b, "outside", "balanced", { stamina: state.a.stamina, spacing: open.total });
  assert.ok(Math.abs(boosted - plain - 0.03) < 1e-9, `open look adds exactly +0.03 (got ${boosted - plain})`);
  // And the possession still resolves through the one real path.
  const event = playPossession(state, { offense: "drive" }, { spacing: map });
  assert.equal(event.offense, "drive");
  assert.equal(event.turn, 1);
  assert.equal(event.spacing, map.drive);
});
