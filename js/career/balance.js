/**
 * Centralized tuning numbers for the time-travel coach's personal life/career
 * layer (docs/CAREER_LIFE_ROADMAP.md). One file so later phases (B-F) don't
 * each invent their own magic numbers scattered across modules.
 *
 * This file only grows as later roadmap steps land; it intentionally starts
 * small with just what phase A needs.
 */

/** Starting age when a new time-travel career begins. */
export const COACH_START_AGE = 35;

/** Mandatory retirement age (roadmap B7). */
export const COACH_RETIRE_AGE = 70;

export const COACH_START_REPUTATION = 50;
export const COACH_START_MOOD = 60;

/** The four perk lines from the roadmap: tactics / player development / negotiation / media. */
export const COACH_PERK_LINES = ["tactics", "development", "negotiation", "media"];

/** Each perk line caps at 3 levels (roadmap §2.3). */
export const COACH_PERK_MAX_LEVEL = 3;

/** Flat XP curve for now: level N needs N * this much XP to reach N+1. Can grow a real curve later. */
export const COACH_XP_PER_LEVEL = 100;

/** Energy granted at the start of each in-season week (roadmap §2.1). */
export const WEEKLY_ENERGY = 3;

/** Energy granted once per offseason (roadmap §2.1). */
export const OFFSEASON_ENERGY = 10;

/** --- Phase B1: season goals (roadmap B1) --- */

/** How many of a team's best players (by OVR) count toward its roster-strength score, used to
 * bucket season-goal difficulty into rebuild / middle / contender. Matches the methodology the
 * opening interview offers already use (js/modes/timeTravelCareer.js's teamStrength()). */
export const GOAL_ROSTER_STRENGTH_SAMPLE = 8;

/** Regular-season win rate a "rebuild"-tier team's goal asks for -- avoid a full tank, not "contend". */
export const REBUILD_WIN_RATE_GOAL = 0.35;

/** Front-office trust swing when a season goal is judged at year's end. */
export const SEASON_GOAL_TRUST_BONUS = 6;
export const SEASON_GOAL_TRUST_PENALTY = -8;

/** --- Phase B2: firing escalation (roadmap B2) --- */

/** Front office trust below this floor is fireable on its own, independent of win rate or goals.
 * Starting trust across the three interview archetypes is 45-58 (timeTravelCareer.js's
 * OFFER_DETAILS) and a single missed season goal costs SEASON_GOAL_TRUST_PENALTY (-8), so this
 * floor takes a real sustained slide to reach -- not one bad event. */
export const FIRING_TRUST_FLOOR = 15;

/** --- Phase B3: dynamic renewal offers (roadmap B3) --- */

/** Full-tenure (not just the last two seasons, unlike B2's firing check) goal hit rate at or
 * below which a ringless tenure gets boiled down to a single one-year trial offer instead of the
 * usual rebuild/contender pair. */
export const RENEWAL_TRIAL_GOAL_RATE = 0.34;

/** Coach reputation (root.coach.reputation, 0-100, starts at COACH_START_REPUTATION) below this
 * is also required for the trial-only outcome -- a ringless but well-regarded coach (good goal
 * record elsewhere, strong reputation from other phases) still gets the normal menu. */
export const RENEWAL_TRIAL_REPUTATION_CEILING = 40;

/** Two or more championships during the tenure unlocks a third, stronger "dynasty" offer on top
 * of the usual pair -- the menu only ever adds a better option for a great tenure, it never
 * removes the familiar rebuild/contender choice. */
export const RENEWAL_DYNASTY_CHAMPIONSHIPS = 2;

/** --- Phase E3: personal finance (roadmap E3) --- */

/** Flat annual pay before any B3 renewal has ever set a real contract salary -- the initial
 * five-year hire (timeTravelCareer.js's OFFER_DETAILS) negotiates authority/trust/pressure but
 * never a dollar figure, so this is what's paid in the meantime. Scaled to sit between
 * trial-extension (4) and rebuild-extension (7) in careerContract.js's OFFER_TEMPLATES. */
export const COACH_BASE_SALARY = 5;

/** House tiers: a one-time purchase cost and a small recurring per-season mood bump paid out
 * alongside salary (see js/career/finance.js's settleCoachFinances()). Deliberately does NOT
 * touch a "family satisfaction" stat -- nothing in the game reads one yet, so inventing it here
 * would be the same unwired-field mistake A1 warns against; that belongs with a future
 * relationships-focused increment. */
export const HOUSE_TIERS = {
  apartment: { label: "公寓", cost: 20, moodBonus: 2 },
  house: { label: "独栋别墅", cost: 60, moodBonus: 5 },
  mansion: { label: "豪宅", cost: 150, moodBonus: 9 },
};

/**
 * Investment asset classes, keyed by the in-story year they become available (an era can't
 * invest in something that doesn't exist yet -- 1960 has no tech stocks, let alone crypto).
 * baseReturn/volatility drive the REAL roll (finance.js's rollInvestmentReturn), which is always
 * divergence-independent -- divergence only blurs the forecast preview, never the market itself.
 */
export const INVESTMENT_ASSET_CLASSES = {
  1950: [{ id: "bonds", label: "国债", baseReturn: 0.03, volatility: 0.02 }],
  1980: [{ id: "blue-chip", label: "蓝筹股", baseReturn: 0.08, volatility: 0.12 }],
  2000: [{ id: "tech-stocks", label: "科技股", baseReturn: 0.11, volatility: 0.25 }],
  2012: [{ id: "crypto", label: "加密货币", baseReturn: 0.18, volatility: 0.55 }],
};

/** Forecast accuracy decays to this floor as timelineDivergence climbs -- never hits exactly 0,
 * so there is always SOME signal in the hint, just a very noisy one. */
export const INVESTMENT_FORECAST_MIN_ACCURACY = 0.15;

/** Divergence at which forecast accuracy would hit 0 before the floor above clamps it -- i.e. how
 * fast "you've changed history too much to remember how this market went" sets in. */
export const INVESTMENT_FORECAST_DIVERGENCE_FALLOFF = 40;

/** Fixed stake per investment click -- keeps the UI to one button per asset class instead of a
 * free-form amount input. Scaled against HOUSE_TIERS.apartment's cost (20) so a few seasons of
 * investing is a meaningful alternative to saving straight for a house, not a rounding error. */
export const INVESTMENT_STAKE = 10;
