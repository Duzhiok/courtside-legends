// The one rule for turning any roster position string ("G", "F-C", "pg", ...) into PG/SG/SF/PF/C. The setup roster
// (js/app.js) and the Gold tactics board (js/ui/tactics) both place starters with it, so they cannot disagree.
const SLOT_IDS = ["PG", "SG", "SF", "PF", "C"];

/** Map any roster pos string into PG/SG/SF/PF/C. */
export function normalizePos(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (SLOT_IDS.includes(p)) return p;
  if (p.includes("G") && p.startsWith("P")) return "PG";
  if (p.includes("G")) return "SG";
  if (p.includes("C")) return "C";
  if (p.includes("F") && p.startsWith("P")) return "PF";
  return "SF";
}
