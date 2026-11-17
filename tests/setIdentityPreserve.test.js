// B72: setIdentity must move currentRole without dropping other identity fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setIdentity } from "../js/career/careerIdentity.js";

const base = () => ({
  identity: {
    initialRole: "COACH",
    currentRole: "COACH",
    prestige: "architect",
    history: [{ role: "COACH", year: 1996 }],
  },
  leagueCareer: { role: "COACH", season: 1 },
});

test("a second setIdentity keeps prestige and history, moves only currentRole", () => {
  const out = setIdentity(base(), "GM_COACH");
  assert.equal(out.identity.currentRole, "GM_COACH");
  assert.equal(out.identity.initialRole, "COACH");
  assert.equal(out.identity.prestige, "architect");
  assert.deepEqual(out.identity.history, [{ role: "COACH", year: 1996 }]);
  assert.equal(out.leagueCareer.role, "GM_COACH");
});

test("setIdentity does not mutate its input", () => {
  const root = base();
  const snapshot = structuredClone(root);
  setIdentity(root, "GM");
  assert.deepEqual(root, snapshot);
});

test("first stamp on an unstamped root still sets both roles", () => {
  const out = setIdentity({}, "PLAYER");
  assert.deepEqual(out.identity, { initialRole: "PLAYER", currentRole: "PLAYER" });
});
