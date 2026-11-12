/**
 * Career role permissions (ADR-006 R4): the matrix, the identity record,
 * the guard decisions, and the enforced entry points — a forbidden
 * operation attempted through the REAL entry point must fail, not just
 * lose its button.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_CAPABILITIES,
  CAREER_ROLES,
  identityOf,
  permissionsFor,
  setIdentity,
} from "../js/career/careerIdentity.js";
import {
  CareerPermissionError,
  canDo,
  capabilityForOverrideCategory,
  careerRole,
  denyMessage,
  requireCapability,
} from "../js/career/careerGuards.js";

// ---------------------------------------------------------------- matrix

test("permissionsFor pins the exact capability set per role", () => {
  assert.deepEqual(
    [...permissionsFor("PLAYER")].sort(),
    ["personalTraining", "signOwnContract", "takeover", "watchGame"],
  );
  assert.deepEqual(
    [...permissionsFor("COACH")].sort(),
    [
      "commandGame",
      "setRotation",
      "setTrainingFocus",
      "signOwnContract",
      "suggestDraft",
      "suggestTrade",
      "teamTraining",
      "watchGame",
    ],
  );
  assert.deepEqual(
    [...permissionsFor("GM")].sort(),
    [
      "allocateDevelopment",
      "draft",
      "release",
      "signFreeAgent",
      "signOwnContract",
      "trade",
      "watchGame",
    ],
  );
  assert.deepEqual(
    [...permissionsFor("GM_COACH")].sort(),
    [...CAREER_CAPABILITIES].sort(),
  );
});

test("permissionsFor fails closed on unknown roles", () => {
  for (const role of [undefined, null, "", "coach", "ADMIN"]) {
    assert.equal(permissionsFor(role).size, 0, String(role));
  }
});

test("permissionsFor returns a fresh set every call", () => {
  const first = permissionsFor("COACH");
  first.add("trade");
  assert.equal(permissionsFor("COACH").has("trade"), false);
});

// ---------------------------------------------------------------- identity

test("identityOf maps missing or invalid identity to Classic GM+Coach", () => {
  for (const root of [null, undefined, {}, { identity: null }, { identity: {} }, { identity: { currentRole: "coach" } }]) {
    assert.equal(identityOf(root), "GM_COACH", JSON.stringify(root));
  }
  for (const role of CAREER_ROLES) {
    assert.equal(identityOf({ identity: { currentRole: role } }), role);
  }
});

test("setIdentity stamps root.identity and leagueCareer.role together", () => {
  const root = {
    leagueCareer: { careerId: "c1", role: "GM_COACH" },
    story: { employer: "LAL" },
  };
  const stamped = setIdentity(root, "COACH");
  assert.equal(stamped.identity.initialRole, "COACH");
  assert.equal(stamped.identity.currentRole, "COACH");
  assert.equal(stamped.leagueCareer.role, "COACH");
  // pure: the input is untouched
  assert.equal(root.leagueCareer.role, "GM_COACH");
  assert.equal(root.identity, undefined);
});

test("setIdentity keeps an existing initialRole and moves only currentRole", () => {
  const root = {
    identity: { initialRole: "GM", currentRole: "GM" },
    leagueCareer: { careerId: "c1", role: "GM" },
  };
  const stamped = setIdentity(root, "COACH");
  assert.equal(stamped.identity.initialRole, "GM");
  assert.equal(stamped.identity.currentRole, "COACH");
  assert.equal(stamped.leagueCareer.role, "COACH");
});

test("setIdentity works without a leagueCareer and rejects unknown roles", () => {
  const stamped = setIdentity(null, "GM");
  assert.deepEqual(stamped.identity, { initialRole: "GM", currentRole: "GM" });
  assert.throws(() => setIdentity({}, "ADMIN"), /CAREER_ROLES/);
});

// ---------------------------------------------------------------- guards

test("careerRole prefers the stamped career role, falls back to the save identity", () => {
  assert.equal(careerRole({ role: "COACH" }), "COACH");
  assert.equal(careerRole({}, { identity: { currentRole: "GM" } }), "GM");
  assert.equal(careerRole({ role: "nope" }, { identity: { currentRole: "GM" } }), "GM");
  // old save: no role anywhere — full Classic GM+Coach control, no migration
  assert.equal(careerRole({}, null), "GM_COACH");
  assert.equal(careerRole(null, undefined), "GM_COACH");
});

test("canDo reads the matrix; requireCapability throws a typed refusal", () => {
  const coach = { role: "COACH" };
  const gm = { role: "GM" };
  assert.equal(canDo(coach, "setRotation"), true);
  assert.equal(canDo(coach, "trade"), false);
  assert.equal(canDo(gm, "trade"), true);
  assert.equal(canDo(gm, "commandGame"), false);
  assert.equal(canDo(gm, "watchGame"), true);
  assert.equal(canDo({ role: "PLAYER" }, "takeover"), true);
  assert.equal(canDo({ role: "PLAYER" }, "trade"), false);

  assert.equal(requireCapability(coach, "commandGame"), "COACH");
  assert.throws(
    () => requireCapability(coach, "trade"),
    (error) => {
      assert.ok(error instanceof CareerPermissionError);
      assert.equal(error.code, "ROLE_NOT_PERMITTED");
      assert.equal(error.role, "COACH");
      assert.equal(error.capability, "trade");
      assert.match(error.message, /经理/);
      return true;
    },
  );
  assert.throws(
    () => requireCapability(gm, "setRotation"),
    (error) => error instanceof CareerPermissionError && error.role === "GM",
  );
});

test("denyMessage covers every capability in both languages", () => {
  for (const capability of CAREER_CAPABILITIES) {
    const zh = denyMessage("COACH", capability, "zh");
    const en = denyMessage("COACH", capability, "en");
    assert.equal(typeof zh, "string");
    assert.ok(zh.length > 4, capability);
    assert.equal(typeof en, "string");
    assert.ok(en.length > 4, capability);
    assert.notEqual(zh, en, capability);
  }
});

test("override categories map to their capability, unknown categories are ungated", () => {
  assert.equal(capabilityForOverrideCategory("rotation"), "setRotation");
  assert.equal(capabilityForOverrideCategory("lineup"), "setRotation");
  assert.equal(capabilityForOverrideCategory("tactics"), "commandGame");
  assert.equal(capabilityForOverrideCategory("gameplan"), "commandGame");
  assert.equal(capabilityForOverrideCategory("training"), "setTrainingFocus");
  assert.equal(capabilityForOverrideCategory("something-new"), null);
});

// ---------------------------------------------------------------- role plumbing + draft guards

import {
  beginCareerDraft,
  clearManualOverride,
  createLeagueCareer,
  forfeitCareerDraftPick,
  makeCareerDraftPick,
  setManualOverride,
  suggestCareerDraftPick,
} from "../js/modes/leagueCareer.js";
import { frontOfficePick } from "../js/engine/leagueDraft.js";

function completedCareerSeason(userTeamId = "B") {
  const ids = ["A", "B", "C", "D"];
  return {
    phase: "done",
    year: 2024,
    userTeamId,
    league: { teamIds: ids },
    teams: Object.fromEntries(ids.map((id) => [id, { id, players: [] }])),
    standings: Object.fromEntries(
      ids.map((id, index) => [id, { w: 20 + index, l: 62 - index, pf: 8000, pa: 8100 }]),
    ),
    freeAgents: [],
  };
}

function careerWithRole(role, overrides = {}) {
  return createLeagueCareer({
    kind: "franchise",
    season: completedCareerSeason("B"),
    careerId: "test-career",
    ...(role === undefined ? {} : { role }),
    ...overrides,
  });
}

test("createLeagueCareer stamps the role; omitted role reads as Classic GM+Coach", () => {
  assert.equal(careerWithRole("COACH").role, "COACH");
  assert.equal(careerWithRole("GM").role, "GM");
  assert.equal(careerWithRole(undefined).role, "GM_COACH");
  assert.throws(() => careerWithRole("ADMIN"), /CAREER_ROLES/);
});

test("beginCareerDraft admits the GM and the suggesting coach, refuses the player", () => {
  assert.equal(beginCareerDraft(careerWithRole("GM")).management.draft.status, "in_progress");
  assert.equal(beginCareerDraft(careerWithRole("COACH")).management.draft.status, "in_progress");
  assert.equal(beginCareerDraft(careerWithRole("GM_COACH")).management.draft.status, "in_progress");
  assert.throws(
    () => beginCareerDraft(careerWithRole("PLAYER")),
    (error) => error instanceof CareerPermissionError && error.capability === "draft",
  );
});

test("makeCareerDraftPick executes for the GM and refuses for the coach, without mutation", () => {
  const coachStarted = beginCareerDraft(careerWithRole("COACH"));
  const before = structuredClone(coachStarted);
  assert.throws(
    () => makeCareerDraftPick(coachStarted, coachStarted.management.draft.prospects[0].prospectId),
    (error) => error instanceof CareerPermissionError && error.role === "COACH" && error.capability === "draft",
  );
  assert.deepEqual(coachStarted, before);

  const gmStarted = beginCareerDraft(careerWithRole("GM"));
  const prospectId = gmStarted.management.draft.prospects[0].prospectId;
  const picked = makeCareerDraftPick(gmStarted, prospectId);
  // advanceDraftToUserPick also records the CPU picks before the user's
  // turn, so the count is not 1 — the user's pick is the one that counts.
  assert.ok(picked.management.draft.selections.some((s) => s.prospectId === prospectId));
  assert.ok(picked.management.draft.selections.length >= 1);
});

test("forfeitCareerDraftPick refuses for the coach", () => {
  const started = beginCareerDraft(careerWithRole("COACH"));
  assert.throws(
    () => forfeitCareerDraftPick(started),
    (error) => error instanceof CareerPermissionError && error.capability === "draft",
  );
  const gmStarted = beginCareerDraft(careerWithRole("GM"));
  const before = gmStarted.management.draft.selections.length;
  const forfeited = forfeitCareerDraftPick(gmStarted);
  // the forfeited slot is consumed and the draft moves on
  assert.ok(forfeited.management.draft.selections.length > before);
  assert.ok(forfeited.management.draft.currentPick > gmStarted.management.draft.currentPick);
});

test("frontOfficePick honors a live suggestion, else takes the cpuScore-best", () => {
  const started = beginCareerDraft(careerWithRole("GM_COACH"));
  const draft = started.management.draft;
  const second = draft.prospects[1].prospectId;
  assert.equal(frontOfficePick(draft, started.season, second), second);
  const best = frontOfficePick(draft, started.season, null);
  assert.equal(typeof best, "string");
  assert.ok(draft.prospects.some((p) => p.prospectId === best));
  assert.equal(frontOfficePick(draft, started.season, "not-on-the-board"), best);
});

test("suggestCareerDraftPick records the suggestion and lets the front office execute it", () => {
  const started = beginCareerDraft(careerWithRole("COACH"));
  const suggested = started.management.draft.prospects[0].prospectId;
  const pickNumber = started.management.draft.currentPick;
  const next = suggestCareerDraftPick(started, suggested);

  assert.equal(next.management.draftSuggestions.length, 1);
  assert.deepEqual(next.management.draftSuggestions[0], {
    prospectId: suggested,
    pick: pickNumber,
    year: 2024,
  });
  // the suggested prospect is the one taken: it leaves the board
  assert.equal(
    next.management.draft.prospects.some((p) => p.prospectId === suggested),
    false,
  );
  // the draft moved on (or completed) — the coach can suggest again
  assert.notEqual(next.management.draft, started.management.draft);
});

test("suggestCareerDraftPick with no suggestion lets the front office decide", () => {
  const started = beginCareerDraft(careerWithRole("COACH"));
  const before = started.management.draft.selections.length;
  const next = suggestCareerDraftPick(started, null);
  assert.deepEqual(next.management.draftSuggestions, []);
  assert.ok(next.management.draft.selections.length > before);
});

test("suggestCareerDraftPick refuses the GM and an unavailable prospect", () => {
  const gmStarted = beginCareerDraft(careerWithRole("GM"));
  assert.throws(
    () => suggestCareerDraftPick(gmStarted, gmStarted.management.draft.prospects[0].prospectId),
    (error) => error instanceof CareerPermissionError && error.capability === "suggestDraft",
  );
  const coachStarted = beginCareerDraft(careerWithRole("COACH"));
  assert.throws(
    () => suggestCareerDraftPick(coachStarted, "not-on-the-board"),
    /not available/,
  );
});

test("a coach can suggest every user pick until the draft completes", () => {
  let career = beginCareerDraft(careerWithRole("COACH"));
  let suggestions = 0;
  while (career.management.draft.status === "in_progress") {
    const draft = career.management.draft;
    assert.equal(draft.order[draft.currentPick], "B", "draft waits at the user's turn");
    career = suggestCareerDraftPick(career, draft.prospects[0].prospectId);
    suggestions += 1;
  }
  assert.equal(career.management.draft.status, "complete");
  assert.equal(career.management.draftSuggestions.length, suggestions);
  assert.ok(suggestions >= 1);
});

test("manual-override guards follow the category map", () => {
  const coach = careerWithRole("COACH");
  const gm = careerWithRole("GM");
  // rotation is the coach's job
  assert.equal(setManualOverride(coach, "rotation", "starters", ["a"]).manualOverrides.rotation.starters[0], "a");
  assert.throws(
    () => setManualOverride(gm, "rotation", "starters", ["a"]),
    (error) => error instanceof CareerPermissionError && error.capability === "setRotation",
  );
  assert.throws(
    () => clearManualOverride(gm, "rotation", "starters"),
    (error) => error instanceof CareerPermissionError && error.capability === "setRotation",
  );
  // training focus is the coach's job
  assert.throws(
    () => setManualOverride(gm, "training", "alpha", { focus: "shooting" }),
    (error) => error instanceof CareerPermissionError && error.capability === "setTrainingFocus",
  );
  // an unmapped category is not a role-gated operation
  assert.equal(setManualOverride(gm, "notes", "k", "v").manualOverrides.notes.k, "v");
});

// ---------------------------------------------------------------- development plans: coach sets, GM allocates

import {
  recommendDevelopmentPlans,
  setDevelopmentPlan,
} from "../js/modes/playerDevelopment.js";

function devPlayer(bref, overrides = {}) {
  return {
    id: `${bref}-2030`,
    bref,
    name: bref,
    season: 2030,
    age: 25,
    pos: "PG",
    overall: 70,
    scoring: 70,
    three: 70,
    mid: 70,
    paint: 70,
    pass: 70,
    defense: 70,
    rebound: 70,
    steal: 70,
    block: 70,
    speed: 70,
    strength: 70,
    stamina: 70,
    iq: 70,
    clutch: 70,
    ...overrides,
  };
}

function devCareer(role, players = [devPlayer("alpha"), devPlayer("mentor", { age: 31, iq: 85 })]) {
  return {
    careerId: "development",
    kind: "franchise",
    role,
    phase: "regular",
    season: {
      phase: "regular",
      userTeamId: "USER",
      teams: { USER: { players } },
    },
    management: {
      draft: null,
      draftHistory: [],
      seasonHistory: [],
      developmentPlans: {},
    },
    manualOverrides: {},
    recommendations: {},
  };
}

function devPlan(overrides = {}) {
  return {
    focus: "shooting",
    role: "starter",
    mentorBref: "mentor",
    load: "normal",
    source: "manual",
    ...overrides,
  };
}

test("a coach sets the whole development plan", () => {
  const next = setDevelopmentPlan(devCareer("COACH"), "alpha", devPlan());
  assert.deepEqual(next.management.developmentPlans.alpha, devPlan());
  assert.deepEqual(next.manualOverrides.training.alpha, devPlan());
});

test("a GM may change only the load on an existing plan", () => {
  const withPlan = setDevelopmentPlan(devCareer("COACH"), "alpha", devPlan());
  const gmCareer = { ...withPlan, role: "GM" };
  const next = setDevelopmentPlan(gmCareer, "alpha", devPlan({ load: "high" }));
  assert.equal(next.management.developmentPlans.alpha.load, "high");
  assert.equal(next.management.developmentPlans.alpha.focus, "shooting");
  assert.equal(next.management.developmentPlans.alpha.role, "starter");
  assert.equal(next.management.developmentPlans.alpha.mentorBref, "mentor");
});

test("a GM may adjust the load on an automatic (recommended) plan", () => {
  const recommended = recommendDevelopmentPlans(devCareer("GM_COACH"));
  const base = recommended.management.developmentPlans.alpha;
  const gmCareer = { ...recommended, role: "GM" };
  const next = setDevelopmentPlan(gmCareer, "alpha", { ...base, load: "low", source: "manual" });
  assert.equal(next.management.developmentPlans.alpha.load, "low");
  assert.equal(next.management.developmentPlans.alpha.focus, base.focus);
});

test("a GM may not invent a focus, role, or mentor — or a plan from scratch", () => {
  const withPlan = setDevelopmentPlan(devCareer("COACH"), "alpha", devPlan());
  const gmCareer = { ...withPlan, role: "GM" };
  for (const change of [
    { focus: "defense" },
    { role: "bench" },
    { mentorBref: null },
  ]) {
    assert.throws(
      () => setDevelopmentPlan(gmCareer, "alpha", devPlan(change)),
      (error) => error instanceof CareerPermissionError && error.capability === "setTrainingFocus",
      JSON.stringify(change),
    );
  }
  assert.throws(
    () => setDevelopmentPlan(devCareer("GM"), "alpha", devPlan()),
    (error) => error instanceof CareerPermissionError && error.role === "GM",
  );
});

test("a role with neither training capability cannot touch plans", () => {
  assert.throws(
    () => setDevelopmentPlan(devCareer("PLAYER"), "alpha", devPlan()),
    (error) => error instanceof CareerPermissionError && error.capability === "setTrainingFocus",
  );
});

// ---------------------------------------------------------------- Time Travel role flow

import { historicalSeason } from "../js/data/historicalSeasons.js";
import { PLAYERS } from "../js/data/players.js";
import {
  acceptInterviewOffer,
  createTimeTravelPrologue,
  generateInterviewOffers,
  setPrologueRole,
  startNewStint,
} from "../js/modes/timeTravelCareer.js";

// The real season builders need a populated roster: with PLAYERS empty,
// buildCpuTeamForYear finds nobody and autoFillTeam's draw loop never
// terminates (drawPack returns empty batches). Same seed as
// timeTravelCareer.test.js — 12 synthetic cards per 1991 team, plus
// free agents — so a real 1991 career can be built in-process.
function playerCard(team, index) {
  const rating = 55 + ((team.charCodeAt(0) + index) % 35);
  return {
    id: `test-${team}-${index}`,
    bref: `test-${team}-${index}`,
    name: `${team} Player ${index}`,
    season: 1991,
    team,
    pos: "SF",
    scoring: rating,
    three: rating,
    mid: rating,
    paint: rating,
    defense: rating,
    rebound: rating,
    pass: rating,
    speed: rating,
    strength: rating,
    stamina: rating,
    iq: rating,
    clutch: rating,
    steal: rating,
    block: rating,
  };
}

for (const team of historicalSeason(1991).teams) {
  for (let index = 0; index < 12; index++) {
    PLAYERS.push(playerCard(team.bref || team.id, index));
  }
}
for (let index = 0; index < 12; index++) {
  PLAYERS.push(playerCard("FREE", index));
}

const TT_INPUT = { year: 1991, philosophy: "analytics", seed: 42 };

function coachRoot() {
  const prologue = createTimeTravelPrologue({ ...TT_INPUT, role: "COACH" });
  return acceptInterviewOffer(prologue, prologue.offers[0].id);
}

test("prologue role defaults to Classic GM+Coach; explicit role is stored", () => {
  assert.equal(createTimeTravelPrologue(TT_INPUT).role, "GM_COACH");
  assert.equal(createTimeTravelPrologue({ ...TT_INPUT, role: "COACH" }).role, "COACH");
  assert.equal(createTimeTravelPrologue({ ...TT_INPUT, role: "GM" }).role, "GM");
  assert.throws(() => createTimeTravelPrologue({ ...TT_INPUT, role: "ADMIN" }), /role is not supported/);
});

test("setPrologueRole is consumed by the next prologue and then resets", () => {
  setPrologueRole("COACH");
  assert.equal(createTimeTravelPrologue(TT_INPUT).role, "COACH");
  assert.equal(createTimeTravelPrologue(TT_INPUT).role, "GM_COACH");
  assert.throws(() => setPrologueRole("ADMIN"), /CAREER_ROLES/);
});

test("acceptInterviewOffer stamps the role on the save and the career", () => {
  const root = coachRoot();
  assert.equal(identityOf(root), "COACH");
  assert.deepEqual(root.identity, { initialRole: "COACH", currentRole: "COACH" });
  assert.equal(root.leagueCareer.role, "COACH");

  const classic = acceptInterviewOffer(
    createTimeTravelPrologue(TT_INPUT),
    createTimeTravelPrologue(TT_INPUT).offers[0].id,
  );
  assert.equal(identityOf(classic), "GM_COACH");
  assert.deepEqual(classic.identity, { initialRole: "GM_COACH", currentRole: "GM_COACH" });
  assert.equal(classic.leagueCareer.role, "GM_COACH");
});

test("a new stint keeps the career's role", () => {
  const root = coachRoot();
  const offer = generateInterviewOffers({ year: 1991, philosophy: "analytics", seed: 43 })[0];
  const next = startNewStint(root, offer);
  assert.equal(next.leagueCareer.role, "COACH");
  assert.equal(identityOf(next), "COACH");
  assert.equal(next.story.employer, offer.teamId);
});

test("Coach flow end to end through the real mode layer", () => {
  const root = coachRoot();
  const career = root.leagueCareer;
  const roster = career.season.teams[career.season.userTeamId].players;
  const first = roster.find((p) => p?.bref);

  // the coach may NOT execute a draft pick — the refusal comes from the
  // permission guard, before any draft-state complaint
  assert.throws(
    () => makeCareerDraftPick(career, "anyone"),
    (error) => error instanceof CareerPermissionError && error.capability === "draft",
  );
  // the coach MAY set a development plan on a real roster player
  const planned = setDevelopmentPlan(career, first.bref, {
    focus: "shooting",
    role: "starter",
    mentorBref: null,
    load: "normal",
    source: "manual",
  });
  assert.equal(planned.management.developmentPlans[first.bref].focus, "shooting");
  // the coach MAY set the rotation
  assert.deepEqual(
    setManualOverride(career, "rotation", "starters", [first.bref]).manualOverrides.rotation.starters,
    [first.bref],
  );
  // the coach MAY enter the draft (to suggest) — the fresh season is not
  // done, so the refusal is the season state, not the permission
  assert.throws(() => beginCareerDraft(career), /done/);
});

test("GM flow end to end through the real mode layer", () => {
  const prologue = createTimeTravelPrologue({ ...TT_INPUT, role: "GM" });
  const root = acceptInterviewOffer(prologue, prologue.offers[0].id);
  const career = root.leagueCareer;
  assert.equal(identityOf(root), "GM");

  // the GM passes the permission gate for picks — the fresh season has
  // no active draft, so the refusal is the draft state, not permission
  assert.throws(
    () => makeCareerDraftPick(career, "anyone"),
    (error) => !(error instanceof CareerPermissionError) && /active draft/.test(error.message),
  );
  // the GM may NOT set the rotation
  assert.throws(
    () => setManualOverride(career, "rotation", "starters", ["x"]),
    (error) => error instanceof CareerPermissionError && error.capability === "setRotation",
  );
});

// ---------------------------------------------------------------- engine guard found by these fixtures

import { autoFillTeam } from "../js/engine/draft.js";

test("autoFillTeam returns a short pack instead of spinning when the pool is empty", () => {
  // Regression: with PLAYERS empty, drawPack returns empty batches and
  // the fill loop never terminated — a season built without seeding the
  // roster hung forever (found while wiring the part-4 fixtures above).
  // The guard mirrors the one the power-bump loop below already has.
  const saved = PLAYERS.splice(0, PLAYERS.length);
  try {
    assert.equal(autoFillTeam("Empty Test", 8, { power: 0 }).players.length, 0);
  } finally {
    PLAYERS.push(...saved);
  }
});

// ---------------------------------------------------------------- ADR-006 R1: save validation

import {
  createRootState,
  readRootSave,
  ROOT_SAVE_KEY,
  validateRoot,
  writeRootSave,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

/** A root whose leagueCareer passes validateLeagueCareer. */
function rootWithCareer(role, overrides = {}) {
  const career = careerWithRole(role);
  return createRootState({
    leagueCareer: {
      ...career,
      season: { ...career.season, schedule: [] },
      ...overrides,
    },
  });
}

