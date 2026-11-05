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
 * roster vs historical teams), so they are NOT locked. Only Duel puts two humans on one match.
 */
export function humanSideCount(mode) {
  return mode === "duel" ? 2 : 1;
}

export function speedLocked(mode) {
  return humanSideCount(mode) > 1;
}
