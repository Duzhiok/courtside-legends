import assert from "node:assert/strict";
import { test } from "node:test";

import { CAREER_SUPERSTAR_BREFS, LEGENDARY_SEASONS, playerLegacyBadge } from "../js/data/playerLegacy.js";

function card(overrides) {
  return { bref: "x", season: 2000, team: "CHI", hiddenTier: "bench", ...overrides };
}

test("exact curated iconic season wins Legendary with a team-colored card style", () => {
  const c = card({ bref: "jordami01", season: 1996, team: "CHI", hiddenTier: "superstar" });
  const badge = playerLegacyBadge(c, 100);
  assert.equal(badge.label, "传奇");
  assert.equal(badge.cls, "legend");
  assert.ok(badge.cardStyle, "iconic seasons should carry a team-colored card style");
  assert.match(badge.cardStyle, /#CE1141/i); // Bulls red from teamColors.js
});

test("the real NBA 50 fallback grants Legendary only at All-Star-caliber production (rank >= 3)", () => {
  // top-10/50 legend, allstar-tier season, not individually curated -> legendary, no special style
  const strong = card({ bref: "jordami01", season: 1985, hiddenTier: "superstar" });
  const strongBadge = playerLegacyBadge(strong, 85);
  assert.equal(strongBadge.label, "传奇");
  assert.equal(strongBadge.cardStyle, null, "fallback legendary has no curated team-color treatment");

  // same legend, but a decline-phase season with low production -> no fallback bump
  const weak = card({ bref: "jordami01", season: 2003, hiddenTier: "bench" });
  const weakBadge = playerLegacyBadge(weak, 60);
  assert.notEqual(weakBadge.label, "传奇");
});

test("Garnett's low-production rookie season stays Go-To Guy, not Legendary -- the user's own example", () => {
  const rookie = card({ bref: "garneke01", season: 1996, hiddenTier: "starter" });
  const badge = playerLegacyBadge(rookie, 59);
  assert.equal(badge.label, "当家球星");
});

test("Garnett's MVP season is a curated LEGENDARY_SEASONS entry", () => {
  assert.ok(LEGENDARY_SEASONS.garneke01?.includes(2004));
  const mvp = card({ bref: "garneke01", season: 2004, team: "MIN", hiddenTier: "superstar" });
  assert.equal(playerLegacyBadge(mvp, 99).label, "传奇");
});

test("Paul George is not in the curated superstar set -- his best season is All-Star, not Superstar", () => {
  assert.ok(!CAREER_SUPERSTAR_BREFS.has("georgpa01"));
  const peak = card({ bref: "georgpa01", season: 2019, hiddenTier: "superstar" });
  assert.equal(playerLegacyBadge(peak, 93).label, "全明星");
});

test("Westbrook's triple-double MVP season is curated Legendary; his other seasons are not", () => {
  const mvpYear = card({ bref: "westbru01", season: 2017, team: "OKC", hiddenTier: "superstar" });
  assert.equal(playerLegacyBadge(mvpYear, 94).label, "传奇");

  const otherYear = card({ bref: "westbru01", season: 2021, hiddenTier: "superstar" });
  const otherBadge = playerLegacyBadge(otherYear, 86);
  assert.notEqual(otherBadge.label, "传奇");
});

test("customPool.js's loose modern-pricing list (NBA_75_EXTRA_BREF) must not leak into Legendary", () => {
  // Booker/Tatum/Morant/Zion get a $3 floor in the custom draft pool for pricing purposes only;
  // that is not the real, historically fixed NBA 50 Greatest list and must not grant Legendary.
  const bookerPeak = card({ bref: "bookede01", season: 2022, hiddenTier: "superstar" });
  assert.notEqual(playerLegacyBadge(bookerPeak, 91).label, "传奇");
});

test("a curated career superstar needs an All-Star-caliber season too, not just the name on a list", () => {
  const peak = card({ bref: "jokicni01", hiddenTier: "superstar" });
  assert.equal(playerLegacyBadge(peak, 97).label, "超级球星");

  const mediocre = card({ bref: "jokicni01", hiddenTier: "starter" });
  assert.notEqual(playerLegacyBadge(mediocre, 70).label, "超级球星");
});

test("generic production buckets fill in for every uncurated card", () => {
  assert.equal(playerLegacyBadge(card({ hiddenTier: "allstar" }), 85).label, "全明星");
  assert.equal(playerLegacyBadge(card({ hiddenTier: "star" }), 80).label, "球星");
  assert.equal(playerLegacyBadge(card({ hiddenTier: "starter" }), 75).label, "当家球星");
});

test("cards with no hiddenTier match fall back to the pure-OVR bands", () => {
  assert.equal(playerLegacyBadge(card({ hiddenTier: "bench" }), 96).label, "神话");
  assert.equal(playerLegacyBadge(card({ hiddenTier: "bench" }), 82).label, "先发");
  assert.equal(playerLegacyBadge(card({ hiddenTier: "bench" }), 50).label, "");
});

test("a card is never given two badges -- exactly one object with one label comes back", () => {
  const c = card({ bref: "jordami01", season: 1996, hiddenTier: "superstar" });
  const badge = playerLegacyBadge(c, 100);
  assert.equal(Object.keys(badge).length, 4);
  assert.equal(typeof badge.label, "string");
});

test("missing/undefined card fields do not throw", () => {
  assert.doesNotThrow(() => playerLegacyBadge({}, 0));
  assert.doesNotThrow(() => playerLegacyBadge(null, undefined));
});
