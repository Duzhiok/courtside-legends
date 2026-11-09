import test from "node:test";
import assert from "node:assert/strict";
import { MY_TEAM_GOLD, GOLD_LEDGER_CAP, goldEntitlement, grantSeasonGold } from "../js/myteam/seasonRewards.js";
import { seasonFinish, seasonRank, seasonObjectives, seasonReport, objectivesLine } from "../js/myteam/seasonReport.js";
import { myTeamResult } from "../js/myteam/seasonRecord.js";
import { reportHtml, objectivesHtml } from "../js/ui/myTeamReportView.js";
import { legacyFromAccount, legacyHtml, myTeamHistory } from "../js/ui/myWorldView.js";

const ME = "LAS";
function season({ variant = "quick", w = 0, l = 0, phase = "regular", playoffs = null, seasonId = "mts_1", owner = "acc_a", players = [], others = {} } = {}) {
  const games = variant === "full" ? 82 : 20;
  return {
    myTeam: { seasonId, ownerAccountId: owner, rules: { variant, seasonLength: games } },
    userTeamId: ME, rsGames: games, phase, playoffs,
    standings: { [ME]: { w, l }, A: { w: 10, l: 10, ...others.A }, B: { w: 5, l: 15 } },
    playerSeason: Object.fromEntries(players.map((p, i) => [`${ME}:${i}`, { teamId: ME, playerId: String(i), name: p.name, pos: "G", stats: { gp: p.gp ?? 20, min: (p.gp ?? 20) * 30, pts: p.ppg * (p.gp ?? 20), reb: 5 * (p.gp ?? 20), ast: 3 * (p.gp ?? 20) } }])),
  };
}
const inPlayoffs = (extra = {}) => ({ east: { series: [{ high: { id: ME }, low: { id: "B" } }] }, ...extra });
/** An in-memory accounts store with the same get/save contract as account.js. */
function bank(...ids) {
  const accounts = Object.fromEntries(ids.map((id) => [id, { id, gold: 100 }]));
  return { accounts, getAcc: (id) => accounts[id] || null, saveAcc: (a) => { accounts[a.id] = a; } };
}

test("reward table stays below ranked per game and a season is worth about 1-4 extra draws", () => {
  const RANKED_WIN = 40;
  for (const t of Object.values(MY_TEAM_GOLD)) assert.ok(t.win < RANKED_WIN / 4 && t.loss < t.win);
  const champ20 = 12 * MY_TEAM_GOLD.quick.win + 8 * MY_TEAM_GOLD.quick.loss + MY_TEAM_GOLD.quick.completion + MY_TEAM_GOLD.quick.playoffs + MY_TEAM_GOLD.quick.champion;
  const champ82 = 50 * MY_TEAM_GOLD.full.win + 32 * MY_TEAM_GOLD.full.loss + MY_TEAM_GOLD.full.completion + MY_TEAM_GOLD.full.playoffs + MY_TEAM_GOLD.full.champion;
  assert.ok(champ20 / 200 > 1 && champ20 / 200 < 2);
  assert.ok(champ82 / 200 > 3 && champ82 / 200 < 4);
  assert.ok(champ20 < 20 * 40, "20 ranked games always out-earn a 20-game My Team season");
});

test("entitlement is derived from the record, and only completion/title bonuses wait for the end", () => {
  assert.deepEqual(goldEntitlement(season({ w: 5, l: 2 })), { games: 5 * 6 + 2 * 2, completion: 0, playoffs: 0, champion: 0 });
  const done = goldEntitlement(season({ w: 12, l: 8, phase: "done", playoffs: inPlayoffs({ championId: ME }) }));
  assert.deepEqual(done, { games: 88, completion: 40, playoffs: 30, champion: 120 });
  assert.equal(goldEntitlement(season({ w: 12, l: 8, phase: "done", playoffs: inPlayoffs({ championId: "B" }) })).champion, 0);
  assert.equal(goldEntitlement({ userTeamId: ME }), null, "a non-My-Team season earns nothing");
});

