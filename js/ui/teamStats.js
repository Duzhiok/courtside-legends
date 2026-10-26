/**
 * Display helpers for in-game team stats.
 *
 * Morale (and the other team meters) are continuous inside the sim -- morale moves by
 * `teamDelta * 0.15` -- so the raw value is routinely something like 78.00500000000001.
 * Players should see a whole number; the sim keeps the precision.
 */

/** A meter value as the player should read it: a whole number, "0" for junk. */
export function meterText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : "0";
}
