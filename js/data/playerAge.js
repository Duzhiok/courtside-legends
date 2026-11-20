/**
 * Player age resolution (A-P2-6 residue): a pure data rule, not a mode rule.
 *
 * Moved verbatim from js/modes/playerDevelopment.js. The career layer
 * (gameGoals, playerGrowth) used to import `resolvedAge` from modes/, which
 * is the wrong direction for a shared pure helper — career and modes both
 * read it, so it lives in the data layer with the other pure player rules
 * (playerMinutes.js, epiphany.js). js/modes/playerDevelopment.js re-exports
 * it so that module's public API is unchanged.
 */
import { estimateAge } from "./careerArc.js";

/**
 * A player's age for growth/goal rules: the card's own `age` when present,
 * otherwise the estimate from their real career span (data/careerArc.js).
 */
export function resolvedAge(player) {
  const age = Number(player?.age);
  return Number.isFinite(age) && player?.age !== null ? age : estimateAge(player);
}
