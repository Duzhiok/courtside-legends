import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPickOwnership,
  buildNaturalPicks,
  createDraftState,
  generateDraftOrder,
  picksOwnedBy,
  swapDraftPicks,
} from "../js/engine/leagueDraft.js";
import { beginCareerDraft, createLeagueCareer, makeCareerDraftPick } from "../js/modes/leagueCareer.js";

function seasonFixture() {
  const ids = ["A", "B", "C", "D"];
  return {
    phase: "done",
    year: 2024,
    userTeamId: "B",
    league: { teamIds: ids },
    teams: Object.fromEntries(ids.map((id) => [id, { id, name: id, players: [] }])),
    standings: Object.fromEntries(
      ids.map((id, index) => [id, { w: 20 + index, l: 62 - index, pf: 8000, pa: 8100 }]),
    ),
  };
}

function careerFixture(seasonOverrides = {}) {
  return createLeagueCareer({
    kind: "franchise",
    season: { ...seasonFixture(), ...seasonOverrides },
    careerId: "test-career",
  });
}

test("default draft order is one slot per team", () => {
  const order = generateDraftOrder(seasonFixture(), { seed: "s1" });
  assert.equal(order.length, 4);
  assert.deepEqual([...order].sort(), ["A", "B", "C", "D"]);
});

test("a team owning two picks appears twice in the order", () => {
  const season = seasonFixture();
  const picks = [...buildNaturalPicks(season), { sourceTeamId: "B", ownerTeamId: "B" }];
  const order = generateDraftOrder(season, { seed: "s1", picks });
  assert.equal(order.length, 5);
  assert.equal(order.filter((id) => id === "B").length, 2);
  const draft = createDraftState({ season, seed: "s1", picks });
  assert.equal(draft.order.length, 5);
  assert.equal(draft.picks.length, 5);
});

test("pick ownership moves a slot from its source team to the new owner", () => {
  const season = seasonFixture();
  const picks = applyPickOwnership(buildNaturalPicks(season), { A: "B" });
  const order = generateDraftOrder(season, { seed: "s1", picks });
  assert.equal(order.filter((id) => id === "B").length, 2);
  assert.equal(order.filter((id) => id === "A").length, 0);
  assert.deepEqual(picksOwnedBy({ ...season, pickOwnership: { 2024: { A: "B" } } }, 2024, "B").sort(), ["A", "B"]);
});

test("swapDraftPicks swaps natural picks, refuses downgrades and re-trades", () => {
  const season = seasonFixture();
  // B (2nd-worst record) swaps with C (3rd): C receives the better pick -> accepts.
  const ok = swapDraftPicks(season, { year: 2024, cpuTeamId: "C" });
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual(season.pickOwnership[2024], { B: "C", C: "B" });
  // Re-trading an already-traded pick is refused in v1.
  const again = swapDraftPicks(season, { year: 2024, cpuTeamId: "D" });
  assert.equal(again.ok, false);
  // Downgrade refusal: B's pick is worse than A's, so A rejects.
  const fresh = seasonFixture();
  const bad = swapDraftPicks(fresh, { year: 2024, cpuTeamId: "A" });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /价值不够/);
  assert.equal(swapDraftPicks(fresh, { year: 2024, cpuTeamId: "B" }).ok, false);
  assert.equal(swapDraftPicks(fresh, { year: 2024, cpuTeamId: "ZZ" }).ok, false);
});

test("beginCareerDraft honors traded pick ownership", () => {
  const career = careerFixture({ pickOwnership: { 2024: { A: "B" } } });
  const started = beginCareerDraft(career);
  const order = started.management.draft.order;
  assert.equal(order.filter((id) => id === "B").length, 2);
  assert.equal(order.filter((id) => id === "A").length, 0);
});

test("two user picks in a row both land on the user team", () => {
  const started = beginCareerDraft(careerFixture());
  const draft = started.management.draft;
  draft.order = ["B", "B", "C", "D"];
  draft.currentPick = 0;
  const first = makeCareerDraftPick(started, draft.prospects[0].prospectId);
  const draftAfterFirst = first.management.draft;
  assert.equal(draftAfterFirst.selections.filter((s) => s.teamId === "B").length, 1);
  assert.equal(draftAfterFirst.currentPick, 1);
  const second = makeCareerDraftPick(first, draftAfterFirst.prospects[0].prospectId);
  const draftAfterSecond = second.management.draft;
  assert.equal(draftAfterSecond.selections.filter((s) => s.teamId === "B").length, 2);
  // Career drafts are two rounds now: the mutated round-1 order finishes,
  // round 2 extends from the season pick list, and user picks continue
  // until the whole draft (both rounds) is complete.
  let done = second;
  while (done.management.draft.status === "in_progress") {
    done = makeCareerDraftPick(done, done.management.draft.prospects[0].prospectId);
  }
  assert.equal(done.management.draft.status, "complete");
});
