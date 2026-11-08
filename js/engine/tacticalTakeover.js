/**
 * M3 tactical takeover — regular-game DecisionAdapter (ROADMAP §6).
 *
 * Extends the M2b DecisionAdapter pattern (ClutchController's { ok, reason }
 * shape + validation before any engine call) from the clutch possession to
 * ordinary tactical operations: setFocusPlay / setTempo, reusing the
 * FOCUS_PLAYS / TEMPO_OPTIONS tables in gameplan.js.
 *
 * This is only a UI wrapper over existing GameSim APIs — the same calls the
 * dead-ball panel already makes. It adds one thing the dead-ball panel does
 * not: it may be used while the ball is live ("takeover"). The engine calls
 * themselves are plain state writes (no dice, no new rules), so calling them
 * live changes nothing about how a possession resolves; the next possession
 * simply reads the new focus / tempo. Hiding or disabling the panel calls
 * nothing at all, so the simulation is unaffected.
 *
 * Reasons mirror the clutch contract: "no_sim" | "game_over" | "invalid".
 */

import { FOCUS_PLAYS, TEMPO_OPTIONS, normalizeTempo } from "./gameplan.js";

export const TAKEOVER_REASONS = Object.freeze(["no_sim", "game_over", "invalid"]);

export function createTacticalTakeover({ sim } = {}) {
  const needSim = () =>
    sim && typeof sim.setFocusPlay === "function" && typeof sim.setTempo === "function"
      ? null
      : { ok: false, reason: "no_sim" };
  const needLive = () => (sim.running === false || sim.ended ? { ok: false, reason: "game_over" } : null);

  return {
    /** Set the possession focus for ~6 offensive possessions ("" clears it). Live-ball safe. */
    setFocus(focusId) {
      const err = needSim() || needLive();
      if (err) return err;
      if (!focusId) {
        sim.focusPlay = null;
        return { ok: true, focusId: null };
      }
      if (!FOCUS_PLAYS.some((f) => f.id === focusId)) return { ok: false, reason: "invalid" };
      const applied = sim.setFocusPlay(focusId);
      return applied ? { ok: true, focusId } : { ok: false, reason: "invalid" };
    },

    /** Set the game tempo (grind / normal / push). Live-ball safe. */
    setTempo(tempoId) {
      const err = needSim() || needLive();
      if (err) return err;
      const id = normalizeTempo(tempoId);
      if (!TEMPO_OPTIONS.some((t) => t.id === id)) return { ok: false, reason: "invalid" };
      sim.setTempo(id);
      return { ok: true, tempoId: id };
    },

    /** Current focus + tempo, for the panel's status line. */
    current() {
      if (!sim) return { focusPlay: null, tempo: "normal" };
      let tempo = "normal";
      try {
        tempo = sim.you?.()?.gameplan?.tempo || sim.youTempo?.()?.id || "normal";
      } catch {
        tempo = "normal";
      }
      return { focusPlay: sim.focusPlay ? { ...sim.focusPlay } : null, tempo };
    },
  };
}
