// B61 step 13: the two settlement rules handleCareerResult used inline, now owned by their modules.
import test from "node:test";
import assert from "node:assert/strict";
import { careerResultReward } from "../js/engine/careerEconomy.js";
import { nextChallengeTier } from "../js/data/careerChallenges.js";

test("result gold: title 400+100/round, a win 120+40/round, a loss a flat 40; missing round counts as 1", () => {
  assert.equal(careerResultReward({ champion: true, round: 4 }), 800);
  assert.equal(careerResultReward({ champion: true }), 500);
  assert.equal(careerResultReward({ youWin: true, round: 3 }), 240);
  assert.equal(careerResultReward({ youWin: true, round: 0 }), 160);
  assert.equal(careerResultReward({ youWin: false, round: 5 }), 40);
});

test("a champion climbs gold → playoff15 → champ7 → done; custom runs and unknown tiers never climb", () => {
  assert.equal(nextChallengeTier("gold"), "playoff15");
  assert.equal(nextChallengeTier("playoff15"), "champ7");
  assert.equal(nextChallengeTier("champ7"), null);
  assert.equal(nextChallengeTier("gold", true), null);
  assert.equal(nextChallengeTier("custom"), null);
  assert.equal(nextChallengeTier(undefined), null);
});
