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
  setDevelopmentPlan,
  validateDevelopmentPlans,
} from "../js/modes/playerDevelopment.js";
import {
  createRootState,
  exportRootSave,
  importRootSave,
} from "../js/data/saveRoot.js";
import { advanceLeagueOffseason } from "../js/engine/season.js";
import { invalidateDevelopLadder } from "../js/engine/develop.js";
import { overall, PLAYERS } from "../js/data/players.js";
import {
  buildCareerTimeline,
  filterCareerTimeline,
} from "../js/modes/careerTimeline.js";

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

function developmentPlan(overrides = {}) {
  return {
    focus: "shooting",
    role: "starter",
    mentorBref: null,
    load: "high",
    source: "manual",
    ...overrides,
  };
}

function finishDraft(career) {
  let next = career;
  while (next.management.draft.status === "in_progress") {
    assert.equal(
      next.management.draft.order[next.management.draft.currentPick],
      next.season.userTeamId,
    );
    const roster = next.season.teams[next.season.userTeamId].players;
    next = makeCareerDraftPick(
      next,
      next.management.draft.prospects[0].prospectId,
      roster.length >= 15 ? { waivePlayerId: roster[0].id } : {},
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
    teamName: "B",
    record: { w: 21, l: 61 },
    championId: "D",
    finish: "finals",
    awards: {
      mvp: { playerId: "D-3", name: "D-3", teamId: "D" },
      dpoy: null,
      roy: { playerId: "A-0", name: "A-0", teamId: "A" },
    },
    transactions: [],
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

test("CPU fallback waiver keeps preparation immutable and prevents dead-ends", () => {
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

  const prepared = prepareCareerOffseason(original);
  assert.equal(prepared.phase, "draft");
  assert.ok(prepared.management.draft.selections.length >= 2);
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
  assert.equal(rookieYearTwo._rookie, undefined);
});

test("players without future cards retire deterministically after development", () => {
  const season = doneSeason();
  season.teams.B.players = [
    player("old-40", { age: 39 }),
    player("low-36", {
      age: 35,
      scoring: 30,
      three: 30,
      mid: 30,
      paint: 30,
      pass: 30,
      defense: 30,
      rebound: 30,
      steal: 30,
      block: 30,
      speed: 30,
      strength: 30,
      stamina: 30,
      iq: 30,
      clutch: 30,
    }),
    player("still-active", { age: 35 }),
  ];

  const result = advanceLeagueOffseason(season, { seed: 9 });

  assert.equal(result.ok, true);
  assert.deepEqual(
    season.teams.B.players.map((entry) => entry.bref),
    ["still-active"],
  );
  assert.deepEqual(
    result.log.filter((entry) => entry.retired).map((entry) => entry.bref).sort(),
    ["low-36", "old-40"],
  );
});

test("drafted next-season rookie keeps its plan without immediate development", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  const selection = drafted.management.draft.selections.find((entry) => entry.teamId === "B");
  const rookieBefore = drafted.season.teams.B.players.find(
    (entry) => entry.bref === selection.bref,
  );
  const planned = setDevelopmentPlan(
    drafted,
    selection.bref,
    developmentPlan({ focus: "conditioning" }),
  );

  const completed = completeCareerOffseason(planned).career;
  const rookieAfter = completed.season.teams.B.players.find(
    (entry) => entry.bref === selection.bref,
  );

  assert.equal(rookieAfter.id, rookieBefore.id);
  assert.equal(rookieAfter._developmentEffects, undefined);
  assert.deepEqual(
    completed.management.developmentPlans[selection.bref],
    developmentPlan({ focus: "conditioning" }),
  );

  const secondDraft = finishDraft(prepareCareerOffseason(markSeasonDone(completed)));
  const secondSeason = completeCareerOffseason(secondDraft).career;
  const rookieYearTwo = secondSeason.season.teams.B.players.find(
    (entry) => entry.bref === selection.bref,
  );
  assert.ok(rookieYearTwo._developmentEffects.totalPoints > 0);
  assert.ok(rookieYearTwo._developmentEffects.totalPoints <= 3);
  assert.deepEqual(
    secondSeason.management.developmentPlans[selection.bref],
    developmentPlan({ focus: "conditioning" }),
  );
});

test("offseason plans apply bounded growth after base evolution and enrich the log", () => {
  const baselineSeason = doneSeason();
  const plannedSeason = structuredClone(baselineSeason);
  const selected = developmentPlan();

  assert.equal(advanceLeagueOffseason(baselineSeason, { seed: 123 }).ok, true);
  assert.equal(
    advanceLeagueOffseason(plannedSeason, {
      seed: 123,
      developmentPlans: { "B-1": selected },
    }).ok,
    true,
  );

  const baseline = baselineSeason.teams.B.players.find((entry) => entry.bref === "B-1");
  const developed = plannedSeason.teams.B.players.find((entry) => entry.bref === "B-1");
  const applied = Object.values(developed._developmentEffects.attributeDeltas)
    .reduce((sum, value) => sum + value, 0);
  assert.equal(applied, 1);
  assert.ok(developed._developmentEffects.reasons.includes("low minutes"));
  assert.equal(developed.three, baseline.three + (developed._developmentEffects.attributeDeltas.three || 0));
  assert.equal(developed.mid, baseline.mid + (developed._developmentEffects.attributeDeltas.mid || 0));
  assert.equal(developed.scoring, baseline.scoring + (developed._developmentEffects.attributeDeltas.scoring || 0));
  assert.deepEqual(developed._developmentPlan, selected);
  assert.match(developed._developNote, /training|训练/i);
  const log = plannedSeason.offseasonLog.find((entry) => entry.bref === "B-1");
  assert.deepEqual(log.plan, selected);
  assert.deepEqual(log.effects, developed._developmentEffects);
  assert.equal(plannedSeason.teams.A.players[0]._developmentEffects, undefined);
});

test("historical development keeps the next ladder card and plan across id replacement", () => {
  const originalLength = PLAYERS.length;
  const base = player("ladder-2030", {
    id: "ladder-card-2030",
    bref: "ladder-player",
    season: 2030,
    age: 24,
    three: 60,
    mid: 61,
    scoring: 62,
  });
  const nextCard = player("ladder-2031", {
    id: "ladder-card-2031",
    bref: "ladder-player",
    season: 2031,
    age: 25,
    three: 80,
    mid: 81,
    scoring: 82,
  });
  PLAYERS.push(structuredClone(base), structuredClone(nextCard));
  invalidateDevelopLadder();

  try {
    const original = managedCareer();
    original.season.teams.B.players = [structuredClone(base)];
    original.season.playerSeason["B:ladder-card-2030"] = {
      stats: { gp: 82, min: 82 * 30 },
    };
    const planned = setDevelopmentPlan(original, "ladder-player", developmentPlan());
    const drafted = finishDraft(prepareCareerOffseason(planned));
    const completed = completeCareerOffseason(drafted).career;
    const developed = completed.season.teams.B.players.find(
      (entry) => entry.bref === "ladder-player",
    );

    assert.equal(developed.id, nextCard.id);
    assert.ok(developed._developmentEffects.totalPoints <= 3);
    for (const attribute of ["three", "mid", "scoring"]) {
      assert.equal(
        developed[attribute],
        nextCard[attribute] +
          (developed._developmentEffects.attributeDeltas[attribute] || 0),
      );
    }
    assert.equal(developed._developAfterOvr, overall(developed));
    assert.match(developed._developNote, new RegExp(`→${overall(developed)}`));
    assert.deepEqual(
      completed.management.developmentPlans["ladder-player"],
      developmentPlan(),
    );
  } finally {
    PLAYERS.splice(originalLength);
    invalidateDevelopLadder();
  }
});

test("role expectations, morale, and stale development metadata are handled", () => {
  const plannedSeason = doneSeason();
  plannedSeason.teams.B.players[0].roleExpectation = "starter";
  plannedSeason.teams.B.players[0].morale = 50;
  plannedSeason.playerSeason["B:B-1"] = { stats: { gp: 82, min: 82 * 30 } };
  assert.equal(
    advanceLeagueOffseason(plannedSeason, {
      seed: 123,
      developmentPlans: { "B-1": developmentPlan({ load: "normal" }) },
    }).ok,
    true,
  );
  const developed = plannedSeason.teams.B.players[0];
  assert.ok(developed._developmentEffects.reasons.includes("stable role"));
  assert.equal(developed.morale, 52);
  assert.equal(
    developed._developmentEffects.injuryRiskDelta,
    0,
  );

  const unplannedSeason = doneSeason();
  unplannedSeason.teams.B.players[0]._developmentPlan = developmentPlan();
  unplannedSeason.teams.B.players[0]._developmentEffects = { totalPoints: 3 };
  assert.equal(advanceLeagueOffseason(unplannedSeason, { seed: 123 }).ok, true);
  assert.equal(unplannedSeason.teams.B.players[0]._developmentPlan, undefined);
  assert.equal(unplannedSeason.teams.B.players[0]._developmentEffects, undefined);
});

test("malformed offseason plans reject before mutating season state", () => {
  for (const developmentPlans of [
    null,
    [],
    { "B-1": { ...developmentPlan(), load: "extreme" } },
  ]) {
    const season = doneSeason();
    const before = structuredClone(season);
    assert.throws(() =>
      advanceLeagueOffseason(season, { seed: 123, developmentPlans }),
    );
    assert.deepEqual(season, before);
  }
});

test("managed completion validates every executable plan before mutation", () => {
  const drafted = finishDraft(prepareCareerOffseason(managedCareer()));
  drafted.management.developmentPlans = {
    "B-1": { ...developmentPlan(), focus: "invalid" },
  };
  const before = structuredClone(drafted);

  assert.throws(() => validateDevelopmentPlans(drafted), /focus|plan/i);
  assert.throws(() => completeCareerOffseason(drafted), /focus|plan/i);
  assert.deepEqual(drafted, before);
});

test("successful career completion prunes only plans for players no longer rostered", () => {
  const original = managedCareer();
  original.season.teams.B.players.push(player("stay"));
  let planned = setDevelopmentPlan(original, "B-1", developmentPlan());
  planned = setDevelopmentPlan(planned, "stay", developmentPlan({ focus: "defense" }));
  const prepared = finishDraft(prepareCareerOffseason(planned));
  prepared.season.teams.B.players = prepared.season.teams.B.players.filter(
    (entry) => entry.bref !== "stay",
  );

  const completed = completeCareerOffseason(prepared).career;
  assert.ok(completed.management.developmentPlans["B-1"]);
  assert.equal(completed.management.developmentPlans.stay, undefined);
  assert.equal(
    completed.season.teams.B.players.find((entry) => entry.bref === "B-1").bref,
    "B-1",
  );
});

test("a full user roster waives the explicitly selected veteran", () => {
  const original = managedCareer();
  original.season.teams.B.players = Array.from(
    { length: 15 },
    (_, index) => player(`veteran-${index}`, { age: 24 + index }),
  );
  let prepared = prepareCareerOffseason(original);
  const explicit = prepared.season.teams.B.players[9];
  prepared = makeCareerDraftPick(
    prepared,
    prepared.management.draft.prospects[0].prospectId,
    { waivePlayerId: explicit.id },
  );
  const drafted = prepared;
  const userSelection = drafted.management.draft.selections.find(
    (entry) => entry.teamId === "B",
  );

  assert.ok(userSelection.waived);
  assert.equal(userSelection.waived.bref, explicit.bref);
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
  const planned = setDevelopmentPlan(
    managedCareer(),
    "B-1",
    developmentPlan({ focus: "defense" }),
  );
  const drafted = finishDraft(prepareCareerOffseason(planned));
  const left = completeCareerOffseason(structuredClone(drafted)).career;
  const right = completeCareerOffseason(structuredClone(drafted)).career;

  assert.equal(left.season.seed, right.season.seed);
  assert.deepEqual(left.season.teams, right.season.teams);
  assert.deepEqual(left.season.schedule, right.season.schedule);
  assert.deepEqual(left.season.offseasonLog, right.season.offseasonLog);
  assert.deepEqual(left.season.freeAgents, right.season.freeAgents);
  assert.deepEqual(left.season.staffMarket, right.season.staffMarket);
  assert.deepEqual(
    left.management.developmentPlans,
    right.management.developmentPlans,
  );
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
  assert.equal(
    career.management.seasonHistory.every(
      (summary) =>
        summary.teamName === "B"
        && Array.isArray(summary.transactions)
        && summary.transactions.length === 0,
    ),
    true,
  );
  const timeline = buildCareerTimeline(career);
  assert.equal(timeline.length, 15);
  assert.equal(timeline.every((entry) => entry.teamName === "B"), true);
  assert.deepEqual(filterCareerTimeline(timeline, "transactions"), []);

  const root = createRootState({
    activeMode: "franchise",
    leagueCareer: career,
  });
  const savedAtBefore = root.savedAt;
  const roundTripped = importRootSave(exportRootSave(root));
  assert.equal(root.savedAt, savedAtBefore);
  assert.deepEqual(roundTripped, root);
});

for (const initialRosterSize of [12, 15]) {
  test(`twenty-five cycles from a ${initialRosterSize}-player roster never dead-end`, () => {
    let career = managedCareer();
    for (const team of Object.values(career.season.teams)) {
      team.players = Array.from(
        { length: initialRosterSize },
        (_, index) => player(`${team.id}-${index}`, {
          age: 20 + (index % 24),
          scoring: 35 + index,
          defense: 35 + index,
        }),
      );
    }

    for (let index = 0; index < 25; index++) {
      career = finishDraft(prepareCareerOffseason(career));
      assert.equal(career.management.draft.prospects.length, 0);
      assert.equal(career.management.draftHistory.at(-1).prospects.length, 0);
      career = completeCareerOffseason(career).career;
      const brefs = Object.values(career.season.teams)
        .flatMap((team) => team.players.map((entry) => entry.bref));
      assert.equal(new Set(brefs).size, brefs.length);
      assert.ok(Object.values(career.season.teams).every((team) => team.players.length <= 15));
      if (index < 24) career = markSeasonDone(career);
    }

    const serialized = JSON.stringify(createRootState({
      activeMode: "franchise",
      leagueCareer: career,
    }));
    assert.ok(Buffer.byteLength(serialized) < 500_000, Buffer.byteLength(serialized));
  });
}
