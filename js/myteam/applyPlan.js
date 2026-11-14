/**
 * Apply a counter-plan to a season team: starters + default system + rotation snapshot -- nothing else.
 * This is the ONLY writer in the matchup feature, and it runs only from the explicit "Apply plan" button.
 * Mutates `team` (the caller saves the season). Unknown ids are refused so a stale plan can't corrupt a lineup.
 */
import { captureRotationPlan } from "../engine/gameplan.js";

export function applyCounterPlan(team, plan) {
  if (!team || !plan?.ids?.length) return false;
  const have = new Set((team.players || []).map((p) => p.id));
  if (plan.ids.length !== 5 || !plan.ids.every((id) => have.has(id))) return false;
  team.starterIds = [...plan.ids];
  if (team.coach && plan.tacticId) {
    team.coach.specialTactics = [plan.tacticId, ...(team.coach.specialTactics || []).filter((t) => t !== plan.tacticId)];
  }
  team.rotation = captureRotationPlan(team, team.starterIds);
  return true;
}
