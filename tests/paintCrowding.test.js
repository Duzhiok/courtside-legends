import test from "node:test";
import assert from "node:assert/strict";
import {
  NORMAL_NON_SHOOTING_BIGS,
  PAINT_CROWD_PER_BIG,
  paintCrowdPenalty,
} from "../js/engine/sim.js";

// A normal lineup carries at most two bigs who can't shoot (a center and a power forward) --
// that's the floor the engine assumes a season card's paint% was earned against. Anything beyond
// that is what actually breaks five-out: a packed, helpless paint that sags off every shooter.
function big(id, overrides = {}) {
  return { id, pos: "C", threeTend: 1, three: 20, ...overrides };
}
function wing(id) {
  return { id, pos: "SG", threeTend: 60, three: 75 };
}
function stretchBig(id) {
  // A real stretch four: a PF who can shoot is a spacer, not clogging. Counted by isFloorShooter,
  // not by position alone.
  return { id, pos: "PF", threeTend: 55, three: 72 };
}

test("a normal two-big lineup pays nothing extra", () => {
  const onCourt = [big("c1"), { ...big("pf1"), pos: "PF" }, wing("sg1"), wing("sf1"), wing("pg1")];
  assert.equal(paintCrowdPenalty(onCourt, "paint"), 0);
  assert.equal(paintCrowdPenalty(onCourt, "mid"), 0);
});

test("stacking a third, fourth, fifth non-shooting big escalates the penalty", () => {
  const base = [big("c1"), { ...big("pf1"), pos: "PF" }];
  const extras = [{ ...big("pf2"), pos: "PF" }, { ...big("pf3"), pos: "PF" }, { ...big("c2") }];
  for (let extra = 1; extra <= 3; extra++) {
    const onCourt = [...base, ...extras.slice(0, extra), wing("g1")].slice(0, 5);
    const penalty = paintCrowdPenalty(onCourt, "paint");
    assert.ok(penalty > 0, `${extra} extra big(s) should cost something, got ${penalty}`);
    const expectedExtra = Math.max(0, base.length + extra - NORMAL_NON_SHOOTING_BIGS);
    assert.equal(penalty, expectedExtra * PAINT_CROWD_PER_BIG);
  }
});

test("three threes never pay the paint-crowding penalty -- it's exactly the shot the crowd gives up", () => {
  const fiveCenters = Array.from({ length: 5 }, (_, i) => big(`c${i}`));
  assert.equal(paintCrowdPenalty(fiveCenters, "three"), 0);
});

test("mid-range pays half of what the rim pays, for the same lineup", () => {
  const fiveCenters = Array.from({ length: 5 }, (_, i) => big(`c${i}`));
  const paint = paintCrowdPenalty(fiveCenters, "paint");
  const mid = paintCrowdPenalty(fiveCenters, "mid");
  assert.equal(mid, paint / 2);
});

test("a shooting big (stretch four) does not count as clogging the paint", () => {
  const onCourt = [big("c1"), stretchBig("pf1"), stretchBig("pf2"), wing("sg1"), wing("pg1")];
  // Only one true non-shooting big (the center) -- under the allowed two, so no penalty.
  assert.equal(paintCrowdPenalty(onCourt, "paint"), 0);
});

test("natural position decides, not the lineup slot a big is parked in", () => {
  // A true center stashed at the small-forward slot (playPos) is still a center for this check --
  // teams don't actually get to make a non-shooting big into a spacer by relabeling his slot.
  const stashed = { id: "c1", pos: "C", playPos: "SF", threeTend: 1, three: 20 };
  const onCourt = [stashed, { ...big("pf1"), pos: "PF" }, { ...big("pf2"), pos: "PF" }, { ...big("pf3"), pos: "PF" }, wing("g1")];
  assert.ok(paintCrowdPenalty(onCourt, "paint") > 0);
});

test("an empty or missing lineup is safe", () => {
  assert.equal(paintCrowdPenalty([], "paint"), 0);
  assert.equal(paintCrowdPenalty(null, "paint"), 0);
  assert.equal(paintCrowdPenalty(undefined, "paint"), 0);
});
