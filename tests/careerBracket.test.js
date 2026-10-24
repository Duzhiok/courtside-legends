import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCareerInjuryWave,
  buildStagePods,
  computeCareerAllTeam,
  findYourOpenMatch,
  noteCareerAllTeamGame,
  noteCareerLoss,
  runCpuMatchInto,
  upgradeCpuAdvancers,
  yourCareerMatch,
} from "../js/engine/careerBracket.js";

/**
 * Extracted from js/app.js alongside careerEconomy.js (R26 continued): these five
 * functions used to read `state.career` as a hidden global inside app.js. They now
 * take the career object `c` explicitly, which is what makes them testable here at all.
 */
function team(id, overrides = {}) {
  return { bracketId: id, name: id, isCpu: id !== "you", players: [], ...overrides };
}

test("noteCareerLoss: increments the loss counter for that bracketId only", () => {
  const c = { losses: {} };
  noteCareerLoss(c, team("cpu-a"));
  noteCareerLoss(c, team("cpu-a"));
  noteCareerLoss(c, team("cpu-b"));
  assert.deepEqual(c.losses, { "cpu-a": 2, "cpu-b": 1 });
});

test("noteCareerLoss: no-ops safely without c.losses or a bracketId", () => {
  assert.doesNotThrow(() => noteCareerLoss(null, team("x")));
  assert.doesNotThrow(() => noteCareerLoss({}, team("x")));
  assert.doesNotThrow(() => noteCareerLoss({ losses: {} }, null));
});

test("noteCareerAllTeamGame: lazily creates allTeamBoard and is a no-op without a snapshot", () => {
  const c = {};
  noteCareerAllTeamGame(c, null, team("a"), team("b"));
  assert.equal(c.allTeamBoard, undefined, "nothing should be created when snap is missing");
  // A minimal fake snapshot just needs whatever shape accumulateGameToAllTeamBoard reads;
  // the point of this test is the wiring (board gets created, doesn't throw), not the box math.
  assert.doesNotThrow(() => noteCareerAllTeamGame(c, { home: {}, away: {}, score: { home: 1, away: 0 } }, team("a"), team("b")));
  assert.ok(c.allTeamBoard, "board should exist after a real snapshot comes through");
});

test("runCpuMatchInto: a match already done or belonging to the human is left untouched", () => {
  const c = { losses: {} };
  const doneMatch = { a: team("a"), b: team("b"), done: true, yours: false };
  const yoursMatch = { a: team("you"), b: team("b"), done: false, yours: true };
  const beforeDone = JSON.stringify(doneMatch);
  const beforeYours = JSON.stringify(yoursMatch);
  runCpuMatchInto(c, doneMatch);
  runCpuMatchInto(c, yoursMatch);
  assert.equal(JSON.stringify(doneMatch), beforeDone);
  assert.equal(JSON.stringify(yoursMatch), beforeYours);
});

test("runCpuMatchInto: null/undefined match is a safe no-op", () => {
  assert.doesNotThrow(() => runCpuMatchInto({ losses: {} }, null));
});

test("yourCareerMatch: pods take priority over the legacy flat roundMatches list", () => {
  const { pods } = buildStagePods([team("you"), team("b"), team("c"), team("d")]);
  const c = {
    pods,
    roundMatches: [{ a: team("you"), b: team("z"), yours: true, done: false }],
  };
  const fromPods = findYourOpenMatch(pods);
  assert.ok(fromPods, "pods really do have an open match for 'you' in this fixture");
  assert.equal(yourCareerMatch(c), fromPods);
});

test("yourCareerMatch: falls back to roundMatches when there are no pods", () => {
  const openMatch = { a: team("you"), b: team("z"), yours: true, done: false };
  const c = { roundMatches: [{ a: team("x"), b: team("y"), yours: false, done: true }, openMatch] };
  assert.equal(yourCareerMatch(c), openMatch);
});

test("yourCareerMatch: no pods, no roundMatches, nothing crashes — returns null", () => {
  assert.equal(yourCareerMatch({}), null);
  assert.equal(yourCareerMatch(null), null);
});

test("computeCareerAllTeam: with no board yet, falls back to pulling rosters from team/alive/series", () => {
  const c = {
    team: team("you", { players: [{ id: "p1", pos: "PG", name: "P1" }] }),
    alive: [team("cpu-a", { players: [{ id: "p2", pos: "SG", name: "P2" }] })],
  };
  const result = computeCareerAllTeam(c);
  assert.ok(Array.isArray(result));
  assert.equal(c.allTeam, result, "the computed all-team is stashed back onto c.allTeam");
});

test("computeCareerAllTeam: a career object with nothing at all returns an empty array, not a crash", () => {
  assert.deepEqual(computeCareerAllTeam(null), []);
  assert.deepEqual(computeCareerAllTeam({}), []);
});

