/**
 * Save-file shapes of the managed-career progression ledgers: C2 growth, C3 epiphany. Kept apart from
 * the modules that use them on purpose: the save validator must not drag the whole player database
 * in just to check a few numbers.
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

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const isGameLine = (line) => isObject(line) && Object.values(line).every((n) => Number.isFinite(n) && n >= 0);

/** `{ [bref]: { form: [game line], learned: [skillId] } }`, or undefined for saves from before C3. */
export function validEpiphany(ledger) {
  if (ledger === undefined) return true;
  if (!isObject(ledger)) return false;
  return Object.entries(ledger).every(([bref, entry]) => (
    bref.trim() !== ""
    && isObject(entry)
    && Array.isArray(entry.form) && entry.form.every(isGameLine)
    && Array.isArray(entry.learned)
    && entry.learned.every((id) => typeof id === "string" && id !== "")
    && new Set(entry.learned).size === entry.learned.length
  ));
}
