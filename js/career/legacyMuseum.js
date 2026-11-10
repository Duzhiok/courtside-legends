/**
 * Legacy Museum (篮球人生博物馆): the career legacy detail view behind the
 * My World honours wall (user decision 2026-11-10, after 375b75d).
 *
 * Pure data-shaping, no DOM, no storage, no RNG. It reads only what the
 * account really holds:
 * - completed-career records (`account.careerCompletions`, see
 *   careerAchievements.js): { careerId, role, prestige, year, seasons,
 *   championships, tier, reason, at }. `year` is the final season year.
 * - the legacy record (legacySummaryFor, careerRelationships.js): counts
 *   and headlines for transitions, trades, drafts, divergences, promises
 *   and rivalries.
 *
 * Nothing is invented: a field with no real source is null and the view
 * omits it (or says "unknown"). Team names, win-loss records and wealth
 * do not exist on any real record, so the museum never shows them.
 *
 * Titles come from ARCHITECT_TITLES (careerAchievements.js), the single
 * source — this module passes the earned title objects through untouched.
 */
import { architectTitlesFor, architectUnlocked, careerCompletions } from "./careerAchievements.js";
import { legacySummaryFor } from "./careerRelationships.js";

/** The earliest completion for a role (by `at`), or null. Records without a timestamp sort last. */
function earliestFor(list, role) {
  const matches = list.filter((entry) => entry?.role === role);
  if (!matches.length) return null;
  return matches.reduce((a, b) => ((a.at ?? Infinity) <= (b.at ?? Infinity) ? a : b));
}

/**
 * One completion record, copied with only the fields the museum shows.
 * Missing fields stay null — never invented, never defaulted to a plausible
 * value (a missing year is not "—", a missing championship count is not 0).
 */
function careerEntry(entry) {
  if (!entry) return null;
  return {
    careerId: typeof entry.careerId === "string" ? entry.careerId : null,
    role: typeof entry.role === "string" ? entry.role : null,
    prestige: entry.prestige === true,
    year: Number.isInteger(entry.year) ? entry.year : null,
    seasons: Number.isInteger(entry.seasons) ? entry.seasons : null,
    championships: Number.isInteger(entry.championships) ? entry.championships : null,
    tier: typeof entry.tier === "string" ? entry.tier : null,
    reason: typeof entry.reason === "string" ? entry.reason : null,
    at: Number.isFinite(entry.at) ? entry.at : null,
  };
}

/**
 * The museum model for an account, or null when there is nothing to show:
 * guests (no account) and accounts that have not unlocked The Architect
 * (fewer than one completed Coach career plus one completed GM career)
 * get no museum — the honours wall's progress block is their view.
 *
 * `unlockedAt` is the earliest date both qualifications were held: the
 * later of the two earliest completion timestamps. It is null when either
 * timestamp is missing, and the view then says the unlock date is unknown
 * instead of guessing one.
 */
export function legacyMuseumFor(account) {
  if (!account || !architectUnlocked(account)) return null;
  const list = careerCompletions(account);
  const coach = earliestFor(list, "COACH");
  const gm = earliestFor(list, "GM");
  if (!coach || !gm) return null; // unreachable while the unlock derives from the same records, kept as a guard
  return {
    unlocked: true,
    titles: architectTitlesFor(account),
    unlockedAt: coach.at != null && gm.at != null ? Math.max(coach.at, gm.at) : null,
    qualifications: { coach: careerEntry(coach), gm: careerEntry(gm) },
    architectCareers: list.filter((entry) => entry?.prestige === true).map(careerEntry),
    legacy: legacySummaryFor(account),
  };
}
