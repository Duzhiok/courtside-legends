/**
 * Save-file shape of the C2 growth state. Kept apart from playerGrowth.js on purpose: the save
 * validator must not drag the whole player database in just to check a few numbers.
 */
/** `{ [bref]: { year, xp, levels, deltas } }`, or undefined for saves from before C2. */
export function validGrowth(growth) {
  if (growth === undefined) return true;
  if (!growth || typeof growth !== "object" || Array.isArray(growth)) return false;
  return Object.entries(growth).every(([bref, entry]) => (
    bref.trim() !== ""
    && entry && typeof entry === "object" && !Array.isArray(entry)
    && Number.isInteger(entry.year)
    && Number.isFinite(entry.xp) && entry.xp >= 0
    && Number.isInteger(entry.levels) && entry.levels >= 0
    && entry.deltas && typeof entry.deltas === "object" && !Array.isArray(entry.deltas)
    && Object.values(entry.deltas).every((n) => Number.isInteger(n) && n > 0)
  ));
}
