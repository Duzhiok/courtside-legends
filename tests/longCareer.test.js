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
import { advanceLeagueOffseason } from "../js/engine/season.js";

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

function markSeasonDone(career, championId = "A") {
  const next = structuredClone(career);
  next.phase = "season_complete";
  next.season.phase = "done";
  next.season.awards = null;
  next.season.playoffs = {
    championId,
    east: { series: [] },
    west: { series: [] },
    finals: { high: { id: "A" }, low: { id: "C" } },
  };
  for (const [index, id] of next.season.league.teamIds.entries()) {
    next.season.standings[id] = {
      w: 20 + index,
      l: 62 - index,
      pf: 8000,
      pa: 8000,
    };
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
  assert.deepEqual(
    prepared.history.map((event) => event.type),
    ["season-completed", "draft-opened"],
  );
  assert.ok(prepared.history[0].at < prepared.history[1].at);
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

test("preparation remains atomic after an earlier CPU draft pick mutates its clone", () => {
  let original;
  let order;
  for (let index = 0; index < 100; index++) {
    const candidate = createLeagueCareer({
      kind: "franchise",
      careerId: `atomic-${index}`,
      season: doneSeason(),
    });
    candidate.season.standings.B = { w: 80, l: 2, pf: 9000, pa: 7000 };
    const probe = prepareCareerOffseason(candidate);
    const userIndex = probe.management.draft.order.indexOf(candidate.season.userTeamId);
    if (userIndex >= 2) {
      original = candidate;
      order = probe.management.draft.order;
      break;
    }
  }
  assert.ok(original, "expected a deterministic seed with two CPU picks before the user");
  original.season.teams[order[0]].players = Array.from(
    { length: 14 },
    (_, index) => player(`first-${index}`),
  );
  original.season.teams[order[1]].players = Array.from(
    { length: 15 },
    (_, index) => player(`blocked-${index}`, { _rookie: true }),
  );
  const before = structuredClone(original);

  assert.throws(() => prepareCareerOffseason(original), /all-rookie|waive/i);
  assert.deepEqual(original, before);
});

test("Task-2 completed draft gains its missing summary without drafting twice", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const legacy = structuredClone(drafted);
  legacy.management.seasonHistory = [];
  legacy.history = legacy.history.filter((event) => event.type !== "season-completed");
  const rostersBefore = structuredClone(legacy.season.teams);
  const selectionsBefore = structuredClone(legacy.management.draft.selections);

  const prepared = prepareCareerOffseason(legacy);

  assert.equal(prepared.management.seasonHistory.length, 1);
  assert.deepEqual(prepared.management.draft.selections, selectionsBefore);
  assert.deepEqual(prepared.season.teams, rostersBefore);
  assert.deepEqual(
    prepared.history.map((event) => event.type),
    ["season-completed", "draft-opened", "draft-completed"],
  );
  assert.ok(prepared.history[0].at < prepared.history[1].at);
  assert.ok(prepared.history[1].at < prepared.history[2].at);
  assert.equal(completeCareerOffseason(prepared).career.season.year, 2031);
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

  const malformed = structuredClone(drafted);
  malformed.season.phase = "regular";
  const malformedBefore = structuredClone(malformed);
  assert.throws(() => completeCareerOffseason(malformed), /finals|done|offseason|休赛期/i);
  assert.deepEqual(malformed, malformedBefore);
});

test("rookie debut card and four-year contract are not skipped during draft completion", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const selection = drafted.management.draft.selections.find((entry) => entry.teamId === "B");
  const rookieBefore = drafted.season.teams.B.players.find((entry) => entry.bref === selection.bref);
  const debutBefore = structuredClone(rookieBefore);
  assert.equal(rookieBefore.contract.yearsRemaining, 4);

  const firstSeason = completeCareerOffseason(drafted).career;
  const rookieAfter = firstSeason.season.teams.B.players.find((entry) => entry.bref === selection.bref);
  assert.equal(rookieAfter.season, debutBefore.season);
  assert.equal(rookieAfter.age, debutBefore.age);
  assert.equal(rookieAfter.scoring, debutBefore.scoring);
  assert.equal(rookieAfter.contract.yearsRemaining, 4);

  const secondDraft = finishDraft(prepareCareerOffseason(markSeasonDone(firstSeason)));
  const secondSeason = completeCareerOffseason(secondDraft).career;
  const rookieYearTwo = secondSeason.season.teams.B.players.find((entry) => entry.bref === selection.bref);
  assert.equal(rookieYearTwo.season, debutBefore.season + 1);
  assert.equal(rookieYearTwo.age, debutBefore.age + 1);
  assert.equal(rookieYearTwo.contract.yearsRemaining, 3);
  assert.equal(rookieYearTwo.salary, rookieYearTwo.contract.salary);
});

test("a full user roster waives one veteran when its rookie is drafted", () => {
  const original = managedCareer();
  original.season.teams.B.players = Array.from(
    { length: 15 },
    (_, index) => player(`veteran-${index}`, { age: 24 + index }),
  );
  const drafted = finishDraft(prepareCareerOffseason(original));
  const userSelection = drafted.management.draft.selections.find(
    (entry) => entry.teamId === "B",
  );

  assert.ok(userSelection.waived);
  assert.equal(drafted.season.teams.B.players.length, 15);
  assert.equal(
    drafted.season.freeAgents.some(
      (entry) => entry.bref === userSelection.waived.bref,
    ),
    true,
  );
});

test("expired rookie contracts renew once, synchronize salary, and never go negative", () => {
  const season = doneSeason();
  season.teams.B.players = [player("expiring", {
    contract: {
      kind: "rookie-scale",
      signedYear: 2026,
      pickNumber: 1,
      salary: 45,
      yearsRemaining: 1,
      rookieScale: true,
    },
    salary: 45,
  })];

  assert.equal(advanceLeagueOffseason(season).ok, true);
  let expiring = season.teams.B.players[0];
  assert.equal(expiring.contract.yearsRemaining, 0);
  assert.equal(expiring.salary, expiring.contract.salary);
  assert.equal(expiring._renewal.after, expiring.salary);
  assert.match(expiring._developNote, new RegExp(`¤${expiring.salary}`));

  season.phase = "done";
  assert.equal(advanceLeagueOffseason(season).ok, true);
  expiring = season.teams.B.players[0];
  assert.equal(expiring.contract.yearsRemaining, 0);
  assert.equal(expiring.salary, expiring.contract.salary);
});

test("completion is deterministic for development, markets, seed, and schedule", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const left = completeCareerOffseason(structuredClone(drafted)).career;
  const right = completeCareerOffseason(structuredClone(drafted)).career;

  assert.equal(left.season.seed, right.season.seed);
  assert.deepEqual(left.season.teams, right.season.teams);
  assert.deepEqual(left.season.schedule, right.season.schedule);
  assert.deepEqual(left.season.offseasonLog, right.season.offseasonLog);
  assert.deepEqual(left.season.freeAgents, right.season.freeAgents);
  assert.deepEqual(left.season.staffMarket, right.season.staffMarket);
});

test("explicit offseason seeds are normalized to uint32", () => {
  const season = doneSeason();
  const result = advanceLeagueOffseason(season, { seed: -1 });
  assert.equal(result.ok, true);
  assert.equal(season.seed, 0xffffffff);
  assert.equal(advanceLeagueOffseason({ ...doneSeason(), phase: "done" }, { seed: 1.5 }).ok, false);
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
      career = markSeasonDone(career);
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
