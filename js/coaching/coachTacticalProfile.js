/**
 * Coach tactical profile (Team Intelligence v3). DATA-DRIVEN: everything is derived from the coach card's own config
 * (`specialTactics`, `preferred`, `buffs`) — no coach is special-cased by name, so a new coach card needs no code here.
 *
 * What the game really does with a coach (so the labels below stay honest):
 *   - `specialTactics` + roster unlocks + balanced/pack_paint are the tactics the sim lets you pick (availableTactics).
 *   - `preferred` archetypes feed lineupFit() and systemFitScore() — both are read by GameSim (shot quality / hidden play factor).
 */
import { TACTICS, availableTactics, coachTactics } from "../data/coaches.js";

const OFF_SYSTEM = 0.6; // a tactic the coach doesn't specialise in: allowed, executed less convincingly
const NEUTRAL = 0.85; // balanced / stance tactics every coach can run

export function coachProfile(coach) {
  const buffs = coach?.buffs || {};
  const off = buffs.offense ?? 5;
  const def = buffs.defense ?? 5;
  const lean = off - def >= 3 ? "offense" : def - off >= 3 ? "defense" : "balanced";
  return {
    id: coach?.id || null,
    nativeSystems: coachTactics(coach).map((t) => t.id),
    preferredArchetypes: [...(coach?.preferred || [])],
    philosophy: lean,
  };
}

/** 0..1 — how at home this coach is with a system. */
export function systemProficiency(coach, tacticId) {
  if (coachProfile(coach).nativeSystems.includes(tacticId)) return 1;
  const t = TACTICS[tacticId];
  if (!t || t.group === "stance" || t.group === "team_state" || tacticId === "balanced") return NEUTRAL;
  return OFF_SYSTEM;
}

/** The systems this coach can actually run with this roster, with where each one comes from. */
export function selectableSystems(coach, players = []) {
  const native = new Set(coachProfile(coach).nativeSystems);
  return availableTactics(coach, players).map((t) => ({
    id: t.id,
    tactic: t,
    native: native.has(t.id),
    proficiency: systemProficiency(coach, t.id),
    source: native.has(t.id) ? "coach" : t.id === "balanced" || t.id === "pack_paint" ? "open" : "roster",
  }));
}

/** Best system for this coach + roster by the sim-backed fit (see coachSystemFit); used as the default preview. */
export function defaultSystem(coach, players = []) {
  const sys = selectableSystems(coach, players);
  return (sys.find((s) => s.native) || sys[0])?.id || "balanced";
}
