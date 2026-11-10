/**
 * Workstream G — Basketball Career Network: Scout career.
 *
 * A scout evaluates prospects with INCOMPLETE information, recommends draft
 * targets, and receives DELAYED feedback from actual player development.
 * The feedback reads real later-season rows from roster.json — what the
 * player actually became in the original timeline — never invented numbers.
 *
 * Scout = uncertain FUTURE potential. This must feel different from the
 * Analytics Specialist (workstream G, analyticsSpecialist.js), which reads
 * PAST evidence and efficiency from complete season stats.
 *
 * Historical knowledge may provide clues but must not guarantee outcomes:
 * the scout's estimate is noisy (a real future star can be graded B, a
 * future bust can be graded A), the pool always contains decoys with
 * similar rookie stat lines whose real futures diverged, and the score
 * grades the RECOMMENDATION against its draft cost — not whether the
 * player picked a famous name.
 *
 * Pure module: no DOM, no Math.random (seeded noise only), no sim imports.
 * Works on plain roster rows ({ bref, name, season, team, pos, gp, mpg,
 * ppg, rpg, apg, spg, bpg, tpg, fg, tp, ft, fga, tpa }) and converts to
 * cards with seasonToCard for overall().
 */
import { seededStream } from "../../core/seededRandom.js";
import { seasonToCard, overall } from "../../data/players.js";

const GRADES = ["F", "D", "C", "B", "A", "S"];

/**
 * One-pass index over a rows array, memoised by array identity (the view
 * and the tests pass the same ROWS_CACHE array every time). Without it
 * every prospect lookup rescans all 23k rows and the pool build is O(n²).
 */
const indexCache = new WeakMap();
function rosterIndex(rows) {
  let idx = indexCache.get(rows);
  if (!idx) {
    idx = { byBref: new Map(), firstSeason: new Map() };
    for (const r of rows || []) {
      if (!r || !r.bref) continue;
      if (!idx.byBref.has(r.bref)) idx.byBref.set(r.bref, []);
      idx.byBref.get(r.bref).push(r);
      const prev = idx.firstSeason.get(r.bref);
      if (prev === undefined || r.season < prev) idx.firstSeason.set(r.bref, r.season);
    }
    indexCache.set(rows, idx);
  }
  return idx;
}

/** Overall -> grade band. S >= 85, A >= 80, B >= 75, C >= 70, D >= 65, else F. */
export function gradeForOverall(ovr) {
  const v = Number(ovr) || 0;
  if (v >= 85) return "S";
  if (v >= 80) return "A";
  if (v >= 75) return "B";
  if (v >= 70) return "C";
  if (v >= 65) return "D";
  return "F";
}

const gradeIndex = (g) => Math.max(0, GRADES.indexOf(g));

/** The first recorded season for a player (their rookie season in the data). */
export function firstSeasonFor(rows, bref) {
  return rosterIndex(rows).firstSeason.get(bref) ?? null;
}

/**
 * Prospect candidates for a draft season: players whose first recorded
 * season is `season` (rookies) or `season - 1` (sophomores), with at least
 * 5 games played. Returns { row, card, experience } per candidate, in
 * roster order (the caller picks deterministically).
 */
export function prospectPool(rows, season, { minGp = 5 } = {}) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || row.season !== season || (row.gp || 0) < minGp) continue;
    if (seen.has(row.bref)) continue;
    const first = firstSeasonFor(rows, row.bref);
    if (first !== season && first !== season - 1) continue;
    seen.add(row.bref);
    out.push({ row, card: seasonToCard(row), experience: first === season ? "rookie" : "sophomore" });
  }
  return out;
}

/** Peak overall of a player over the seasons after `season` (up to `years`). */
export function futurePeakOverall(rows, bref, season, years = 4) {
  let peak = null;
  let peakSeason = null;
  for (const r of rosterIndex(rows).byBref.get(bref) || []) {
    if (r.season <= season || r.season > season + years) continue;
    const ovr = overall(seasonToCard(r));
    if (peak === null || ovr > peak) { peak = ovr; peakSeason = r.season; }
  }
  return { peak, peakSeason };
}

/** Peak per-game scoring over the seasons after `season` (up to `years`). */
export function futurePeakPpg(rows, bref, season, years = 4) {
  let peak = null;
  let peakSeason = null;
  for (const r of rosterIndex(rows).byBref.get(bref) || []) {
    if (r.season <= season || r.season > season + years) continue;
    const ppg = Number(r.ppg) || 0;
    if (peak === null || ppg > peak) { peak = ppg; peakSeason = r.season; }
  }
  return { peak, peakSeason };
}

/**
 * The scout's report on one prospect. The estimate is built from the real
 * future peak and then blurred with seeded noise — a scout can underrate a
 * future star and overrate a future bust. Confidence reflects the sample
 * size (games + minutes actually observed), never the future.
 */
