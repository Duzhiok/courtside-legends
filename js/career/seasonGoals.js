/**
 * Season goals / "board goals" (B1 of docs/CAREER_LIFE_ROADMAP.md).
 *
 * Before this, every interview offer carried a `firstYearGoal` string (e.g. "进入季后赛") that got
 * copied into `root.story.promises` once and never read again -- pure flavor text, not a real
 * mechanic. This module makes it real: at the start of every season (not just the first), the
 * front office looks at how the roster actually stacks up *right now* -- not a one-time snapshot
 * from the opening interview -- and sets a goal sized to that. Hit it, trust goes up; miss it,
 * trust goes down. js/modes/careerContract.js owns wiring this into frontOfficeTrust/eventLog;
 * this module only knows roster strength -> tier -> goal -> achieved-or-not, all pure functions.
 */
import { overall } from "../data/players.js";
import { GOAL_ROSTER_STRENGTH_SAMPLE, REBUILD_WIN_RATE_GOAL } from "./balance.js";

export const SEASON_GOAL_TIERS = ["rebuild", "middle", "contender"];
export const SEASON_GOAL_KINDS = ["win-rate", "finish"];
export const SEASON_GOAL_STATUSES = ["active", "achieved", "missed"];

// Ordered worst-to-best; must match the `finish` values js/modes/leagueCareer.js's
// annualSummary() actually produces (lottery / playoffs / finals / champion -- there's no
// "second round" granularity in a season summary, so goals can only target one of these four).
export const FINISH_TIERS = ["lottery", "playoffs", "finals", "champion"];

const SEASON_GOAL_TEMPLATES = {
  rebuild: {
    kind: "win-rate",
    target: REBUILD_WIN_RATE_GOAL,
    label: `不摆烂：常规赛胜率不低于 ${Math.round(REBUILD_WIN_RATE_GOAL * 100)}%`,
    labelEn: `Avoid a full tank: finish at a .${Math.round(REBUILD_WIN_RATE_GOAL * 1000)} record or better`,
  },
  middle: {
    kind: "finish",
    target: "playoffs",
    label: "带队打进季后赛",
    labelEn: "Lead the team into the playoffs",
  },
  contender: {
    kind: "finish",
    target: "finals",
    label: "带队打进总决赛",
    labelEn: "Lead the team to the Finals",
  },
};

/** Average OVR of a team's best GOAL_ROSTER_STRENGTH_SAMPLE players. 0 for an empty/missing roster
 * rather than throwing -- a team with no players yet (mid-construction) just isn't very strong. */
export function teamRosterStrength(team) {
  const players = Array.isArray(team?.players) ? team.players : [];
  if (!players.length) return 0;
  const top = [...players].sort((a, b) => overall(b) - overall(a)).slice(0, GOAL_ROSTER_STRENGTH_SAMPLE);
  return top.reduce((sum, player) => sum + overall(player), 0) / top.length;
}

/**
 * Which third of the league the user's team currently ranks in by roster strength -- the same
 * thirds split the opening interview offers use for rebuild/middle/contender, just recomputed
 * every season from the live league (season.teams) instead of a one-time historical snapshot.
 * Rosters diverge through trades, drafts, and development, so goal difficulty should track where
 * the team actually stands now, not where the history books say it stood on day one.
 */
export function rosterTier(teams, userTeamId) {
  const ids = Object.keys(teams || {});
  if (!ids.includes(userTeamId)) {
    throw new RangeError(`unknown team id: ${userTeamId}`);
  }
  const ranked = ids
    .map((id) => ({ id, score: teamRosterStrength(teams[id]) }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  const rank = ranked.findIndex((entry) => entry.id === userTeamId);
  const firstCut = Math.floor(ranked.length / 3);
  const secondCut = Math.floor((ranked.length * 2) / 3);
  if (rank < firstCut) return "rebuild";
  if (rank < secondCut) return "middle";
  return "contender";
}

/** The goal the front office hands down for a season, sized to the team's current tier. Callers
 * attach `year` and `status` -- this function only knows roster strength, not career state. */
export function buildSeasonGoal(teams, userTeamId) {
  const tier = rosterTier(teams, userTeamId);
  return { tier, ...SEASON_GOAL_TEMPLATES[tier] };
}

/** Did a completed season (the same summary shape stored in management.seasonHistory) satisfy
 * `goal`? */
export function goalAchieved(goal, summary) {
  if (goal.kind === "win-rate") {
    const wins = Number(summary?.record?.w) || 0;
    const losses = Number(summary?.record?.l) || 0;
    const games = wins + losses;
    return games > 0 && wins / games >= goal.target;
  }
  if (goal.kind === "finish") {
    const rank = FINISH_TIERS.indexOf(summary?.finish);
    const targetRank = FINISH_TIERS.indexOf(goal.target);
    return rank >= 0 && targetRank >= 0 && rank >= targetRank;
  }
  throw new RangeError(`unknown season goal kind: ${goal.kind}`);
}
