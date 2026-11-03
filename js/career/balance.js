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

/** --- Phase C5: coach XP and perks (roadmap C5, §2.3) --- */

/** Coach XP per finished game. A .500 regular season is ~450 XP: level 1 -> 3 in year one, then
 * slower (level N needs N * COACH_XP_PER_LEVEL), so the 12-point tree takes well over a decade. */
export const COACH_XP_WIN = 8;
export const COACH_XP_LOSS = 3;
/** A win over a team whose top-8 OVR (seasonGoals.teamRosterStrength) is at least this much higher. */
export const COACH_XP_UPSET_GAP = 3;
export const COACH_XP_UPSET = 6;
export const COACH_XP_PLAYOFF_MULTIPLIER = 2;

/** Per perk level. Each is small on purpose (principle 6): a perk nudges, it never decides a game. */
/** Tactician: relative make chance of your team's shots (engine/sim.js, next to lineup fit). Not a fit
 * bonus: fit is clamped at 96 and real lineups sit there half the time, so a fit perk would often do nothing. */
export const PERK_TACTICS_SHOT = 0.005;
/** Player development: in-season player XP (career/playerGrowth.js) multiplier, per level. */
export const PERK_DEVELOPMENT_XP = 0.1;
/** Negotiator: added to every season's salary (career/finance.js currentCoachSalary). */
export const PERK_NEGOTIATION_SALARY = 1;
/** Media savvy: a season's reputation LOSS shrinks by this much (career/reputation.js); never becomes a gain. */
export const PERK_MEDIA_SOFTEN = 1;

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
export const RENEWAL_TRIAL_GOAL_RATE = 0.45;
// Why 0.45 and not lower: two goals missed in a row is a firing, so a coach who is still employed at his
// first renewal (five goals) has missed at most three -- a hit rate of at least 0.4. A threshold below that
// (it was 0.34) can never be met, which made the trial offer dead content. 0.45 admits exactly the worst
// records a coach can survive and nothing better (3 of 5 is 0.6, and still gets the usual pair).

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

// ---------------------------------------------------------------- B7: retirement and legacy
/** Legacy score = titles + win rate + longevity + standing. Every term has a ceiling in practice
 * (win rate above .500 is the only open-ended one and is physically bounded by 1.000), so a tier is
 * earned by a mix, not by farming a single stat. Worked examples live in tests/legacy.test.js. */
export const LEGACY_TITLE_POINTS = 12;
/** Points per 1.000 of career win rate ABOVE .500 (a .650 career is worth 15). Below .500 is 0, not negative. */
export const LEGACY_WIN_PCT_POINTS = 100;
export const LEGACY_SEASON_POINTS = 0.5;
/** Seasons past this stop adding points: longevity helps, it doesn't buy a Hall of Fame plaque. */
export const LEGACY_SEASON_CAP = 30;
/** Reputation is 0-100, so at most 25 points. */
export const LEGACY_REPUTATION_POINTS = 0.25;
/** Lowest score of each tier above "brief". */
export const LEGACY_TIER_MIN = { hallOfFame: 80, great: 55, solid: 35, journeyman: 15 };

// ---------------------------------------------------------------- C2: player XP and in-season growth
/** XP a player needs for one level. A starter earns ~35-45 XP a game, so a young starter levels about
 * every 27 games and a bench rookie (10 min, quiet nights) barely once a season: minutes matter. */
export const GROWTH_XP_PER_LEVEL = 1200;
/** XP = minutes x performance x youth. Performance maps a Game Score (the same yardstick as the card's
 * "本场最佳") onto a multiplier: a 0-score night counts 0.6, a 10 counts 1.1, a 30+ night caps at 2. */
export const GROWTH_PERF_BASE = 0.6;
export const GROWTH_PERF_PER_SCORE = 0.05;
export const GROWTH_PERF_MIN = 0.5;
export const GROWTH_PERF_MAX = 2;
/** By age: how fast XP comes in, and how many +1 levels a player can bank in ONE season. Veterans
 * past 32 earn nothing in-season: the real curve already has them declining, we don't fight it. */
