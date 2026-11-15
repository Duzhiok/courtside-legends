/**
 * Shared tuning constants (A-P2-7 direction: generic tuning lives in core/,
 * career/ keeps only career-specific constants).
 *
 * Moved here from js/career/balance.js so lower layers can use a tuning
 * value without importing the career layer: js/engine/developmentRules.js
 * needs GROWTH_CARRYOVER for carriedDeltas (A-P2-6). career/balance.js
 * re-exports these names, so existing imports keep working.
 */

/** Share of a season's growth that survives into the next year's real card (rounded half up). */
export const GROWTH_CARRYOVER = 0.5;