test("validateRoot accepts a root without an identity — old saves stay Classic", () => {
  const root = createRootState();
  assert.doesNotThrow(() => validateRoot(root));
  assert.equal(identityOf(root), "GM_COACH");
});

test("validateRoot accepts a stamped identity and the write/read round-trip keeps it", () => {
  const stamped = setIdentity(createRootState(), "COACH");
  assert.doesNotThrow(() => validateRoot(stamped));
  const storage = createMemoryStorage();
  writeRootSave(stamped, storage);
  const loaded = readRootSave(storage);
  assert.deepEqual(loaded.identity, { initialRole: "COACH", currentRole: "COACH" });
  assert.equal(identityOf(loaded), "COACH");
});

test("validateRoot rejects an illegal identity", () => {
  const bad = [
    { currentRole: "ADMIN" },
    { initialRole: "PLAYER2" },
    { currentRole: 3 },
    "COACH",
    { history: [{ role: "ADMIN" }] },
    { history: "COACH" },
    { history: [{ teamId: "B" }] },
  ];
  for (const identity of bad) {
    assert.throws(
      () => validateRoot(createRootState({ identity })),
      /invalid root save/,
      `identity ${JSON.stringify(identity)} must be rejected`,
    );
  }
  // Absent, null, and empty read as Classic — never required.
  for (const identity of [undefined, null, {}, { currentRole: null }]) {
    assert.doesNotThrow(
      () => validateRoot(createRootState({ identity })),
      `identity ${JSON.stringify(identity)} must be accepted`,
    );
  }
});

