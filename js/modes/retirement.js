/**
 * B7 of docs/CAREER_LIFE_ROADMAP.md: the last way a career ends. A coach can hang up the whistle
 * whenever the desk is clear, or is made to at COACH_RETIRE_AGE.
 *
 * Two prerequisites were missing, same story as reputation in B6: `advanceCoachAge` existed but
 * nothing ever called it, so a coach never got a day older and the forced-retirement age was
 * unreachable. settleCoachAge() is the missing caller, guarded per season year by an eventLog entry
 * (the guard-by-log pattern reputation and finances already use) so a re-run can't age anyone twice.
 *
 * "retired" is a terminal employment status: no job board, no renewal, no poaching. The finished
 * jobs stay in root.coach.stints, which is also the single source the legacy summary reads.
 */
import { advanceCoachAge, ensureCoachProfile, isRetirementAge, withCoachProfile } from "../career/coachProfile.js";
import { buildLegacy, LEGACY_TIERS } from "../career/legacy.js";
import { buildStintRecord } from "../career/stints.js";
import { userGamesPlayed } from "../engine/season.js";
import { careerPerformance } from "./careerContract.js";

const requireRoot = (root) => {
  if (!root?.story || !root?.leagueCareer) throw new TypeError("root with a career story is required");
};
const statusOf = (root) => root?.story?.employment?.status ?? "active";
/** A stint is "in progress" (not yet archived in coach.stints) only while the coach holds the job. */
const hasLiveStint = (status) => status === "active" || status === "renewal";

/** One finished season = one year older. No-op without a finished season, or if already counted. */
export function settleCoachAge(root) {
  const history = root?.leagueCareer?.management?.seasonHistory;
  const last = Array.isArray(history) ? history.at(-1) : null;
  if (!last || !root?.story || statusOf(root) === "retired") return root;
  const log = root.story.eventLog || [];
  if (log.some((entry) => entry.type === "coach-aged" && entry.year === last.year)) return root;
  const coach = ensureCoachProfile(root);
  const aged = advanceCoachAge(coach);
  return {
    ...withCoachProfile(root, aged),
    story: {
      ...root.story,
      eventLog: [...log, { type: "coach-aged", year: last.year, from: coach.age, to: aged.age, at: Date.now() }],
    },
  };
}

/** The coach's legacy as it stands right now: archived stints plus the job in progress, if any. */
export function previewLegacy(root) {
  requireRoot(root);
  const coach = ensureCoachProfile(root);
  if (!hasLiveStint(statusOf(root))) return buildLegacy(coach);
  const live = buildStintRecord(root, careerPerformance(root), "retired");
  return buildLegacy({ ...coach, stints: [...coach.stints, live] });
}

/**
 * Why a voluntary retirement is not possible right now, or null if it is. Forced retirement ignores
 * this. Allowed: between jobs (fired / walked away), or in a job before the season's first game
 * with nothing waiting on you -- the same "clear desk" window poaching uses, so no half-played
 * season is thrown away.
 */
export function retirementBlocker(root) {
  if (!root?.story || !root?.leagueCareer) return "no-career";
  const status = statusOf(root);
  if (status === "retired") return "already-retired";
  if (previewLegacy(root).seasons < 1) return "no-finished-season";
  if (status === "fired" || status === "departed") return null;
  if (status !== "active") return "not-employed";
  if (root.story.pendingDecision) return "decision-pending";
  if (userGamesPlayed(root.leagueCareer.season) > 0) return "season-underway";
  return null;
}

export const canRetire = (root) => retirementBlocker(root) === null;

/**
 * Hang up the whistle. reason: "voluntary" (the player chose; must pass retirementBlocker) or
 * "forced" (age; always allowed). Archives the job in progress as stint reason "retired" and
 * records the ending, rated by the whole career.
 */
export function retireCoach(root, reason = "voluntary") {
  requireRoot(root);
  if (statusOf(root) === "retired") throw new Error("this coach has already retired");
  if (reason !== "forced") {
    const blocker = retirementBlocker(root);
    if (blocker) throw new Error(`can't retire right now: ${blocker}`);
  }
  const coach = ensureCoachProfile(root);
  const stints = hasLiveStint(statusOf(root))
    ? [...coach.stints, buildStintRecord(root, careerPerformance(root), "retired")]
    : coach.stints;
  const retiredCoach = { ...coach, stints };
  const legacy = buildLegacy(retiredCoach);
  const tier = LEGACY_TIERS[legacy.tier];
  const ending = { id: "retired", label: tier.label, labelEn: tier.labelEn, tone: tier.tone, tier: legacy.tier, reason };
  const year = root.leagueCareer.season?.year;
  return {
    ...withCoachProfile(root, retiredCoach),
    story: {
      ...root.story,
      employment: { status: "retired", reason, age: coach.age },
      currentChapter: "epilogue",
      ending,
      pendingDecision: null,
      poachOffer: null,
      eventLog: [...root.story.eventLog, { type: "retired", reason, year, age: coach.age, tier: legacy.tier, at: Date.now() }],
    },
  };
}

/** The age gate, run once per rollover: a coach at retirement age is retired, whatever else is going on. */
export function retireIfDue(root) {
  if (!root?.story || !root?.leagueCareer || statusOf(root) === "retired") return root;
  return isRetirementAge(ensureCoachProfile(root)) ? retireCoach(root, "forced") : root;
}
