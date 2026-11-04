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

test("B21: zone_drop / switch_all descriptions admit what is not implemented", () => {
  assert.match(TACTICS.zone_drop.desc, /没有对应实现/);
  assert.match(TACTICS.zone_drop.descEn, /not actually implemented/);
  assert.match(TACTICS.switch_all.desc, /没有单独逻辑/);
  assert.match(TACTICS.switch_all.descEn, /no standalone switching logic/);
});

test("B21: round-focus post_up is distinguishable from tactic post_up", () => {
  const focus = FOCUS_PLAYS.find((f) => f.id === "post_up");
  assert.equal(focus.name, "连攻内线");
  assert.notEqual(focus.name, TACTICS.post_up.name);
});

test("B21: numbers untouched (spot check on the edited entries)", () => {
  assert.equal(TACTICS.pnr_spam.offense, 1.07);
  assert.equal(TACTICS.zone_drop.defense, 1.08);
  assert.equal(TACTICS.zone_drop.threeRate, 1.05);
  assert.equal(TACTICS.switch_all.defense, 1.1);
  assert.deepEqual(
    [TACTICS.pack_paint.offense, TACTICS.pack_paint.defense, TACTICS.pack_paint.pace, TACTICS.pack_paint.threeRate],
    [1, 1, 1, 1],
  );
});