test("validateRoot rejects an illegal stamped career role", () => {
  assert.doesNotThrow(() => validateRoot(rootWithCareer("GM")));
  const tampered = rootWithCareer("GM", { role: "ADMIN" });
  assert.throws(() => validateRoot(tampered), /invalid root save/);
});

test("a stored root with an illegal identity does not load", () => {
  const raw = setIdentity(createRootState(), "COACH");
  raw.identity.currentRole = "ADMIN";
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: JSON.stringify(raw) });
  assert.equal(readRootSave(storage), null);
});

// ---------------------------------------------------------------- ADR-006 R6: contract grants

import { OFFER_TEMPLATES, grantsForPrivileges } from "../js/career/contractOffers.js";
import { effectivePermissions } from "../js/career/careerGuards.js";
import { acceptCareerContract, evaluateCareerEmployment } from "../js/modes/careerContract.js";

test("grantsForPrivileges maps each contract privilege to the audit table, and nothing else", () => {
  const byId = Object.fromEntries(OFFER_TEMPLATES.map((offer) => [offer.id, grantsForPrivileges(offer.privileges)]));
  assert.deepEqual(byId["trial-extension"], []);
  assert.deepEqual(byId["rebuild-extension"], ["setTrainingFocus", "draft"]);
  assert.deepEqual(byId["contender-extension"], ["trade", "signFreeAgent"]);
  assert.deepEqual(byId["dynasty-extension"], ["trade", "signFreeAgent", "release", "draft"]);
  // The two budget lines are dead promises (no budget field exists) and
  // the max-renewal priority is a payroll operation — none of them grants.
  assert.deepEqual(grantsForPrivileges(["额外教练预算", "专属训练设施预算", "顶薪续约优先权"]), []);
  // Unknown labels and non-arrays grant nothing, never throw.
  assert.deepEqual(grantsForPrivileges(["完全人事决定权", "不存在的特权"]), ["trade", "signFreeAgent", "release", "draft"]);
  assert.deepEqual(grantsForPrivileges(["完全人事决定权", "季中补强额度"]), ["trade", "signFreeAgent", "release", "draft"]);
  assert.deepEqual(grantsForPrivileges(undefined), []);
  assert.deepEqual(grantsForPrivileges("完全人事决定权"), []);
});

