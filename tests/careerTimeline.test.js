import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCareerTimeline,
  filterCareerTimeline,
} from "../js/modes/careerTimeline.js";
import {
  createLeagueCareer,
  prepareCareerOffseason,
} from "../js/modes/leagueCareer.js";

function careerFixture() {
  return {
    season: {
      year: 2032,
      userTeamId: "NEW",
      teams: {
        OLD: { name: "Old Team" },
        NEW: { name: "New Team" },
        CHAMP: { name: "Champion Team" },
      },
      schedule: [{ box: { huge: true } }],
    },
    management: {
      seasonHistory: [
        {
          year: 2031,
          teamId: "NEW",
          teamName: "New Team",
          record: { w: 48, l: 34 },
          finish: "playoffs",
          championId: "CHAMP",
          awards: { mvp: { name: "MVP" }, dpoy: null, roy: null },
          transactions: [],
        },
        {
          year: 2030,
          teamId: "OLD",
          teamName: "Old Team",
          record: { w: 41, l: 41 },
          finish: "lottery",
          championId: "CHAMP",
          awards: { mvp: null, dpoy: null, roy: { name: "ROY" } },
          transactions: [
            { type: "sign", year: 2030, day: 2, description: "Signed Player" },
          ],
          schedule: ["must not leak"],
        },
      ],
      draftHistory: [
        {
          year: 2030,
          order: ["NEW", "OLD"],
          prospects: [{ name: "must not leak" }],
          selections: [
            {
              pickNumber: 1,
              teamId: "NEW",
              name: "Wrong Team Pick",
              bref: "wrong",
              source: "generated",
            },
            {
              pickNumber: 2,
              teamId: "OLD",
              name: "Historical Pick",
              bref: "historical",
              source: "historical-debut",
              playerSeason: { huge: true },
            },
          ],
        },
        {
          year: 2032,
          order: ["NEW"],
          selections: [{
            pickNumber: 1,
            teamId: "NEW",
            name: "Current Pick",
            bref: "current",
            source: "generated",
          }],
        },
      ],
    },
    history: [
      { type: "season-completed", year: 2030, at: 1 },
      { type: "draft-completed", year: 2030, selections: 32, at: 2 },
      { type: "story-choice", year: 2030, label: "Major Choice", payload: { huge: true }, at: 3 },
      { type: "offseason-completed", year: 2031, nextYear: 2032, at: 4 },
    ],
  };
}

test("timeline merges compact history by year and uses that year's team", () => {
  const career = careerFixture();
  const before = structuredClone(career);
  const timeline = buildCareerTimeline(career);

  assert.deepEqual(timeline.map((entry) => entry.year), [2030, 2031, 2032]);
  assert.equal(timeline[0].teamId, "OLD");
  assert.equal(timeline[0].teamName, "Old Team");
  assert.equal(timeline[0].userDraftPick.name, "Historical Pick");
  assert.equal(timeline[2].userDraftPick.name, "Current Pick");
  assert.deepEqual(timeline[0].events.map((event) => event.type), ["story-choice"]);
  assert.equal(JSON.stringify(timeline).match(/schedule|box|playerSeason|prospects/g), null);
  assert.deepEqual(career, before);

  timeline[0].record.w = 0;
  assert.equal(career.management.seasonHistory[1].record.w, 41);
});

test("timeline filters all four categories and rejects invalid values", () => {
  const timeline = buildCareerTimeline(careerFixture());

  assert.deepEqual(filterCareerTimeline(timeline, "all").map((entry) => entry.year), [2030, 2031, 2032]);
  assert.deepEqual(filterCareerTimeline(timeline, "seasons").map((entry) => entry.year), [2030, 2031]);
  assert.deepEqual(filterCareerTimeline(timeline, "drafts").map((entry) => entry.year), [2030, 2032]);
  assert.deepEqual(filterCareerTimeline(timeline, "transactions").map((entry) => entry.year), [2030]);
  assert.throws(() => filterCareerTimeline(timeline, "awards"), /filter/i);
});

test("offseason summaries keep only 20 compact current-year transactions", () => {
  const ids = ["A", "B", "C", "D"];
  const season = {
    phase: "done",
    year: 2030,
    mode: "modern",
    seed: 7,
    userTeamId: "B",
    league: {
      teamIds: ids,
      eastIds: ["A", "B"],
      westIds: ["C", "D"],
      labels: Object.fromEntries(ids.map((id) => [id, id])),
      confById: { A: "East", B: "East", C: "West", D: "West" },
    },
    teams: Object.fromEntries(ids.map((id) => [id, { id, name: id, players: [] }])),
    standings: Object.fromEntries(ids.map((id) => [id, { w: 41, l: 41, pf: 1, pa: 1 }])),
    schedule: [],
    playerSeason: {},
    freeAgents: [],
    awards: null,
    playoffs: {
      championId: "D",
      east: { series: [] },
      west: { series: [] },
      finals: { high: { id: "B" }, low: { id: "D" } },
    },
    tradeLog: [
      { type: "sign", year: 2029, day: 1, name: "Old" },
      ...Array.from({ length: 22 }, (_, index) => ({
        type: index % 2 ? "sign" : "cut",
        year: 2030,
        day: index,
        name: `Player ${index}`,
        salary: 80,
      })),
    ],
  };
  const career = createLeagueCareer({
    kind: "franchise",
    careerId: "transaction-summary",
    season,
  });

  const prepared = prepareCareerOffseason(career);
  const transactions = prepared.management.seasonHistory[0].transactions;

  assert.equal(transactions.length, 20);
  assert.deepEqual(transactions[0], {
    type: "cut",
    year: 2030,
    day: 2,
    description: "Player 2",
  });
  assert.equal(transactions.some((entry) => entry.description === "Old"), false);
  assert.equal(JSON.stringify(transactions).includes("salary"), false);
});
