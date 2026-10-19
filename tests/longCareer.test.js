import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCareerOffseason,
  completeCareerOffseason,
  createLeagueCareer,
  makeCareerDraftPick,
  prepareCareerOffseason,
} from "../js/modes/leagueCareer.js";
import {
  createRootState,
  exportRootSave,
  importRootSave,
} from "../js/data/saveRoot.js";

function player(id, overrides = {}) {
  return {
    id,
    bref: id,
    name: id,
    season: 2030,
    age: 22,
    pos: "PG",
    scoring: 60,
    three: 60,
    mid: 60,
    paint: 60,
    pass: 60,
    defense: 60,
    rebound: 60,
    steal: 60,
    block: 60,
    speed: 60,
    strength: 60,
    stamina: 60,
    iq: 60,
    clutch: 60,
    salary: 80,
    ...overrides,
  };
}

function doneSeason(year = 2030) {
  const ids = ["A", "B", "C", "D"];
  return {
    v: 2,
    phase: "done",
    year,
    mode: "modern",
    seed: 77,
    userTeamId: "B",
    customNames: {},
    league: {
      teamIds: ids,
      eastIds: ["A", "B"],
      westIds: ["C", "D"],
      labels: Object.fromEntries(ids.map((id) => [id, id])),
      confById: { A: "East", B: "East", C: "West", D: "West" },
    },
    teams: Object.fromEntries(
      ids.map((id, index) => [
        id,
        { id, name: id, players: [player(`${id}-${index}`)], isCpu: id !== "B" },
      ]),
    ),
    standings: Object.fromEntries(
      ids.map((id, index) => [
        id,
        { w: 20 + index, l: 62 - index, pf: 8000 + index, pa: 8100 },
      ]),
    ),
    schedule: [],
    playerSeason: {},
    resultsLog: [{ box: { large: true } }],
    tradeLog: [],
    freeAgents: [],
    awards: {
      mvp: { playerId: "D-3", name: "D-3", teamId: "D", extra: "omit" },
      dpoy: null,
      roy: { playerId: "A-0", name: "A-0", teamId: "A" },
    },
    playoffs: {
      championId: "D",
      east: { series: [{ high: { id: "A" }, low: { id: "B" } }] },
      west: { series: [] },
      finals: { high: { id: "B" }, low: { id: "D" } },
    },
  };
}

function managedCareer(year = 2030) {
  return createLeagueCareer({
    kind: "franchise",
    careerId: "long-career",
    season: doneSeason(year),
  });
}

function finishDraft(career) {
  let next = career;
  while (next.management.draft.status === "in_progress") {
    assert.equal(
      next.management.draft.order[next.management.draft.currentPick],
      next.season.userTeamId,
    );
    next = makeCareerDraftPick(
      next,
      next.management.draft.prospects[0].prospectId,
    );
  }
  return next;
}

test("preparation snapshots a compact summary and opens the same-year draft", () => {
  const original = managedCareer();
  const prepared = prepareCareerOffseason(original);

  assert.equal(prepared.phase, "draft");
  assert.equal(prepared.season.phase, "done");
  assert.equal(prepared.season.year, 2030);
  assert.equal(prepared.management.draft.year, 2030);
  assert.deepEqual(prepared.management.seasonHistory, [{
    year: 2030,
    teamId: "B",
    record: { w: 21, l: 61 },
    championId: "D",
    finish: "finals",
    awards: {
      mvp: { playerId: "D-3", name: "D-3", teamId: "D" },
      dpoy: null,
      roy: { playerId: "A-0", name: "A-0", teamId: "A" },
    },
  }]);
  assert.equal(JSON.stringify(prepared.management.seasonHistory).includes("box"), false);
  assert.equal(prepared.history.filter((event) => event.type === "season-completed").length, 1);
  assert.deepEqual(original, managedCareer());
});

test("preparation is atomic on invalid draft state and cannot repeat a year", () => {
  const invalid = managedCareer();
  invalid.season.standings = null;
  const before = structuredClone(invalid);
  assert.throws(() => prepareCareerOffseason(invalid));
  assert.deepEqual(invalid, before);

  const prepared = prepareCareerOffseason(managedCareer());
  const duplicate = structuredClone(prepared);
  duplicate.phase = "regular";
  duplicate.season.phase = "done";
  const duplicateBefore = structuredClone(duplicate);
  assert.throws(() => prepareCareerOffseason(duplicate), /already|history|summary/i);
  assert.deepEqual(duplicate, duplicateBefore);
});

