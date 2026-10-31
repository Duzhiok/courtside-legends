/**
 * What happens to a time-travel career between two seasons, in the one order that works. Pulled
 * out of the screen controller (where it was bound to DOM + global state) so the ORDER -- which is
 * where the subtle bugs live -- can be unit-tested with real saves.
 *
 *   goal result -> pay salary -> reputation -> age -> (drop a stale poach offer) -> next story
 *   beat -> firing check -> retirement age gate -> poach offer
 *
 * Reputation goes before the firing check so a renewal menu is priced off the season just played;
 * the age gate goes after it so a coach who is fired AND of retirement age has the firing recorded
 * first; the poach offer goes last because it only fires for a coach with a clear desk.
 */
import { settleSeasonReputation } from "../career/reputation.js";
import { settleCoachFinances } from "../career/finance.js";
import { finalizeCareerEnding, queueNextStoryEvent } from "../story/eventEngine.js";
import { advanceSeasonGoal, evaluateCareerEmployment } from "./careerContract.js";
import { expirePoachOffer, maybeCreatePoachOffer } from "./poaching.js";
import { retireIfDue, settleCoachAge } from "./retirement.js";

/** The log entry `type` that a step just appended, or null if it did nothing this time. */
const justLogged = (root, type) => {
  const last = root.story.eventLog.at(-1);
  return last?.type === type ? last : null;
};

/**
 * @returns {{ root, resolvedGoal?, settledFinances?, settledReputation?, poachOffer?, retirement?, nextGoal? }}
 *   `root` is the input itself when nothing changed (a retired career is sealed: no salary, no
 *   story beats, no aging); the other fields are the facts the caller recaps to the player.
 */
export function settleSeasonRollover(root, { year } = {}) {
  if (root?.story?.employment?.status === "retired") return { root };
  const goaled = advanceSeasonGoal(root);
  const financed = settleCoachFinances(goaled);
  const reputed = settleSeasonReputation(financed);
  const aged = settleCoachAge(reputed);
  const next = queueNextStoryEvent(expirePoachOffer(aged), { year });
  const employed = evaluateCareerEmployment(next);
  const finalized = employed === next ? finalizeCareerEnding(next) : employed;
  const retired = retireIfDue(finalized);
  const result = maybeCreatePoachOffer(retired);
  if (result === root) return { root };
  return {
    root: result,
    resolvedGoal: justLogged(goaled, "season-goal-result"),
    settledFinances: justLogged(financed, "finances-settled"),
    settledReputation: justLogged(reputed, "reputation-settled"),
    poachOffer: result !== retired ? result.story.poachOffer : null,
    retirement: retired !== finalized ? { age: retired.story.employment.age, tier: retired.story.ending.tier } : null,
    nextGoal: result.story.seasonGoal || null,
  };
}
