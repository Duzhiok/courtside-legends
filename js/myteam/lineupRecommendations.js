/**
 * Lineup recommendations under the active coach + system (Team Intelligence v3). Pure, preview-only:
 * nothing here writes a lineup; applying a recommendation is an explicit UI action that goes through saveLineup.
 *
 * Utility of a five  U = 0.40·Q + 0.30·F + 0.20·S − 0.10·R   (ANALYSIS weights, a starting point to calibrate, not a win model)
 *   Q  overall capability: mean overall blended with the five's measured strengths (offence, defence, boards, creation)
 *   F  coach + system fit: GameSim's lineupFit blended with how well the best role assignment suits the cards
 *   S  synergy: role complementarity (+ named synergies such as PnR)
 *   R  conflict load: spacing, ball crowding, missing rim protection, mismatched jobs
 *
 * Rules that keep the advice trustworthy:
 *   - every candidate gets its roles optimised from scratch; a manual role override NEVER leaks into the comparison
 *   - roles are fixed BEFORE players are swapped: if the current five is fine once its roles are reassigned, we say so
 *   - a swap needs a clear margin, and a benched star always comes with the price spelled out
 *   - no hard "protect high OVR" rule: a specialist can still win when the numbers justify it
 */
import { TACTICS } from "../data/coaches.js";
import { analyzeTeam } from "./coachDrivenAnalysis.js";
import { ovr } from "./playerRoleFit.js";

const W = { Q: 0.4, F: 0.3, S: 0.2, R: 0.1 };
export const SWAP_MARGIN = 4; // utility points a different five must win by before we suggest churn
export const STAR_MARGIN = 2.5; // ...plus this much for every OVR-90+ starter it would bench
const STAR_OVR = 90;
const TRADEOFF_DELTA = 4;
const SEV = { high: 12, medium: 6, low: 2 };

function* fives(items) {
  const n = items.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) yield [items[a], items[b], items[c], items[d], items[e]];
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

/** Utility with its parts, from a fresh (override-free) analysis of the five. */
export function lineupUtility(coach, tactic, five) {
  const a = analyzeTeam({ coach, tacticalSystem: tactic, starters: five });
  const strengths = Object.entries(a.intrinsicStrengths).filter(([k, v]) => k !== "benchDepth" && v.score != null).map(([, v]) => v.score);
  const Q = 0.5 * mean(five.map(ovr)) + 0.5 * mean(strengths);
  const F = 0.5 * a.coachSystemFit.score + 0.5 * a.roleFitAverage;
  const S = Math.min(100, a.roleFitAverage + a.tacticalSynergies.length * 4);
  const R = Math.min(100, a.conflicts.reduce((t, c) => t + (SEV[c.severity] || 0), 0) * 3);
  const U = W.Q * Q + W.F * F + W.S * S - W.R * R;
  return { U: Math.round(U * 10) / 10, parts: { Q: Math.round(Q), F: Math.round(F), S: Math.round(S), R: Math.round(R) }, analysis: a };
}

const abilityScore = (five) => Math.round(mean(five.map(ovr)) + new Set(five.map((p) => p.playPos || p.pos)).size * 2);

function bestBy(roster, score) {
  let top = null;
  for (const five of fives(roster)) {
    const s = score(five);
    if (!top || s > top.score) top = { score: s, five };
  }
  return top;
}

/** What changes going from one five to another: measured strengths gained/lost, stars benched, what they were doing. */
export function tradeoffs(fromAnalysis, toAnalysis, outPlayers, inPlayers) {
  const gains = [];
  const losses = [];
  for (const [k, v] of Object.entries(toAnalysis.intrinsicStrengths)) {
    const was = fromAnalysis.intrinsicStrengths[k]?.score;
    if (v.score == null || was == null) continue;
    if (v.score - was >= TRADEOFF_DELTA) gains.push({ key: k, from: was, to: v.score });
    else if (was - v.score >= TRADEOFF_DELTA) losses.push({ key: k, from: was, to: v.score });
  }
  const benchedStars = outPlayers.filter((p) => ovr(p) >= STAR_OVR).map((p) => ({ id: p.id, name: p.name, ovr: ovr(p), role: fromAnalysis.playerRoleFits[p.id]?.natural?.id || null }));
  const drop = outPlayers.length ? mean(outPlayers.map(ovr)) - mean(inPlayers.map(ovr)) : 0;
  return { gains, losses, benchedStars, ovrDrop: Math.round(drop * 10) / 10 };
}

/**
 * @param {{coach: object, tacticalSystem: object|string, roster: object[], currentIds?: string[]}} p
 * @returns {null|{tactic, verdict, current, best, abilityOnly, swaps, tradeoffs, differsFromAbility}}
 *   verdict: "keep" (already best) | "reassign" (fix roles, keep the five) | "swap" (clear margin for another five)
 */
export function recommendLineups({ coach, tacticalSystem, roster, currentIds = [] }) {
  const tactic = typeof tacticalSystem === "string" ? TACTICS[tacticalSystem] : tacticalSystem || TACTICS.balanced;
  const pool = (roster || []).filter(Boolean);
  if (pool.length < 5) return null;
  const curCards = currentIds.map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  const hasCurrent = curCards.length === 5;
  // Each five is judged by utility minus the bar it must clear: benching your stars needs a bigger win.
  const starsCut = (f) => (hasCurrent ? curCards.filter((p) => ovr(p) >= STAR_OVR && !f.includes(p)).length : 0);
  const top = bestBy(pool, (f) => lineupUtility(coach, tactic, f).U - starsCut(f) * STAR_MARGIN);
  const topU = lineupUtility(coach, tactic, top.five);
  const cur = hasCurrent ? lineupUtility(coach, tactic, curCards) : null;
  const abilityFive = bestBy(pool, abilityScore).five;

  const swap = !cur || topU.U - cur.U >= SWAP_MARGIN + starsCut(top.five) * STAR_MARGIN;
  const finalFive = swap ? top.five : curCards;
  const finalU = swap ? topU : cur;
  const out = hasCurrent ? curCards.filter((p) => !finalFive.includes(p)) : [];
  const incoming = hasCurrent ? finalFive.filter((p) => !curCards.includes(p)) : [];
  const ids = (xs) => xs.map((p) => p.id);
  return {
    tactic: tactic.id,
    verdict: swap ? "swap" : cur.analysis.conflicts.some((c) => c.code === "role_mismatch") ? "reassign" : "keep",
    current: cur ? { ids: ids(curCards), U: cur.U, parts: cur.parts } : null,
    best: { ids: ids(finalFive), U: finalU.U, parts: finalU.parts },
    abilityOnly: { ids: ids(abilityFive) },
    swaps: { in: ids(incoming), out: ids(out) },
    tradeoffs: cur && swap ? tradeoffs(cur.analysis, topU.analysis, out, incoming) : null,
    differsFromAbility: ids(finalFive).sort().join() !== ids(abilityFive).sort().join(),
  };
}
