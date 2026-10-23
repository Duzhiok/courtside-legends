/**
 * Regression for user report #12: "我设置的球员上场时间当模拟的时候，没有按照我设置的来"
 * (I set a player's target minutes, but the simulation didn't follow it).
 *
 * The target-minutes PACING algorithm inside sim.js was already verified correct in isolation
 * (±3 min of target) in an earlier pass. The actual bug was one layer up, in how js/app.js's
 * openSetup() rebuilt a fresh team for the next game:
 *
 *   1. renderSeasonRotation() (the "默认轮换 · 实验板" screen) mutates
 *      state.season.teams[userTeamId].players[i].targetMinutes DIRECTLY as the user drags a
 *      slider -- there is no separate "draft" state for that screen.
 *   2. That live edit is NOT written into live.rotation (a separate cached snapshot) until the
 *      user clicks the distinct "保存默认轮换" button -- easy to skip, since the screen already
 *      visibly reflects the edit with no apparent need for a second save step.
 *   3. openSetup() clones the live team fresh for the next game (cloneSide() -> clonePlayer() ->
 *      structuredClone(), which DOES correctly carry the live edit) -- but then immediately
 *      overwrote that correct clone with applyRotationPlan(you, live.rotation), i.e. the STALE
 *      snapshot from before the edit. The live edit was silently discarded the moment the next
 *      game's setup screen opened.
 *
 * The fix: re-capture the plan fresh from the live team every time (captureRotationPlan(live,
 * live.starterIds)) instead of trusting the separately-cached live.rotation snapshot. These two
 * tests demonstrate the bug (applying a stale snapshot reverts a live edit) and the fix
 * (re-capturing fresh never can go stale) using the real, exported, pure functions app.js calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { captureRotationPlan, applyRotationPlan } from "../js/engine/gameplan.js";

function player(id, targetMinutes) {
  return { id, pos: "PG", playPos: "PG", roleExpectation: "starter", targetMinutes };
}

test("BUG (documented, now fixed in app.js): applying a snapshot captured BEFORE a live edit silently reverts that edit", () => {
  const live = { players: [player("p1", 20)], starterIds: ["p1"] };
  const staleSnapshot = captureRotationPlan(live, live.starterIds); // "保存默认轮换" was clicked here...

  live.players[0].targetMinutes = 26; // ...then the user drags the slider to 26 WITHOUT saving again.

  // cloneSide() in app.js would correctly carry the live 26 onto a fresh clone for the next game.
  const freshClone = { players: [player("p1", 26)] };

  // The old openSetup() code path: applyRotationPlan(you, live.rotation) using the STALE snapshot.
  applyRotationPlan(freshClone, staleSnapshot);
  assert.equal(
    freshClone.players[0].targetMinutes,
    20,
    "this is the bug: the unsaved 26-minute edit got reverted back to the stale 20",
  );
});

test("FIX: re-capturing the plan fresh from the live team at setup time always reflects the latest edit", () => {
  const live = { players: [player("p1", 20)], starterIds: ["p1"] };
  captureRotationPlan(live, live.starterIds); // an earlier save happens, but is irrelevant now

  live.players[0].targetMinutes = 26; // live edit, unsaved

  const freshClone = { players: [player("p1", 26)] };
  const freshPlan = captureRotationPlan(live, live.starterIds); // what openSetup() does now
  applyRotationPlan(freshClone, freshPlan);

  assert.equal(freshClone.players[0].targetMinutes, 26, "the fresh capture must carry the live edit through");
});

test("a brand new player with no rotation history yet still gets sane defaults from captureRotationPlan", () => {
  const live = { players: [{ id: "new1", pos: "C" }], starterIds: [] };
  const plan = captureRotationPlan(live, live.starterIds);
  const target = plan.players.find((p) => p.id === "new1");
  assert.ok(target.targetMinutes > 0, "must fall back to a role/stamina-based suggestion, not 0 or undefined");
  assert.ok(target.orders, "must backfill default orders for a player who never visited the rotation screen");
});

test("captureRotationPlan + applyRotationPlan round-trips starterIds, tempo, and special tactics too, not just minutes", () => {
  const live = {
    players: [player("p1", 22), player("p2", 18)],
    starterIds: ["p1"],
    gameplan: { offenseFocusId: "p1", tempo: "fast" },
    coach: { specialTactics: ["press"], buffs: { offense: 60, defense: 55, morale: 50, stamina: 50 }, style: "方针" },
  };
  const plan = captureRotationPlan(live, live.starterIds);
  const target = { players: [player("p1", 20), player("p2", 20)] };
  applyRotationPlan(target, plan);
  assert.deepEqual(
    target.players.map((p) => p.targetMinutes),
    [22, 18],
  );
});