test("paying is idempotent: refresh, resume and repeat saves never pay twice", () => {
  const b = bank("acc_a");
  const st = season({ w: 3, l: 1 });
  assert.equal(grantSeasonGold(st, b).gained, 3 * 6 + 2);
  assert.equal(b.accounts.acc_a.gold, 100 + 20);
  for (let i = 0; i < 4; i++) assert.equal(grantSeasonGold(st, b).gained, 0);
  assert.equal(b.accounts.acc_a.gold, 120);
  // a reloaded copy of the same season (same seasonId) is the same season
  assert.equal(grantSeasonGold(structuredClone(st), b).gained, 0);
});

test("later games pay only the difference; finishing pays each bonus once", () => {
  const b = bank("acc_a");
  grantSeasonGold(season({ w: 3, l: 1 }), b);
  assert.equal(grantSeasonGold(season({ w: 4, l: 1 }), b).gained, 6);
  assert.equal(grantSeasonGold(season({ w: 12, l: 8, phase: "regular", playoffs: inPlayoffs() }), b).gained, (12 * 6 + 16) - (4 * 6 + 2) + 30);
  const end = season({ w: 12, l: 8, phase: "done", playoffs: inPlayoffs({ championId: ME }) });
  const g = grantSeasonGold(end, b);
  assert.equal(g.gained, 40 + 120);
  assert.equal(g.total, 88 + 40 + 30 + 120);
  assert.equal(grantSeasonGold(end, b).gained, 0);
  assert.equal(b.accounts.acc_a.gold, 100 + 278);
});

test("a state that goes backwards (odd save) never claws gold back or pays again", () => {
  const b = bank("acc_a");
  grantSeasonGold(season({ w: 10, l: 2 }), b);
  const after = b.accounts.acc_a.gold;
  assert.equal(grantSeasonGold(season({ w: 2, l: 0 }), b).gained, 0);
  assert.equal(b.accounts.acc_a.gold, after);
  assert.equal(grantSeasonGold(season({ w: 10, l: 2 }), b).gained, 0);
});

test("only the season's own account is credited; a missing owner pays nothing", () => {
  const b = bank("acc_a", "acc_b");
  grantSeasonGold(season({ w: 5, l: 0, owner: "acc_a" }), b);
  assert.equal(b.accounts.acc_b.gold, 100);
  assert.equal(b.accounts.acc_b.myTeamGold, undefined);
  assert.equal(grantSeasonGold(season({ w: 5, l: 0, owner: "acc_gone" }), b).gained, 0);
  assert.equal(grantSeasonGold(season({ w: 5, l: 0, owner: null }), b).gained, 0);
});

test("20-game and 82-game seasons use their own rates; the ledger is capped", () => {
  const b = bank("acc_a");
  assert.equal(grantSeasonGold(season({ variant: "full", w: 10, l: 10, seasonId: "f1" }), b).gained, 10 * 3 + 10);
  for (let i = 0; i < GOLD_LEDGER_CAP + 5; i++) grantSeasonGold(season({ w: 1, l: 0, seasonId: `s${i}` }), b);
  const ids = Object.keys(b.accounts.acc_a.myTeamGold);
  assert.equal(ids.length, GOLD_LEDGER_CAP);
  assert.equal(ids.at(-1), `s${GOLD_LEDGER_CAP + 4}`, "newest season is kept");
});

test("finish, rank and objectives come from real fields", () => {
  const champ = season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: ME }) });
  assert.equal(seasonFinish(champ), "champion");
  assert.equal(seasonFinish(season({ w: 9, l: 11, phase: "done", playoffs: inPlayoffs({ championId: "B" }) })), "playoffs");
  assert.equal(seasonFinish(season({ w: 9, l: 11, phase: "done", playoffs: { east: { series: [] }, finals: { high: { id: ME }, low: { id: "B" } }, championId: "B" } })), "finals");
  assert.equal(seasonFinish(season({ w: 2, l: 9, phase: "done", playoffs: { east: { series: [] } } })), "missed");
  assert.equal(seasonFinish(season({ w: 2, l: 1 })), "pending");
  assert.deepEqual(seasonRank(champ), { rank: 1, teams: 3 });
  const obj = (st) => Object.fromEntries(seasonObjectives(st).map((o) => [o.id, o.status]));
  assert.deepEqual(obj(season({ w: 1, l: 1 })), { wins60: "open", playoffs: "open", star20: "open", title: "open" });
  assert.equal(obj(season({ w: 12, l: 0 })).wins60, "done");
  assert.equal(obj(season({ w: 5, l: 9 })).wins60, "failed", "can no longer reach 12 wins");
  const full = obj(season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: ME }), players: [{ name: "Star", ppg: 27 }] }));
  assert.deepEqual(full, { wins60: "done", playoffs: "done", star20: "done", title: "done" });
  assert.equal(obj(season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: "B" }), players: [{ name: "Role", ppg: 11 }] })).star20, "failed");
  assert.match(objectivesLine(seasonObjectives(season({ w: 12, l: 0 })), "zh"), /✓ 赢下 12\+ 场/);
});

