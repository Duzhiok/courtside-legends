import test from "node:test";
import assert from "node:assert/strict";
import { annualSummary } from "../js/modes/leagueCareer.js";
import { renderCareerHistory } from "../js/ui/leagueManagementView.js";

function fakeSeason({
  year = 2030,
  championId = "YOU",
  finals,
  players = [],
  finalsMvp = null,
}) {
  return {
    year,
    userTeamId: "YOU",
    standings: { YOU: { w: 60, l: 22 } },
    teams: {
      YOU: { name: "我的球队", players },
      OPP: { name: "对手球队", players: [] },
    },
    league: { labels: {} },
    playoffs: {
      east: { series: [] },
      west: { series: [] },
      championId,
      finals,
    },
    finalsMvp,
    awards: {},
    tradeLog: [],
  };
}

const ROSTER = [
  { bref: "jordami01", season: 1996, name: "Michael Jordan", pos: "SG" },
  { bref: "pippe sc01", season: 1996, name: "Scottie Pippen", pos: "SF" },
  { bref: "rodmade01", season: 1996, name: "Dennis Rodman", pos: "PF" },
];

test("champion as high side: roster snapshot + opponent + series score from the champion's view", () => {
  const summary = annualSummary(fakeSeason({
    finals: { high: { id: "YOU" }, low: { id: "OPP" }, winsHigh: 4, winsLow: 2, winnerId: "YOU" },
    players: ROSTER,
    finalsMvp: { id: "jordami01-1996", name: "Michael Jordan", teamId: "YOU" },
  }));
  assert.equal(summary.finish, "champion");
  assert.equal(summary.trophy.opponentId, "OPP");
  assert.equal(summary.trophy.opponentName, "对手球队");
  assert.equal(summary.trophy.seriesScore, "4-2");
  assert.deepEqual(summary.trophy.roster, ROSTER);
  // Finals MVP already rides on the summary; the room shows it next to the trophy.
  assert.equal(summary.awards.finalsMvp.name, "Michael Jordan");
});

test("champion as low side: the series score flips to the champion's perspective", () => {
  const summary = annualSummary(fakeSeason({
    finals: { high: { id: "OPP" }, low: { id: "YOU" }, winsHigh: 3, winsLow: 4, winnerId: "YOU" },
    players: ROSTER,
  }));
  assert.equal(summary.trophy.seriesScore, "4-3");
  assert.equal(summary.trophy.opponentId, "OPP");
});

test("non-championship seasons get no trophy key at all", () => {
  const lostFinals = annualSummary(fakeSeason({
    championId: "OPP",
    finals: { high: { id: "YOU" }, low: { id: "OPP" }, winsHigh: 2, winsLow: 4, winnerId: "OPP" },
    players: ROSTER,
  }));
  assert.equal(lostFinals.finish, "finals");
  assert.equal("trophy" in lostFinals, false);

  const lottery = annualSummary(fakeSeason({
    championId: "OPP",
    finals: { high: { id: "OPP" }, low: { id: "OTH" }, winsHigh: 4, winsLow: 1, winnerId: "OPP" },
    players: ROSTER,
  }));
  assert.equal(lottery.finish, "lottery");
  assert.equal("trophy" in lottery, false);
});

test("champion without finals data records no trophy rather than a broken card", () => {
  const summary = annualSummary(fakeSeason({
    championId: "YOU",
    finals: null,
    players: ROSTER,
  }));
  // championId says champion, but there is no finals to take an opponent or score from.
  assert.equal("trophy" in summary, false);
});

function container() {
  return {
    innerHTML: "",
    onclick: null,
    onchange: null,
    dataset: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function careerWithHistory(seasonHistory) {
  return {
    management: { seasonHistory },
    history: [],
    season: { userTeamId: "YOU", teams: { YOU: { name: "我的球队" } } },
  };
}

test("old save without a trophy field renders fine and shows no trophy room", () => {
  const box = container();
  renderCareerHistory(box, {
    career: careerWithHistory([{
      year: 2029,
      teamId: "YOU",
      teamName: "我的球队",
      record: { w: 50, l: 32 },
      championId: "OPP",
      finish: "playoffs",
      awards: {},
      transactions: [],
    }]),
    lang: "zh",
  });
  assert.match(box.innerHTML, /长期生涯历史/);
  assert.match(box.innerHTML, /2029/);
  assert.doesNotMatch(box.innerHTML, /冠军墙/);
});

test("trophy room lists title seasons with opponent, score, FMVP and roster, names escaped", () => {
  const box = container();
  renderCareerHistory(box, {
    career: careerWithHistory([
      {
        year: 2030,
        teamId: "YOU",
        teamName: "我的球队",
        record: { w: 60, l: 22 },
        championId: "YOU",
        finish: "champion",
        awards: { finalsMvp: { playerId: "jordami01-1996", name: "Michael Jordan", teamId: "YOU" } },
        transactions: [],
        trophy: {
          opponentId: "OPP",
          opponentName: "对手球队",
          seriesScore: "4-2",
          roster: [
            { bref: "jordami01", season: 1996, name: "A <script>", pos: "SG" },
            { bref: "pippe sc01", season: 1996, name: "B & C", pos: "SF" },
          ],
        },
      },
      {
        year: 2029,
        teamId: "YOU",
        teamName: "我的球队",
        record: { w: 50, l: 32 },
        championId: "OPP",
        finish: "playoffs",
        awards: {},
        transactions: [],
      },
    ]),
    lang: "zh",
  });
  assert.match(box.innerHTML, /冠军墙/);
  assert.match(box.innerHTML, /2030/);
  assert.match(box.innerHTML, /对手球队/);
  assert.match(box.innerHTML, /4-2/);
  assert.match(box.innerHTML, /总决赛 MVP：Michael Jordan/);
  assert.match(box.innerHTML, /夺冠阵容：/);
  assert.match(box.innerHTML, /A &lt;script&gt;/);
  assert.match(box.innerHTML, /B &amp; C/);
  assert.doesNotMatch(box.innerHTML, /<script>/);
  // The room sits above the year-by-year list, and only the title season is in it.
  assert.ok(box.innerHTML.indexOf("冠军墙") < box.innerHTML.indexOf("career-history-list"));
  assert.equal((box.innerHTML.match(/夺冠阵容：/g) || []).length, 1);

  const enBox = container();
  renderCareerHistory(enBox, {
    career: careerWithHistory([
      {
        year: 2030,
        teamId: "YOU",
        teamName: "我的球队",
        record: { w: 60, l: 22 },
        championId: "YOU",
        finish: "champion",
        awards: { finalsMvp: { playerId: "jordami01-1996", name: "Michael Jordan", teamId: "YOU" } },
        transactions: [],
        trophy: {
          opponentId: "OPP",
          opponentName: "对手球队",
          seriesScore: "4-2",
          roster: [{ bref: "jordami01", season: 1996, name: "Michael Jordan", pos: "SG" }],
        },
      },
    ]),
    lang: "en",
  });
  assert.match(enBox.innerHTML, /Trophy Room/);
  assert.match(enBox.innerHTML, /Finals: beat/);
  assert.match(enBox.innerHTML, /Finals MVP: Michael Jordan/);
  assert.match(enBox.innerHTML, /Championship roster: Michael Jordan/);
});
