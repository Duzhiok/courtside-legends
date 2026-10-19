import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRecommendation,
  createLeagueCareer,
  setManualOverride,
} from "../js/modes/leagueCareer.js";

for (const category of ["lineup", "matchups", "roles", "minutes", "training", "skills"]) {
  test(`manual ${category} overrides automatic recommendations`, () => {
    let career = createLeagueCareer({
      kind: "timeTravel",
      season: { phase: "regular" },
      careerId: `manual-${category}`,
    });
    career = setManualOverride(career, category, "player-1", "manual-value");
    career = applyRecommendation(career, category, {
      "player-1": "automatic-value",
      "player-2": "automatic-second",
    });
    assert.equal(career.recommendations[category]["player-1"], "manual-value");
    assert.equal(career.recommendations[category]["player-2"], "automatic-second");
  });
}
