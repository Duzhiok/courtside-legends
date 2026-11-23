/**
 * What `switch_all` and `zone_drop` DO against a pick and roll (docs/implementation/b25-defense-behaviour-design.md).
 *
 * Before this file both tactics were one flat defense multiplier, so they hurt an isolation more than a pick and roll (measured, §1 of the design).
 * Here the tactic is a coverage that answers the action it faces. Every function is pure and draws no random number; sim.js only adds the deltas it
 * returns to values it already computes. A defense that is not `switch_all` / `zone_drop`, or a possession that is not a pick and roll,
 * returns the identity (0 / 1) and the possession plays exactly as it did.
 *
 *   switch  - the screen is cancelled: the bonuses that exist BECAUSE of a screen shrink. A slip or a ghost never relied on one, so they keep theirs
 *             (that is what makes them an answer to a switch), and the switched bodies are mismatched: bigs on guards, guards on the roll man.
 *   drop    - the big sinks: the rim is protected, the pull-up and the kick-out three are given up.
 *
 * Numbers are first guesses to be tuned by scripts/measure/defense-tactic-vs-action.mjs; the structure is the decision.
 */
export const COVERAGE_BY_TACTIC = Object.freeze({ switch_all: "switch", zone_drop: "drop" });

export const COVERAGE_TUNING = Object.freeze({
  switchScreenKeep: 0.5, // a real screen keeps this share of its open / make bonuses against a switch
  switchGhostOpen: 0.06, // the defenders switched onto a screen that never came: the same man left behind as a slip (PNR_TUNING.slipOpen is 0.06)
  switchBigOnGuard: 1.6, // x the existing `bigMismatch` (a big defending a jump shooter) while switching
  switchGuardOnBigPaint: 0.03, // a guard switched onto the roll man at the rim
  dropMidOpen: 0.05, // the handler's pull-up is given up
  dropKickThreeOpen: 0.03, // the corner / kick-out three is given up
  dropPaintMake: 0.03, // the rim is protected (smaller than pack_paint's 0.07: they are not stacked on purpose)
  dropBlockMult: 1.1,
});

/** "switch" | "drop" | null for a tactic object or id. */
export function coverageOf(tactic) {
  const id = typeof tactic === "string" ? tactic : tactic?.id;
  return COVERAGE_BY_TACTIC[id] || null;
}

/** The part of the possession a coverage cares about, read once from sim.js's `sideCtx`. */
export function coverageCtx(sideCtx) {
  const pnr = sideCtx?.pnr || null;
  return {
    scheme: sideCtx?.scheme || null,
    kickedOut: !!sideCtx?.kickedOut,
    screenReal: !pnr || pnr.realScreen !== false, // no plan means the automatic screen, which is real
    ghost: !!pnr?.ghost,
  };
}

const isPnr = (c) => c?.scheme === "pnr";
const isPnrOrDrive = (c) => c?.scheme === "pnr" || c?.scheme === "drive_kick";
const isBig = (p) => ["C", "PF"].includes(p?.playPos || p?.pos);

/** Multiplier for the bonuses a screen creates (open and make). 1 unless a switch meets a real screen. */
export function screenKeep(coverage, ctx) {
  return coverage === "switch" && isPnr(ctx) && ctx.screenReal ? COVERAGE_TUNING.switchScreenKeep : 1;
}

/** Added to `open` by the coverage itself. */
export function coverageOpen(coverage, ctx, { zone = null } = {}) {
  if (!ctx) return 0;
  if (coverage === "switch" && ctx.ghost) return COVERAGE_TUNING.switchGhostOpen;
  if (coverage === "drop" && isPnrOrDrive(ctx)) {
    if (zone === "mid" && !ctx.kickedOut) return COVERAGE_TUNING.dropMidOpen;
    if (zone === "three" && ctx.kickedOut) return COVERAGE_TUNING.dropKickThreeOpen;
  }
  return 0;
}

/** Added to the make probability by the coverage itself. */
export function coverageMake(coverage, ctx, { zone = null, baller = null, defender = null } = {}) {
  if (!ctx || zone !== "paint") return 0;
  if (coverage === "drop" && isPnrOrDrive(ctx)) return -COVERAGE_TUNING.dropPaintMake;
  if (coverage === "switch" && isPnr(ctx) && ctx.kickedOut && isBig(baller) && !isBig(defender)) return COVERAGE_TUNING.switchGuardOnBigPaint;
  return 0;
}

/** x the engine's `bigMismatch` term. */
export function bigMismatchMult(coverage, ctx) {
  return coverage === "switch" && isPnr(ctx) ? COVERAGE_TUNING.switchBigOnGuard : 1;
}

/** x the paint block chance. */
export function blockMult(coverage, ctx, zone) {
  return coverage === "drop" && isPnrOrDrive(ctx) && zone === "paint" ? COVERAGE_TUNING.dropBlockMult : 1;
}
