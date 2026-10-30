/**
 * E3 of docs/CAREER_LIFE_ROADMAP.md: the time-travel coach's personal money -- salary income,
 * buying a home, and placing a modest seasonal bet on an era-appropriate investment. Pure
 * functions only, same contract as coachProfile.js: every function takes a coach/root and
 * returns a new one, never mutates its input.
 *
 * Deliberately scoped down from the full roadmap prose: house purchases pay out a recurring
 * mood bump (a real, testable effect wired into an existing stat) rather than inventing a new
 * "family satisfaction" field that nothing else in the game reads yet -- same reasoning A1 used
 * to leave coachProfile.js fields unwired until a phase actually needs them. Investments are
 * single-season bets (cash out, resolve next settlement, done) rather than a compounding
 * multi-year portfolio, to keep the state shape -- and the tests -- simple.
 */
import {
  COACH_BASE_SALARY,
  HOUSE_TIERS,
  INVESTMENT_ASSET_CLASSES,
  INVESTMENT_FORECAST_DIVERGENCE_FALLOFF,
  INVESTMENT_FORECAST_MIN_ACCURACY,
} from "./balance.js";
import { ensureCoachProfile } from "./coachProfile.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assetClassById(assetId) {
  return Object.values(INVESTMENT_ASSET_CLASSES)
    .flat()
    .find((assetClass) => assetClass.id === assetId);
}

/**
 * The annual salary currently in effect: whatever the last accepted B3 renewal offer pays, or a
 * flat base salary before any renewal has ever happened. The initial five-year hire
 * (timeTravelCareer.js's OFFER_DETAILS) negotiates authority/trust/pressure but never a dollar
 * figure, so there is no archetype-specific number to read for those years.
 */
export function currentCoachSalary(root) {
  return root?.story?.employment?.offer?.salary ?? COACH_BASE_SALARY;
}

/** House tiers available to buy, id -> { label, cost, moodBonus }. */
export function houseTiers() {
  return HOUSE_TIERS;
}

export function canAffordHouse(coach, tierId) {
  const tier = HOUSE_TIERS[tierId];
  return !!tier && (coach?.cash ?? 0) >= tier.cost;
}

/**
 * Buy a house tier outright. Upgrading later just pays the new tier's full cost -- there is no
 * trade-in credit for whatever you owned before, same as the game doesn't model selling a
 * player's old house in real life either. Downgrading makes no sense (you'd pay to move into
 * something worse) so it isn't blocked, just pointless; the UI shouldn't offer it.
 */
export function buyHouse(coach, tierId) {
  const tier = HOUSE_TIERS[tierId];
  if (!tier) throw new RangeError(`unknown house tier: ${tierId}`);
  if (!canAffordHouse(coach, tierId)) throw new Error("not enough cash for this house");
  return { ...coach, cash: coach.cash - tier.cost, housing: tierId };
}

/** Investment asset classes unlocked by the in-story year -- an era can't invest in something
 * that doesn't exist yet (no crypto in 1960). */
export function availableAssetClasses(year) {
  return Object.entries(INVESTMENT_ASSET_CLASSES)
    .filter(([unlockYear]) => Number(year) >= Number(unlockYear))
    .flatMap(([, classes]) => classes);
}

/**
 * How reliable investmentForecast()'s hint is: 1 at zero divergence, decaying toward
 * INVESTMENT_FORECAST_MIN_ACCURACY as the timeline the coach has changed drifts further from the
 * history they actually remember. This never affects the real roll (rollInvestmentReturn) --
 * divergence punishes the coach's ability to predict the market, not the market itself.
 */
export function investmentForecastAccuracy(divergence) {
  return clamp(1 - (Number(divergence) || 0) / INVESTMENT_FORECAST_DIVERGENCE_FALLOFF, INVESTMENT_FORECAST_MIN_ACCURACY, 1);
}

/** A preview shown before investing: the asset's advertised return, blurred by how much the
 * timeline has diverged from what the coach remembers. Never used to resolve an actual payout. */
export function investmentForecast(assetId, divergence, rng = Math.random) {
  const assetClass = assetClassById(assetId);
  if (!assetClass) throw new RangeError(`unknown asset class: ${assetId}`);
  const accuracy = investmentForecastAccuracy(divergence);
  const noise = (rng() * 2 - 1) * assetClass.volatility * (1 - accuracy);
  return assetClass.baseReturn + noise;
}

/** The real, divergence-independent return for one settlement. Always rolled fresh -- never
 * derived from investmentForecast() above, so a confident forecast can still lose money. */
export function rollInvestmentReturn(assetId, rng = Math.random) {
  const assetClass = assetClassById(assetId);
  if (!assetClass) throw new RangeError(`unknown asset class: ${assetId}`);
  return assetClass.baseReturn + (rng() * 2 - 1) * assetClass.volatility;
}

export function canAffordInvestment(coach, amount) {
  return Number.isFinite(amount) && amount > 0 && (coach?.cash ?? 0) >= amount;
}

/**
 * Place a bet: cash leaves immediately, the position resolves at the next
 * settleCoachFinances() call (one season later). Positions never compound across multiple
 * seasons -- each is a fresh, re-decided-every-year choice, not a portfolio to track forever.
 */
export function placeInvestment(coach, assetId, amount, year) {
  if (!assetClassById(assetId)) throw new RangeError(`unknown asset class: ${assetId}`);
  if (!canAffordInvestment(coach, amount)) throw new Error("not enough cash for this investment");
  return {
    ...coach,
    cash: coach.cash - amount,
    pendingInvestments: [...(coach.pendingInvestments || []), { assetId, amount, placedYear: year }],
  };
}

/**
 * One season's financial settlement: pay the current salary, resolve every pending investment
 * (win or lose, independent of divergence), and credit the recurring mood bump for whatever
 * house tier is currently owned. Meant to be called once per season transition, alongside (but
 * independent of) careerContract.js's advanceSeasonGoal() -- finance never touches
 * frontOfficeTrust, goals never touch cash, and the caller composes both.
 */
export function settleCoachFinances(root, rng = Math.random) {
  const coach = ensureCoachProfile(root);
  const salary = currentCoachSalary(root);
  const pending = coach.pendingInvestments || [];
  let cash = (coach.cash || 0) + salary;
  const settledInvestments = [];
  for (const position of pending) {
    const roll = rollInvestmentReturn(position.assetId, rng);
    const proceeds = position.amount * (1 + roll);
    cash += proceeds;
    settledInvestments.push({ assetId: position.assetId, amount: position.amount, roll, proceeds });
  }
  const houseTier = HOUSE_TIERS[coach.housing];
  const mood = clamp((coach.mood ?? 0) + (houseTier?.moodBonus || 0), 0, 100);
  return {
    ...root,
    coach: { ...coach, cash, mood, pendingInvestments: [] },
    story: {
      ...root.story,
      eventLog: [
        ...(root.story?.eventLog || []),
        {
          type: "finances-settled",
          year: root.leagueCareer?.season?.year,
          salary,
          settledInvestments,
          houseMoodBonus: houseTier?.moodBonus || 0,
          at: Date.now(),
        },
      ],
    },
  };
}
