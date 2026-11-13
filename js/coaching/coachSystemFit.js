/**
 * Coach-System Fit (Team Intelligence v3).
 *
 * The score IS `lineupFit(players, coach, tactic)` — the same number GameSim feeds into shot quality — so this part of
 * the analysis is sim-backed, not decoration. We only add a traceable breakdown of where the points come from, and the
 * coach's proficiency with the system (native vs off-system), which is shown as context.
 */
import { lineupFit } from "../engine/chemistry.js";
import { systemFitScore } from "../data/intangibles.js";
import { systemProficiency } from "./coachTacticalProfile.js";

const HIT_PREFERRED = 6; // mirrors lineupFit()
const HIT_NEED = 5;

export function coachSystemFit(coach, tactic, players) {
  const list = (players || []).filter(Boolean);
  if (!list.length) return { score: 0, simBacked: true, proficiency: 0, parts: [] };
  const score = Math.max(0, Math.min(100, Math.round(lineupFit(list, coach, tactic))));
  const arch = list.map((p) => p.archetype);
  const prefHits = arch.filter((a) => (coach?.preferred || []).includes(a)).length;
  const needHits = arch.filter((a) => (tactic?.needs || []).includes(a)).length;
  return {
    score,
    simBacked: true,
    proficiency: systemProficiency(coach, tactic?.id),
    parts: [
      { key: "preferred", points: prefHits * HIT_PREFERRED, detail: prefHits },
      { key: "needs", points: needHits * HIT_NEED, detail: needHits },
    ],
  };
}

/** Per-player system fit (sim-backed: GameSim multiplies play by hiddenPlayFactor, which reads this). */
export function playerSystemFit(player, coach, tactic) {
  return Math.round(systemFitScore(player, coach, tactic));
}
