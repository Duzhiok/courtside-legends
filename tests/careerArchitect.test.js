/**
 * Prestige Career System (3+1): the unlock store.
 *
 * Pins: completion records are the only persisted truth (the unlock is
 * derived, never stored); one record per careerId, never double-awarded;
 * only a formal ending counts (a single season, or being fired without
 * an ending, records nothing); Coach + GM both required; a Classic
 * GM + Coach career does not qualify; Architect (prestige) completions
 * feed the dynasty titles; the dev override is session-only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHITECT_QUALIFYING_ROLES,
  LEGITIMATE_ENDING_IDS,
  ARCHITECT_TITLES,
  careerCompletions,
  isFormalCareerEnding,
  completionFromRoot,
  recordCareerCompletion,
  architectProgress,
  architectUnlocked,
  architectTitlesFor,
  readArchitectDevOverride,
} from "../js/career/careerAchievements.js";

/** A retired root: COACH, 3 finished seasons, 1 championship, fired once mid-career. */
function retiredRoot({ role = "COACH", careerId = "career-1", championships = 1 } = {}) {
  return {
    identity: { currentRole: role },
    leagueCareer: { careerId, season: { year: 2001 } },
    story: {
      employment: { status: "retired", reason: "voluntary" },
      ending: { id: "retired" },
    },
    coach: {
      reputation: 50,
      age: 60,
      stints: [
        { teamId: "LAL", startYear: 1998, seasons: 2, wins: 90, losses: 74, championships: 0 },
        { teamId: "BOS", startYear: 2000, seasons: 3, wins: 150, losses: 96, championships },
      ],
    },
  };
}

function fakeStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// ---------------------------------------------------------------- endings

test("isFormalCareerEnding: only a retired career with a legitimate ending id counts", () => {
  assert.deepEqual(LEGITIMATE_ENDING_IDS, ["retired"]);
  assert.equal(isFormalCareerEnding(retiredRoot()), true);
  assert.equal(isFormalCareerEnding({ ...retiredRoot(), story: { employment: { status: "fired" }, ending: null } }), false);
  assert.equal(isFormalCareerEnding({ ...retiredRoot(), story: { employment: { status: "active" }, ending: null } }), false);
  assert.equal(isFormalCareerEnding({ ...retiredRoot(), story: { employment: { status: "retired" }, ending: { id: "walked-away" } } }), false);
  assert.equal(isFormalCareerEnding(null), false);
  assert.equal(isFormalCareerEnding({}), false);
});

test("completionFromRoot: a retired Coach career yields a record; anything else yields null", () => {
  const rec = completionFromRoot(retiredRoot());
  assert.equal(rec.careerId, "career-1");
  assert.equal(rec.role, "COACH");
  assert.equal(rec.prestige, false);
  assert.equal(rec.seasons, 5);
  assert.equal(rec.championships, 1);
  assert.equal(rec.year, 2001);
  assert.equal(typeof rec.tier, "string");
  assert.equal(rec.reason, "voluntary");

  // Fired without a formal ending: no record (the coach may be re-hired).
  const fired = retiredRoot();
  fired.story = { employment: { status: "fired", reason: "fired" }, ending: null };
  assert.equal(completionFromRoot(fired), null);
  // Active career, one season in: a single season is not sufficient.
  const active = retiredRoot();
  active.story = { employment: { status: "active" }, ending: null };
  assert.equal(completionFromRoot(active), null);
  // No career id: nothing to dedupe on.
  const noId = retiredRoot();
  noId.leagueCareer = { careerId: "", season: { year: 2001 } };
  assert.equal(completionFromRoot(noId), null);
  // Zero finished seasons: not a completed career even with an ending.
  const empty = retiredRoot();
  empty.coach = { reputation: 0, age: 40, stints: [] };
  assert.equal(completionFromRoot(empty), null);
});

test("completionFromRoot: prestige marks an Architect career only for GM + Coach", () => {
  const arch = completionFromRoot(retiredRoot({ role: "GM_COACH" }), { prestige: true });
  assert.equal(arch.role, "GM_COACH");
  assert.equal(arch.prestige, true);
  // Prestige is ignored for other roles: a Coach career is a Coach career.
  const coach = completionFromRoot(retiredRoot({ role: "COACH" }), { prestige: true });
  assert.equal(coach.prestige, false);
  // No prestige flag: a Classic GM + Coach retirement is not an Architect career.
  const classic = completionFromRoot(retiredRoot({ role: "GM_COACH" }));
  assert.equal(classic.prestige, false);
});

// ---------------------------------------------------------------- records

