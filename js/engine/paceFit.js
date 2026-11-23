/**
 * Pace that depends on who is playing and how the game stands, instead of one fixed number (B26, docs/implementation/b26-pace-adaptation-design.md).
 *
 *   rush cost   - the `push` tempo's penalties (-0.024 make, -0.035 open, x1.22 turnovers) used to be the same for every lineup. Now they scale with the
 *                 lineup's running fit (speed and freshness): a team that can run absorbs the rush, a slow or tired one pays more.
 *                 Only COSTS scale; the benefits of a tempo (grind's gains, push's extra possessions) are untouched.
 *   chase pace  - the late-game chase used to be x1.38 whether the team trailed by 2 with 4:00 left or by 9 with 40 s left. Now the gain
 *                 follows the urgency (seconds of clock per point of deficit) and the lineup's fit.
 *
 * Pure functions, no random draw. Both are normalised so the league average stays where it was (REF values come from scripts/measure/push-tempo-by-lineup.mjs and
 * late-chase-pace.mjs); only the SPREAD between lineups / situations is new.
 */
import { clamp } from "../core/seededRandom.js";

export const PACE_TUNING = Object.freeze({
  rushRefFit: 0.69, // the mean IN-GAME fit of a pushing team (0.686 over 22 team-seasons; the opening five alone read 0.74, but fatigue pulls it down)
  rushSlope: 3.0, // cost x (1 + slope * (ref - fit)); in-game team fits span 0.57-0.84, so roughly 0.55x to 1.35x (slope 6 was tried: slow -11.1 / fast -5.7)
  rushMin: 0.5,
  rushMax: 1.5,
  chaseGain: 0.38, // the old flat x1.38
  chaseSecPerPoint: 70, // urgency is 0 at this many seconds per point of deficit and 1 at none
  chaseUrgencyRef: 0.70, // the mean urgency of a chase possession; a possession at the mean keeps the old 1.38
  chaseMin: 0.4,
  chaseMax: 1.4,
  chaseFitRef: 0.69,
  chaseFitSlope: 0.6,
  chaseFitMin: 0.7,
  chaseFitMax: 1.3,
});

/** 0..1: how well the five on court can run, from their average speed and freshness. (Moved verbatim from the B4 comeback code.) */
export function runningFit(court) {
  const list = court || [];
  const avg = (key, fallback) => list.reduce((n, p) => n + (Number(p[key]) || fallback), 0) / Math.max(1, list.length);
  return clamp((avg("speed", 50) - 35) / 35, 0, 1) * clamp((78 - avg("fatigue", 0)) / 40, 0, 1);
}

/** x on a rushing penalty. 1 at the reference fit. */
export function rushCostScale(fit) {
  const t = PACE_TUNING;
  return clamp(1 + t.rushSlope * (t.rushRefFit - fit), t.rushMin, t.rushMax);
}

/** The tempo with its COSTS scaled for this lineup; the same object when it has none (so every other tempo plays exactly as before). */
export function scaleTempoCosts(tempo, fit) {
  if (!tempo || !(tempo.makeBonus < 0 || tempo.openBonus < 0 || tempo.tovMult > 1)) return tempo;
  const k = rushCostScale(fit);
  return {
    ...tempo,
    makeBonus: tempo.makeBonus < 0 ? tempo.makeBonus * k : tempo.makeBonus,
    openBonus: tempo.openBonus < 0 ? tempo.openBonus * k : tempo.openBonus,
    tovMult: tempo.tovMult > 1 ? 1 + (tempo.tovMult - 1) * k : tempo.tovMult,
  };
}

/** 0..1: how badly the trailing side needs the ball back quickly. */
export function chaseUrgency(deficit, clock) {
  return clamp(1 - clock / Math.max(1, deficit) / PACE_TUNING.chaseSecPerPoint, 0, 1);
}

/** The late-game chase's pace multiplier for this deficit, clock and lineup. */
export function chasePaceMult(deficit, clock, fit) {
  const t = PACE_TUNING;
  const g = clamp(chaseUrgency(deficit, clock) / t.chaseUrgencyRef, t.chaseMin, t.chaseMax);
  const f = clamp(1 + t.chaseFitSlope * (fit - t.chaseFitRef), t.chaseFitMin, t.chaseFitMax);
  return 1 + t.chaseGain * g * f;
}
