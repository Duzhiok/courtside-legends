import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXPANSION_FRANCHISES, FRANCHISE_CODES, leagueLayout, rosterCode } from "../js/reborn/franchises.js";
import { REBORN_TEAM_IDS, createRebornState } from "../js/reborn/identity.js";
import { buildSeason, playGame, rosterCards } from "../js/reborn/season.js";
import { rolloverSeason } from "../js/reborn/contract.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });

test("rosterCode: a franchise keeps its Reborn id and takes the code it had that season; an id with no lineage is its own code", () => {
  assert.equal(rosterCode("WSB", 1997), "WSB");
  assert.equal(rosterCode("WSB", 1998), "WAS");
  assert.equal(rosterCode("VAN", 2001), "VAN");
  assert.equal(rosterCode("VAN", 2002), "MEM");
  assert.deepEqual([2002, 2003, 2005, 2006, 2007, 2008, 2013, 2014].map((y) => rosterCode("CHH", y)), ["CHH", "NOH", "NOH", "NOK", "NOK", "NOH", "NOH", "NOP"]);
  assert.equal(rosterCode("SEA", 2009), "OKC");
  assert.equal(rosterCode("NJN", 2013), "BRK");
  assert.deepEqual([2005, 2007, 2008, 2010, 2011, 2014, 2015, 2025].map((y) => rosterCode("CHA", y)), ["CHA", "CHA", "CHR", "CHR", "CHA", "CHA", "CHO", "CHO"], "the Charlotte expansion club");
  assert.equal(rosterCode("BOS", 2010), "BOS");
  assert.equal(rosterCode("NOPE", 2010), "NOPE");
});

test("every team in the league has a full roster in every season from 1997 on, no two ids resolve to the same roster, and every club in the data is a scheduled team (a missing one plays the game against nobody)", () => {
  for (let year = 1997; year <= 2025; year += 1) {
    const league = leagueLayout(year);
    const codes = league.teamIds.map((id) => rosterCode(id, year));
    assert.equal(new Set(codes).size, league.teamIds.length, `${year}: two ids share a roster`);
    const dataTeams = new Set(ROWS.filter((r) => r.season === year && r.team !== "NBA").map((r) => r.team));   // "NBA" is a bucket of unattributed rows, not a club
    assert.deepEqual([...dataTeams].sort(), [...codes].sort(), `${year}: the schedule and the roster data disagree about which clubs exist`);
    for (const id of league.teamIds) {
      const n = rosterCards(ROWS, id, year).length;
      assert.ok(n >= 8, `${year} ${id} (${rosterCode(id, year)}) has ${n} players`);
    }
  }
  const known = new Set([...REBORN_TEAM_IDS, ...EXPANSION_FRANCHISES.map((f) => f.id)]);
  for (const id of Object.keys(FRANCHISE_CODES)) assert.ok(known.has(id), `${id} is a league team id`);
});

test("a second-season game against the renamed franchise is a real game: both teams score, the player plays, the opponent is that year's roster", async () => {
  let reborn = createRebornState("franchise-check", ROWS);
  reborn.player.coachTrust = 80;
  const first = buildSeason(reborn, ROWS);
  reborn = rolloverSeason(reborn, { year: first.year, players: ROWS }).reborn;
  const season = buildSeason(reborn, ROWS);
  assert.equal(season.year, first.year + 1);
  season.index = season.games.findIndex((g) => g.homeId === "WSB" || g.awayId === "WSB");
  assert.ok(season.index >= 0, "the schedule has a Washington game");
  const { report } = await playGame(reborn, season, ROWS, { onTakeover: takeover });
  assert.ok(report.score.home > 60 && report.score.away > 60, `scores ${JSON.stringify(report.score)}`);
  assert.ok(report.line.min > 0, "the player was on the floor");
  assert.ok(report.opponents.length >= 8, "the opponent has a roster");
  assert.ok(report.opponents.every((p) => p.id.includes(`-${season.year}-`)), "every opposing card is from the season being played");
  assert.equal(report.opp, "WSB", "the stable Reborn id is what the run records");
});

test("the league grows only by real expansion: the 29 clubs of 1996-97 until the Charlotte expansion team joins in 2005, as a NEW club (not a relocation)", () => {
  for (let year = 1997; year <= 2004; year += 1) {
    const league = leagueLayout(year);
    assert.deepEqual(league.teamIds, REBORN_TEAM_IDS, `${year}: before expansion the league is exactly the 29 stable ids, in the same order (so older schedules do not change)`);
  }
  for (let year = 2005; year <= 2025; year += 1) {
    const league = leagueLayout(year);
    assert.equal(league.teamIds.length, 30);
    assert.deepEqual(league.teamIds.filter((id) => id !== "CHA").sort(), [...REBORN_TEAM_IDS].sort(), "the original 29 are all still there");
    assert.equal(league.confById.CHA, "east");
    assert.ok(!REBORN_TEAM_IDS.includes("CHA"), "an expansion club is not a starting team for a new run");
  }
  // Charlotte (CHA) and the old Charlotte Hornets (CHH, now New Orleans) are different clubs: no player list is shared in the first expansion year.
  const cha = new Set(ROWS.filter((r) => r.season === 2005 && r.team === "CHA").map((r) => r.bref));
  const nola = new Set(ROWS.filter((r) => r.season === 2005 && r.team === rosterCode("CHH", 2005)).map((r) => r.bref));
  assert.equal([...cha].filter((b) => nola.has(b)).length, 0);
});

test("the Charlotte lineage is one club across its code changes: the roster carries over between neighbouring seasons", () => {
  const brefs = (year) => new Set(ROWS.filter((r) => r.season === year && r.team === rosterCode("CHA", year)).map((r) => r.bref));
  for (const year of [2006, 2007, 2008, 2009, 2011, 2012, 2015, 2016]) {
    const before = brefs(year - 1);
    const kept = [...brefs(year)].filter((b) => before.has(b)).length;
    assert.ok(kept >= 4, `${year}: only ${kept} players carried over from ${year - 1} (${rosterCode("CHA", year - 1)} -> ${rosterCode("CHA", year)})`);
  }
});
