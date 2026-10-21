import test from "node:test";
import assert from "node:assert/strict";
import { inGameInjuryChance, rollAdvancementInjuries } from "../js/data/intangibles.js";

function withSeededRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test("in-game injury chance is zero below risk 60 and capped at 2% even when fatigued", () => {
  assert.equal(inGameInjuryChance(40), 0);
  assert.equal(inGameInjuryChance(59), 0);
  assert.ok(inGameInjuryChance(70) < 0.02);
  assert.equal(inGameInjuryChance(99, { fatigue: 999 }), 0.02);
});

test("iron_body reduces effective in-game injury risk instead of being ignored", () => {
  const withIronBody = inGameInjuryChance(85, { ironBody: true });
  const without = inGameInjuryChance(85, { ironBody: false });
  assert.ok(withIronBody < without);
});

test("a single possession check never exceeds a few percent, unlike the old 4.5% cap", () => {
  // Old formula could hit 4.5% per check; new ceiling must stay well under that.
  for (let risk = 0; risk <= 100; risk += 5) {
    assert.ok(inGameInjuryChance(risk, { fatigue: 100 }) <= 0.02);
  }
});

test("advancement injury chance is near zero for an average player in round 1", () => {
  const player = { name: "Average Joe", intangibles: { injuryRisk: 50 } };
  const chance = withSeededRandom([0.0001], () => {
    rollAdvancementInjuries([player], { round: 1, intensity: 1 });
    return player.injuredGames > 0;
  });
  // Even with the unluckiest possible roll (near 0), round-1 average risk should not injure.
  assert.equal(chance, false);
});

test("advancement injury chance is capped at 16% even for the most fragile player in the deepest round", () => {
  const fragile = { name: "Glass Cannon", intangibles: { injuryRisk: 99 } };
  const justUnderCap = withSeededRandom([0.159], () => {
    rollAdvancementInjuries([fragile], { round: 5, intensity: 1.35 });
    return fragile.injuredGames > 0;
  });
  assert.equal(justUnderCap, true);

  const fragile2 = { name: "Glass Cannon 2", intangibles: { injuryRisk: 99 } };
  const justOverCap = withSeededRandom([0.161], () => {
    rollAdvancementInjuries([fragile2], { round: 5, intensity: 1.35 });
    return fragile2.injuredGames > 0;
  });
  assert.equal(justOverCap, false);
});

test("advancement injuries tick down and recover instead of compounding forever", () => {
  const player = { name: "Hurt", intangibles: { injuryRisk: 90 }, injuredGames: 1, injuryStatus: "伤停" };
  const reports = rollAdvancementInjuries([player], { round: 2, intensity: 1 });
  assert.equal(player.injuredGames, 0);
  assert.equal(player.injuryStatus, null);
  assert.equal(reports[0].type, "recover");
});
