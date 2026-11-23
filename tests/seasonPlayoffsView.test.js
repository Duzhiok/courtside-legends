// B61: the season playoffs tab is a pure view now. These use hand-built season states (no engine sim, so a GameSim
// recalibration cannot move them). The move itself was proven byte-identical against the old inline code on real engine
// seasons (7 stages x 4 flag combinations x zh/en = 56 cases, see docs/BACKLOG.md B61 step 6).
import test from "node:test";
import assert from "node:assert/strict";
import { setLang } from "../js/i18n.js";
import { playoffsHtml, playoffsPromptHtml } from "../js/ui/seasonPlayoffsView.js";

const team = (id, name) => ({ id, name });
const game = (homeId, awayId, homeScore, awayScore) => ({ homeId, awayId, homeScore, awayScore, winnerId: homeScore > awayScore ? homeId : awayId });
const stat = (gp, pts, extra = {}) => ({ gp, min: gp * 30, pts, reb: gp * 5, ast: gp * 4, plusMinus: 0, ...extra });

function season(over = {}) {
  return {
    year: 2024,
    phase: "playoffs",
    userTeamId: "A",
    teams: { A: { name: "Aces" }, B: { name: "Bolts" }, C: { name: "Comets" }, D: { name: "Drift" } },
    standings: { A: { w: 50, l: 32, pf: 9000, pa: 8800 } },
    playerSeason: {},
    playoffs: {
      east: { round: 2, series: [{ high: team("A", "Aces"), low: team("B", "Bolts"), winsHigh: 4, winsLow: 2, done: true, winnerId: "A", winnerName: "Aces", games: [game("A", "B", 101, 99), game("B", "A", 90, 95)] }], finalist: "A" },
      west: { round: 2, series: [{ high: team("C", "Comets"), low: team("D", "Drift"), winsHigh: 4, winsLow: 1, done: true, winnerId: "C", winnerName: "Comets", games: [] }], finalist: "C" },
      finals: { high: team("A", "Aces"), low: team("C", "Comets"), winsHigh: 1, winsLow: 2, done: false, games: [game("A", "C", 100, 98)] },
      championId: null,
    },
    ...over,
  };
}

test("before the playoffs: the hint and the one-click sim button, enabled only while the regular season / awards are open", () => {
  setLang("zh");
  for (const [phase, enabled] of [["regular", true], ["awards", true], ["playoffs", false], ["done", false]]) {
    const html = playoffsPromptHtml({ phase });
    assert.match(html, /常规赛结束后从评奖页进入季后赛/);
    assert.equal(/id="btn-season-sim-playoffs" disabled/.test(html), !enabled, phase);
  }
  setLang("en");
  assert.match(playoffsPromptHtml({ phase: "awards" }), /Sim the whole playoffs/);
});

test("mid-playoffs: both conference blocks, a series row with its games, the live Finals card with the next home team, the bulk buttons", () => {
  setLang("zh");
  const html = playoffsHtml(season());
  assert.match(html, /东部 · R2/);
  assert.match(html, /西部 · R2/);
  assert.match(html, /Aces vs Bolts<\/span><strong>4-2 · Aces/);
  assert.match(html, /G1 Aces <b>101<\/b>–<b>99<\/b> Bolts/, "a played game is listed home first");
  assert.match(html, /series-game hi/, "the winner of a game is marked");
  assert.match(html, /分区冠军：Aces/);
  assert.match(html, /总决赛 · 七场四胜/);
  assert.match(html, /下一场：第 4 场 · 主场 /, "Finals game 4 follows 1-2");
  assert.match(html, /id="btn-season-night-po">模拟总决赛下一场/);
  assert.match(html, /id="btn-season-advance-po">打完总决赛/);
  assert.match(html, /id="btn-season-sim-all-po"/);
  assert.doesNotMatch(html, /btn-season-offseason/, "no offseason button until the season is done");
  setLang("en");
  const en = playoffsHtml(season());
  assert.match(en, /Next: Game 4 · home /);
  assert.match(en, /Sim next Finals game/);
});

