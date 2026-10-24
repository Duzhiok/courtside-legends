import test from "node:test";
import assert from "node:assert/strict";
import {
  createDraftState,
  selectDraftProspect,
  advanceDraftRoundIfNeeded,
  advanceDraftToUserPick,
  buildNaturalPicks,
  applyPickOwnership,
} from "../js/engine/leagueDraft.js";

/**
 * Second-round draft: one draft state, two rounds. Round 2 extends the same
 * state (same year, same ownership map) when round 1 completes: pure
 * worst-first order, no lottery re-draw, and a fresh pool that excludes
 * every round-1 selection.
 */

function mk(id) {
  return {
    id,
    name: id,
    pos: "PG",
    scoring: 70,
    defense: 70,
    pass: 70,
    rebound: 70,
    steal: 70,
    block: 70,
    speed: 70,
    strength: 70,
  };
}

// Records: w worst, then x, y, b best. Standings drive both the round-1
// lottery pool and the round-2 worst-first order.
function season({ userTeamId = "y", picks = null } = {}) {
  const ids = ["w", "x", "y", "b"];
  const wins = { w: 10, x: 30, y: 40, b: 60 };
  const teams = {};
  for (const id of ids) {
    teams[id] = { players: Array.from({ length: 12 }, (_, i) => mk(`${id}${i}`)) };
  }
  return {
    year: 2020,
    userTeamId,
    teams,
    standings: Object.fromEntries(
      ids.map((id) => [id, { w: wins[id], l: 82 - wins[id], pf: 8000, pa: 8000 }]),
    ),
    picks,
  };
}

function driveRound(draft, s) {
  let next = draft;
  const startRound = next.round ?? 1;
  while (next.status === "in_progress" && (next.round ?? 1) === startRound) {
    next = selectDraftProspect(next, s, next.prospects[0].prospectId);
  }
  return next;
}

test("2-round draft: round 1 completes, then extends to round 2 in the same state", () => {
  const s = season();
  const draft = createDraftState({ season: s, seed: "r2-test", rounds: 2 });
  assert.equal(draft.rounds, 2);
  assert.equal(draft.round, 1);
  assert.equal(draft.order.length, 4);

  const afterRound1 = advanceDraftRoundIfNeeded(driveRound(draft, s), s);
  assert.equal(afterRound1.status, "in_progress");
  assert.equal(afterRound1.round, 2);
  assert.equal(afterRound1.order.length, 8);
  assert.equal(afterRound1.currentPick, 4);
  // Same draft object lineage: round-1 selections are kept, not archived.
  assert.equal(afterRound1.selections.length, 4);

  const done = driveRound(afterRound1, s);
  assert.equal(done.status, "complete");
  assert.equal(done.round, 2);
  assert.equal(done.selections.length, 8);
  assert.deepEqual(
    done.selections.map((x) => x.pickNumber),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  // Rookie scale keeps falling with the overall pick number.
  assert.ok(done.selections[4].contract.salary < done.selections[0].contract.salary);
});

test("round-2 order is pure worst-first by source record, no lottery", () => {
  const s = season();
  const draft = createDraftState({ season: s, seed: "r2-test", rounds: 2 });
  const afterRound1 = advanceDraftRoundIfNeeded(driveRound(draft, s), s);
  // Naturals: source order worst-first is w, x, y, b.
  assert.deepEqual(afterRound1.order.slice(4), ["w", "x", "y", "b"]);
});

test("round-2 order follows traded pick ownership", () => {
  const s = season();
  // Worst team w's pick is owned by best team b, and vice versa.
  const picks = applyPickOwnership(buildNaturalPicks(s), { w: "b", b: "w" });
  const draft = createDraftState({ season: s, seed: "r2-test", rounds: 2, picks });
  const afterRound1 = advanceDraftRoundIfNeeded(driveRound(draft, s), s);
  // Sources worst-first: w -> owner b, x -> x, y -> y, b -> owner w.
  assert.deepEqual(afterRound1.order.slice(4), ["b", "x", "y", "w"]);
});

test("round-2 pool excludes every round-1 selection and has enough players", () => {
  const s = season();
  const draft = createDraftState({ season: s, seed: "r2-test", rounds: 2 });
  const afterRound1 = advanceDraftRoundIfNeeded(driveRound(draft, s), s);
  const selectedIds = new Set(afterRound1.selections.map((x) => x.prospectId));
  const selectedBrefs = new Set(afterRound1.selections.map((x) => x.bref));
  assert.ok(afterRound1.prospects.length >= 4);
  for (const p of afterRound1.prospects) {
    assert.equal(selectedIds.has(p.prospectId), false);
    assert.equal(selectedBrefs.has(p.bref), false);
  }
});

test("1-round drafts are untouched by the transition", () => {
  const s = season();
  const draft = createDraftState({ season: s, seed: "r2-test" });
  const done = driveRound(draft, s);
  assert.equal(done.status, "complete");
  assert.equal(done.order.length, 4);
  assert.equal(advanceDraftRoundIfNeeded(done, s), done);
});

test("advanceDraftToUserPick carries a career draft through both rounds", () => {
  const s = season({ userTeamId: "y" });
  let draft = createDraftState({ season: s, seed: "r2-test", rounds: 2 });
  // CPU auto-picks until the user's turn, user picks, repeat to completion.
  let guard = 0;
  while (draft.status === "in_progress" && guard++ < 20) {
    draft = advanceDraftToUserPick(draft, s);
    if (draft.status !== "in_progress") break;
    assert.equal(draft.order[draft.currentPick], "y");
    draft = selectDraftProspect(draft, s, draft.prospects[0].prospectId);
  }
  assert.equal(draft.status, "complete");
  assert.equal(draft.selections.length, 8);
  assert.equal(draft.round, 2);
  // The user picked in both rounds (one natural pick per round).
  assert.equal(draft.selections.filter((x) => x.teamId === "y").length, 2);
});

test("createDraftState rejects rounds outside 1-2", () => {
  const s = season();
  assert.throws(() => createDraftState({ season: s, seed: "r2-test", rounds: 3 }), /rounds/);
});
