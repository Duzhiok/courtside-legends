/**
 * Apply a counter-plan for ONE opponent. Writes only `team.matchupPlan` (opponent-bound); the saved default
 * starters / system / rotation are left untouched, so the plan never leaks into games against other teams.
 * resolveEffectiveGameplan() is the single reader. This is the only writer in the matchup feature and runs only
 * from the explicit "Apply plan" button. Unknown ids are refused so a stale plan can't corrupt a lineup.
 */
import { captureRotationPlan } from "../engine/gameplan.js";

const STARTER_MIN = 28;
const BENCHED_MAX = 24;

/** The rotation plan a matchup plan plays with: the plan's five + system, minutes nudged to match the new roles. */
export function matchupRotation(team, plan) {
  const rot = captureRotationPlan(team, plan.ids);
  const five = new Set(plan.ids);
  const oldFive = new Set(team.starterIds || []);
  for (const p of rot.players) {
    if (five.has(p.id)) p.targetMinutes = Math.max(p.targetMinutes, STARTER_MIN);
    else if (oldFive.has(p.id)) p.targetMinutes = Math.min(p.targetMinutes, BENCHED_MAX);
  }
  if (plan.tacticId) rot.specialTactics = [plan.tacticId, ...rot.specialTactics.filter((t) => t !== plan.tacticId)];
  return rot;
}

export function applyCounterPlan(team, plan, opponentId) {
  if (!team || !opponentId || !plan?.ids?.length) return false;
  const have = new Set((team.players || []).map((p) => p.id));
  if (plan.ids.length !== 5 || !plan.ids.every((id) => have.has(id))) return false;
  team.matchupPlan = { opponentId, planId: plan.id || null, tacticId: plan.tacticId || null, rotation: matchupRotation(team, plan) };
  return true;
}

/** Drop the matchup plan (back to the saved default). Returns whether anything changed. */
export function clearMatchupPlan(team) {
  if (!team?.matchupPlan) return false;
  delete team.matchupPlan;
  return true;
}
