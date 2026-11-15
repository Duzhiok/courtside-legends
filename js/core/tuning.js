/**
 * Shared tuning constants (A-P2-7 direction: generic tuning lives in core/,
 * career/ keeps only career-specific constants).
 *
 * Moved here from js/career/balance.js so lower layers can use a tuning
 * value without importing the career layer: js/engine/developmentRules.js
 * needs GROWTH_CARRYOVER for carriedDeltas (A-P2-6); js/engine/tradeProposals.js
 * and js/data/buzz.js need the buzz cluster (A-P2-7). career/balance.js
 * re-exports these names, so existing imports keep working.
 */

/** Share of a season's growth that survives into the next year's real card (rounded half up). */
export const GROWTH_CARRYOVER = 0.5;

// ---------------------------------------------------------------- C4: highlights and market buzz
// "Buzz" is how loudly the trade market is talking about a player right now.
// (Moved here from js/career/balance.js, A-P2-7; see that file's C4 note.)
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