test("effectivePermissions adds the contract's grants to the role matrix and ignores unknown ids", () => {
  const coach = { role: "COACH", grants: ["trade", "draft"] };
  assert.deepEqual(
    [...effectivePermissions(coach)].sort(),
    [...permissionsFor("COACH"), "trade", "draft"].sort(),
  );
  assert.equal(canDo(coach, "trade"), true);
  assert.equal(canDo(coach, "setRotation"), true);
  assert.equal(canDo(coach, "release"), false);
  assert.equal(requireCapability(coach, "trade"), "COACH");

  // Unknown grant ids and a non-array grants field change nothing.
  assert.equal(canDo({ role: "COACH", grants: ["ADMIN", "trade"] }, "trade"), true);
  assert.equal(canDo({ role: "COACH", grants: ["ADMIN"] }, "trade"), false);
  assert.equal(canDo({ role: "COACH", grants: "trade" }, "trade"), false);
  // A career without grants reads exactly as its role matrix.
  assert.deepEqual([...effectivePermissions({ role: "GM" })].sort(), [...permissionsFor("GM")].sort());
  // A grant also works for the GM: it adds a capability the role lacks.
  const gm = { role: "GM", grants: ["commandGame"] };
  assert.deepEqual(
    [...effectivePermissions(gm)].sort(),
    [...permissionsFor("GM"), "commandGame"].sort(),
  );
  assert.equal(canDo(gm, "commandGame"), true);
  assert.equal(canDo(gm, "trade"), true);
});

