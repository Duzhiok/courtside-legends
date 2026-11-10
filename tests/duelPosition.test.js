/**
 * Legend Duel D3.1 (position-aware gameplay): spacing terms are small,
 * explainable, and bounded. They enter makeProb ONLY through the explicit
 * `spacing` argument (or playPossession's opts.spacing map) — never
 * implicitly — they scale with stamina, and they can never guarantee a
 * make: the final [0.08, 0.92] clamp is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SPACING_LABEL,
  SPACING_TERM_MAX,
  applyPossession,
  createTakeover,
  moveControlledTo,
  spacingForShot,
  spacingByOffense,
  isDefenderBeaten,
} from "../js/duel/duelTakeover.js";
import {
  createDuel,
  playPossession,
  makeProb,
  OFFENSE_CHOICES,
  SPACING_TOTAL_MAX,
} from "../js/duel/duelSim.js";

const EPS = 1e-9;
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, `${msg} (got ${a}, want ${b})`);

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

function evenDuel(seed = "position-test") {
  return createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty: "pro", seed });
}

/** A takeover state with the ball / defender placed exactly (bypasses the shadow). */
function at(ball, defender) {
  return { ball: { ...ball }, defender: { ...defender }, lastShot: null, myBall: true };
}

test("spacing terms are bounded everywhere: |term| ≤ 0.03, |total| ≤ 0.06", () => {
  const defenderSpots = [
    { x: 50, y: 32 }, { x: 50, y: 10 }, { x: 20, y: 32 },
    { x: 90, y: 44 }, { x: 50, y: 44 }, { x: 38, y: 20 },
  ];
  for (let x = 4; x <= 96; x += 8) {
    for (let y = 3; y <= 48; y += 5) {
      for (const defender of defenderSpots) {
        for (const offense of OFFENSE_CHOICES) {
          const { terms, total } = spacingForShot(at({ x, y }, defender), offense);
          for (const term of terms) {
            assert.ok(Math.abs(term.value) <= SPACING_TERM_MAX + EPS, `${offense} ${term.key} = ${term.value}`);
          }
          assert.ok(Math.abs(total) <= SPACING_TOTAL_MAX + EPS, `${offense} total = ${total} at (${x},${y})`);
          assert.equal(total, terms.reduce((s, t) => s + t.value, 0), "total is the sum of its terms");
        }
      }
    }
  }
});

test("open: separation beyond the arc is an open look for jump shots only", () => {
  const corner = moveControlledTo(createTakeover(), 12, 44);
  const outside = spacingForShot(corner, "outside");
  assert.deepEqual(outside.terms, [{ key: "open", value: 0.03 }]);
  assert.equal(outside.total, 0.03);
  assert.equal(spacingForShot(corner, "midrange").total, 0.03, "open applies to midrange too");
  // A drive from the same corner gets nothing: too far from the rim.
  assert.equal(spacingForShot(corner, "drive").total, 0, "corner drive has no spacing term");
  // From the standard start (top of the arc) there is no open look yet.
  assert.equal(spacingForShot(createTakeover(), "outside").total, 0, "top-of-arc outside is not open");
});

test("contest: a defender on the shooter hurts jump shots, not inside shots", () => {
  const tight = at({ x: 50, y: 10 }, { x: 50, y: 8 });
  assert.deepEqual(spacingForShot(tight, "outside").terms, [{ key: "contest", value: -0.03 }]);
  assert.equal(spacingForShot(tight, "midrange").total, -0.03);
  // The same tight spot is a RIM look for a drive, not a contest.
  assert.deepEqual(spacingForShot(tight, "drive").terms, [{ key: "rim", value: 0.03 }]);
  assert.equal(spacingForShot(tight, "post").total, 0.03);
});

