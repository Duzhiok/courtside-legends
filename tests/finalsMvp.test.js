// R89 Finals MVP: champion-team only, judged on Finals-series performance,
// recorded in the season summary.
import test from "node:test";
import assert from "node:assert/strict";
import { selectFinalsMvp } from "../js/engine/allTeam.js";
import { computeFinalsMvp } from "../js/engine/season.js";
import { annualSummary } from "../js/modes/leagueCareer.js";

function row(id, teamId, { ppg = 20, rpg = 5, apg = 5, ovr = 85, wins = 4, gp = 5 } = {}) {
  return {
    id, name: id, teamId, teamName: teamId, pos: "SF", ovr,
    gp, pts: ppg * gp, reb: rpg * gp, ast: apg * gp, stl: 5, blk: 5, min: 35 * gp, wins, gradeSum: 0,
  };
}

test("selectFinalsMvp picks the champion's best, never the losing finalist's star", () => {
  const board = {
    champStar: row("champStar", "CHAMP", { ppg: 30, rpg: 8, apg: 6, ovr: 90, wins: 4 }),
    champRole: row("champRole", "CHAMP", { ppg: 15, rpg: 4, apg: 3, ovr: 75, wins: 4 }),
    loserStar: row("loserStar", "LOSE", { ppg: 35, rpg: 10, apg: 8, ovr: 92, wins: 1 }),
  };
  const mvp = selectFinalsMvp(board, "CHAMP");
  assert.equal(mvp.id, "champStar");
  assert.equal(mvp.teamId, "CHAMP");
  assert.equal(mvp.ppg, 30);
  assert.equal(selectFinalsMvp(board, "LOSE").id, "loserStar");
  assert.equal(selectFinalsMvp({}, "CHAMP"), null);
  assert.equal(selectFinalsMvp(board, " NOBODY "), null);
});

test("computeFinalsMvp prefers the Finals board, falls back to the Finals All-Team", () => {
  const board = {
    champStar: row("champStar", "CHAMP", { ppg: 30, ovr: 90 }),
    loserStar: row("loserStar", "LOSE", { ppg: 35, ovr: 92 }),
  };
  assert.equal(computeFinalsMvp({ playoffs: { championId: "CHAMP" }, finalsBoard: board }).id, "champStar");
  const fallback = computeFinalsMvp({
    playoffs: { championId: "CHAMP" },
    finalsAllTeam: [
      { id: "champBest", name: "champBest", teamId: "CHAMP", score: 80 },
      { id: "loserBest", name: "loserBest", teamId: "LOSE", score: 95 },
    ],
  });
  assert.equal(fallback.id, "champBest");
  assert.equal(computeFinalsMvp({ playoffs: {} }), null);
  assert.equal(computeFinalsMvp({ playoffs: { championId: "CHAMP" }, finalsBoard: {}, finalsAllTeam: [] }), null);
});

test("annualSummary records the Finals MVP in awards", () => {
  const season = {
    year: 2024,
    userTeamId: "USER",
    teams: { USER: { name: "我方" } },
    standings: { USER: { w: 60, l: 22 } },
    playoffs: { championId: "USER", finals: { high: { id: "USER" }, low: { id: "OPP" } } },
    awards: {},
    tradeLog: [],
    finalsMvp: { id: "star", name: "Star", teamId: "USER" },
  };
  const summary = annualSummary(season);
  assert.equal(summary.finish, "champion");
  assert.deepEqual(summary.awards.finalsMvp, { playerId: "star", name: "Star", teamId: "USER" });
  const noMvp = annualSummary({ ...season, finalsMvp: null });
  assert.equal(noMvp.awards.finalsMvp, null);
});