/** A root five seasons in, contract expired, renewal offers on the table. */
function renewalRoot(role, championSeasons = 0, { reputation = 50, goalResults = [] } = {}) {
  const history = Array.from({ length: 5 }, (_, index) => ({
    year: 1991 + index,
    teamId: "CHI",
    teamName: "Bulls",
    record: { w: 45 + index, l: 37 - index },
    championId: index < championSeasons ? "CHI" : "LAL",
  }));
  const root = {
    leagueCareer: {
      role,
      season: { year: 1996 },
      management: { seasonHistory: history },
    },
    coach: { reputation },
    story: {
      currentChapter: "year-five",
      frontOfficeTrust: 50,
      mediaPressure: 20,
      timelineDivergence: 5,
      eventLog: goalResults.map((achieved) => ({ type: "season-goal-result", achieved })),
      pendingDecision: null,
      employment: { status: "active" },
    },
  };
  return evaluateCareerEmployment(root);
}

test("accepting a rebuild extension grants the coach draft, not trade", () => {
  const renewal = renewalRoot("COACH");
  assert.equal(renewal.story.employment.status, "renewal");
  const accepted = acceptCareerContract(renewal, "rebuild-extension");
  assert.deepEqual(accepted.leagueCareer.grants, ["setTrainingFocus", "draft"]);
  assert.equal(canDo(accepted.leagueCareer, "draft"), true);
  assert.equal(canDo(accepted.leagueCareer, "setTrainingFocus"), true);
  assert.equal(canDo(accepted.leagueCareer, "trade"), false);
  // The original root is untouched (accept is immutable).
  assert.equal(renewal.leagueCareer.grants, undefined);

  // The same check the trade button runs (app.js careerOperationAllowed)
  // refuses the trade, and the real draft entry admits the pick: the
  // grant is consumed by the guard, not just displayed.
  assert.throws(
    () => requireCapability(accepted.leagueCareer, "trade"),
    (error) => error instanceof CareerPermissionError && error.capability === "trade",
  );
  const drafted = beginCareerDraft(careerWithRole("COACH", { grants: ["draft"] }));
  assert.equal(drafted.management.draft.status, "in_progress");
  const picked = makeCareerDraftPick(drafted, drafted.management.draft.prospects[0].prospectId);
  assert.ok(picked.management.draft.selections.length >= 1);
});