/**
 * applyCareerInjuryWave's actual injury roll is random (rollAdvancementInjuries), so these
 * tests drive the deterministic "already hurt, now recovering" path (injuredGames: 1 always
 * recovers on the next roll, no RNG involved) -- that's enough to pin the *routing* this
 * function is actually responsible for: your team at full weight, your series opponent and
 * the rest of the bracket's survivors at reduced weight, and never double-counting "you".
 */
function hurtPlayer(id) {
  return { id, name: id, injuredGames: 1, injuryStatus: "伤停" };
}

test("applyCareerInjuryWave: rolls your own team's recoveries", () => {
  const c = { team: { bracketId: "you", players: [hurtPlayer("p1")] } };
  const notes = applyCareerInjuryWave(c, { round: 1 });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /伤愈归队/);
});

test("applyCareerInjuryWave: also rolls the current series opponent", () => {
  const c = {
    team: { bracketId: "you", players: [] },
    series: { opp: { bracketId: "cpu-x", players: [hurtPlayer("rival")] } },
  };
  const notes = applyCareerInjuryWave(c, { round: 1 });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /rival/);
});

test("applyCareerInjuryWave: rolls the rest of the bracket's survivors but skips 'you' in alive[] to avoid double-counting", () => {
  // Two distinct objects both tagged bracketId "you" -- the filter is by id, not identity,
  // so this pins down that *any* alive[] entry claiming to be "you" gets skipped, not just
  // a reference-equality check against c.team.
  const c = {
    team: { bracketId: "you", players: [hurtPlayer("dup")] },
    alive: [
      { bracketId: "you", players: [hurtPlayer("should-be-skipped")] },
      { bracketId: "cpu-y", players: [hurtPlayer("other")] },
    ],
  };
  const notes = applyCareerInjuryWave(c, { round: 1 });
  assert.equal(notes.length, 2, "human team (from c.team) once + cpu-y once -- never the alive[] 'you' duplicate");
  assert.ok(notes.some((n) => n.includes("dup")));
  assert.ok(notes.some((n) => n.includes("other")));
  assert.ok(!notes.some((n) => n.includes("should-be-skipped")));
});

test("applyCareerInjuryWave: with no team at all, returns an empty array instead of crashing", () => {
  assert.deepEqual(applyCareerInjuryWave(null, {}), []);
  assert.deepEqual(applyCareerInjuryWave({}, {}), []);
});

/**
 * Extracted alongside the above (same app.js call site, upgradeCpuAdvancers hands budgets to
 * cpuUpgradeRoster from draft.js, which spends against the real PLAYERS pool) -- needs the real
 * roster loaded, unlike the rest of this file which uses tiny fake team() fixtures.
 */
test("upgradeCpuAdvancers: only touches CPU survivors, hands out gold, and clears stale starterIds so a rebuilt lineup gets picked", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  await loadSampleRoster();
  const you = team("you", { isCpu: false, gold: 0, starterIds: ["x"], players: [] });
  const cpu = team("cpu-a", { gold: 0, starterIds: ["y"], players: [] });
  const c = { stageSize: 16, fieldSource: "historical", used: new Set() };
  upgradeCpuAdvancers(c, [you, cpu]);
  assert.equal(you.gold, 0, "the human's own team is never touched");
  assert.deepEqual(you.starterIds, ["x"], "human starterIds untouched");
  assert.ok(cpu.gold >= 0, "CPU team got a gold purse (all of it may have been spent on upgrades)");
  assert.equal(cpu.starterIds, null, "CPU starterIds cleared so the lineup picker re-derives it from the new roster");
});

test("upgradeCpuAdvancers: deeper stages (smaller stageSize) hand out bigger purses than earlier rounds", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  await loadSampleRoster();
  // Spy on cpuUpgradeRoster's actual spend isn't exposed, so measure the purse via gold left
  // over when there's nothing left in the pool to buy (globalUsed = everyone already taken).
  const { PLAYERS } = await import("../js/data/players.js");
  const everyoneTaken = new Set(PLAYERS.map((p) => p.id));
  const early = team("cpu-early", { gold: 0, players: [] });
  const late = team("cpu-late", { gold: 0, players: [] });
  upgradeCpuAdvancers({ stageSize: 32, fieldSource: "historical", used: new Set(everyoneTaken) }, [early]);
  upgradeCpuAdvancers({ stageSize: 4, fieldSource: "historical", used: new Set(everyoneTaken) }, [late]);
  // Nothing is buyable (pool fully excluded), so gold left over IS the purse that was handed out.
  assert.ok(late.gold > early.gold, `expected a deeper stage (4) to hand out a bigger purse than stage 32, got early=${early.gold} late=${late.gold}`);
});

test("upgradeCpuAdvancers: empty survivor list is a safe no-op", () => {
  assert.doesNotThrow(() => upgradeCpuAdvancers({ stageSize: 16, used: new Set() }, []));
});
