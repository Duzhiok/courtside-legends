/**
 * Root save -> plain view-models for the time-travel screen. Pure data in, plain data out (no DOM),
 * so the "what does this screen show" decisions are unit-testable in Node.
 */
import { ensureCoachProfile } from "../../career/coachProfile.js";
import { INITIAL_CONTRACT_YEARS } from "../../career/balance.js";
import { historicalSeason } from "../../data/historicalSeasons.js";
import { teamColors } from "../../data/teamColors.js";
import { tr } from "./format.js";

/** Roster code for a historical team (cards use `bref || id`), then its colours. */
export function teamColorsFor(year, teamId) {
  const meta = historicalSeason(year)?.teams?.find((team) => team.id === teamId);
  return teamColors(meta?.bref || meta?.id || teamId);
}

/** Display name for a team in a given historical year (stints only store the id). */
export function teamNameFor(year, teamId) {
  const meta = historicalSeason(year)?.teams?.find((team) => team.id === teamId);
  return meta?.name || teamId;
}

/** Top-N players of one historical team by overall, for the "core players" row on offer cards. */
export function teamCore({ players, overall, year, teamId, count = 3 }) {
  const meta = historicalSeason(year)?.teams?.find((team) => team.id === teamId);
  const key = meta?.bref || teamId;
  return players
    .filter((player) => Number(player.season) === year && player.team === key)
    .map((player) => ({ name: player.name, ovr: Math.round(overall(player)) }))
    .sort((left, right) => right.ovr - left.ovr)
    .slice(0, count);
}

/**
 * Everything the HQ header + contract timeline need.
 * `report` is eventEngine.buildCareerReport(root) -- passed in so it is computed once per render.
 */
export function hqModel(root, report, lang = "zh") {
  const career = root.leagueCareer;
  const story = root.story;
  const season = career?.season;
  const teamId = story.employer || season?.userTeamId || "";
  const employment = story.employment || {};
  const contractYears = employment.contractYears ?? INITIAL_CONTRACT_YEARS;
  const tenureStart = employment.tenureStartSeasonCount ?? 0;
  const contractSeasons = report.seasons.slice(tenureStart);
  const lastSeason = report.seasons.at(-1);
  const status = employment.status;
  let label = "";
  if (status === "fired") label = tr(lang, "已被解雇", "Fired");
  else if (status === "departed") label = tr(lang, "已离任", "Departed");
  else if (status === "retired") label = tr(lang, "已退休", "Retired");
  else if (story.pendingDecision?.type === "contract-renewal") label = tr(lang, "续约谈判中", "Renewal talks");
  return {
    labelTone: status === "retired" ? "gold" : "alert",
    teamId,
    teamName: season?.teams?.[teamId]?.name || season?.userTeamName || teamId,
    year: report.currentYear,
    colors: teamColorsFor(report.currentYear, teamId),
    coach: (() => {
      const coach = ensureCoachProfile(root);
      return {
        level: coach.level,
        reputation: Math.round(coach.reputation ?? 0),
        age: coach.age,
        mood: Math.round(coach.mood ?? 0),
      };
    })(),
    contractYears,
    yearsPlayed: Math.min(contractYears, contractSeasons.length),
    currentContractSeasons: contractSeasons,
    startYear: contractSeasons[0]?.year ?? report.currentYear,
    record: lastSeason?.record || null,
    titles: report.championships,
    finished: report.finished,
    label,
  };
}

/** The four numbers shown in the KPI HUD (+ cash). */
export function kpiModel(root) {
  const coach = ensureCoachProfile(root);
  return {
    trust: root.story.frontOfficeTrust ?? 0,
    pressure: root.story.mediaPressure ?? 0,
    divergence: root.story.timelineDivergence ?? 0,
    knowledge: root.story.futureKnowledge ?? 0,
    cash: coach.cash ?? 0,
  };
}

/** True when the most recent board-goal result was a miss: one more and the job is gone.
 * (careerPerformance().consecutiveMissedGoals is a boolean for "two in a row" -- by then the coach is
 * already fired, so it can't drive a warning; this reads the last single result instead.) */
export function onThinIce(root) {
  const last = [...(root?.story?.eventLog || [])].reverse().find((entry) => entry.type === "season-goal-result");
  return last?.achieved === false;
}
