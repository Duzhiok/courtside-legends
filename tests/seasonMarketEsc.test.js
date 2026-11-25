import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esc } from "../js/core/html.js";
import { marketOwnedCard, playerMarketCardHtml } from "../js/ui/marketCards.js";
import { playoffsHtml } from "../js/ui/seasonPlayoffsView.js";
import { evaluateRosterPlayer, renderRosterEvaluation } from "../js/ui/rosterEvaluationView.js";

// Regression (B119, 2026-11-24): esc audit batch 3 — the season/market/trade
// screen group. The 2026-11-19 audit listed 51 medium-risk unescaped name
// interpolations; batches 1 (Wibey 519df336, load boundary) and 2 (B118,
// live-match group) are done. This batch re-verified the season/market/trade
// group at current line numbers and found 15 sites still raw: the duel
// bid card, the two market card builders (now in marketCards.js), the three
// trade checkbox player labels, the season roster preview chips, the Finals
// MVP + All-Team lines in renderResultAllTeam, the non-career scout opponent
// line, the playoffs tab series rows / champion / finalist / All-Team / MVP /
// offseason log, and the roster evaluation card. Each now goes through
// esc() (defense in depth on top of the load gate).
//
// Re-verified safe, not fixed here: tournament slot/bracket/champion names
// are generated literals (`玩家 ${i + 1}` / `轮空 AI ${i + 1}`, no input
// path); the result-summary team names go through textContent; the
// offseason recap only reaches alert(); familyDuelCardRow pools come from
// PLAYERS (roster.json) and the season-offer chips from franchise rosters —
// both low-risk roster data, left for the low-risk batch.
const appSrc = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const poSrc = readFileSync(new URL("../js/ui/seasonPlayoffsView.js", import.meta.url), "utf8");

function body(src, fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  assert.ok(start >= 0, `function ${fnName} not found`);
  const paramsClose = src.indexOf(") {", start);
  assert.ok(paramsClose >= 0, `function ${fnName} has no ") {"`);
  const openIdx = paramsClose + 1;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${fnName}`);
}

const BAD = '<img src=x onerror=alert(1)>';

function assertEscaped(html, label) {
  assert.ok(!html.includes(BAD), `${label}: raw crafted name must not appear`);
  assert.ok(html.includes("&lt;img"), `${label}: crafted name must be escaped`);
}

test("bid card: duel bid player name is escaped", () => {
  const line = appSrc.split("\n").find((l) => l.includes("#bid-card") && l.includes("innerHTML") && l.includes("p.name"));
  assert.ok(line, "bid-card innerHTML line not found");
  assert.ok(/esc\(p\.name\)/.test(line), "bid card must esc the player name");
  assert.ok(!/\$\{p\.name\}/.test(line), "no raw ${p.name} may remain on the bid-card line");
});

test("trade rows: all three player checkbox labels escape the name", () => {
  const labels = [...appSrc.matchAll(/tradeCheckboxRow\("sm-(?:give|want|want3)-player", p\.id, `([^`]*)`\)/g)];
  assert.equal(labels.length, 3, "expected the three player trade label call sites");
  for (const [, label] of labels) {
    assert.ok(label.includes("esc(p.name)"), `trade label must esc the player name: ${label}`);
    assert.ok(!label.includes("${p.name}"), `no raw \${p.name} in trade label: ${label}`);
  }
});

test("season roster preview chips escape the player name", () => {
  const fnSrc = body(appSrc, "previewSeasonRoster");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in the roster preview");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "roster preview chips must esc the player name");
});

test("non-career scout line escapes the opponent team name", () => {
  const hits = [...appSrc.matchAll(/\$\{esc\(oppTeam\.name\)\}/g)];
  assert.equal(hits.length, 1, "the opponent line must esc the team name exactly once");
});

