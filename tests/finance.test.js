import test from "node:test";
import assert from "node:assert/strict";
import {
  availableAssetClasses,
  buyHouse,
  canAffordHouse,
  canAffordInvestment,
  currentCoachSalary,
  houseTiers,
  investmentForecast,
  investmentForecastAccuracy,
  placeInvestment,
  rollInvestmentReturn,
  settleCoachFinances,
} from "../js/career/finance.js";
import { createCoachProfile } from "../js/career/coachProfile.js";
import { COACH_BASE_SALARY, HOUSE_TIERS, INVESTMENT_FORECAST_MIN_ACCURACY } from "../js/career/balance.js";

function rootWithCoach(coachOverrides = {}, storyOverrides = {}) {
  return {
    leagueCareer: { season: { year: 1996 } },
    story: { eventLog: [], employment: { status: "active" }, timelineDivergence: 0, ...storyOverrides },
    coach: createCoachProfile(coachOverrides),
  };
}

// --- salary ---

test("currentCoachSalary falls back to the flat base salary before any renewal has happened", () => {
  const root = rootWithCoach();
  assert.equal(currentCoachSalary(root), COACH_BASE_SALARY);
});

test("currentCoachSalary reads the accepted renewal offer's salary once one exists", () => {
  const root = rootWithCoach({}, { employment: { status: "renewed", offer: { salary: 20 } } });
  assert.equal(currentCoachSalary(root), 20);
});

// --- houses ---

test("houseTiers exposes the same catalog as balance.js, label/cost/moodBonus intact", () => {
  assert.deepEqual(houseTiers(), HOUSE_TIERS);
});

test("canAffordHouse is false below cost and true at or above it", () => {
  const poor = createCoachProfile({ cash: 10 });
  const rich = createCoachProfile({ cash: 1000 });
  assert.equal(canAffordHouse(poor, "apartment"), false);
  assert.equal(canAffordHouse(rich, "apartment"), true);
});

test("buyHouse deducts cost and sets housing, leaving everything else about the coach untouched", () => {
  const coach = createCoachProfile({ cash: 100, age: 42 });
  const after = buyHouse(coach, "apartment");
  assert.equal(after.cash, 100 - HOUSE_TIERS.apartment.cost);
  assert.equal(after.housing, "apartment");
  assert.equal(after.age, 42, "unrelated fields survive the update");
  assert.equal(coach.cash, 100, "input is not mutated");
});

test("buyHouse rejects an unaffordable tier without touching cash or housing", () => {
  const coach = createCoachProfile({ cash: 1 });
  assert.throws(() => buyHouse(coach, "mansion"), /not enough cash/);
});

test("buyHouse rejects an unknown tier id", () => {
  assert.throws(() => buyHouse(createCoachProfile({ cash: 1000 }), "yacht"), RangeError);
});

// --- investment asset classes by era ---

test("availableAssetClasses only offers what the in-story year has invented yet", () => {
  const classes1960 = availableAssetClasses(1960).map((c) => c.id);
  const classes2020 = availableAssetClasses(2020).map((c) => c.id);
  assert.deepEqual(classes1960, ["bonds"], "no stocks, no crypto in 1960");
  assert.ok(classes2020.includes("crypto"), "crypto exists by 2020");
  assert.ok(classes2020.includes("bonds"), "older asset classes stay available later");
});

// --- forecast accuracy vs divergence ---

test("investmentForecastAccuracy is 1 at zero divergence and decays toward (not below) the floor", () => {
  assert.equal(investmentForecastAccuracy(0), 1);
  assert.ok(investmentForecastAccuracy(1000) >= INVESTMENT_FORECAST_MIN_ACCURACY);
  assert.ok(investmentForecastAccuracy(20) < investmentForecastAccuracy(5), "more divergence is never more accurate");
});

test("investmentForecast is noise-free (matches baseReturn exactly) at zero divergence regardless of rng", () => {
  const classes = availableAssetClasses(2020);
  const bonds = classes.find((c) => c.id === "bonds");
  // rng never called when accuracy is 1 (noise amplitude is zero), but pass one anyway to prove it
  const forecast = investmentForecast("bonds", 0, () => 0.999);
  assert.equal(forecast, bonds.baseReturn);
});

