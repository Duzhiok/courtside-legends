import test from "node:test";
import assert from "node:assert/strict";
import { seasonTeamIds } from "../js/engine/season.js";
import { allLeagueTeamIds } from "../js/data/league.js";

test("seasonTeamIds is exported and uses the save's league when it has one", () => {
  assert.deepEqual(seasonTeamIds({}), allLeagueTeamIds());
  assert.deepEqual(seasonTeamIds({ league: { teamIds: ["BOS", "LAL"] } }), ["BOS", "LAL"]);
});