test("recordCareerCompletion: one record per careerId, never double-awarded", () => {
  const account = {};
  assert.deepEqual(careerCompletions(account), []);
  const rec = completionFromRoot(retiredRoot());
  const afterFirst = recordCareerCompletion(account, rec);
  assert.equal(afterFirst, account, "returns the account for saveAccount");
  assert.equal(careerCompletions(account).length, 1);
  // Same career ends again (double save): ignored.
  recordCareerCompletion(account, { ...rec, at: Date.now() + 1000 });
  assert.equal(careerCompletions(account).length, 1);
  // A different career records separately.
  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "GM", careerId: "career-2" })));
  assert.equal(careerCompletions(account).length, 2);
  // Bad input never writes.
  recordCareerCompletion(account, null);
  recordCareerCompletion(null, rec);
  assert.equal(careerCompletions(account).length, 2);
});

// ---------------------------------------------------------------- unlock

test("architectProgress / architectUnlocked: both Coach and GM are required", () => {
  assert.deepEqual(ARCHITECT_QUALIFYING_ROLES, ["COACH", "GM"]);
  const account = {};
  assert.deepEqual(architectProgress(account), { coach: false, gm: false, completed: 0 });
  assert.equal(architectUnlocked(account), false);

  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "COACH" })));
  assert.deepEqual(architectProgress(account), { coach: true, gm: false, completed: 1 });
  assert.equal(architectUnlocked(account), false, "one qualification is not enough");

  // A Classic GM + Coach career does NOT qualify.
  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "GM_COACH", careerId: "career-3" })));
  assert.deepEqual(architectProgress(account), { coach: true, gm: false, completed: 1 });
  assert.equal(architectUnlocked(account), false);

  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "GM", careerId: "career-2" })));
  assert.deepEqual(architectProgress(account), { coach: true, gm: true, completed: 2 });
  assert.equal(architectUnlocked(account), true, "permanent once both are satisfied");
  // The unlock is derived, never stored: no boolean field on the account.
  assert.equal(account.architectUnlocked, undefined);
  assert.equal(account.coachCareerCompleted, undefined);
  assert.equal(account.gmCareerCompleted, undefined);
});

test("architectUnlocked: the dev override opens it for testing without writing a qualification", () => {
  const account = {};
  assert.equal(architectUnlocked(account, { devOverride: true }), true);
  assert.equal(careerCompletions(account).length, 0, "the override writes no record");
  assert.equal(architectUnlocked(account), false, "without the override the lock is back");
});

// ---------------------------------------------------------------- titles

test("architectTitlesFor: locked accounts hold no titles; the dynasty titles derive from Architect careers", () => {
  assert.deepEqual(architectTitlesFor({}), []);
  const account = {};
  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "COACH" })));
  recordCareerCompletion(account, completionFromRoot(retiredRoot({ role: "GM", careerId: "career-2" })));
  assert.deepEqual(architectTitlesFor(account).map((t) => t.id), ["architect"]);
  assert.equal(architectTitlesFor(account)[0].en, "The Architect");

  // An Architect career completed without a championship: Immortal, not Dynasty Master.
  recordCareerCompletion(
    account,
    completionFromRoot(retiredRoot({ role: "GM_COACH", careerId: "career-4", championships: 0 }), { prestige: true }),
  );
  assert.deepEqual(architectTitlesFor(account).map((t) => t.id), ["architect", "basketball-immortal"]);

  // An Architect career with a championship: both dynasty titles.
  const account2 = {};
  recordCareerCompletion(account2, completionFromRoot(retiredRoot({ role: "COACH" })));
  recordCareerCompletion(account2, completionFromRoot(retiredRoot({ role: "GM", careerId: "career-2" })));
  recordCareerCompletion(
    account2,
    completionFromRoot(retiredRoot({ role: "GM_COACH", careerId: "career-4", championships: 2 }), { prestige: true }),
  );
  assert.deepEqual(
    architectTitlesFor(account2).map((t) => t.id),
    ["architect", "dynasty-master", "basketball-immortal"],
  );
  assert.equal(ARCHITECT_TITLES.dynasty.en, "Dynasty Master");
  assert.equal(ARCHITECT_TITLES.immortal.en, "Basketball Immortal");
});

// ---------------------------------------------------------------- dev override

test("readArchitectDevOverride: ?architect=1 sets it for the session, ?architect=0 clears it", () => {
  const storage = fakeStorage();
  assert.equal(readArchitectDevOverride("", storage), false);
  assert.equal(readArchitectDevOverride("?architect=1", storage), true);
  assert.equal(storage.data["architect-dev-unlock"], "1");
  assert.equal(readArchitectDevOverride("", storage), true, "persists for the session");
  assert.equal(readArchitectDevOverride("?architect=0", storage), false);
  assert.equal(readArchitectDevOverride("", storage), false);
  assert.equal(readArchitectDevOverride("?architect=1", null), true, "works without storage");
  assert.equal(readArchitectDevOverride("", null), false);
});
