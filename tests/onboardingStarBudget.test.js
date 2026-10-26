// Onboarding star budget: a brand-new account used to start with ~7 All-Stars+ because the
// onboarding odds give 28% per card at OVR 85+ and the player then cherry-picks the best 5
// of a 20-card offer pool. The starting 12 now holds 1-2 stars; the rest are role players.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYERS, seasonToCard } from "../js/data/players.js";
import {
  STARTER_STAR_CAP,
  countStarterStars,
  pickPlayerByOdds,
  rollStarterOffers,
  rollSystemSeven,
  starterStarBudget,
} from "../js/data/account.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function withRealRoster(fn) {
  const originalLength = PLAYERS.length;
  PLAYERS.push(...rows.map(seasonToCard));
  try { fn(); } finally { PLAYERS.splice(originalLength); }
}

/** What a sensible new player does: keep the system 7, then take the 5 best offers. */
function simulateOnboarding() {
  const seven = rollSystemSeven();
  const offers = rollStarterOffers(20, new Set(seven.map((p) => p.id)), starterStarBudget(seven));
  const best5 = [...offers].sort((a, b) => countStarterStars([b]) - countStarterStars([a])).slice(0, 5);
  return { seven, offers, twelve: [...seven, ...best5] };
}

test("onboarding: the starting 12 never holds more than the star cap, and a star is always on offer", () => {
  withRealRoster(() => {
    for (let i = 0; i < 25; i++) {
      const { seven, offers, twelve } = simulateOnboarding();
      assert.ok(countStarterStars(seven) <= 1, "system seven holds at most one star");
      assert.ok(countStarterStars(twelve) <= STARTER_STAR_CAP, `run ${i}: ${countStarterStars(twelve)} stars`);
      assert.ok(countStarterStars([...seven, ...offers]) >= 1, `run ${i}: no star offered at all`);
    }
  });
});

test("onboarding: the old uncapped odds really did hand out a superteam (why the cap exists)", () => {
  withRealRoster(() => {
    let total = 0;
    const runs = 12;
    for (let i = 0; i < runs; i++) {
      const used = new Set();
      const draw = (n) => Array.from({ length: n }, () => {
        const p = pickPlayerByOdds(PLAYERS, { excludeIds: used });
        used.add(p.id);
        return p;
      });
      const seven = draw(7);
      const best5 = draw(20).sort((a, b) => countStarterStars([b]) - countStarterStars([a])).slice(0, 5);
      total += countStarterStars([...seven, ...best5]);
    }
    assert.ok(total / runs > 4, `uncapped average was ${(total / runs).toFixed(1)} stars`);
  });
});

test("onboarding: starterStarBudget leaves room only for what the seven did not use", () => {
  const star = { id: "s", ovr2k: 90, ratingSource: "anchor" };
  assert.deepEqual(starterStarBudget([]), { max: STARTER_STAR_CAP, min: 1 });
  assert.deepEqual(starterStarBudget([star]), { max: STARTER_STAR_CAP - 1, min: 0 });
});
