/**
 * Jersey eras and the four reusable silhouette families (Legends Jersey Collection, J2 art contract).
 *
 * A jersey is NOT a full picture per item: it is a silhouette family + colours + number. 200 jerseys x skin tones x
 * hair x builds must never become 200 x N images. The eras below are an art summary, not a claim that every team wore
 * exactly this cut in a given year -- real products carry their own team + season (see jerseyCatalog.js).
 *
 * Pure data + helpers, no DOM, no storage.
 */

/** The four silhouettes the 2D renderer needs. */
export const UNIFORM_FAMILIES = Object.freeze({
  classic_short: { zh: "经典短裤款", en: "Classic short", shorts: 0.62, body: 0.82, armhole: 0.7 },
  retro_80s: { zh: "80 年代复古款", en: "Retro 80s", shorts: 0.72, body: 0.9, armhole: 0.8 },
  oversized_2000s: { zh: "宽松款", en: "Oversized", shorts: 1.0, body: 1.0, armhole: 1.0 },
  modern_fitted: { zh: "现代修身款", en: "Modern fitted", shorts: 0.85, body: 0.88, armhole: 0.9 },
});

/** Display eras (collection filters). Inclusive end years. */
export const ERAS = Object.freeze([
  { id: "1940s-50s", from: 1940, to: 1959, family: "classic_short", zh: "1940–59", en: "1940–59" },
  { id: "1960s-70s", from: 1960, to: 1979, family: "classic_short", zh: "1960–79", en: "1960–79" },
  { id: "1980s", from: 1980, to: 1989, family: "retro_80s", zh: "1980 年代", en: "1980s" },
  { id: "1990s", from: 1990, to: 1999, family: "oversized_2000s", zh: "1990 年代", en: "1990s" },
  { id: "2000s", from: 2000, to: 2009, family: "oversized_2000s", zh: "2000 年代", en: "2000s" },
  { id: "2010s", from: 2010, to: 2019, family: "modern_fitted", zh: "2010 年代", en: "2010s" },
  { id: "2020s", from: 2020, to: 2100, family: "modern_fitted", zh: "2020 年至今", en: "2020s" },
]);

/**
 * The season's END year: "1995-96" -> 1996, 1996 -> 1996 (the roster's convention), anything else -> null.
 * Never guesses: an unreadable season has no era.
 */
export function endYearOf(season) {
  if (Number.isInteger(season) && season >= 1940 && season <= 2100) return season;
  const m = /^(\d{4})\s*[-–]\s*(\d{2})$/.exec(String(season ?? "").trim());
  if (m) {
    const start = Number(m[1]);
    const end = Math.floor(start / 100) * 100 + Number(m[2]);
    return end > start ? end : end + 100;
  }
  const n = Number(season);
  return Number.isInteger(n) && n >= 1940 && n <= 2100 ? n : null;
}

/** The era a season belongs to, or null when the season is unreadable. */
export function eraForSeason(season) {
  const year = endYearOf(season);
  return year == null ? null : ERAS.find((e) => year >= e.from && year <= e.to) || null;
}

/** The silhouette family for a season. An unreadable season falls back to the neutral oversized cut, never throws. */
export function familyForSeason(season) {
  return eraForSeason(season)?.family || "oversized_2000s";
}