test("accepting a dynasty extension grants the coach full personnel control", () => {
  const renewal = renewalRoot("COACH", 2);
  assert.ok(renewal.story.employment.offers.some((offer) => offer.id === "dynasty-extension"));
  const accepted = acceptCareerContract(renewal, "dynasty-extension");
  assert.deepEqual(accepted.leagueCareer.grants, ["trade", "signFreeAgent", "release", "draft"]);
  for (const capability of ["trade", "signFreeAgent", "release", "draft"]) {
    assert.equal(canDo(accepted.leagueCareer, capability), true, capability);
  }
  // A renewal that grants less replaces the old grants instead of adding:
  // a rough ride (no rings, 1-in-3 goals hit, low reputation) earns only
  // the trial extension, which grants nothing. The last two goals are not
  // both missed, or the tenure would be fired before any renewal.
  const reRenewal = renewalRoot("COACH", 0, { reputation: 30, goalResults: [false, false, true] });
  assert.deepEqual(reRenewal.story.employment.offers.map((offer) => offer.id), ["trial-extension"]);
  const reAccepted = acceptCareerContract(reRenewal, "trial-extension");
  assert.deepEqual(reAccepted.leagueCareer.grants, []);
});

test("a first hire starts with no grants; a new stint resets them", () => {
  const hired = coachRoot();
  assert.deepEqual(hired.leagueCareer.grants, []);

  const granted = {
    ...hired,
    leagueCareer: { ...hired.leagueCareer, grants: ["trade", "signFreeAgent", "release", "draft"] },
  };
  assert.equal(canDo(granted.leagueCareer, "trade"), true);
  const offer = generateInterviewOffers({ year: 1991, philosophy: "analytics", seed: 43 })[0];
  const next = startNewStint(granted, offer);
  assert.deepEqual(next.leagueCareer.grants, []);
  assert.equal(next.leagueCareer.role, "COACH");
  assert.equal(canDo(next.leagueCareer, "trade"), false);
  assert.equal(canDo(next.leagueCareer, "setRotation"), true);
});

