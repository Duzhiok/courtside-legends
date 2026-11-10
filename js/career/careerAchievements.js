/**
 * Prestige Career System (3+1): account-level career achievements.
 *
 * The Architect (GM + Coach) is locked by default and unlocks when the
 * account has completed ONE full Coach career AND ONE full GM career.
 *
 * Source of truth: completed-career records on the account
 * (`account.careerCompletions`, an array). A record is written once, when a
 * career reaches a formal ending (retirement or a timeline final ending).
 * The unlock is DERIVED from those records — it is never stored as a
 * separate boolean, so no two fields can contradict each other. A record
 * is the only thing ever persisted; `architectProgress`,
 * `architectUnlocked` and `architectTitlesFor` all derive from it.
 *
 * What counts (user decision 2026-11-09):
 * - A completed career means reaching a legitimate career-ending state:
 *   retirement (voluntary or forced by age) or a timeline final ending.
 *   Timeline-final endings join LEGITIMATE_ENDING_IDS when they exist;
 *   today only retirement does.
 * - A single season is not sufficient: merely playing (and stopping)
 *   without a formal ending records nothing. Retirement itself requires
 *   at least one finished season (see retirementBlocker), and this module
 *   enforces the same floor.
 * - Championship victory is NOT required.
 * - Being fired does NOT count, unless the career eventually ends in a
 *   formal ending (a fired coach who is re-hired and later retires counts
 *   — the fired stint is just history by then).
 * - Unlock is permanent once both qualifications are satisfied; after
 *   unlocking, the player can start GM + Coach careers unlimited times.
 * - A Classic GM + Coach career does NOT count toward the unlock (it is
 *   the prestige career itself, not a qualification). Only COACH and GM
 *   roles qualify. An Architect career (GM + Coach started from the
 *   prestige card, marked `prestige: true` on the save) is recorded with
 *   prestige so the dynasty titles can derive from it.
 *
 * This module is pure: it never touches localStorage, the DOM, or the
 * network. Callers pass the account object in and persist it themselves
 * (saveAccount). The dev-only unlock override is also pure here: the
 * caller reads it with readArchitectDevOverride() and passes the boolean
 * in — the override is session-scoped and never written as a
 * qualification.
 */
import { identityOf } from "./careerIdentity.js";
import { buildLegacy } from "./legacy.js";

/** Roles that count toward the Architect unlock. */
export const ARCHITECT_QUALIFYING_ROLES = ["COACH", "GM"];

/**
 * Formal career-ending states. Add timeline-final ending ids here when
 * they exist (e.g. a 2050 ending); until then retirement is the only one.
 */
export const LEGITIMATE_ENDING_IDS = ["retired"];

/** Exclusive lifetime titles for Architect careers (My World honours wall). */
export const ARCHITECT_TITLES = {
  architect: { id: "architect", zh: "建筑师", en: "The Architect" },
  dynasty: { id: "dynasty-master", zh: "王朝大师", en: "Dynasty Master" },
  immortal: { id: "basketball-immortal", zh: "篮球不朽", en: "Basketball Immortal" },
};

/** The completed-career records on an account (missing/invalid reads as none). */
export function careerCompletions(account) {
  const list = account?.careerCompletions;
  return Array.isArray(list) ? list : [];
}

/** True when the root is in a formal career-ending state. */
export function isFormalCareerEnding(root) {
  const status = root?.story?.employment?.status;
  const endingId = root?.story?.ending?.id;
  return status === "retired" && LEGITIMATE_ENDING_IDS.includes(endingId);
}

/**
 * Derive a completion record from a finished root, or null when the root
 * is not a qualifying ending. `prestige` marks a career started from the
 * Architect card (only meaningful for GM + Coach); it is ignored for
 * other roles. The record carries the legacy summary so the dynasty
 * titles can derive from it later.
 * @param {object} root the long-career root save (v3)
 * @param {{prestige?:boolean}} opts
 */
export function completionFromRoot(root, { prestige = false } = {}) {
  if (!isFormalCareerEnding(root)) return null;
  const role = identityOf(root);
  const careerId = root?.leagueCareer?.careerId;
  if (typeof careerId !== "string" || !careerId) return null;
  const legacy = buildLegacy(root.coach || {});
  if (legacy.seasons < 1) return null;
  const year = root?.leagueCareer?.season?.year ?? legacy.lastYear;
  return {
    careerId,
    role,
    prestige: prestige === true && role === "GM_COACH",
    year: Number.isInteger(year) ? year : null,
    seasons: legacy.seasons,
    championships: legacy.titles,
    tier: legacy.tier,
    reason: root.story.employment.reason || null,
    at: Date.now(),
  };
}

/**
 * Append a completion record to the account. Idempotent: a record for the
 * same careerId is never written twice (a career can only end once, but
 * the guard makes a double award impossible even if the ending is saved
 * twice). Returns the account (mutated in place, like the rest of the
 * account helpers) so the caller can saveAccount() it.
 */
export function recordCareerCompletion(account, completion) {
  if (!account || !completion || typeof completion.careerId !== "string") return account;
  const list = careerCompletions(account);
  if (list.some((entry) => entry.careerId === completion.careerId)) return account;
  account.careerCompletions = [...list, { ...completion }];
  return account;
}

/** Which of the two Architect qualifications the account holds. Derived. */
export function architectProgress(account) {
  const list = careerCompletions(account);
  const coach = list.some((entry) => entry.role === "COACH");
  const gm = list.some((entry) => entry.role === "GM");
  return { coach, gm, completed: (coach ? 1 : 0) + (gm ? 1 : 0) };
}

/**
 * True when the account may start Architect careers. Derived from the
 * completion records; `devOverride` (session-only, never persisted) opens
 * it for testing.
 */
export function architectUnlocked(account, { devOverride = false } = {}) {
  if (devOverride) return true;
  return architectProgress(account).completed === 2;
}

/**
 * Exclusive lifetime titles the account holds, in order. The Architect
 * title comes from the unlock itself; Dynasty Master needs a championship
 * won in an Architect career; Basketball Immortal needs a completed
 * Architect career. All derive from the completion records.
 */
export function architectTitlesFor(account) {
  const titles = [];
  if (!architectUnlocked(account)) return titles;
  titles.push(ARCHITECT_TITLES.architect);
  const prestige = careerCompletions(account).filter((entry) => entry.prestige === true);
  if (prestige.some((entry) => (entry.championships || 0) >= 1)) {
    titles.push(ARCHITECT_TITLES.dynasty);
  }
  if (prestige.length > 0) titles.push(ARCHITECT_TITLES.immortal);
  return titles;
}

/**
 * Dev-only unlock override for testing: `?architect=1` opens the
 * Architect for this browser session, `?architect=0` clears it. The
 * override is session-scoped (sessionStorage) and never written as a
 * qualification — reload without the flag and the lock is back unless
 * the account genuinely unlocked it. `storage` is injected so tests can
 * pass a fake; pass sessionStorage in the app.
 */
export function readArchitectDevOverride(search = "", storage = null) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const flag = params.get("architect");
  try {
    if (flag === "1") {
      storage?.setItem("architect-dev-unlock", "1");
      return true;
    }
    if (flag === "0") {
      storage?.removeItem("architect-dev-unlock");
      return false;
    }
    return storage?.getItem("architect-dev-unlock") === "1";
  } catch {
    return flag === "1";
  }
}
