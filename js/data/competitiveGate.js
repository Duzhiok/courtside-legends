/**
 * 8-player competitive unlock gate (user decision 2026-11-08): once the
 * account's roster reaches 8 players, ranked, My Team Season (the AI
 * regular season) and online matches with your own roster unlock. Below 8
 * those three stay locked.
 *
 * The gate counts roster size — account.playerIds.length — however the
 * players were obtained. There is deliberately NO time-based gate here:
 * the user's "three days" was only an estimate of how long reaching 8 via
 * free pulls takes.
 *
 * This is the same 8 the season side already used: MY_TEAM_RULES.minRoster
 * is 8 (js/myteam/lineup.js) and the online server starts accounts with an
 * 8-man roster (STARTER_SIZE in server/online-economy.mjs). The server's
 * duel minimum (MIN_DUEL_ROSTER) is the same value, pinned equal by test.
 */

/** Roster size at which ranked / My Team Season / online-roster duels unlock. */
export const MIN_COMPETITIVE_ROSTER = 8;

/** Roster size for the gate: raw account.playerIds length. */
export function competitiveRosterCount(account) {
  return Array.isArray(account?.playerIds) ? account.playerIds.length : 0;
}

/** True once the account holds at least MIN_COMPETITIVE_ROSTER players. */
export function competitiveUnlocked(account) {
  return competitiveRosterCount(account) >= MIN_COMPETITIVE_ROSTER;
}

/** How many more players the account needs to unlock (0 when unlocked). */
export function competitivePlayersNeeded(account) {
  return Math.max(0, MIN_COMPETITIVE_ROSTER - competitiveRosterCount(account));
}
