/**
 * Franchise lineage for Player Reborn's multi-season schedule.
 *
 * The Reborn schedule is built on the 29 team ids of the 1996-97 league (REBORN_TEAM_IDS), and those ids stay the stable identity of a
 * franchise for the whole run: standings, rivalry records and game ids all use them. The roster data, though, names a franchise by the
 * code it used THAT season. Once the run moves past 1997 the two disagree (the Bullets became the Wizards in 1998, the Grizzlies left
 * Vancouver in 2002, ...), and a roster looked up by the old id is EMPTY: the game is then played against nobody (0-0, no minutes).
 *
 * This table says which roster code a stable id has from which season on. It was derived from the roster data itself (the code whose
 * previous-season players carried over) and checked against league history; tests/rebornFranchises.test.js asserts that every id has a
 * full roster in every season from 1997 on, so a data change that breaks the table fails loudly instead of voiding games.
 * Expansion teams that have no 1997 id (Charlotte Bobcats 2005, ...) are not in the Reborn schedule; that is a known gap, not a void game.
 */

/** stable id -> [[first season (roster.json season = end year) of the code, code], ...] in order. */
export const FRANCHISE_CODES = Object.freeze({
  WSB: [[1998, "WAS"]],
  VAN: [[2002, "MEM"]],
  CHH: [[2003, "NOH"], [2006, "NOK"], [2008, "NOH"], [2014, "NOP"]],
  SEA: [[2009, "OKC"]],
  NJN: [[2013, "BRK"]],
});

/** The roster code of a Reborn team id in a season. An id with no lineage (or a season before its first change) is its own code. */
export function rosterCode(teamId, season) {
  const steps = FRANCHISE_CODES[teamId];
  if (!steps) return teamId;
  const year = Number(season);
  let code = teamId;
  for (const [from, next] of steps) if (year >= from) code = next;
  return code;
}
