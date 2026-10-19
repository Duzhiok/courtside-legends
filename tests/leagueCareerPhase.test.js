import test from "node:test";
import assert from "node:assert/strict";
import {
  attemptCareerTransition,
  careerForPersistence,
  isManagedCareer,
  runCareerTransition,
} from "../js/modes/leagueCareerPhase.js";

test("career persistence retains a managed draft wrapper over a done season", () => {
  const career = {
    phase: "draft",
    season: { phase: "done", year: 2030 },
    management: { draft: { year: 2030, status: "in_progress" } },
  };
  const season = { ...career.season };

  const persisted = careerForPersistence(career, season);

  assert.equal(persisted.phase, "draft");
  assert.equal(persisted.season, season);
  assert.equal(career.phase, "draft");
});

test("career persistence synchronizes ordinary and unmanaged wrapper phases", () => {
  const managed = {
    phase: "regular",
    season: { phase: "regular" },
    management: { draft: null },
  };
  assert.equal(
    careerForPersistence(managed, { phase: "playoffs" }).phase,
    "playoffs",
  );

  const unmanaged = { phase: "done", season: { phase: "done" } };
  assert.equal(
    careerForPersistence(unmanaged, { phase: "regular" }).phase,
    "regular",
  );
  assert.equal(isManagedCareer(unmanaged), false);
  assert.equal(isManagedCareer(managed), true);
});

test("career transitions clone current state so failed attempts are retry-safe", () => {
  const current = {
    phase: "draft",
    season: { teams: { USER: { players: [] } } },
    management: { draft: { currentPick: 0 } },
  };
  const mutate = (working) => {
    working.management.draft.currentPick += 1;
    working.season.teams.USER.players.push({ id: "rookie" });
    return working;
  };

  const first = runCareerTransition(current, mutate);
  assert.equal(first.management.draft.currentPick, 1);
  assert.equal(current.management.draft.currentPick, 0);
  assert.deepEqual(current.season.teams.USER.players, []);

  const retry = runCareerTransition(current, mutate);
  assert.deepEqual(retry, first);
});

test("failed pure commits return the original checkpoint and retry deterministically", () => {
  const current = {
    phase: "draft",
    season: { teams: { USER: { players: [] } } },
    management: { draft: { currentPick: 0 } },
  };
  const pick = (working) => {
    working.management.draft.currentPick += 1;
    working.season.teams.USER.players.push({ id: "rookie" });
    return working;
  };
  const failed = attemptCareerTransition(current, pick, () => false);

  assert.equal(failed.ok, false);
  assert.equal(failed.career, current);
  assert.equal(current.management.draft.currentPick, 0);
  assert.deepEqual(current.season.teams.USER.players, []);

  const retry = attemptCareerTransition(current, pick, () => true);
  assert.equal(retry.ok, true);
  assert.equal(retry.career.management.draft.currentPick, 1);
  assert.deepEqual(retry.career.season.teams.USER.players, [{ id: "rookie" }]);
});