test("rim: getting to the basket helps drive and post", () => {
  const atRim = at({ x: 50, y: 8 }, { x: 50, y: 6 });
  assert.equal(spacingForShot(atRim, "drive").total, 0.03);
  assert.equal(spacingForShot(atRim, "post").total, 0.03);
  const far = at({ x: 50, y: 32 }, { x: 50, y: 20 });
  assert.equal(spacingForShot(far, "drive").total, 0, "no rim bonus from the top of the arc");
  // The rim line is 10 units: 10 counts, 11 does not.
  assert.equal(spacingForShot(at({ x: 50, y: 14 }, { x: 50, y: 12 }), "drive").total, 0.03);
  assert.equal(spacingForShot(at({ x: 50, y: 15 }, { x: 50, y: 13 }), "drive").total, 0);
});

test("beaten: a defender off the lane concedes the drive; a set one does not", () => {
  const ball = { x: 50, y: 32 };
  // Off to the side — the lane is open.
  assert.equal(isDefenderBeaten(ball, { x: 20, y: 32 }), true);
  assert.equal(spacingForShot(at(ball, { x: 20, y: 32 }), "drive").total, 0.03);
  // Chasing from behind — beaten too.
  assert.equal(isDefenderBeaten(ball, { x: 50, y: 44 }), true);
  // Dropped into the paint, between ball and basket — set, no bonus.
  assert.equal(isDefenderBeaten(ball, { x: 50, y: 10 }), false);
  assert.equal(spacingForShot(at(ball, { x: 50, y: 10 }), "drive").total, 0);
  // Standing right on the ball — in the shooter's jersey, not beaten.
  assert.equal(isDefenderBeaten(ball, { x: 50, y: 32 }), false);
  // The automatic shadow is always set, so offense can never beat itself.
  const t = createTakeover();
  assert.equal(isDefenderBeaten(t.ball, t.defender), false);
  // Beaten never applies to jump shots — only to drive / post.
  assert.equal(spacingForShot(at(ball, { x: 20, y: 32 }), "outside").total, 0.03, "that is the open term, not beaten");
  assert.deepEqual(spacingForShot(at(ball, { x: 20, y: 32 }), "outside").terms, [{ key: "open", value: 0.03 }]);
});

test("spacingByOffense returns one total per offense choice", () => {
  const map = spacingByOffense(moveControlledTo(createTakeover(), 12, 44));
  assert.deepEqual(Object.keys(map).sort(), [...OFFENSE_CHOICES].sort());
  assert.equal(map.outside, 0.03);
  assert.equal(map.midrange, 0.03);
  assert.equal(map.drive, 0);
  assert.equal(map.post, 0);
  for (const value of Object.values(map)) {
    assert.ok(Math.abs(value) <= SPACING_TOTAL_MAX + EPS);
  }
});

test("makeProb: spacing adds inside the stamina scaling — tired legs gain less", () => {
  const state = evenDuel();
  const a = state.a.duelist;
  const b = state.b.duelist;
  const plain = (stamina) => makeProb(a, b, "outside", "balanced", { stamina });
  const spaced = (stamina) => makeProb(a, b, "outside", "balanced", { stamina, spacing: 0.03 });
  // Fresh legs: the full +0.03.
  approx(spaced(100) - plain(100), 0.03, "fresh-legs spacing gain");
  // Exhausted: the same +0.03 is worth only ×0.82 — fatigue dulls positioning.
  approx(spaced(0) - plain(0), 0.03 * 0.82, "exhausted spacing gain");
  assert.ok(spaced(0) - plain(0) < spaced(100) - plain(100), "tired players gain less from openness");
  // No spacing passed: exactly the pre-D3.1 value.
  assert.equal(plain(100), makeProb(a, b, "outside", "balanced", { stamina: 100 }));
});

test("makeProb: an out-of-range spacing argument is clamped to ±0.06", () => {
  const state = evenDuel();
  const a = state.a.duelist;
  const b = state.b.duelist;
  const args = { stamina: 100 };
  assert.equal(
    makeProb(a, b, "drive", "balanced", { ...args, spacing: 0.5 }),
    makeProb(a, b, "drive", "balanced", { ...args, spacing: 0.06 }),
  );
  assert.equal(
    makeProb(a, b, "drive", "balanced", { ...args, spacing: -0.5 }),
    makeProb(a, b, "drive", "balanced", { ...args, spacing: -0.06 }),
  );
});

