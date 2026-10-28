import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { buildSamePosMatchups, matchupPosOf } from "../js/engine/matchups.js";
import { GameSim } from "../js/engine/sim.js";

/**
 * 防守托管以前只会挑「盯谁/包不包夹」(managedDefense's scheme+target), 从不重建
 * 「谁防谁」整张对位表 -- 换人时 substitute() 只会把对位表原样 1:1 继承给替补
 * (不管位置合不合理), 托管又从来不纠正它, 于是一次体能换人就能让后卫继承中锋的
 * 防守指派, 对位乱跳。这组测试锁死: 开着防守托管时, 对位表必须随场上人实时
 * 重建成「同位置优先」, 而不是信任任何陈旧的 1:1 继承。
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function buildTeam(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  assert.ok(players.length === 12, `need 12 distinct 2020 cards from offset ${offset}`);
  return {
    name,
    players,
    starterIds: players.slice(0, 5).map((p) => p.id),
  };
}

function freshSim(overrides = {}) {
  return new GameSim({
    home: buildTeam("Home", 0),
    away: buildTeam("Away", 12),
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
    ...overrides,
  });
}

test("setAutoDefense(true): assignments populate immediately, not on the next random tick", () => {
  const sim = freshSim();
  assert.equal(sim.defensePlan?.assignments, undefined);
  sim.setAutoDefense(true);
  const opp = sim.opp();
  assert.ok(sim.defensePlan?.assignments, "assignments built right away on toggle-on");
  for (const op of opp.onCourt) assert.ok(sim.defensePlan.assignments[op.id], `no defender assigned to ${op.name}`);
});

test("refreshDefenseAssignments: every opponent on court gets a defender from the current you.onCourt (position-sane by construction)", () => {
  const sim = freshSim();
  sim.refreshDefenseAssignments();
  const you = sim.you();
  const opp = sim.opp();
  const youIds = new Set(you.onCourt.map((p) => p.id));
  for (const [oppId, defId] of Object.entries(sim.defensePlan.assignments)) {
    assert.ok(opp.onCourt.some((p) => p.id === oppId), "assignment key is an on-court opponent");
    assert.ok(youIds.has(defId), "assigned defender is actually on the floor right now");
  }
});

test("a stale/mismatched assignment left on the table gets corrected the next time autoDefense refreshes, not rubber-stamped forever", () => {
  const sim = freshSim();
  const you = sim.you();
  const opp = sim.opp();
  const oppBig = opp.onCourt.find((p) => ["C", "PF"].includes(matchupPosOf(p)));
  const youGuard = you.onCourt.find((p) => ["PG", "SG"].includes(matchupPosOf(p)));
  assert.ok(oppBig && youGuard, "fixture needs an opposing big and one of our guards to misassign");
  // Plant an obviously wrong table by hand: the opponent's big is "guarded" by one of
  // our guards. This is exactly the shape substitute()'s naive 1:1 carry-over can produce
  // after a fatigue sub brings in whoever's freshest, regardless of position.
  sim.defensePlan = { ...(sim.defensePlan || {}), assignments: { [oppBig.id]: youGuard.id } };
  sim.setAutoDefense(true); // toggling on must rebuild immediately, not trust the planted table
  // The rebuild must exactly match what a from-scratch buildSamePosMatchups() would produce for
  // the current floor -- i.e. autopilot owns the table outright, it doesn't half-trust the old one.
  assert.deepEqual(sim.defensePlan.assignments, buildSamePosMatchups(you.onCourt, opp.onCourt, {}));
  assert.notEqual(sim.defensePlan.assignments[oppBig.id], youGuard.id, "the guard is no longer stuck guarding the opposing big");
});

test("manual mode (autoDefense OFF) keeps the old naive carry-over untouched -- this fix only changes autopilot behavior", () => {
  const sim = freshSim();
  // Never touch autoDefense: it stays false the whole test.
  const you = sim.you();
  const outgoing = you.onCourt[0];
  const incoming = you.bench[0];
  sim.setDefenseScheme("focus", sim.opp().onCourt[0].id);
  const before = { ...(sim.defensePlan?.assignments || {}) };
  sim.substitute(outgoing.id, incoming.id, you.side);
  // Whatever the carry-over did, managedDefense() must never have been called (autoDefense is off),
  // so nothing beyond the substitution's own carry-over should have touched assignments.
  for (const [oppId, defId] of Object.entries(before)) {
    if (defId === outgoing.id) {
      assert.equal(sim.defensePlan.assignments[oppId], incoming.id, "naive carry-over still applies in manual mode");
    } else {
      assert.equal(sim.defensePlan.assignments[oppId], defId, "untouched entries stay untouched");
    }
  }
});

test("toggling autoDefense off then back on refreshes again (not a one-shot)", () => {
  const sim = freshSim();
  sim.setAutoDefense(true);
  const first = { ...sim.defensePlan.assignments };
  // Scramble the floor so a fresh rebuild would differ from the stale table.
  const you = sim.you();
  sim.substitute(you.onCourt[0].id, you.bench[0].id, you.side);
  sim.setAutoDefense(false);
  sim.setAutoDefense(true);
  const second = sim.defensePlan.assignments;
  const youIds = new Set(you.onCourt.map((p) => p.id));
  for (const defId of Object.values(second)) assert.ok(youIds.has(defId), "every defender in the fresh table is on the current floor");
  assert.notDeepEqual(second, first, "re-toggling rebuilt the table for the new floor, not just replayed the old one");
});
