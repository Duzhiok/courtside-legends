import test from "node:test";
import assert from "node:assert/strict";
import { groupByPosition, playerSlotPos, resolveStarterPositionCollisions } from "../js/engine/gameplan.js";

/**
 * Extracted from js/app.js alongside the R27 careerBracket work: these three were pure
 * (no DOM, no closures over app state) but had zero tests despite directly affecting
 * lineup correctness -- resolveStarterPositionCollisions in particular is what keeps a
 * starting five from silently fielding two SGs and a hole at PF.
 */
function player(id, pos, playPos = null) {
  return { id, name: id, pos, playPos };
}

test("playerSlotPos: manual playPos wins over the natural position", () => {
  assert.equal(playerSlotPos(player("a", "C", "PF")), "PF");
  assert.equal(playerSlotPos(player("b", "SG")), "SG");
});

test("groupByPosition: buckets five players into their five slots", () => {
  const players = [player("pg", "PG"), player("sg", "SG"), player("sf", "SF"), player("pf", "PF"), player("c", "C")];
  const buckets = groupByPosition(players);
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
    assert.equal(buckets[pos].length, 1, `expected exactly one player in ${pos}`);
    assert.equal(buckets[pos][0].id, pos.toLowerCase());
  }
});

test("groupByPosition: an unrecognizable position string falls back to the SF bucket, not a crash", () => {
  const buckets = groupByPosition([player("mystery", "ZZZ")]);
  assert.equal(buckets.SF.length, 1);
});

test("groupByPosition: null/empty input is a safe no-op", () => {
  const buckets = groupByPosition(null);
  assert.deepEqual(Object.keys(buckets).sort(), ["C", "PF", "PG", "SF", "SG"]);
  for (const pos of Object.keys(buckets)) assert.equal(buckets[pos].length, 0);
});

test("resolveStarterPositionCollisions: moves the duplicate into the one open slot", () => {
  // Two SGs, no PG at all -- the second SG should get bumped to PG, the only gap.
  const picked = [
    player("sg1", "SG", "SG"),
    player("sg2", "SG", "SG"),
    player("sf", "SF", "SF"),
    player("pf", "PF", "PF"),
    player("c", "C", "C"),
  ];
  resolveStarterPositionCollisions(picked);
  const slots = picked.map((p) => p.playPos).sort();
  assert.deepEqual(slots, ["C", "PF", "PG", "SF", "SG"], "every slot should be filled exactly once");
});

test("resolveStarterPositionCollisions: a lineup with no collisions is left untouched", () => {
  const picked = [
    player("pg", "PG", "PG"),
    player("sg", "SG", "SG"),
    player("sf", "SF", "SF"),
    player("pf", "PF", "PF"),
    player("c", "C", "C"),
  ];
  const before = picked.map((p) => p.playPos);
  resolveStarterPositionCollisions(picked);
  assert.deepEqual(picked.map((p) => p.playPos), before);
});

test("resolveStarterPositionCollisions: with no open slot left to move into, the duplicate stays put rather than vanishing", () => {
  // Every slot already has at least one player AND there's a dupe -- nowhere to send it.
  const picked = [
    player("pg", "PG", "PG"),
    player("sg1", "SG", "SG"),
    player("sg2", "SG", "SG"),
    player("sf", "SF", "SF"),
    player("pf", "PF", "PF"),
    player("c", "C", "C"),
  ];
  resolveStarterPositionCollisions(picked);
  // No empty slot existed, so the loop body never runs -- nobody's playPos changes,
  // and crucially nobody gets silently dropped from the roster.
  assert.equal(picked.length, 6);
  assert.equal(picked.filter((p) => p.playPos === "SG").length, 2);
});

test("resolveStarterPositionCollisions: empty or null input is a safe no-op", () => {
  assert.doesNotThrow(() => resolveStarterPositionCollisions([]));
  assert.doesNotThrow(() => resolveStarterPositionCollisions(null));
});