test("investmentForecast gets noisier as divergence rises, independent of rollInvestmentReturn", () => {
  const lowDivergence = investmentForecast("tech-stocks", 2, () => 1); // rng()=1 -> max positive noise
  const highDivergence = investmentForecast("tech-stocks", 100, () => 1);
  assert.ok(highDivergence > lowDivergence, "more divergence means more room for the forecast to drift from baseReturn");
});

test("investmentForecast rejects an unknown asset id", () => {
  assert.throws(() => investmentForecast("nft", 0), RangeError);
});

// --- the real roll is win-or-lose and ignores divergence ---

test("rollInvestmentReturn can land above or below baseReturn depending on rng, regardless of divergence", () => {
  const assetId = "tech-stocks";
  const upside = rollInvestmentReturn(assetId, () => 1); // best case
  const downside = rollInvestmentReturn(assetId, () => 0); // worst case
  assert.ok(upside > downside, "investments have a real win/lose spread");
});

// --- placing and settling investments ---

test("canAffordInvestment and placeInvestment move cash into a pending position", () => {
  const coach = createCoachProfile({ cash: 50 });
  assert.equal(canAffordInvestment(coach, 10), true);
  assert.equal(canAffordInvestment(coach, 51), false);
  const after = placeInvestment(coach, "bonds", 10, 1996);
  assert.equal(after.cash, 40);
  assert.deepEqual(after.pendingInvestments, [{ assetId: "bonds", amount: 10, placedYear: 1996 }]);
});

test("placeInvestment rejects an unaffordable stake or an unknown asset", () => {
  const coach = createCoachProfile({ cash: 5 });
  assert.throws(() => placeInvestment(coach, "bonds", 10, 1996), /not enough cash/);
  assert.throws(() => placeInvestment(createCoachProfile({ cash: 1000 }), "nft", 10, 1996), RangeError);
});

test("settleCoachFinances pays salary, clears pending investments, and can win or lose money", () => {
  const winningRoot = rootWithCoach({ cash: 0, pendingInvestments: [{ assetId: "bonds", amount: 10, placedYear: 1996 }] });
  const won = settleCoachFinances(winningRoot, () => 1); // best-case roll
  const lostRoot = rootWithCoach({ cash: 0, pendingInvestments: [{ assetId: "bonds", amount: 10, placedYear: 1996 }] });
  const lost = settleCoachFinances(lostRoot, () => 0); // worst-case roll
  assert.deepEqual(won.coach.pendingInvestments, [], "positions never carry over past one settlement");
  assert.deepEqual(lost.coach.pendingInvestments, []);
  assert.ok(won.coach.cash > lost.coach.cash, "a better roll on the same stake must pay out more");
  assert.ok(won.coach.cash >= COACH_BASE_SALARY, "salary alone is always credited even on a losing bet");
});

test("settleCoachFinances credits the owned house's recurring mood bonus, clamped to 100", () => {
  const root = rootWithCoach({ mood: 95, housing: "mansion" });
  const after = settleCoachFinances(root);
  assert.equal(after.coach.mood, 100, "clamped rather than overflowing past the cap");
});

test("settleCoachFinances with no house and no investments just pays salary and logs the settlement", () => {
  const root = rootWithCoach({ cash: 3 });
  const after = settleCoachFinances(root);
  assert.equal(after.coach.cash, 3 + COACH_BASE_SALARY);
  const entry = after.story.eventLog.at(-1);
  assert.equal(entry.type, "finances-settled");
  assert.equal(entry.salary, COACH_BASE_SALARY);
  assert.deepEqual(entry.settledInvestments, []);
});

test("settleCoachFinances does not mutate the input root", () => {
  const root = rootWithCoach({ cash: 3, pendingInvestments: [{ assetId: "bonds", amount: 10, placedYear: 1996 }] });
  const before = JSON.parse(JSON.stringify(root));
  settleCoachFinances(root);
  assert.deepEqual(root, before);
});

test("settleCoachFinances backfills a full coach profile for a save that predates root.coach entirely", () => {
  const root = { leagueCareer: { season: { year: 1996 } }, story: { eventLog: [] } };
  const after = settleCoachFinances(root);
  assert.equal(after.coach.cash, COACH_BASE_SALARY);
  assert.equal(after.coach.age > 0, true, "ensureCoachProfile backfilled the rest of the shape, not just cash");
});
