/**
 * Career Inbox view helpers — tests (real roster data from disk).
 *
 * Pins: the scout prospect comes from the real bench pool (mpg < 12,
 * gp >= 10) with a deterministic estimate, and exclusions actually
 * exclude; the veteran is the oldest rotation player; the deadline
 * contender is the historical top-star team (CHI -> UTA/Malone,
 * UTA -> CHI/Jordan); one demo game through a real GameSim returns a
 * real report (win/loss, score, core line).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deadlineContender,
  findScoutProspect,
  findVeteran,
  playDemoGame,
} from "../js/ui/careerInboxView.js";
import { buildSeason, rosterCards } from "../js/reborn/season.js";
import { REBORN_TEAM_IDS } from "../js/reborn/identity.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

test("findScoutProspect: a real bench player, deterministic, exclusions work", () => {
  const first = findScoutProspect(rows, { excludeTeamId: "CHI" });
  assert.ok(first, "a prospect exists");
  assert.ok(Number.isFinite(first.estimate));
  assert.ok(first.mpg < 12);
  assert.notEqual(first.team, "CHI");
  assert.deepEqual(first.reasons.length, 3);
  const again = findScoutProspect(rows, { excludeTeamId: "CHI" });
  assert.equal(again.bref, first.bref, "same input, same prospect");
  const excluded = findScoutProspect(rows, { excludeTeamId: "CHI", excludeBrefs: [first.bref] });
  assert.ok(excluded, "another prospect exists after excluding the first");
  assert.notEqual(excluded.bref, first.bref);
});

test("findVeteran: the oldest rotation player on 1996-97 Chicago", () => {
  const cards = rosterCards(rows, "CHI", 1997);
  const veteran = findVeteran(cards);
  assert.ok(veteran, "a veteran exists");
  // Data note: roster rows carry no age — card ages come from the 2K
  // anchor table and default to 26, so the oldest anchored rotation
  // player is Jordan (34). Parish (43 in real life) played only 9.4 mpg
  // for Chicago, below the rotation bar.
  assert.equal(veteran.name, "Michael Jordan");
  assert.equal(veteran.age, 34);
  assert.ok(veteran.mpg >= 15);
});

test("deadlineContender: history decides — CHI faces UTA/Malone, UTA faces CHI/Jordan", () => {
  const forChi = deadlineContender(1997, "CHI");
  assert.equal(forChi.id, "UTA");
  assert.equal(forChi.star, "Karl Malone");
  assert.equal(forChi.starPpg, 27.4);
  const forUta = deadlineContender(1997, "UTA");
  assert.equal(forUta.id, "CHI");
  assert.equal(forUta.star, "Michael Jordan");
  assert.equal(forUta.starPpg, 29.6);
  assert.equal(deadlineContender(1997, "CHI").id, deadlineContender(1997, "CHI").id);
});

test("playDemoGame: one real GameSim game returns a real report", async () => {
  const season = buildSeason({ startYear: 1996, player: { teamId: "CHI" } }, rows);
  assert.equal(season.games.length, 82);
  const core = rosterCards(rows, "CHI", 1997)[0];
  const demo = {
    seed: "inbox-demo|CHI",
    teamId: "CHI",
    games: season.games,
    index: 0,
    coreId: core.id,
  };
  const report = await playDemoGame(demo, rows);
  assert.ok(report, "a report is returned");
  assert.equal(typeof report.won, "boolean");
  assert.ok(Number.isFinite(report.score.home) && Number.isFinite(report.score.away));
  assert.ok(Number.isFinite(report.corePts));
  assert.ok(REBORN_TEAM_IDS.includes(report.opp));
  // Same seed, same game — the demo driver is deterministic.
  const again = await playDemoGame(demo, rows);
  assert.deepEqual(again.score, report.score);
  assert.equal(again.corePts, report.corePts);
});
