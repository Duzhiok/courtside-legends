/**
 * B7 of docs/CAREER_LIFE_ROADMAP.md: the whole-career summary shown when a coach hangs up the
 * whistle. Pure and derived: it reads only root.coach (stints + age + reputation), so there is no
 * second copy of the career to keep in sync.
 *
 * Why it can't read leagueCareer.seasonHistory: every new stint (B5 re-hire, B6 poaching) builds a
 * fresh leagueCareer, so that history only ever covers the CURRENT job. The finished jobs live in
 * root.coach.stints, which is why a retirement summary is stints-only (the caller appends the
 * in-progress stint first when previewing).
 */
import {
  LEGACY_REPUTATION_POINTS, LEGACY_SEASON_CAP, LEGACY_SEASON_POINTS, LEGACY_TIER_MIN, LEGACY_TITLE_POINTS,
  LEGACY_WIN_PCT_POINTS,
} from "./balance.js";

/** Best to worst. `hallOfFame` is the flag the future Hall-of-Fame speech (roadmap F3) keys off. */
export const LEGACY_TIERS = {
  "hall-of-fame": { label: "名人堂级教头", labelEn: "Hall of Fame Coach", tone: "success" },
  great: { label: "一代名帅", labelEn: "A Great Coach", tone: "success" },
  solid: { label: "稳健的主教练", labelEn: "A Solid Head Coach", tone: "neutral" },
  journeyman: { label: "江湖老教头", labelEn: "Journeyman Coach", tone: "neutral" },
  brief: { label: "昙花一现", labelEn: "A Brief Chapter", tone: "neutral" },
};

export function legacyTierId(score) {
  if (score >= LEGACY_TIER_MIN.hallOfFame) return "hall-of-fame";
  if (score >= LEGACY_TIER_MIN.great) return "great";
  if (score >= LEGACY_TIER_MIN.solid) return "solid";
  if (score >= LEGACY_TIER_MIN.journeyman) return "journeyman";
  return "brief";
}

export function legacyScore({ titles, winPct, seasons, reputation }) {
  return Math.round(
    titles * LEGACY_TITLE_POINTS
    + Math.max(0, winPct - 0.5) * LEGACY_WIN_PCT_POINTS
    + Math.min(seasons, LEGACY_SEASON_CAP) * LEGACY_SEASON_POINTS
    + Math.max(0, reputation) * LEGACY_REPUTATION_POINTS,
  );
}

/** The last season a stint actually coached (startYear + seasons - 1), or null if unknown/none. */
const lastCoachedYear = (stint) => (Number.isInteger(stint.startYear) && stint.seasons > 0 ? stint.startYear + stint.seasons - 1 : null);

/** Summarise a coach's whole career from root.coach. Stints that never finished a season count
 * toward nothing (a hire that was poached away before opening night coached no one). */
export function buildLegacy(coach) {
  const stints = (Array.isArray(coach?.stints) ? coach.stints : []).filter((stint) => stint.seasons > 0);
  const sum = (key) => stints.reduce((total, stint) => total + (stint[key] || 0), 0);
  const wins = sum("wins");
  const losses = sum("losses");
  const games = wins + losses;
  const seasons = sum("seasons");
  const titles = sum("championships");
  const winPct = games ? wins / games : 0;
  const reputation = Math.round(coach?.reputation ?? 0);
  const score = legacyScore({ titles, winPct, seasons, reputation });
  const tier = legacyTierId(score);
  const firstYears = stints.map((stint) => stint.startYear).filter(Number.isInteger);
  const lastYears = stints.map(lastCoachedYear).filter(Number.isInteger);
  return {
    seasons,
    wins,
    losses,
    winPct,
    titles,
    stints: stints.length,
    teams: new Set(stints.map((stint) => stint.teamId)).size,
    firstYear: firstYears.length ? Math.min(...firstYears) : null,
    lastYear: lastYears.length ? Math.max(...lastYears) : null,
    age: coach?.age ?? null,
    reputation,
    score,
    tier,
    hallOfFame: tier === "hall-of-fame",
  };
}