test("renderResultAllTeam: Finals MVP line and All-Team slots escape names", () => {
  const fnSrc = body(appSrc, "renderResultAllTeam");
  assert.ok(!/\$\{mvp\.name\}|\$\{mvp\.teamName\}|\$\{p\.name\}|\$\{p\.teamName/.test(fnSrc), "no raw MVP/slot name may remain");
  assert.equal((fnSrc.match(/esc\(mvp\.name\)/g) || []).length, 2, "MVP name must be escaped in both languages");
  assert.equal((fnSrc.match(/esc\(mvp\.teamName\)/g) || []).length, 2, "MVP team must be escaped in both languages");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "All-Team slot must esc the player name");
  assert.ok(/esc\(p\.teamName/.test(fnSrc), "All-Team slot must esc the team name");
});

test("renderResultAllTeam: crafted MVP and slot names come out escaped", () => {
  const start = appSrc.search(/function renderResultAllTeam\(/);
  const paramsClose = appSrc.indexOf(") {", start);
  const header = appSrc.slice(start, paramsClose + 1);
  const rebuilt = new Function("$", "L", "photoImg", "esc", `return (${header}${body(appSrc, "renderResultAllTeam")});`);
  const box = { hidden: true, innerHTML: "" };
  const fn = rebuilt(() => box, (zh) => zh, () => "", esc);
  fn(
    [{ slot: "PG", pos: "PG", name: BAD, teamName: BAD, gp: 5, ppg: 20, rpg: 5, apg: 6 }],
    "总决赛最佳阵容",
    { name: BAD, teamName: BAD, ppg: 25, rpg: 6, apg: 5, gp: 5 },
  );
  assertEscaped(box.innerHTML, "renderResultAllTeam");
});

const craftedPlayer = {
  id: "x1",
  name: BAD,
  season: 1996,
  pos: "PG",
  scoring: 80,
  defense: 80,
  pass: 80,
  rebound: 50,
  steal: 50,
  block: 50,
  speed: 80,
  strength: 60,
  injuredGames: 0,
  tags: [],
};

test("marketOwnedCard: crafted owned player name comes out escaped", () => {
  const html = marketOwnedCard(craftedPlayer, true);
  assertEscaped(html, "marketOwnedCard");
});

test("playerMarketCardHtml: crafted shop player name comes out escaped", () => {
  const html = playerMarketCardHtml(craftedPlayer, { team: { players: [], coach: null } }, { duel: false, scoutOn: false, budget: 9999 });
  assertEscaped(html, "playerMarketCardHtml");
});

function craftedSeason() {
  return {
    phase: "done",
    year: 1996,
    userTeamId: "T1",
    teams: {
      T1: { id: "T1", name: BAD },
      T2: { id: "T2", name: "Good Team" },
    },
    playoffs: {
      championId: "T1",
      east: {
        round: 3,
        series: [
          { high: { id: "T1", name: BAD }, low: { id: "T2", name: "Good Team" }, winsHigh: 4, winsLow: 2, done: true, winnerName: BAD, winnerId: "T1", games: [] },
        ],
        finalist: "T1",
      },
      west: { round: 3, series: [], finalist: null },
      finals: { high: { id: "T1", name: BAD }, low: { id: "T2", name: "Good Team" }, winsHigh: 4, winsLow: 1, done: true, games: [] },
    },
    finalsAllTeam: [{ slot: "PG", pos: "PG", name: BAD, teamName: BAD, gp: 5, ppg: 20, rpg: 5, apg: 6 }],
    finalsMvp: { name: BAD, teamName: BAD, gp: 5, ppg: 25, rpg: 6, apg: 5 },
    offseasonLog: [{ name: BAD, fromSeason: 1995, toSeason: 1996, before: 80, delta: 2, after: 82, salaryBefore: 100, salaryAfter: 120, renewal: "续约" }],
    playerSeason: {},
    standings: {},
  };
}

test("playoffsHtml: series, champion, finalist, All-Team, MVP and offseason log escape names", () => {
  const html = playoffsHtml(craftedSeason(), { managed: false, hasDraft: false });
  assertEscaped(html, "playoffsHtml");
});

test("playoffsHtml: no raw team/player name interpolation remains", () => {
  assert.ok(!/\$\{s\.high\?\.name/.test(poSrc), "series high team must be escaped");
  assert.ok(!/\$\{s\.low\?\.name/.test(poSrc), "series low team must be escaped");
  assert.ok(!/\$\{s\.winnerName/.test(poSrc), "series winner name must be escaped");
  assert.ok(!/总冠军 \$\{st\.teams/.test(poSrc), "champion team must be escaped");
  assert.ok(!/分区冠军：\$\{st\.teams/.test(poSrc), "finalist team must be escaped");
  assert.ok(!/\$\{p\.name\}|\$\{p\.teamName/.test(poSrc), "All-Team slot names must be escaped");
  assert.ok(!/\$\{st\.finalsMvp\.name\}/.test(poSrc), "Finals MVP name must be escaped");
  assert.equal((poSrc.match(/esc\(st\.finalsMvp\.name\)/g) || []).length, 1, "Finals MVP name must be escaped once");
  assert.equal((poSrc.match(/esc\(st\.finalsMvp\.teamName\)/g) || []).length, 1, "Finals MVP team must be escaped once");
  assert.ok(!/\$\{r\.name\}/.test(poSrc), "offseason log names must be escaped");
});

test("renderRosterEvaluation: crafted player name comes out escaped", () => {
  const row = evaluateRosterPlayer(craftedPlayer, null, { salary: 100, ovr: 85, learned: [] });
  const container = { innerHTML: "" };
  renderRosterEvaluation(container, [row]);
  assertEscaped(container.innerHTML, "renderRosterEvaluation");
});