test("makeProb: the final clamp holds and no spacing can guarantee a make", () => {
  const weak = duelist({ shooting: 30, finishing: 30, handles: 30, strength: 30 });
  const wall = duelist({ defense: 99, strength: 99, skills: ["lockdown", "rim_protector"] });
  const star = duelist({ shooting: 99, finishing: 99, handles: 99, skills: ["rainmaker"] });
  for (const offense of OFFENSE_CHOICES) {
    for (const defense of ["balanced", "perimeter", "paint"]) {
      for (const spacing of [-0.06, 0, 0.06]) {
        const p = makeProb(weak, wall, offense, defense, { spacing, stamina: 0 });
        assert.ok(p >= 0.08 && p <= 0.92, `${offense}/${defense} spacing ${spacing}: ${p}`);
        const q = makeProb(star, weak, offense, defense, { spacing, stamina: 100, shooterIsLegend: true, difficulty: "legend" });
        assert.ok(q >= 0.08 && q <= 0.92, `star ${offense}/${defense} spacing ${spacing}: ${q}`);
        assert.ok(q < 0.93, "even the best spacing cannot guarantee a make");
      }
    }
  }
});

test("playPossession applies the spacing map for the resolved offense only", () => {
  const map = { drive: 0, midrange: 0, outside: 0.03, post: 0 };
  const withMap = createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty: "pro", seed: "spacing-map" });
  const event = playPossession(withMap, { offense: "outside" }, { spacing: map });
  assert.equal(event.offense, "outside");
  assert.equal(event.spacing, 0.03);
  // event.prob is rounded to 3 decimals, so compare within rounding.
  assert.ok(
    Math.abs(event.prob - makeProb(withMap.a.duelist, withMap.b.duelist, "outside", event.defense, { stamina: 100, spacing: 0.03 })) < 0.001,
    "event prob includes the spacing term",
  );
  // Same seed, no map: the CPU picks the same defense and the prob is the
  // no-spacing value — the map is the only difference.
  const plain = createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty: "pro", seed: "spacing-map" });
  const event2 = playPossession(plain, { offense: "outside" });
  assert.equal(event2.defense, event.defense, "same seed picks the same defense");
  assert.equal(event2.spacing, 0);
  assert.ok(Math.abs(event.prob - event2.prob - 0.03) < 0.0015, "the map moved the prob by +0.03 (within rounding)");
});

test("a full duel with a spacing map still finishes like a normal duel", () => {
  const state = createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty: "pro", seed: "spacing-duel" });
  let t = createTakeover();
  while (!state.over && state.turn < 200) {
    const myBall = state.possession === "a";
    // Position like a player would: corner for outside, rim for drive.
    if (myBall) t = moveControlledTo(t, 12, 44);
    else t = moveControlledTo(t, 50, 32);
    const choice = myBall ? { offense: "outside" } : { defense: "balanced" };
    const event = playPossession(state, choice, { spacing: spacingByOffense(t) });
    assert.ok(typeof event.spacing === "number" && Math.abs(event.spacing) <= SPACING_TOTAL_MAX + EPS);
    // Next possession starts from the top of the arc, exactly like the view.
    t = applyPossession(t, state, event);
  }
  assert.ok(state.over, "the duel finished");
  assert.ok(state.winner === "a" || state.winner === "b", "there is a winner");
  assert.ok(state.log.every((e) => typeof e.spacing === "number"), "every event carries its spacing");
});

test("every spacing term has a zh/en label pair", () => {
  for (const [key, label] of Object.entries(SPACING_LABEL)) {
    assert.equal(label.length, 2, `${key} label pair`);
    assert.ok(label[0].length >= 1 && label[1].length >= 1, `${key} labels non-empty`);
    assert.notEqual(label[0], label[1], `${key} zh/en differ`);
  }
  assert.deepEqual(Object.keys(SPACING_LABEL).sort(), ["beaten", "contest", "open", "rim"]);
});
