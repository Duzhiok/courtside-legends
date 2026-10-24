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
import {
  createRootState,
  exportRootSave,
  importRootSave,
} from "../js/data/saveRoot.js";

function completedSeason(overrides = {}) {
  const ids = ["A", "B", "C", "D"];
  return {
    v: 2,
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
    teams: Object.fromEntries(
      ids.map((id) => [id, { id, name: `Team ${id}`, players: [] }]),
    ),
    standings: Object.fromEntries(
      ids.map((id) => [id, { w: 41, l: 41, pf: 1, pa: 1 }]),
    ),
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
    tradeLog: [],
    ...overrides,
  };
}

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
  assert.deepEqual(
    timeline[0].events.map((event) => event.type),
    ["story-choice"],
  );
  assert.deepEqual(
    timeline[0].events.map((event) => event.label),
    ["生涯事件"],
  );
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
  const season = completedSeason({
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
  });
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
    descriptionEn: "Player 2",
  });
  assert.equal(transactions.some((entry) => entry.description === "Old"), false);
  assert.equal(JSON.stringify(transactions).includes("salary"), false);
});

test("legacy no-year transactions are included only for the first summary", () => {
  const legacyTrade = {
    type: "trade",
    day: 5,
    withName: "Team C",
    give: [{ name: "Outgoing" }],
    get: [{ name: "Incoming" }],
  };
  const first = createLeagueCareer({
    kind: "franchise",
    careerId: "legacy-first",
    season: completedSeason({ tradeLog: [legacyTrade] }),
  });
  const later = createLeagueCareer({
    kind: "franchise",
    careerId: "legacy-later",
    season: completedSeason({ tradeLog: [legacyTrade] }),
  });
  later.management.seasonHistory = [{
    year: 2029,
    teamId: "B",
    teamName: "Team B",
    record: { w: 40, l: 42 },
    championId: "A",
    finish: "lottery",
    awards: { mvp: null, dpoy: null, roy: null },
    transactions: [],
  }];

  assert.equal(
    prepareCareerOffseason(first).management.seasonHistory[0].transactions.length,
    1,
  );
  assert.deepEqual(
    prepareCareerOffseason(later).management.seasonHistory.at(-1).transactions,
    [],
  );
});

test("transaction descriptions compact trades and staff changes", () => {
  const career = createLeagueCareer({
    kind: "franchise",
    careerId: "descriptions",
    season: completedSeason({
      tradeLog: [
        {
          type: "trade",
          year: 2030,
          day: 3,
          withName: "Team C",
          give: [{ name: "Out A" }, { name: "Out B" }],
          get: [{ name: "In A" }],
        },
        {
          type: "hire_coach",
          year: 2030,
          day: 4,
          name: "New Coach",
          replaced: "Old Coach",
        },
        {
          type: "fire_assistant",
          year: 2030,
          day: 5,
          name: "Old Assistant",
        },
      ],
    }),
  });

  assert.deepEqual(
    prepareCareerOffseason(career).management.seasonHistory[0].transactions,
    [
      {
        type: "trade",
        year: 2030,
        day: 3,
        description: "Team C：送出 Out A、Out B，得到 In A",
        descriptionEn: "Team C: sent Out A, Out B, got In A",
      },
      {
        type: "hire_coach",
        year: 2030,
        day: 4,
        description: "New Coach（替换 Old Coach）",
        descriptionEn: "New Coach (replacing Old Coach)",
      },
      {
        type: "fire_assistant",
        year: 2030,
        day: 5,
        description: "Old Assistant",
        descriptionEn: "Old Assistant",
      },
    ],
  );
});

test("real offseason summaries survive root round-trip into the timeline", () => {
  const career = createLeagueCareer({
    kind: "franchise",
    careerId: "round-trip",
    season: completedSeason({
      tradeLog: [{
        type: "sign",
        year: 2030,
        day: 2,
        name: "Signed Player",
      }],
    }),
  });
  const prepared = prepareCareerOffseason(career);
  const root = createRootState({
    activeMode: "franchise",
    leagueCareer: prepared,
  });
  const roundTripped = importRootSave(exportRootSave(root));
  const [entry] = buildCareerTimeline(roundTripped.leagueCareer);

  assert.equal(entry.teamName, "Team B");
  assert.deepEqual(entry.record, { w: 41, l: 41 });
  assert.deepEqual(entry.transactions, [{
    type: "sign",
    year: 2030,
    day: 2,
    description: "Signed Player",
    descriptionEn: "Signed Player",
  }]);
});

test("real accepted-offer events use a Chinese label with team context", () => {
  const career = {
    season: {
      year: 1991,
      userTeamId: "POR",
      teams: { POR: { name: "波特兰开拓者" } },
    },
    management: { seasonHistory: [], draftHistory: [] },
    history: [{
      type: "accepted-offer",
      year: 1991,
      teamId: "POR",
      teamName: "不可变的旧队名",
      at: 0,
    }],
  };
  const [entry] = buildCareerTimeline(career);
  const [event] = entry.events;

  assert.equal(event.type, "accepted-offer");
  assert.equal(event.teamId, "POR");
  assert.equal(event.label, "接受 不可变的旧队名 邀请");
  assert.doesNotMatch(event.label, /accepted-offer/);
});

test("timeline hides redundant lifecycle detail events", () => {
  const career = {
    season: {
      year: 2030,
      userTeamId: "B",
      teams: { B: { name: "Team B" } },
    },
    management: { seasonHistory: [], draftHistory: [] },
    history: [
      { type: "accepted-offer", year: 2030, teamId: "B", at: 1 },
      { type: "future-knowledge-intro", year: 2030, choiceId: "keep-quiet", at: 2 },
      { type: "season-completed", year: 2030, at: 3 },
      { type: "draft-opened", year: 2030, order: ["B"], at: 4 },
      { type: "draft-completed", year: 2030, selections: 32, at: 5 },
      { type: "offseason-completed", year: 2030, nextYear: 2031, at: 6 },
      { type: "unknown-internal-event", year: 2030, payload: { large: true }, at: 7 },
    ],
  };
  const events = buildCareerTimeline(career)[0].events;

  assert.deepEqual(events.map((event) => event.label), [
    "接受 Team B 邀请",
    "完成未来知识抉择",
    "生涯事件",
  ]);
  assert.equal(events[0].teamId, "B");
  assert.equal(events[1].choiceId, "keep-quiet");
  assert.equal(JSON.stringify(events).includes("order"), false);
  assert.equal(JSON.stringify(events).includes("payload"), false);
});
