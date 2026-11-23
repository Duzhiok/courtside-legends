import test from "node:test";
import assert from "node:assert/strict";
import { TACTICS, TACTIC_GROUPS, tacticGroupName } from "../js/data/coaches.js";
import { FOCUS_PLAYS } from "../js/engine/gameplan.js";

/**
 * B21 (L2, names/descriptions/grouping only, no numbers): every tactic
 * carries a display group from TACTIC_GROUPS; pnr_spam is renamed;
 * zone_drop / switch_all descriptions state their actual effects instead
 * of the unimplemented ones; the round-focus post_up no longer shares a
 * display name with the tactic post_up.
 */
const IDS = Object.keys(TACTICS);

test("B21: every tactic has a known group, and every group is used", () => {
  assert.equal(IDS.length, 24);
  const known = new Set(TACTIC_GROUPS.map((g) => g.id));
  for (const id of IDS) assert.ok(known.has(TACTICS[id].group), `${id} group ${TACTICS[id].group}`);
  for (const g of TACTIC_GROUPS) {
    assert.ok(IDS.some((id) => TACTICS[id].group === g.id), `group ${g.id} is empty`);
    assert.ok(g.name && g.nameEn, `group ${g.id} needs zh + en labels`);
  }
});

test("B21: audit group placements (stance / rebounding)", () => {
  assert.equal(TACTICS.pack_paint.group, "stance");
  assert.equal(TACTICS.crash_boards.group, "rebounding");
  assert.equal(TACTICS.second_chance.group, "rebounding");
  assert.equal(tacticGroupName("rebounding", "zh"), "篮板策略");
  assert.equal(tacticGroupName("rebounding", "en"), "Rebounding");
});

test("B21: pnr_spam renamed to 高频挡拆 / High-Frequency PnR", () => {
  assert.equal(TACTICS.pnr_spam.name, "高频挡拆");
  assert.equal(TACTICS.pnr_spam.nameEn, "High-Frequency PnR");
});

test("B25: zone_drop / switch_all descriptions state what the engine now does (they used to admit it did nothing)", () => {
  for (const t of [TACTICS.zone_drop, TACTICS.switch_all]) {
    assert.doesNotMatch(t.desc, /没有对应实现|没有单独逻辑/);
    assert.doesNotMatch(t.descEn, /not actually implemented|no standalone switching logic/);
  }
  assert.match(TACTICS.zone_drop.desc, /篮下/); assert.match(TACTICS.zone_drop.desc, /中距离/);
  assert.match(TACTICS.zone_drop.descEn, /rim/); assert.match(TACTICS.zone_drop.descEn, /pull-up/);
  assert.match(TACTICS.switch_all.desc, /错配/); assert.match(TACTICS.switch_all.descEn, /mismatch/);
});

test("B21: round-focus post_up is distinguishable from tactic post_up", () => {
  const focus = FOCUS_PLAYS.find((f) => f.id === "post_up");
  assert.equal(focus.name, "连攻内线");
  assert.notEqual(focus.name, TACTICS.post_up.name);
});

test("B21: numbers untouched (spot check on the edited entries)", () => {
  assert.equal(TACTICS.pnr_spam.offense, 1.07);
  // 1.08 -> 1.04 on purpose (B25): zone_drop now also protects the rim and concedes the pull-up on a pick and roll, so the blanket bump is lowered to
  // keep the league-average points allowed where they were (scripts/measure/defense-tactic-vs-action.mjs, natural orders: 106.6 before, 106.7 after).
  assert.equal(TACTICS.zone_drop.defense, 1.04);
  assert.equal(TACTICS.zone_drop.threeRate, 1.05);
  assert.equal(TACTICS.switch_all.defense, 1.1);
  assert.deepEqual(
    [TACTICS.pack_paint.offense, TACTICS.pack_paint.defense, TACTICS.pack_paint.pace, TACTICS.pack_paint.threeRate],
    [1, 1, 1, 1],
  );
});
