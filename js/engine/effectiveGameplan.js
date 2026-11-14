/**
 * The ONE answer to "what lineup / system / rotation does the user's team actually play with in this game?"
 * Shared by every entry point: 亲自指挥 (openSetup) and every simulated game (simScheduledGame -> liveTeam),
 * regular season and playoffs alike.
 *
 * Priority:  opponent-bound matchup plan  ->  the team's saved default gameplan  ->  engine default.
 * A matchup plan is bound to one opponent: games against anybody else fall back to the default, so a plan built
 * to stop Shaq never silently follows the team into a batch of unrelated games. Pure -- never mutates the team.
 */
import { captureRotationPlan } from "./gameplan.js";

/** The team's matchup plan if it was built for `opponentId`, else null. */
export function matchupPlanFor(team, opponentId) {
  const m = team?.matchupPlan;
  return m && opponentId && m.opponentId === opponentId && m.rotation ? m : null;
}

/** { source: "matchup" | "default" | "engine", plan: rotation plan or null, planId } */
export function resolveEffectiveGameplan(team, { opponentId = null } = {}) {
  const m = matchupPlanFor(team, opponentId);
  if (m) return { source: "matchup", plan: m.rotation, planId: m.planId || null };
  // Re-capture the default from the live fields every time (an unsaved minutes edit must not be reverted by a
  // stale `team.rotation` snapshot -- same reason openSetup re-captures).
  if (team?.starterIds?.length >= 5) return { source: "default", plan: captureRotationPlan(team, team.starterIds), planId: null };
  return { source: "engine", plan: null, planId: null };
}
