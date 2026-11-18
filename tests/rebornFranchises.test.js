import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FRANCHISE_CODES, rosterCode } from "../js/reborn/franchises.js";
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
  assert.equal(rosterCode("BOS", 2010), "BOS");
  assert.equal(rosterCode("NOPE", 2010), "NOPE");
});

test("every Reborn team has a full roster in every season from 1997 on, and no two ids resolve to the same roster (a missing one plays the game against nobody)", () => {
  for (let year = 1997; year <= 2024; year += 1) {
    const codes = REBORN_TEAM_IDS.map((id) => rosterCode(id, year));
    assert.equal(new Set(codes).size, REBORN_TEAM_IDS.length, `${year}: two ids share a roster`);
    for (const id of REBORN_TEAM_IDS) {
      const n = rosterCards(ROWS, id, year).length;
      assert.ok(n >= 8, `${year} ${id} (${rosterCode(id, year)}) has ${n} players`);
    }
  }
  for (const id of Object.keys(FRANCHISE_CODES)) assert.ok(REBORN_TEAM_IDS.includes(id), `${id} is a Reborn team id`);
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
