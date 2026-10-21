import test from "node:test";
import assert from "node:assert/strict";
import {
  PITY,
  RATE_TABLE,
  bannerFilter,
  craftCost,
  currentBanners,
  extraDrawsLeft,
  freshGachaState,
  pityFloor,
  pullCard,
  recordExtraDraw,
} from "../js/data/gacha.js";
import {
  GRADE_BANDS,
  ROLL_SPREAD,
  applyHiddenRoll,
  hiddenRating,
  rollGrade,
  rollOffsets,
} from "../js/data/cardRoll.js";

const ovrOf = (p) => p.ovr;

function card(id, ovr, extra = {}) {
  return { id, bref: id.split("-")[0], ovr, season: 2000, team: "CHI", ...extra };
}

/** rng that replays a script, then repeats the last value. */
function scripted(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const POOL = [
  card("myth-1", 97),
  card("legend-1", 94),
  card("super-1", 91),
  card("allstar-1", 87),
  card("starter-1", 82),
  card("rotation-1", 76),
  card("common-1", 60),
  card("common-2", 55),
];

test("rate table sums to 1 and 90+ is now 7%", () => {
  const total = RATE_TABLE.reduce((sum, band) => sum + band.p, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const ninetyPlus = RATE_TABLE.filter((band) => band.min >= 90).reduce((sum, band) => sum + band.p, 0);
  assert.ok(Math.abs(ninetyPlus - 0.07) < 1e-9);
});

test("10th pull without an 85+ is forced to at least 全明星", () => {
  let gacha = freshGachaState();
  const alwaysCommon = () => 0.999;
  for (let i = 0; i < PITY.allstarEvery - 1; i++) {
    const pull = pullCard({ pool: POOL, gacha, rng: alwaysCommon, ovrOf });
    assert.ok(pull.player.ovr < 85);
    gacha = pull.gacha;
  }
  const pity = pullCard({ pool: POOL, gacha, rng: alwaysCommon, ovrOf });
  assert.ok(pity.pityHit);
  assert.ok(pity.player.ovr >= 85);
  assert.equal(pity.gacha.sinceAllstar, 0);
});

test("50th pull without a 93+ is forced to at least 传奇", () => {
  const gacha = { ...freshGachaState(), sinceLegend: PITY.legendAt - 1, sinceAllstar: 3 };
  assert.equal(pityFloor(gacha).id, "legend");
  const pull = pullCard({ pool: POOL, gacha, rng: () => 0.999, ovrOf });
  assert.ok(pull.player.ovr >= 93);
  assert.equal(pull.gacha.sinceLegend, 0);
});

test("wishlist redirects a pull inside the wish person's band", () => {
  const pool = [card("star-a", 87), card("wish-b", 88), card("star-c", 86)];
  const gacha = { ...freshGachaState(), wishlist: "wish" };
  // band roll lands somewhere (single band anyway), redirect roll 0.1 < 0.3
  const pull = pullCard({ pool, gacha, rng: scripted(0.5, 0.1, 0.9), ovrOf });
  assert.equal(pull.player.bref, "wish");
  assert.ok(pull.wishHit);
});

test("empty band falls back to the nearest lower band, not straight to myth", () => {
  const pool = [card("allstar-x", 86), card("common-x", 60), card("myth-x", 98)];
  // 0.03 → superstar band (empty) → nearest lower non-empty = allstar
  const pull = pullCard({ pool, gacha: freshGachaState(), rng: scripted(0.03, 0), ovrOf });
  assert.equal(pull.player.id, "allstar-x");
});

test("banners rotate weekly and filter by decade / franchise", () => {
  const week0 = currentBanners(new Date(Date.UTC(2024, 0, 2)));
  const week1 = currentBanners(new Date(Date.UTC(2024, 0, 9)));
  assert.equal(week0[0].id, "standard");
  assert.notEqual(week0[1].id, week1[1].id);
  const era = bannerFilter({ kind: "era", decade: 1990 });
  assert.ok(era({ season: 1996 }));
  assert.ok(!era({ season: 2001 }));
  const team = bannerFilter({ kind: "team", codes: ["SEA", "OKC"] });
  assert.ok(team({ team: "SEA" }));
  assert.ok(!team({ team: "LAL" }));
});

test("banner pools never leak cards from outside the banner", () => {
  const pool = [card("a-1", 87, { team: "CHI" }), card("b-1", 95, { team: "LAL" })];
  const banner = { kind: "team", codes: ["CHI"] };
  for (const roll of [0.001, 0.5, 0.999]) {
    const pull = pullCard({ pool, gacha: freshGachaState(), banner, rng: () => roll, ovrOf });
    assert.equal(pull.player.team, "CHI");
  }
});

test("extra gold draws are capped per day and crafting scales with band", () => {
  let gacha = freshGachaState();
  assert.equal(extraDrawsLeft(gacha, "2026-01-01"), 2);
  gacha = recordExtraDraw(gacha, "2026-01-01");
  gacha = recordExtraDraw(gacha, "2026-01-01");
  assert.equal(extraDrawsLeft(gacha, "2026-01-01"), 0);
  assert.equal(extraDrawsLeft(gacha, "2026-01-02"), 2);
  assert.ok(craftCost(97) > craftCost(87));
  assert.ok(craftCost(87) > craftCost(60));
});

test("成色 offsets stay within ±ROLL_SPREAD and are deterministic per seed", () => {
  for (let seed = 1; seed < 400; seed++) {
    const { offsets } = rollOffsets(seed);
    for (const value of Object.values(offsets)) {
      assert.ok(Math.abs(value) <= ROLL_SPREAD);
    }
  }
  assert.deepEqual(rollOffsets(42), rollOffsets(42));
});

test("成色 grades follow a bell shape: B is the most common, S is rare", () => {
  const counts = Object.fromEntries(GRADE_BANDS.map((band) => [band.grade, 0]));
  for (let seed = 1; seed <= 4000; seed++) counts[rollGrade(rollOffsets(seed).quality)] += 1;
  assert.ok(counts.B > counts.A && counts.B > counts.C);
  assert.ok(counts.S / 4000 < 0.14);
  assert.ok(counts.S > 0 && counts.D > 0);
});

test("applyHiddenRoll shifts intangibles but never role fingerprints", () => {
  const base = { intangibles: { winningImpact: 81, ceiling: 70, systemAdapt: 75, composure: 60, chemistryMagnet: 65, ballNeed: 40, offBall: 77, injuryRisk: 50 } };
  const rolled = applyHiddenRoll(structuredClone(base), 1234);
  assert.equal(rolled.intangibles.ballNeed, 40);
  assert.equal(rolled.intangibles.offBall, 77);
  assert.ok(Math.abs(rolled.intangibles.winningImpact - 81) <= ROLL_SPREAD);
  assert.ok(["S", "A", "B", "C", "D"].includes(rolled.hiddenRoll.grade));
  assert.equal(rolled.hiddenRoll.rating, hiddenRating(rolled));
});
