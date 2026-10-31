// Shared REAL-engine career fixtures (real prologue, real season, real firing) for the time-travel
// tests. Importing this module also stocks PLAYERS -- see installSyntheticPlayers().
import assert from "node:assert/strict";
import { historicalSeason } from "../../js/data/historicalSeasons.js";
import { PLAYERS } from "../../js/data/players.js";
import { acceptInterviewOffer, createTimeTravelPrologue } from "../../js/modes/timeTravelCareer.js";
import { evaluateCareerEmployment } from "../../js/modes/careerContract.js";
import { createCoachProfile } from "../../js/career/coachProfile.js";

export const YEAR = 1995;

// PLAYERS is only filled by the browser's loadPlayers(); in Node it is empty and the season builder
// would spin forever looking for a roster. Same synthetic-cards trick timeTravelCareer.test.js uses.
function playerCard(team, index) {
  const rating = 55 + ((team.charCodeAt(0) + index) % 35);
  return {
    id: `reemp-${team}-${index}`, name: `${team} Player ${index}`, season: YEAR, team, pos: "SF",
    scoring: rating, three: rating, mid: rating, paint: rating, defense: rating, rebound: rating,
    pass: rating, speed: rating, strength: rating, stamina: rating, iq: rating, clutch: rating,
    steal: rating, block: rating,
  };
}
for (const team of historicalSeason(YEAR).teams) {
  for (let index = 0; index < 12; index++) PLAYERS.push(playerCard(team.id, index));
}
// createSeason() also stocks a free-agent pool; with none in PLAYERS it spins forever.
for (let index = 0; index < 12; index++) PLAYERS.push(playerCard("FREE", index));

/** A REAL hired career (real prologue, real season) -- re-employment builds a real new season, so
 * a hand-faked root isn't enough here the way it is for the pure contract tests. */
export function hiredRoot(reputation) {
  const prologue = createTimeTravelPrologue({ year: YEAR, philosophy: "analytics", seed: 7 });
  const root = acceptInterviewOffer(prologue, prologue.offers[1].id);
  return reputation === undefined
    ? root
    : { ...root, coach: createCoachProfile({ ...(root.coach || {}), reputation, cash: 40 }) };
}

export function withHistory(root, history) {
  return {
    ...root,
    leagueCareer: {
      ...root.leagueCareer,
      management: { ...root.leagueCareer.management, seasonHistory: history },
    },
  };
}

export function badSeasons(root, count = 2) {
  const id = root.story.employer;
  return Array.from({ length: count }, (_, i) => ({
    year: YEAR + i, teamId: id, teamName: "T", record: { w: 28 - i, l: 54 + i }, finish: "lottery", championId: "LAL",
  }));
}

export function firedRoot(reputation) {
  const hired = hiredRoot(reputation);
  const fired = evaluateCareerEmployment(withHistory(hired, badSeasons(hired)));
  assert.equal(fired.story.employment.status, "fired", "fixture must really be fired");
  return fired;
}