test("without a Finals yet, the night button names what it does: play the night, or start the next round", () => {
  setLang("en");
  const open = season();
  open.playoffs.finals = null;
  open.playoffs.east.series[0].done = false;
  assert.match(playoffsHtml(open), /Sim next playoff night/);
  open.playoffs.east.series[0].done = true;
  assert.match(playoffsHtml(open), /Start next round/);
});

test("a finished season: champion, Finals All-Team, Finals MVP, no bulk buttons, one offseason button whose wording follows the career", () => {
  setLang("zh");
  const done = season({
    phase: "done",
    finalsAllTeam: [{ slot: "PG", name: "Ann", teamName: "Aces", gp: 6, ppg: 21, rpg: 4, apg: 8 }, { pos: "C", name: "Bo", teamName: "Comets", gp: 0, ovr: 77 }],
    finalsMvp: { name: "Ann", teamName: "Aces", gp: 6, ppg: 21, rpg: 4, apg: 8 },
  });
  done.playoffs.finals = { ...done.playoffs.finals, winsHigh: 4, winsLow: 2, done: true };
  done.playoffs.championId = "A";
  const plain = playoffsHtml(done);
  assert.match(plain, /总冠军 Aces/);
  assert.match(plain, /总决赛最佳阵容/);
  assert.match(plain, /21分 4板 8助/);
  assert.match(plain, /OVR 77/, "a player with no games shows his rating instead");
  assert.match(plain, /总决赛 MVP/);
  assert.doesNotMatch(plain, /btn-season-night-po|btn-season-advance-po|btn-season-sim-all-po/, "B59: dead bulk buttons are not drawn");
  assert.match(plain, /休赛期成长 · 开启 2025 赛季/);
  assert.match(playoffsHtml(done, { managed: true }), /进入休赛期选秀/);
  assert.match(playoffsHtml(done, { managed: true, hasDraft: true }), /继续选秀/, "an open draft board wins over the managed wording");
  assert.match(playoffsHtml(done, { hasDraft: true }), /继续选秀/);
  // A My Team season has its own done bar: no offseason button, and then no action row at all.
  const myTeam = playoffsHtml({ ...done, myTeam: true });
  assert.doesNotMatch(myTeam, /btn-season-offseason|btn-row/);
});

test("the live stat table: your team's players only, best scorer first, eight at most, names escaped, and an empty-state row", () => {
  setLang("zh");
  const rows = {};
  for (let i = 0; i < 10; i += 1) rows[`p${i}`] = { name: `Mine ${i}`, teamId: "A", stats: stat(10, 100 + i * 10) };
  rows.other = { name: "Not mine", teamId: "B", stats: stat(10, 900) };
  rows.nogames = { name: "Bench Guy", teamId: "A", stats: stat(0, 0) };
  rows.evil = { name: "<img src=x onerror=1>", teamId: "A", stats: stat(10, 5000) };
  const html = playoffsHtml(season({ playerSeason: rows }));
  const body = html.split("<tbody>")[1].split("</tbody>")[0];
  assert.equal((body.match(/<tr>/g) || []).length, 8, "top eight");
  assert.doesNotMatch(body, /Not mine|Bench Guy/);
  assert.ok(body.indexOf("&lt;img") !== -1 && !body.includes("<img"), "a hostile name is escaped");
  assert.ok(body.indexOf("&lt;img") < body.indexOf("Mine 9"), "sorted by points per game");
  assert.match(html, /50胜32负 · 净胜 200/);
  assert.match(playoffsHtml(season()), /暂无球员数据/);
  assert.match(playoffsHtml(season({ standings: {} })), /暂无战绩/);
});

test("last offseason's log shows up to 16 rows, with the salary move only when there is one", () => {
  setLang("en");
  const log = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, fromSeason: 2023, toSeason: 2024, before: 70, after: 72, delta: 2 }));
  log[0] = { ...log[0], salaryBefore: 100, salaryAfter: 140, renewal: "3y" };
  const html = playoffsHtml(season({ offseasonLog: log }));
  assert.equal((html.match(/OVR 70\+2→72/g) || []).length, 16);
  assert.match(html, /P0：2023→2024 · OVR 70\+2→72 · Sal ¤100→¤140 \(3y\)/);
  assert.doesNotMatch(html, /P1：.*Sal /);
  assert.doesNotMatch(playoffsHtml(season()), /Last offseason growth/);
});
