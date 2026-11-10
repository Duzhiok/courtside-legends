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
