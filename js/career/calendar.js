/**
 * Calendar and energy timing (A3 of docs/CAREER_LIFE_ROADMAP.md).
 *
 * Three time units from roadmap §2.1:
 * - game day: every completed user game (settlement itself is C1's job, not this module's).
 * - week: every GAMES_PER_WEEK user games played *within the current season* grants weekly
 *   energy. An 82-game regular season produces floor(82 / 4) = 20 week boundaries.
 * - offseason: a single lump energy grant between seasons.
 *
 * `gamesPlayed` throughout this module means "completed user games so far THIS SEASON" (resets
 * to 0 when a new season starts) -- not a career-long cumulative count, so week numbering lines
 * up with each season instead of drifting across multi-season (and later multi-stint) careers.
 *
 * Nothing here is wired into actual gameplay yet; that's for later phases once the loop that
 * tracks `gamesPlayed` and calls onGameCompleted() per game actually exists.
 */
import { grantEnergy } from "./coachProfile.js";
import { OFFSEASON_ENERGY, WEEKLY_ENERGY } from "./balance.js";

export const GAMES_PER_WEEK = 4;

/** True exactly on the game that completes a week (the 4th, 8th, 12th, ... game of the season). */
export function isWeekBoundary(gamesPlayed, gamesPerWeek = GAMES_PER_WEEK) {
  return Number.isInteger(gamesPlayed) && gamesPlayed > 0 && gamesPlayed % gamesPerWeek === 0;
}

/** How many complete weeks have elapsed after `gamesPlayed` games this season. */
export function weeksElapsed(gamesPlayed, gamesPerWeek = GAMES_PER_WEEK) {
  const played = Number.isFinite(gamesPlayed) ? gamesPlayed : 0;
  return Math.max(0, Math.floor(played / gamesPerWeek));
}

/**
 * Placeholder "do nothing with the energy" preset. Phase E (off-court activities) will replace
 * this with something that actually spends the grant during bulk simulation; until then energy
 * just resets each window and nothing consumes it. The `{ id, apply(coach) }` shape is fixed now
 * so later code calling advanceWeek()/advanceOffseason() doesn't need to change when E adds a
 * real preset -- only what `apply` does changes.
 */
export const NULL_SCHEDULE_PRESET = {
  id: "none",
  apply(coach) {
    return coach;
  },
};

/**
 * Grant weekly energy, then let the schedule preset auto-spend it. This is the one function a
 * bulk-simulation loop should call per elapsed week -- it never prompts, so simulating a whole
 * season never pops up a per-week dialog (roadmap principle 5).
 */
export function advanceWeek(coach, preset = NULL_SCHEDULE_PRESET) {
  return preset.apply(grantEnergy(coach, WEEKLY_ENERGY));
}

/** Same idea as advanceWeek(), but the once-per-offseason lump grant. */
export function advanceOffseason(coach, preset = NULL_SCHEDULE_PRESET) {
  return preset.apply(grantEnergy(coach, OFFSEASON_ENERGY));
}

/**
 * Call this once per completed user game (gamesPlayed = total completed this season, including
 * the one that just finished). If that game crossed a week boundary this grants weekly energy
 * (running `preset` on it); otherwise the coach is returned unchanged. Callers don't need to
 * duplicate the week-boundary math themselves.
 */
export function onGameCompleted(
  coach,
  gamesPlayed,
  { gamesPerWeek = GAMES_PER_WEEK, preset = NULL_SCHEDULE_PRESET } = {},
) {
  if (!isWeekBoundary(gamesPlayed, gamesPerWeek)) return coach;
  return advanceWeek(coach, preset);
}