test("validateRoot rejects illegal grants and keeps legal ones on a write/read round-trip", () => {
  assert.doesNotThrow(() => validateRoot(rootWithCareer("COACH", { grants: ["trade", "draft"] })));
  assert.doesNotThrow(() => validateRoot(rootWithCareer("COACH", { grants: [] })));
  // Absent grants — every save written before R6 — stay valid.
  assert.doesNotThrow(() => validateRoot(rootWithCareer("COACH")));
  for (const grants of [["trade", "ADMIN"], "trade", [3], [null]]) {
    assert.throws(
      () => validateRoot(rootWithCareer("COACH", { grants })),
      /invalid root save/,
      `grants ${JSON.stringify(grants)} must be rejected`,
    );
  }
  const stored = rootWithCareer("COACH", { grants: ["trade", "draft"] });
  const storage = createMemoryStorage();
  writeRootSave(stored, storage);
  const loaded = readRootSave(storage);
  assert.deepEqual(loaded.leagueCareer.grants, ["trade", "draft"]);
  assert.equal(canDo(loaded.leagueCareer, "trade"), true);
});

// ---------------------------------------------------------------- ADR-006 R7: Player Reborn joins the identity system

import { readFileSync } from "node:fs";
import { createRebornState } from "../js/reborn/identity.js";

