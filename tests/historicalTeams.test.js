import test from "node:test";
import assert from "node:assert/strict";
import { teamNameFor } from "../js/data/historicalTeams.js";

// A-P2-3: teamNameFor moved out of js/ui/timeTravel/viewModel.js into the data
// layer so js/story/ no longer imports from js/ui/. Behaviour is verbatim:
// the historical-season display name, falling back to the raw team id.
test("teamNameFor returns the historical-season display name", () => {
  assert.equal(teamNameFor(1991, "CHI"), "公牛");
  assert.equal(teamNameFor(1991, "BOS"), "凯尔特人");
  assert.equal(teamNameFor(1996, "CHI"), "公牛");
});

test("teamNameFor falls back to the team id when the year or team is unknown", () => {
  assert.equal(teamNameFor(1900, "CHI"), "CHI");
  assert.equal(teamNameFor(1991, "XXX"), "XXX");
  assert.equal(teamNameFor(undefined, "CHI"), "CHI");
});