export function scoutReportFor(prospect, rows, { seed = 1, years = 4 } = {}) {
  const { row, card } = prospect;
  const rng = seededStream(seed * 7919 + (row.bref || "").length * 131 + (row.season || 0));
  const currentOvr = overall(card);
  const currentGrade = gradeForOverall(currentOvr);
  const { peak } = futurePeakOverall(rows, row.bref, row.season, years);
  // No later rows at all: the scout has nothing to project from — say so.
  const peakGrade = peak === null ? currentGrade : gradeForOverall(peak);
  const peakIdx = gradeIndex(peakGrade);
  const loIdx = Math.max(0, peakIdx - (rng() < 0.5 ? 1 : 0) - (rng() < 0.25 ? 1 : 0));
  const hiIdx = Math.min(GRADES.length - 1, peakIdx + (rng() < 0.5 ? 1 : 0));
  const sample = Math.min(1, ((row.gp || 0) / 60) * 0.6 + ((row.mpg || 0) / 30) * 0.4);
  const confidence = Math.round(35 + sample * 45 + rng() * 12);
  return {
    bref: row.bref,
    name: row.name,
    pos: row.pos,
    team: row.team,
    season: row.season,
    experience: prospect.experience,
    currentGrade,
    currentOvr,
    potentialRange: [GRADES[loIdx], GRADES[hiIdx]],
    confidence,
    sampleSize: { gp: row.gp || 0, mpg: row.mpg || 0 },
    // Public stats the scout actually saw (never the future).
    observed: {
      ppg: row.ppg || 0, rpg: row.rpg || 0, apg: row.apg || 0,
      fg: row.fg || 0, tp: row.tp || 0,
    },
  };
}

/** Development tiers from REAL later rows. `peakMpg` is the peak minutes of the later seasons. */
export function developmentTier(report) {
  const { peakOvr, peakPpg, peakMpg, seasonsPlayed } = report;
  if (!seasonsPlayed) return "bust";
  if ((peakOvr ?? 0) >= 85 || (peakPpg ?? 0) >= 20) return "star";
  if ((peakOvr ?? 0) >= 75 || ((peakMpg ?? 0) >= 25 && (peakPpg ?? 0) >= 12)) return "starter";
  if ((peakOvr ?? 0) >= 68 || (peakMpg ?? 0) >= 12) return "rotation";
  return "bust";
}

export const DEVELOPMENT_TIER_LABEL = {
  star: { zh: "未来巨星", en: "Future star" },
  starter: { zh: "首发球员", en: "Starter" },
  rotation: { zh: "轮换球员", en: "Rotation player" },
  bust: { zh: "未能立足", en: "Did not stick" },
};

/**
 * Delayed feedback: what the prospect actually became, from real rows in
 * the `years` seasons after their draft season. This is the original
 * timeline's outcome — the scout's judgment is graded against it, and the
 * UI labels it as such (in the player's own timeline it could differ).
 */
export function developmentReport(prospect, rows, { years = 3 } = {}) {
  const { row } = prospect;
  let peakOvr = null;
  let peakPpg = null;
  let peakMpg = null;
  let seasonsPlayed = 0;
  let peakSeason = null;
  for (const r of rosterIndex(rows).byBref.get(row.bref) || []) {
    if (r.season <= row.season || r.season > row.season + years) continue;
    seasonsPlayed += 1;
    const ovr = overall(seasonToCard(r));
    if (peakOvr === null || ovr > peakOvr) { peakOvr = ovr; peakSeason = r.season; }
    if (peakPpg === null || (Number(r.ppg) || 0) > peakPpg) peakPpg = Number(r.ppg) || 0;
    if (peakMpg === null || (Number(r.mpg) || 0) > peakMpg) peakMpg = Number(r.mpg) || 0;
  }
  const report = {
    bref: row.bref, name: row.name, season: row.season,
    peakOvr, peakPpg, peakMpg, peakSeason, seasonsPlayed,
  };
  report.tier = developmentTier(report);
  return report;
}

/**
 * Grade one recommendation. `pickCost` is the draft capital spent
 * ("lottery" | "mid" | "late" | "undrafted"); recommending a future star
 * with a late pick is worth more than spending a lottery pick on a
 * rotation player. Passing is graded too — passing on a star is the
 * costliest miss.
 */
export function gradeScoutRecommendation({ recommended, pickCost = "mid", report }) {
  const tier = report?.tier || "bust";
  const cost = { lottery: 2, mid: 1, late: 0, undrafted: 0 }[pickCost] ?? 1;
  let points = 0;
  let verdict = "";
  if (recommended) {
    if (tier === "star") { points = 3 - Math.min(1, cost); verdict = "hit-star"; }
    else if (tier === "starter") { points = cost >= 2 ? 1 : 2; verdict = "hit-starter"; }
    else if (tier === "rotation") { points = cost >= 2 ? -1 : 1; verdict = "hit-rotation"; }
    else { points = -1; verdict = "miss-bust"; }
  } else {
    if (tier === "star") { points = -2; verdict = "missed-star"; }
    else if (tier === "starter") { points = -1; verdict = "missed-starter"; }
    else if (tier === "rotation") { points = 0; verdict = "passed-rotation"; }
    else { points = 1; verdict = "correct-pass"; }
  }
  return { verdict, points, tier, pickCost };
}

/** Totals for a whole scout class (one draft season of recommendations). */
export function scoreScoutClass(graded) {
  const list = Array.isArray(graded) ? graded : [];
  return {
    total: list.reduce((s, g) => s + (g?.points || 0), 0),
    hits: list.filter((g) => (g?.verdict || "").startsWith("hit-")).length,
    misses: list.filter((g) => (g?.verdict || "").startsWith("miss")).length,
    count: list.length,
  };
}

/**
 * Deterministic pick of `count` prospects from a pool (seeded shuffle).
 * The slice uses this so the same seed always shows the same five names.
 */
export function pickProspects(pool, count, seed = 1) {
  const rng = seededStream(seed);
  const arr = [...(pool || [])];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/** Integration seam for workstream C: a scout-career recommendation in the shape C's scoutingIntel consumes. */
export function toScoutingIntelInput({ prospect, report, recommended, pickCost }) {
  return {
    source: "scout-career",
    bref: prospect?.row?.bref,
    season: prospect?.row?.season,
    recommended: Boolean(recommended),
    pickCost: pickCost || "mid",
    scoutConfidence: report?.confidence ?? null,
    potentialRange: report?.potentialRange || null,
  };
}
