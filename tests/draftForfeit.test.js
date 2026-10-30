// R89 draft forfeit: give up a pick instead of being forced to waive a player.
import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDraftToUserPick,
  createDraftState,
  forfeitDraftPick,
  selectDraftProspect,
} from "../js/engine/leagueDraft.js";
import { forfeitCareerDraftPick } from "../js/modes/leagueCareer.js";

function card(bref, season, overrides = {}) {
  return {
    id: `${bref}-${season}`, bref, season, name: bref, pos: "SG", age: 21,
    scoring: 70, three: 68, mid: 69, paint: 65, defense: 66, rebound: 55, pass: 62,
    speed: 72, strength: 58, stamina: 71, iq: 64, clutch: 63, steal: 65, block: 45,
    ...overrides,
  };
}

const fixturePlayers = [
  card("alpha", 2021), card("beta", 2021), card("gamma", 2021), card("delta", 2021),
];

function roster(prefix, count) {
  return Array.from({ length: count }, (_, i) => card(`${prefix}${i}`, 2020, { name: `${prefix}${i}` }));
}

function seasonFixture(userCount = 12) {
  return {
    year: 2024,
    userTeamId: "USER",
    league: { teamIds: ["USER", "CPU"] },
    teams: {
      USER: { id: "USER", name: "USER", players: roster("u", userCount) },
      CPU: { id: "CPU", name: "CPU", players: roster("c", 12) },
    },
    standings: {
      USER: { w: 20, l: 62, pf: 8000, pa: 8100 },
      CPU: { w: 50, l: 32, pf: 8500, pa: 8000 },
    },
    freeAgents: [],
  };
}

function userDraft(season, picks, rounds = 1) {
  return createDraftState({ season, seed: "forfeit-test", players: fixturePlayers, picks, rounds });
}

const userPicks = [
  { sourceTeamId: "USER", ownerTeamId: "USER" },
  { sourceTeamId: "CPU", ownerTeamId: "USER" },
];

test("forfeit consumes the slot, takes no prospect and touches no roster", () => {
  const season = seasonFixture(12);
  const draft = userDraft(season, userPicks);
  assert.deepEqual(draft.order, ["USER", "USER"]);
  const prospectsBefore = draft.prospects.length;
  const next = forfeitDraftPick(draft, season);
  assert.equal(next.selections.length, 1);
  assert.equal(next.selections[0].forfeited, true);
  assert.equal(next.selections[0].teamId, "USER");
  assert.equal(next.currentPick, 1);
  assert.equal(next.status, "in_progress");
  assert.equal(next.prospects.length, prospectsBefore);
  assert.equal(season.teams.USER.players.length, 12);
  // The next user pick still works normally after a forfeit.
  const picked = selectDraftProspect(next, season, next.prospects[0].prospectId);
  assert.equal(picked.selections.length, 2);
  assert.equal(season.teams.USER.players.length, 13);
});

test("forfeit works on a full 15-man roster without naming anyone to waive", () => {
  const season = seasonFixture(15);
  const draft = userDraft(season, userPicks);
  const next = forfeitDraftPick(draft, season);
  assert.equal(next.selections[0].forfeited, true);
  assert.equal(season.teams.USER.players.length, 15);
  assert.deepEqual(season.freeAgents, []);
});

test("forfeit on a CPU turn throws, and forfeiting the last pick completes the draft", () => {
  const season = seasonFixture(12);
  const cpuFirst = userDraft(season, userPicks);
  cpuFirst.order = ["CPU", "USER"];
  assert.throws(() => forfeitDraftPick(cpuFirst, season), /only the user team/);
  const single = userDraft(season, [{ sourceTeamId: "USER", ownerTeamId: "USER" }]);
  assert.deepEqual(single.order, ["USER"]);
  const done = forfeitDraftPick(single, season);
  assert.equal(done.status, "complete");
  assert.equal(done.selections[0].forfeited, true);
});

test("career wrapper forfeits on the user's turn and advances the draft", () => {
  const season = seasonFixture(12);
  const draft = userDraft(season, userPicks);
  const career = { careerId: "c1", season, management: { draft }, history: [] };
  const next = forfeitCareerDraftPick(career);
  assert.equal(next.management.draft.selections[0].forfeited, true);
  assert.equal(next.management.draft.currentPick, 1);
  assert.equal(next.season.teams.USER.players.length, 12);
  // Advancing still lands on the user's next pick (no CPU auto-pick consumed it).
  assert.equal(next.management.draft.order[next.management.draft.currentPick], "USER");
  assert.equal(advanceDraftToUserPick(next.management.draft, next.season).currentPick, 1);
});
