/**
 * Historical-team lookups, shared by the story and UI layers.
 *
 * These are pure reads over the generated `historicalSeasons.js` data (that
 * file is auto-generated — do not add hand-written helpers to it). They used
 * to live in `js/ui/timeTravel/viewModel.js`, which forced `js/story/` to
 * import from `js/ui/` (A-P2-3); the view model now imports from here instead.
 * `teamColorsFor`/`teamCore` still live in the view model for now — same
 * lookup family, separate scheduling.
 */
import { historicalSeason } from "./historicalSeasons.js";

/** Display name for a team in a given historical year (stints only store the id). */
export function teamNameFor(year, teamId) {
  const meta = historicalSeason(year)?.teams?.find((team) => team.id === teamId);
  return meta?.name || teamId;
}
