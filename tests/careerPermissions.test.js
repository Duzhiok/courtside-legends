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
