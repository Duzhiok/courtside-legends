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
 *
 * This is deliberately not js/data/franchises.js: that table is a year-less set of every code a modern club ever used (Legend Mode), so it cannot say
 * which code a team had in a given season, and it folds the old Charlotte Hornets into the new Charlotte club.
 */
import { REBORN_EAST_IDS, REBORN_WEST_IDS } from "./identity.js";

/** stable id -> [[first season (roster.json season = end year) of the code, code], ...] in order. */
export const FRANCHISE_CODES = Object.freeze({
  WSB: [[1998, "WAS"]],
  VAN: [[2002, "MEM"]],
  CHH: [[2003, "NOH"], [2006, "NOK"], [2008, "NOH"], [2014, "NOP"]],
  SEA: [[2009, "OKC"]],
  NJN: [[2013, "BRK"]],
  // The Charlotte expansion team (Bobcats, 2005; Hornets again from 2015). NOT the old Charlotte Hornets (CHH), which is the New Orleans line above.
  CHA: [[2005, "CHA"], [2008, "CHR"], [2011, "CHA"], [2015, "CHO"]],
});

/**
 * Franchises that join the league AFTER 1997. They are scheduled only from `from` on and are never a starting team for a new run
 * (REBORN_TEAM_IDS stays the 29 franchises of 1996-97, which is what creation and identity validation use).
 * The roster data holds exactly one more club from 2005 on (30, then the stray "NBA" bucket, which is not a team).
 */
export const EXPANSION_FRANCHISES = Object.freeze([{ id: "CHA", from: 2005, conference: "east" }]);

/** The teams in the league in a season, in a stable order: the 29 of 1996-97 first (so schedules before any expansion are exactly what they were), then expansion teams. */
export function leagueLayout(season) {
  const year = Number(season);
  const joined = EXPANSION_FRANCHISES.filter((f) => year >= f.from);
  const eastIds = [...REBORN_EAST_IDS, ...joined.filter((f) => f.conference === "east").map((f) => f.id)];
  const westIds = [...REBORN_WEST_IDS, ...joined.filter((f) => f.conference === "west").map((f) => f.id)];
  const confById = Object.fromEntries([...eastIds.map((id) => [id, "east"]), ...westIds.map((id) => [id, "west"])]);
  return { teamIds: [...eastIds, ...westIds], eastIds, westIds, confById };
}

/** The roster code of a Reborn team id in a season. An id with no lineage (or a season before its first change) is its own code. */
export function rosterCode(teamId, season) {
  const steps = FRANCHISE_CODES[teamId];
  if (!steps) return teamId;
  const year = Number(season);
  let code = teamId;
  for (const [from, next] of steps) if (year >= from) code = next;
  return code;
}
