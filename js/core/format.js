/**
 * Shared formatting helpers — the single source for pure display formatting.
 *
 * A-P2-16: fmtClock was defined three times with different rounding
 * (app.js used floor, js/online/client.js used round,
 * js/ui/coachingMomentView.js used ceil). Canonical rule is floor, matching
 * the main live-game clock in app.js and standard game-clock display
 * (12.6s remaining shows 0:12, not 0:13). The sim clock is fractional
 * (possessions burn rand(8, 20) / pace seconds), so the other two call sites
 * can show 1s less than before when the fraction is >= 0.5 — an intentional
 * display-rounding unification, not a sim change.
 */

/**
 * Format a game-clock value in seconds as "M:SS".
 * Fractional seconds are floored; null/undefined/NaN/negative input shows 0:00.
 */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
