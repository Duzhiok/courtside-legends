/**
 * B4 of docs/CAREER_LIFE_ROADMAP.md: a "stint" is one continuous tenure at one team. It can span
 * multiple contract renewals (B3) without ending -- a renewal just starts a fresh contract term
 * at the SAME team, governed by that offer's own `years` (see careerContract.js's
 * contractExpired()). A stint only ends when the coach actually leaves that team: fired, or
 * departs after declining a renewal today; a future B5/B6/B7 add re-employment, poaching, and
 * retirement as more ways a stint can end (and a new one begin).
 *
 * root.coach.stints holds only COMPLETED stints. The one currently in progress is never
 * duplicated into it -- it's always derived live from careerContract.js's careerPerformance()
 * plus root.story.employer/employment, the same single-source-of-truth rule every other derived
 * career value in this codebase already follows (e.g. nothing re-stores what performance.js can
 * recompute from root.leagueCareer.management.seasonHistory).
 *
 * Pure module, no gameplay wiring of its own: careerContract.js calls buildStintRecord() at the
 * exact moment a tenure ends (fired or departed) and appends the result to root.coach.stints.
 */

function requireRoot(root) {
  if (!root?.story || !root?.leagueCareer) {
    throw new TypeError("root with a career story is required");
  }
}

/**
 * Build a completed-stint record for the tenure that is ending right now. `performance` is
 * whatever careerContract.js's careerPerformance(root) already computed for this call -- passed
 * in rather than recomputed so this stays a pure function of data the caller already has.
 */
export function buildStintRecord(root, performance, reason) {
  requireRoot(root);
  return {
    teamId: root.story.employer,
    startYear: root.story.startYear ?? null,
    endYear: root.leagueCareer.season?.year ?? null,
    seasons: performance.seasons,
    wins: performance.wins,
    losses: Math.max(0, performance.games - performance.wins),
    championships: performance.championships,
    reason,
  };
}
