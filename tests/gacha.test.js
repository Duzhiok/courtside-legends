import test from "node:test";
import assert from "node:assert/strict";
import {
  NEWBIE,
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
  // hadAllstar: skip the 新手保底 so this exercises the ordinary 10-pull pity
  let gacha = { ...freshGachaState(), hadAllstar: true };
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

test("the rates shown to players add up to exactly 100%", async () => {
  const { rateSummary } = await import("../js/ui/gachaView.js");
  const shown = [...rateSummary().matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(shown.length, RATE_TABLE.length);
  assert.ok(Math.abs(shown.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.match(rateSummary(), /传奇 1\.7%/);
});

test("新手保底: an account with no 85+ gets one by its 5th pull, once", () => {
  let gacha = freshGachaState();
  const alwaysCommon = () => 0.999;
  for (let i = 0; i < NEWBIE.allstarByPull - 1; i++) {
    const pull = pullCard({ pool: POOL, gacha, rng: alwaysCommon, ovrOf });
    assert.ok(pull.player.ovr < 85, `pull ${i + 1} is an ordinary pull`);
    assert.ok(!pull.pityHit);
    gacha = pull.gacha;
  }
  const fifth = pullCard({ pool: POOL, gacha, rng: alwaysCommon, ovrOf });
  assert.ok(fifth.pityHit && fifth.player.ovr >= 85);
  assert.equal(fifth.gacha.hadAllstar, true);
  assert.equal(fifth.gacha.pulls, NEWBIE.allstarByPull);
  // after that, ordinary odds again (the 10-pull counter was reset by the 85+)
  const sixth = pullCard({ pool: POOL, gacha: fifth.gacha, rng: alwaysCommon, ovrOf });
  assert.ok(!sixth.pityHit && sixth.player.ovr < 85);
});

test("a lucky early 85+ also spends the 新手保底", () => {
  const lucky = pullCard({ pool: POOL, gacha: freshGachaState(), rng: () => 0.001, ovrOf });
  assert.ok(lucky.gacha.hadAllstar);
  assert.equal(pityFloor(lucky.gacha), null);
});

// ---- R13: pool-relative bands for era / team banners ----

/** 1000-card "league": a realistic top-heavy shape, plus a weak 1955 era. */
function leaguePool() {
  const shape = [[3, 98], [3, 94], [5, 91], [20, 87], [20, 82], [100, 77], [549, 65]];
  const cards = [];
  for (const [count, ovr] of shape) {
    for (let i = 0; i < count; i++) cards.push(card(`m${ovr}x${i}-2015`, ovr - (i % 3) * 0.2, { season: 2015, bref: `m${ovr}x${i}` }));
  }
  // weak era: 300 cards at 60–79, listed worst-first so a lazy "nearest band" pick is bad
  for (let i = 0; i < 300; i++) cards.push(card(`old${i}-1955`, 60 + i * (19 / 299), { season: 1955, bref: `old${i}` }));
  return cards;
}
const ERA_1950 = { id: "era-1950", kind: "era", decade: 1950, name: "1950年代" };

function lcg(seed) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test("relativeRater: the pool's best card rates like a top card, its worst like filler", async () => {
  const { relativeRater } = await import("../js/data/gacha.js");
  const pool = leaguePool();
  const era = pool.filter((p) => p.season === 1955);
  const rate = relativeRater(pool, era, ovrOf);
  assert.ok(rate(era[era.length - 1]) >= 93, "era's best ≈ league's top 0.3%");
  assert.ok(rate(era[0]) < 74, "era's worst stays filler");
  for (let i = 1; i < era.length; i++) assert.ok(rate(era[i]) >= rate(era[i - 1]), "monotonic");
});

test("a weak-era banner still has a top end: a top-band roll gives the era's best card", () => {
  const pool = leaguePool();
  const gacha = { ...freshGachaState(), hadAllstar: true, pulls: 20 };
  // band roll 0.001 → 神话+; with absolute bands this collapses into the 74–79 filler
  const pull = pullCard({ pool, gacha, banner: ERA_1950, rng: scripted(0.001, 0), ovrOf });
  assert.equal(pull.player.season, 1955);
  assert.ok(pull.player.ovr > 78, `got ${pull.player.ovr}`);
  assert.ok(pull.relative);
});

test("every rarity band is reachable inside a weak-era banner (not just rotation / common)", () => {
  const pool = leaguePool();
  const rng = lcg(7);
  let gacha = { ...freshGachaState(), hadAllstar: true, pulls: 20 };
  const seen = new Map();
  for (let i = 0; i < 8000; i++) {
    const pull = pullCard({ pool, gacha, banner: ERA_1950, rng, ovrOf });
    gacha = pull.gacha;
    seen.set(pull.band.id, (seen.get(pull.band.id) || 0) + 1);
  }
  assert.deepEqual([...seen.keys()].sort(), RATE_TABLE.map((band) => band.id).sort());
  // and the shares stay close to the advertised table
  const share = (id) => (seen.get(id) || 0) / 8000;
  const advertised = (id) => RATE_TABLE.find((band) => band.id === id).p;
  assert.ok(Math.abs(share("common") - advertised("common")) < 0.04, `common ${share("common").toFixed(3)}`);
  assert.ok(share("legend") > 0.005, `legend ${share("legend").toFixed(4)}`);
});

test("新手保底 ignores the chosen banner: the forced pull is a real 85+ from the full pool", () => {
  const pool = leaguePool();
  let gacha = { ...freshGachaState(), pulls: NEWBIE.allstarByPull - 1 };
  const pull = pullCard({ pool, gacha, banner: ERA_1950, rng: scripted(0.999, 0), ovrOf });
  assert.ok(pull.player.ovr >= 85);
  assert.equal(pull.player.season, 2015);
  assert.equal(pull.newbieForced, true);
  assert.equal(pull.relative, false);
  assert.equal(pull.gacha.hadAllstar, true);
});

test("pity counters follow pool-relative standing, so a weak pool cannot jam them", () => {
  const pool = leaguePool();
  const era = pool.filter((p) => p.season === 1955);
  const gacha = { ...freshGachaState(), hadAllstar: true, pulls: 20, sinceAllstar: 8 };
  const pull = pullCard({ pool, gacha, banner: ERA_1950, rng: scripted(0.1, 0), ovrOf }); // 全明星+ roll
  assert.ok(era.includes(pull.player));
  assert.equal(pull.gacha.sinceAllstar, 0, "an era-best pull resets the 10-pull counter");
});

test("the standard banner is unchanged by relative rating", () => {
  const pool = leaguePool();
  const gacha = { ...freshGachaState(), hadAllstar: true, pulls: 20 };
  const pull = pullCard({ pool, gacha, banner: { id: "standard", kind: "standard" }, rng: scripted(0.001, 0), ovrOf });
  assert.ok(pull.player.ovr >= 96 || pull.player.season === 2015);
  assert.equal(pull.relative, false);
});

test("relativeRater: a block of identical OVRs is spread by production, not dropped into one band", async () => {
  const { relativeRater } = await import("../js/data/gacha.js");
  const pool = leaguePool();
  const tied = Array.from({ length: 120 }, (_, i) => card(`tie${i}-2005`, 78, { season: 2005, bref: `tie${i}`, raw: { ppg: i } }));
  const rate = relativeRater([...pool, ...tied], tied, ovrOf);
  const values = tied.map(rate);
  assert.ok(new Set(values).size > 20, "ties are spread across many standings");
  assert.ok(rate(tied[119]) >= rate(tied[0]), "higher production ranks higher");
  const bands = new Set(values.map((v) => RATE_TABLE.find((b) => v >= b.min && v < b.max).id));
  assert.ok(bands.size >= 3, `ties span several bands, got ${[...bands]}`);
});

test("legacy cards (no stored roll) keep a stable 成色 per account, and differ between accounts", async () => {
  const { legacyRollSeed } = await import("../js/data/cardRoll.js");
  assert.equal(legacyRollSeed("acc-1", "farieke01-2012-den"), legacyRollSeed("acc-1", "farieke01-2012-den"));
  assert.notEqual(legacyRollSeed("acc-1", "farieke01-2012-den"), legacyRollSeed("acc-2", "farieke01-2012-den"));
  assert.notEqual(legacyRollSeed("acc-1", "farieke01-2012-den"), legacyRollSeed("acc-1", "farieke01-2013-den"));
  // the grade this seed rolls never changes between reads
  assert.deepEqual(rollOffsets(legacyRollSeed("acc-1", "x")), rollOffsets(legacyRollSeed("acc-1", "x")));
});