const ROSTER_ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("identityOf derives PLAYER for a pre-R7 reborn save — read-only, nothing is stamped", () => {
  const preR7 = { reborn: { role: "player", identity: { bref: "jamesle01" } } };
  const snapshot = structuredClone(preR7);
  assert.equal(identityOf(preR7), "PLAYER");
  assert.deepEqual(preR7, snapshot, "derivation must not write an identity onto the save");
  // a stamp still wins over the derivation
  assert.equal(identityOf({ ...preR7, identity: { currentRole: "COACH" } }), "COACH");
  assert.equal(identityOf({ ...preR7, identity: { currentRole: "PLAYER" } }), "PLAYER");
  // an old save with neither stays Classic
  assert.equal(identityOf({}), "GM_COACH");
  assert.equal(identityOf({ identity: {} }), "GM_COACH");
});

test("identityOf does not derive PLAYER when a leagueCareer is also present", () => {
  // a root with both could be an old coach career — it keeps Q1 Classic
  const mixed = { reborn: { role: "player" }, leagueCareer: { careerId: "c1" } };
  assert.equal(identityOf(mixed), "GM_COACH");
  // ... unless the save carries its own stamp
  assert.equal(identityOf({ ...mixed, identity: { currentRole: "GM" } }), "GM");
});

test("setIdentity stamps PLAYER on a reborn root without a leagueCareer", () => {
  const stamped = setIdentity({ reborn: { role: "player" } }, "PLAYER");
  assert.deepEqual(stamped.identity, { initialRole: "PLAYER", currentRole: "PLAYER" });
  assert.equal(stamped.leagueCareer, undefined, "no leagueCareer is invented");
  assert.equal(identityOf(stamped), "PLAYER");
  // the stamp survives a write/read round-trip (a real reborn state, so
  // validateReborn accepts the root)
  const reborn = createRebornState("r7-roundtrip", ROSTER_ROWS);
  const stored = setIdentity(createRootState({ reborn }), "PLAYER");
  const storage = createMemoryStorage();
  writeRootSave(stored, storage);
  const loaded = readRootSave(storage);
  assert.equal(identityOf(loaded), "PLAYER");
  assert.deepEqual(loaded.identity, { initialRole: "PLAYER", currentRole: "PLAYER" });
});

test("the reborn guard reads a bare role: PLAYER and Classic pass, COACH and GM are refused", () => {
  for (const capability of ["takeover", "personalTraining"]) {
    for (const root of [
      { identity: { currentRole: "PLAYER" } },
      { reborn: { role: "player" } },
      {},
    ]) {
      assert.equal(
        requireCapability({ role: identityOf(root) }, capability, root),
        identityOf(root),
        `${capability} must pass for ${JSON.stringify(root)}`,
      );
    }
    for (const role of ["COACH", "GM"]) {
      const root = { identity: { currentRole: role } };
      assert.throws(
        () => requireCapability({ role: identityOf(root) }, capability, root),
        (error) => {
          assert.equal(error.name, "CareerPermissionError");
          assert.equal(error.code, "ROLE_NOT_PERMITTED");
          assert.equal(error.role, role);
          assert.equal(error.capability, capability);
          return true;
        },
        `${capability} must refuse ${role}`,
      );
    }
  }
});