test("completion requires a completed draft and advances exactly one year", () => {
  const prepared = prepareCareerOffseason(managedCareer());
  const before = structuredClone(prepared);
  assert.throws(() => completeCareerOffseason(prepared), /draft.*complete|complete.*draft/i);
  assert.deepEqual(prepared, before);

  const drafted = finishDraft(prepared);
  const completed = completeCareerOffseason(drafted);
  assert.equal(completed.result.ok, true);
  assert.equal(completed.career.phase, "regular");
  assert.equal(completed.career.season.phase, "regular");
  assert.equal(completed.career.season.year, 2031);
  assert.equal(completed.career.management.draftHistory.length, 1);
  assert.equal(completed.career.management.seasonHistory.length, 1);
  assert.equal(completed.career.history.filter((event) => event.type === "offseason-completed").length, 1);
  assert.throws(() => completeCareerOffseason(completed.career));
});

test("rookie contracts survive development and decrement once", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const selection = drafted.management.draft.selections.find((entry) => entry.teamId === "B");
  const rookieBefore = drafted.season.teams.B.players.find((entry) => entry.bref === selection.bref);
  assert.equal(rookieBefore.contract.yearsRemaining, 4);

  const { career } = completeCareerOffseason(drafted);
  const rookieAfter = career.season.teams.B.players.find((entry) => entry.bref === selection.bref);
  assert.equal(rookieAfter.contract.yearsRemaining, 3);
  assert.equal(rookieAfter.salary, rookieAfter.contract.salary);
});

test("completion is deterministic for development, seed, and schedule", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const left = completeCareerOffseason(structuredClone(drafted)).career;
  const right = completeCareerOffseason(structuredClone(drafted)).career;

  assert.equal(left.season.seed, right.season.seed);
  assert.deepEqual(left.season.teams, right.season.teams);
  assert.deepEqual(left.season.schedule, right.season.schedule);
  assert.deepEqual(left.season.offseasonLog, right.season.offseasonLog);
});

test("managed direct offseason cannot bypass draft while legacy remains compatible", () => {
  const managed = managedCareer();
  const before = structuredClone(managed);
  const rejected = advanceCareerOffseason(managed);
  assert.equal(rejected.result.ok, false);
  assert.match(rejected.result.reason, /staged|prepare|draft/i);
  assert.deepEqual(managed, before);

  const legacy = managedCareer();
  delete legacy.management;
  const advanced = advanceCareerOffseason(legacy);
  assert.equal(advanced.result.ok, true);
  assert.equal(advanced.career.season.year, 2031);
});

test("fifteen generated-rookie cycles preserve league continuity", () => {
  let career = managedCareer();
  for (let index = 0; index < 15; index++) {
    career = finishDraft(prepareCareerOffseason(career));
    assert.equal(
      career.management.draft.selections.every((entry) => entry.source === "generated"),
      true,
    );
    career = completeCareerOffseason(career).career;
    if (index < 14) {
      career.season.phase = "done";
      career.phase = "season_complete";
      career.season.awards = null;
      career.season.playoffs = {
        championId: "A",
        east: { series: [] },
        west: { series: [] },
        finals: { high: { id: "A" }, low: { id: "C" } },
      };
      for (const [teamIndex, id] of career.season.league.teamIds.entries()) {
        career.season.standings[id] = {
          w: 20 + teamIndex,
          l: 62 - teamIndex,
          pf: 8000,
          pa: 8000,
        };
      }
    }
  }

  const brefs = Object.values(career.season.teams)
    .flatMap((team) => team.players.map((entry) => entry.bref));
  assert.equal(new Set(brefs).size, brefs.length);
  assert.equal(Object.values(career.season.teams).every((team) => team.players.length <= 15), true);
  assert.equal(career.management.seasonHistory.length, 15);
  assert.equal(career.management.draftHistory.length, 15);
  assert.equal(career.season.year, 2045);

  const root = createRootState({
    activeMode: "franchise",
    leagueCareer: career,
  });
  const savedAtBefore = root.savedAt;
  const roundTripped = importRootSave(exportRootSave(root));
  assert.equal(root.savedAt, savedAtBefore);
  assert.deepEqual(roundTripped, root);
});
