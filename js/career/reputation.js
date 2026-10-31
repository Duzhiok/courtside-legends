/**
 * Coach reputation moves (B6 of docs/CAREER_LIFE_ROADMAP.md). root.coach.reputation used to be set
 * once at hire and never touched again, which made every reputation gate (B3 renewal menu, B5 job
 * board, B6 poaching) read a constant. This settles it once per finished season.
 *
 * Pure: takes a root, returns a new root. Idempotent per season year (an eventLog entry marks it
 * settled), the same guard-by-log pattern finances use, so a re-run of the offseason hook can never
 * double-pay a title bonus.
 */
import { ensureCoachProfile, withCoachProfile } from "./coachProfile.js";
import {
  REPUTATION_BAD_SEASON, REPUTATION_BAD_WIN_RATE, REPUTATION_CHAMPIONSHIP, REPUTATION_GOAL_HIT,
  REPUTATION_GOAL_MISS, REPUTATION_GOOD_SEASON, REPUTATION_GOOD_WIN_RATE, REPUTATION_WINNING_SEASON,
  REPUTATION_WINNING_WIN_RATE,
} from "./balance.js";

/** Reputation change for one finished season. goalAchieved: true / false / null (no goal on record). */
export function seasonReputationDelta({ record, champion = false, goalAchieved = null }) {
  const games = (record?.w || 0) + (record?.l || 0);
  const winRate = games ? record.w / games : 0.5;
  let delta = 0;
  if (champion) delta = REPUTATION_CHAMPIONSHIP;
  else if (winRate >= REPUTATION_GOOD_WIN_RATE) delta = REPUTATION_GOOD_SEASON;
  else if (winRate >= REPUTATION_WINNING_WIN_RATE) delta = REPUTATION_WINNING_SEASON;
  else if (winRate < REPUTATION_BAD_WIN_RATE) delta = REPUTATION_BAD_SEASON;
  if (goalAchieved === true) delta += REPUTATION_GOAL_HIT;
  if (goalAchieved === false) delta += REPUTATION_GOAL_MISS;
  return delta;
}

/** Settle the most recently finished season's reputation change. No-op if there is no finished
 * season yet, or it was already settled. */
export function settleSeasonReputation(root) {
  const history = root?.leagueCareer?.management?.seasonHistory;
  const last = Array.isArray(history) ? history.at(-1) : null;
  if (!last || !root?.story) return root;
  const log = root.story.eventLog || [];
  if (log.some((entry) => entry.type === "reputation-settled" && entry.year === last.year)) return root;

  const goalEntry = [...log].reverse().find((entry) => entry.type === "season-goal-result" && entry.year === last.year);
  const delta = seasonReputationDelta({
    record: last.record,
    champion: Boolean(last.championId) && last.championId === last.teamId,
    goalAchieved: goalEntry ? goalEntry.achieved : null,
  });
  const coach = ensureCoachProfile(root);
  const from = Math.round(coach.reputation ?? 0);
  const to = Math.max(0, Math.min(100, from + delta));
  return {
    ...withCoachProfile(root, { ...coach, reputation: to }),
    story: {
      ...root.story,
      eventLog: [...log, { type: "reputation-settled", year: last.year, delta: to - from, from, to, at: Date.now() }],
    },
  };
}