export const GROWTH_AGE_TABLE = [
  { maxAge: 21, xp: 1.6, levels: 4 },
  { maxAge: 24, xp: 1.35, levels: 3 },
  { maxAge: 28, xp: 1.0, levels: 2 },
  { maxAge: 32, xp: 0.7, levels: 1 },
  { maxAge: Infinity, xp: 0.45, levels: 0 },
];
/** An attribute may climb to the best value it ever had on the player's REAL later cards, plus this.
 * The slack is the "you changed his timeline" part; without a real career (generated rookies) only
 * the per-season level cap applies. */
export const GROWTH_CEILING_SLACK = 1;
/** Share of a season's growth that survives into the next year's real card (rounded half up). */
export const GROWTH_CARRYOVER = 0.5;

// ---------------------------------------------------------------- C4: highlights and market buzz
// "Buzz" is how loudly the trade market is talking about a player right now. (Not C3's "heating up",
// which is a skill-streak; the two never share a name in code.)
/** Highlight nights, one line per kind. Scoring is one ladder (a 40-point night is not also a 30). */
export const HIGHLIGHT_SCORING = [
  { id: "pts40", min: 40, points: 4 },
  { id: "pts30", min: 30, points: 2 },
];
export const HIGHLIGHT_BLOCKS = { min: 5, points: 2 };
export const HIGHLIGHT_THREES = { min: 8, points: 2 };
/** Ten or more in three of points / rebounds / assists / steals / blocks. */
export const HIGHLIGHT_TRIPLE_DOUBLE = { categories: 3, min: 10, points: 3 };
/** One night can only add this much, however many boxes it ticks. */
export const BUZZ_GAME_CAP = 6;
/** Each team game, old buzz is multiplied by this before the night's points are added: a 40-point
 * night (4) is still "hot" for about three more games, then cools off. */
export const BUZZ_DECAY = 0.8;
export const BUZZ_MAX = 10;
/** At or above this a player counts as hot: the market notices him and prices him up. */
export const BUZZ_HOT = 2;
/** What a buyer will add to his value, in OVR, per point of buzz (capped). */
export const BUZZ_BONUS_PER_POINT = 0.75;
export const BUZZ_MAX_BONUS = 4;
/** From this much buzz a club throws in one more pick. */
export const BUZZ_EXTRA_PICK = 4;

// ---------------------------------------------------------------- C6: game goals and the hand-play bonus
/** Goals set before every game of a managed career. The first one always counts; the second only when you coach the game yourself. */
export const GAME_GOALS_PER_GAME = 2;
/** Playing the game yourself pays player XP and coach XP x1.5 (docs/CAREER_LIFE_ROADMAP.md 2.2). */
export const HAND_PLAY_XP_MULTIPLIER = 1.5;
/** Each goal you meet adds this to that game's XP multiplier (two goals + hand-play: 1.5 x 1.5 = x2.25). */
export const GAME_GOAL_XP_BONUS = 0.25;
/**
 * Thresholds. Measured on the real engine (6 real 1995 teams x 30 games, then 1985 / 2005 / 2016 with
 * a strong, a middling and a weak team): each is met in roughly a quarter to a half of the games, and
 * none moves with the era -- assists 31-33, steals 9-10, turnovers 18-19 and double-figure scorers
 * 4.1-4.5 a game in every season measured. A "N threes" goal was left out on purpose: the same teams
 * made 0.1 (1985), 4.8 (1995) and 7.9 (2016) a game, so any one number is free in one era and
 * impossible in another.
 */
export const GOAL_MARGIN = 10;
export const GOAL_ASSISTS = 35;
export const GOAL_STEALS = 11;
export const GOAL_MAX_TURNOVERS = 16;
export const GOAL_DOUBLE_FIGURE_SCORERS = 5;
export const GOAL_DOUBLE_FIGURE_POINTS = 10;
/** Same bar as the first scoring highlight (C4), so "a 30-point night" means one thing everywhere. */
export const GOAL_STAR_POINTS = HIGHLIGHT_SCORING.at(-1).min;
/** The young-player goal: somebody this young plays at least this long. */
export const GOAL_ROOKIE_MAX_AGE = 23;
export const GOAL_ROOKIE_MINUTES = 20;
