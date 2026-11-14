// v4.1 P0: one resolver every entry point (manual + simulated, regular season + playoffs) reads from, so an
// applied matchup plan is never silently ignored by the sim buttons, and never leaks onto the wrong opponent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveGameplan, matchupPlanFor } from "../js/engine/effectiveGameplan.js";
import { applyCounterPlan, clearMatchupPlan, matchupRotation } from "../js/myteam/applyPlan.js";
import { captureRotationPlan } from "../js/engine/gameplan.js";

const mkPlayer = (id, min = 20) => ({ id, name: id, pos: "SF", targetMinutes: min, injuredGames: 0 });

function team(ids) {
  return { players: ids.map((id) => mkPlayer(id)), starterIds: ids.slice(0, 5), coach: { specialTactics: ["balanced"] } };
}

test("no matchup plan, no saved default -> engine default, nothing to apply", () => {
  const t = { players: [], starterIds: [] };
  const r = resolveEffectiveGameplan(t, { opponentId: "LAL" });
  assert.equal(r.source, "engine");
  assert.equal(r.plan, null);
});

test("no matchup plan, a saved default -> the default, re-captured live (not a stale snapshot)", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const t = team(ids);
  t.players.find((p) => p.id === "a").targetMinutes = 40; // edited live, never saved into a snapshot
  const r = resolveEffectiveGameplan(t, { opponentId: "LAL" });
  assert.equal(r.source, "default");
  assert.deepEqual(r.plan.starterIds, ids.slice(0, 5));
  assert.equal(r.plan.players.find((p) => p.id === "a").targetMinutes, 40, "live edit, not a stale rotation snapshot");
});

test("applying a plan for GSW does not affect what the team plays with against LAL", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const t = team(ids);
  const plan = { id: "contain", ids: ["g", "b", "c", "d", "e"], tacticId: "lockdown" };
  assert.ok(applyCounterPlan(t, plan, "GSW"));
  const vsGsw = resolveEffectiveGameplan(t, { opponentId: "GSW" });
  assert.equal(vsGsw.source, "matchup");
  assert.deepEqual(vsGsw.plan.starterIds, plan.ids);
  const vsLal = resolveEffectiveGameplan(t, { opponentId: "LAL" });
  assert.equal(vsLal.source, "default", "a plan built to stop GSW never leaks onto a game against LAL");
  assert.deepEqual(vsLal.plan.starterIds, ids.slice(0, 5));
  // Saved default fields themselves were never touched -- only the opponent-bound plan was written.
  assert.deepEqual(t.starterIds, ids.slice(0, 5));
  assert.equal(t.coach.specialTactics[0], "balanced");
});

test("apply refuses: missing opponentId, wrong five count, unknown player id", () => {
  const t = team(["a", "b", "c", "d", "e", "f"]);
  const plan = { ids: ["a", "b", "c", "d", "e"], tacticId: "x" };
  assert.equal(applyCounterPlan(t, plan), false, "no opponentId");
  assert.equal(applyCounterPlan(t, { ...plan, ids: plan.ids.slice(0, 4) }, "GSW"), false, "not five");
  assert.equal(applyCounterPlan(t, { ...plan, ids: ["ghost", ...plan.ids.slice(1)] }, "GSW"), false, "unknown id");
  assert.equal(t.matchupPlan, undefined);
});

test("clearMatchupPlan ('keep current') drops the opponent-bound plan; the saved default resumes", () => {
  const t = team(["a", "b", "c", "d", "e", "f"]);
  applyCounterPlan(t, { ids: ["f", "b", "c", "d", "e"], tacticId: "lockdown" }, "GSW");
  assert.equal(resolveEffectiveGameplan(t, { opponentId: "GSW" }).source, "matchup");
  assert.ok(clearMatchupPlan(t));
  assert.equal(clearMatchupPlan(t), false, "nothing left to clear");
  assert.equal(resolveEffectiveGameplan(t, { opponentId: "GSW" }).source, "default");
});

test("matchupPlanFor only matches its own opponent", () => {
  const t = team(["a", "b", "c", "d", "e", "f"]);
  applyCounterPlan(t, { ids: ["f", "b", "c", "d", "e"], tacticId: "x" }, "GSW");
  assert.ok(matchupPlanFor(t, "GSW"));
  assert.equal(matchupPlanFor(t, "LAL"), null);
  assert.equal(matchupPlanFor(t, null), null);
});

test("matchupRotation nudges minutes toward the plan's five without erasing the roster", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const t = team(ids);
  t.players.forEach((p) => (p.targetMinutes = 20));
  const plan = { ids: ["f", "b", "c", "d", "e"], tacticId: "lockdown" };
  const rot = matchupRotation(t, plan);
  assert.equal(rot.players.length, ids.length, "full roster kept");
  assert.ok(rot.players.find((p) => p.id === "f").targetMinutes >= 28, "plan starter gets real minutes");
  assert.ok(rot.players.find((p) => p.id === "a").targetMinutes <= 24, "bumped starter is benched down");
  assert.equal(rot.specialTactics[0], "lockdown");
});

test("captureRotationPlan sanity: effectiveGameplan's fallback shape matches what applyRotationPlan expects", () => {
  const t = team(["a", "b", "c", "d", "e"]);
  const plan = captureRotationPlan(t, t.starterIds);
  assert.deepEqual(plan.starterIds, t.starterIds);
  assert.equal(plan.players.length, 5);
});
