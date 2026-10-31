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

/** --- Phase B4: multi-stint careers (roadmap B4) --- */

/** Contract length (years) for the very first hire. The opening interview offer
 * (timeTravelCareer.js's OFFER_DETAILS) negotiates authority/trust/pressure but never a contract
 * length, so this is what governs when the first renewal-or-firing decision comes due. This used
 * to be a literal lifetime cap ("the chapter always ends at season 5"); now it's just the
 * STARTING contract's length -- every renewal after that is governed by its own `years` from
 * careerContract.js's OFFER_TEMPLATES, and a tenure can run through as many contracts, at the
 * same team, as the coach keeps earning. */
export const INITIAL_CONTRACT_YEARS = 5;

/** --- Phase B5: re-employment after being fired/departing (roadmap B5) --- */

/** root.coach.reputation at or above which a fired/departed coach sees the full 3-offer board
 * (rebuild/middle/contender), identical to a brand-new hire. Below it, nobody trusts you with a
 * contender yet; below REEMPLOYMENT_LIMITED_BOARD_REPUTATION, only a bottom-feeder will take a
 * chance on you at all. The board is NEVER empty, even at reputation 0 -- a true zero-offer dead
 * end would permanently soft-lock the save with no way to ever coach again, which is worse than
 * a bad offer. */
export const REEMPLOYMENT_FULL_BOARD_REPUTATION = 55;

/** Below REEMPLOYMENT_FULL_BOARD_REPUTATION but at or above this: rebuild + middle offers only.
 * Below this floor: a single rebuild offer, guaranteed. */
export const REEMPLOYMENT_LIMITED_BOARD_REPUTATION = 30;

/** --- Phase B6: coach reputation moves, and poaching (roadmap B6) --- */

/** Until B6 nothing ever CHANGED root.coach.reputation: it was set once at hire (50 + the origin's
 * nudge) and then read by B3's renewal menu and B5's job board -- so those tiers only ever saw the
 * starting value, and a championship coach was treated like a rookie. Reputation is now settled
 * once per finished season from how it went. A title is worth more than any record band (they don't
 * stack), and the board goal stacks on top. */
export const REPUTATION_CHAMPIONSHIP = 8;
/** Win rate at/above this earns REPUTATION_GOOD_SEASON ... */
export const REPUTATION_GOOD_WIN_RATE = 0.6;
export const REPUTATION_GOOD_SEASON = 4;
/** ... at/above this (but below the line above) earns REPUTATION_WINNING_SEASON ... */
export const REPUTATION_WINNING_WIN_RATE = 0.5;
export const REPUTATION_WINNING_SEASON = 2;
/** ... and below this costs REPUTATION_BAD_SEASON (negative). Between .400 and .500: no change. */
export const REPUTATION_BAD_WIN_RATE = 0.4;
export const REPUTATION_BAD_SEASON = -3;
export const REPUTATION_GOAL_HIT = 2;
export const REPUTATION_GOAL_MISS = -2;

/** Reputation below this never attracts a poacher. Starting reputation is 50, so the first offer
 * has to be EARNED -- roughly two strong seasons, or one title plus a decent year. */
export const POACH_MIN_REPUTATION = 65;
/** A coach who just arrived hasn't proven anything: at least this many finished seasons in the
 * CURRENT stint before another team comes calling. */
export const POACH_MIN_SEASONS_IN_STINT = 2;
/** After any offer (accepted, declined or lapsed) no new one for this many seasons. */
export const POACH_COOLDOWN_SEASONS = 2;
/** Chance an eligible coach gets an offer in a given offseason: BASE at the threshold, plus
 * PER_REPUTATION for every point above it, never more than MAX (no guaranteed offers). */
export const POACH_BASE_CHANCE = 0.4;
export const POACH_CHANCE_PER_REPUTATION = 0.01;
export const POACH_MAX_CHANCE = 0.75;
/** Walking out on a team mid-contract costs a little standing... */
export const POACH_ACCEPT_REPUTATION_DELTA = -3;
/** ...while turning the offer down is noticed upstairs: front-office trust goes up. */
export const POACH_DECLINE_TRUST_BONUS = 5;
/** A club that goes out of its way to hire you pays for it. Without these two the move was pure
 * loss (a contender's offer carries trust 45 / pressure 80, and the salary never changed), so no
 * sensible player would ever say yes. The trust bonus roughly cancels the cold start (45 -> 60);
 * the pressure and low authority of a contender job stay as the real price. Salary sits above the
 * ¤5 base and the rebuild renewal (7), below the contender renewal (13). */
export const POACH_SIGNING_TRUST_BONUS = 15;
export const POACH_SIGNING_SALARY = 9;
