/**
 * Who may speed a match up.
 *
 * Playback speed (2x / 3x) is a fairness question, not a mode question: a human playing against the CPU has
 * nobody to be unfair to, so the speed button is theirs. Only when TWO humans share one match is it locked,
 * otherwise whoever clicks first would hurry the other player's decisions.
 *
 * This is deliberately separate from "快速模拟整场" (jump straight to the result): speeding up still lets you
 * watch and steer the game, so neither replaces the other.
 *
 * Draft Team and Budget Draft matches are one human against the CPU (a draft team vs a CPU team; a drafted
 * roster vs historical teams), so they are NOT locked. Only Duel puts two humans on one match — plus a
 * tournament bracket match when BOTH sides are human (legacy tournament takes 2–8 human players, so a
 * bracket can pair two of them). A tournament match against the CPU, or a CPU-vs-CPU bracket match, stays
 * unlocked: `match` is the current bracket match ({ a, b } with a `human` flag each), or null when the
 * caller has no match to report.
 */
export function humanSideCount(mode, match = null) {
  if (mode === "duel") return 2;
  if (mode === "tournament" && match?.a?.human && match?.b?.human) return 2;
  return 1;
}

export function speedLocked(mode, match = null) {
  return humanSideCount(mode, match) > 1;
}