test("the report shows what players did; the history record keeps finish, rank and the star", () => {
  const st = season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: ME }), players: [{ name: "Role", ppg: 8 }, { name: "Star", ppg: 25.5 }] });
  st.awards = { mvp: { name: "Star", teamId: ME, ppg: 25.5 } };
  const r = seasonReport(st);
  assert.equal(r.star.name, "Star");
  assert.deepEqual(r.players.map((p) => p.name), ["Star", "Role"]);
  assert.equal(r.mvp.mine, true);
  const rec = myTeamResult(st);
  assert.deepEqual([rec.finish, rec.rank, rec.star.name, rec.champion], ["champion", 1, "Star", true]);
});

test("report markup escapes player names and has no Chinese in English", () => {
  const st = season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: ME }), players: [{ name: "<img src=x onerror=1>", ppg: 20 }] });
  const html = reportHtml({ report: seasonReport(st), gold: { total: 278, parts: { games: 88, completion: 40, playoffs: 30, champion: 120 } }, lang: "en" });
  assert.ok(!html.includes("<img"), "name escaped");
  assert.ok(html.includes("&lt;img"));
  assert.ok(!/[\u4e00-\u9fff]/.test(html), "English report is English");
  assert.ok(html.includes("¤278"));
  assert.ok(!/[\u4e00-\u9fff]/.test(objectivesHtml(seasonObjectives(st), "en")));
  assert.match(reportHtml({ report: seasonReport(st), gold: null, lang: "zh" }), /赛季报告/);
});

test("My World shows My Team titles and recent seasons, counted per account", () => {
  const list = [
    { seasonId: "a", variant: "quick", w: 14, l: 6, champion: true, finish: "champion", star: { name: "<b>X</b>", ppg: 24 } },
    { seasonId: "b", variant: "full", w: 40, l: 42, champion: false, finish: "missed" },
    { seasonId: "c", variant: "quick", w: 12, l: 8, champion: true },
    null,
  ];
  const h = myTeamHistory(list);
  assert.deepEqual([h.titles, h.played, h.recent.length], [2, 3, 3]);
  const legacy = legacyFromAccount({ playerIds: ["x"], myTeamSeasons: list });
  const html = legacyHtml(legacy, null, "zh");
  assert.match(html, /我的赛季 · 2 座总冠军/);
  assert.ok(!html.includes("<b>X</b>") && html.includes("&lt;b&gt;X"));
  assert.ok(!html.includes("还没有冠军"), "titles from My Team replace the empty state");
  const en = legacyHtml(legacy, null, "en");
  assert.match(en, /My Team seasons · 2 title/);
  assert.match(legacyHtml(legacyFromAccount({ playerIds: [] }), null, "zh"), /还没有冠军/);
  assert.equal(legacyFromAccount(null), null);
});

test("report table keeps the minutes column droppable on phones and says playoff stats are included", () => {
  const st = season({ w: 14, l: 6, phase: "done", playoffs: inPlayoffs({ championId: ME }), players: [{ name: "A", ppg: 20 }] });
  const html = reportHtml({ report: seasonReport(st), gold: null, lang: "zh" });
  assert.equal((html.match(/class="mtr-min"/g) || []).length, 2, "header + one row cell");
  assert.match(html, /球员数据含季后赛/);
});
