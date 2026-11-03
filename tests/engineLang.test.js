import test from "node:test";
import assert from "node:assert/strict";
import { cutPlayer, executeTrade } from "../js/engine/seasonMarket.js";
import { generateTradeProposals } from "../js/engine/tradeProposals.js";
import { recommendTradePackage } from "../js/engine/tradeBuilder.js";
import { swapDraftPicks } from "../js/engine/leagueDraft.js";

// Engine reason/message strings take a lang param (default "zh"). These tests
// pin the English side and the default, using the same minimal fixture shape
// as tests/tradeNegotiation.test.js. Team names are English here on purpose:
// a Chinese team name inside a reason is data, not a missing translation.

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture(phase = "regular") {
  const userPlayers = [player("star", 86, 160), player("mid", 82, 145), ...Array.from({ length: 6 }, (_, i) => player(`u${i}`, 70, 50))];
  const cpuPlayers = [player("cpu-star", 83, 150), player("prospect", 70, 35), ...Array.from({ length: 7 }, (_, i) => player(`c${i}`, 68, 45))];
  return {
    year: 1994,
    dayIndex: 20,
    phase,
    userTeamId: "USER",
    teams: {
      USER: { name: "You", players: userPlayers },
      CPU: { name: "Rivals", players: cpuPlayers },
    },
    playerSeason: {
      "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } },
    },
    tradeLog: [],
    draftAssets: [],
    // Pre-filled so ensureSeasonMarket skips its refresh paths in these tests.
    freeAgents: [player("fa", 65, 40)],
    staffMarket: { coaches: [{ id: "c1" }], assistants: [{ id: "a1" }] },
  };
}

const CJK = /[\u3400-\u9fff]/;

test("cutPlayer phase guard speaks the requested language, default stays Chinese", () => {
  const en = cutPlayer(seasonFixture("playoffs"), "star", "en");
  assert.equal(en.ok, false);
  assert.equal(en.reason, "Roster moves are only available during the regular season");
  const zh = cutPlayer(seasonFixture("playoffs"), "star");
  assert.equal(zh.ok, false);
  assert.match(zh.reason, /常规赛/);
});

test("executeTrade phase guard speaks the requested language", () => {
  const res = executeTrade(seasonFixture("playoffs"), {
    giveIds: ["star"],
    wantIds: ["cpu-star"],
    cpuTeamId: "CPU",
    lang: "en",
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "Trades are only available during the regular season");
});

test("generated proposal reasons follow lang, and English has no Chinese", () => {
  const [proposalEn] = generateTradeProposals(seasonFixture(), 3, "en");
  assert.ok(proposalEn, "a proposal is generated");
  assert.doesNotMatch(proposalEn.reason, CJK);
  assert.match(proposalEn.reason, /came calling/);
  const [proposalZh] = generateTradeProposals(seasonFixture());
  assert.ok(proposalZh, "a proposal is generated");
  assert.match(proposalZh.reason, /主动来谈/);
});

test("recommendTradePackage note follows lang", () => {
  const rec = recommendTradePackage(seasonFixture(), { cpuTeamId: "CPU", wantPlayerId: "cpu-star", lang: "en" });
  assert.equal(rec.ok, true);
  assert.match(rec.note, /salary is close/);
  assert.doesNotMatch(rec.note, CJK);
});

test("swapDraftPicks invalid opponent speaks the requested language", () => {
  const season = { year: 1994, userTeamId: "USER", teams: { USER: { players: [] }, CPU: { players: [] } }, standings: { USER: { w: 0, l: 0 }, CPU: { w: 0, l: 0 } } };
  const res = swapDraftPicks(season, { year: 1994, lang: "en" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "Invalid opponent");
});
