/**
 * js/engine/draft.js previously had zero test coverage despite already holding real logic
 * (drawPack, cpuUpgradeRoster, autoFillTeam, teamPowerLabel). This file was written while
 * extracting five more pure draft-state helpers out of app.js (isDraftDone, draftRefreshCost,
 * pickCost, customSideCanSpend, customSpendPhaseDone), so it covers both: the newly-moved
 * functions get focused tests, and the pre-existing exports get at least a smoke test each.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_REFRESH_COST } from "../js/data/customPool.js";
import {
  DRAFT_FREE_REFRESHES,
  DRAFT_REFRESH_COST,
  autoFillTeam,
  cpuUpgradeRoster,
  customSideCanSpend,
  customSpendPhaseDone,
  draftRefreshCost,
  drawPack,
  isDraftDone,
  pickCost,
  takenPeople,
  teamPowerLabel,
} from "../js/engine/draft.js";

function fakePlayer(id, overrides = {}) {
  return { id, bref: id, name: id, season: 2020, scoring: 70, defense: 70, pass: 70, rebound: 70, ...overrides };
}

function fakeDraft(overrides = {}) {
  return {
    picksPerSide: 2,
    budgetMode: false,
    buyPlayers: false,
    used: new Set(),
    teams: {
      A: { players: [], coach: null, assistant: null, gold: 100 },
      B: { players: [], coach: null, assistant: null, gold: 100 },
    },
    ...overrides,
  };
}

test("DRAFT_FREE_REFRESHES / DRAFT_REFRESH_COST are the documented constants", () => {
  assert.equal(DRAFT_FREE_REFRESHES, 3);
  assert.equal(DRAFT_REFRESH_COST, 40);
});

test("isDraftDone: false when rosters, coaches, or assistants are still missing", () => {
  const d = fakeDraft();
  assert.equal(isDraftDone(d), false, "empty rosters");
  d.teams.A.players = [fakePlayer("a1"), fakePlayer("a2")];
  d.teams.B.players = [fakePlayer("b1"), fakePlayer("b2")];
  assert.equal(isDraftDone(d), false, "rosters full but no coaches/assistants yet");
  d.teams.A.coach = { id: "ca" };
  d.teams.B.coach = { id: "cb" };
  assert.equal(isDraftDone(d), false, "coaches in but assistants still missing");
});

test("isDraftDone: true once both rosters, coaches, and assistants are filled", () => {
  const d = fakeDraft({
    teams: {
      A: { players: [fakePlayer("a1"), fakePlayer("a2")], coach: { id: "ca" }, assistant: { id: "aa" }, gold: 0 },
      B: { players: [fakePlayer("b1"), fakePlayer("b2")], coach: { id: "cb" }, assistant: { id: "ab" }, gold: 0 },
    },
  });
  assert.equal(isDraftDone(d), true);
});

test("isDraftDone: a missing/null draft is safely not done", () => {
  assert.equal(isDraftDone(null), false);
  assert.equal(isDraftDone(undefined), false);
});

test("draftRefreshCost: custom budget mode is the cheap block cost, normal draft is the gold cost", () => {
  assert.equal(draftRefreshCost({ budgetMode: true }), CUSTOM_REFRESH_COST);
  assert.equal(draftRefreshCost({ budgetMode: false }), DRAFT_REFRESH_COST);
  assert.equal(draftRefreshCost(null), DRAFT_REFRESH_COST, "no draft object defaults to the non-budget cost");
});

test("pickCost: free when the mode doesn't charge for players at all", () => {
  assert.equal(pickCost({ buyPlayers: false }, fakePlayer("p1")), 0);
  assert.equal(pickCost(null, fakePlayer("p1")), 0);
});

test("pickCost: custom budget mode prices by block (1-5), capped and driven by customPrice/overall", () => {
  const priced = fakePlayer("p1", { customPrice: 4 });
  assert.equal(pickCost({ buyPlayers: true, budgetMode: true }, priced), 4);
});

test("pickCost: normal buy-players mode (duel) prices in gold via playerPrice, not the block scale", () => {
  const strong = fakePlayer("strong", { scoring: 95, defense: 95, pass: 95, rebound: 95 });
  const weak = fakePlayer("weak", { scoring: 40, defense: 40, pass: 40, rebound: 40 });
  const d = { buyPlayers: true, budgetMode: false };
  assert.ok(pickCost(d, strong) > pickCost(d, weak), "a much better player should cost more gold");
  assert.ok(pickCost(d, weak) > 4, "gold prices operate on a different (much bigger) scale than the 1-5 block prices");
});

test("customSideCanSpend: false outside budget mode, with a full roster, or with no gold", () => {
  assert.equal(customSideCanSpend(fakeDraft({ budgetMode: false }), "A"), false, "not budget mode");
  const full = fakeDraft({ budgetMode: true, picksPerSide: 1 });
  full.teams.A.players = [fakePlayer("x")];
  assert.equal(customSideCanSpend(full, "A"), false, "roster already full");
  const broke = fakeDraft({ budgetMode: true });
  broke.teams.A.gold = 0;
  assert.equal(customSideCanSpend(broke, "A"), false, "no gold left");
});

test("customSideCanSpend / customSpendPhaseDone: against the real peak pool, a side with plenty of gold can still spend", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  const { clearPeakPoolCache } = await import("../js/data/customPool.js");
  await loadSampleRoster();
  clearPeakPoolCache();
  const d = fakeDraft({ budgetMode: true, picksPerSide: 8 });
  d.teams.A.gold = 999; // comfortably above every peak card's 1-5 block price
  assert.equal(customSideCanSpend(d, "A"), true);
  assert.equal(customSpendPhaseDone(d), false, "A can still spend, so the spend phase isn't over");
  d.teams.A.gold = 0;
  d.teams.B.gold = 0;
  assert.equal(customSpendPhaseDone(d), true, "neither side can afford anything -- move to the filler phase");
});

test("customSpendPhaseDone: outside budget mode it's trivially always done (there's no spend phase)", () => {
  assert.equal(customSpendPhaseDone(fakeDraft({ budgetMode: false })), true);
  assert.equal(customSpendPhaseDone(null), true);
});

test("takenPeople: maps drafted ids to real brefs so the same person can't show up twice across seasons", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  const roster = await loadSampleRoster();
  const someone = roster[0];
  const people = takenPeople([someone.id]);
  assert.ok(people.has(someone.bref));
});

test("takenPeople: empty/missing ids is a safe no-op", () => {
  assert.equal(takenPeople(null).size, 0);
  assert.equal(takenPeople([]).size, 0);
});

test("drawPack: respects excludeIds and the requested size (smoke test against the real roster)", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  const roster = await loadSampleRoster();
  const excluded = new Set(roster.slice(0, 5).map((p) => p.id));
  const pack = drawPack(3, { excludeIds: excluded });
  assert.ok(pack.length > 0 && pack.length <= 3);
  for (const card of pack) {
    if (card.kind === "player") assert.ok(!excluded.has(card.data.id), "excluded ids must not reappear in the pack");
  }
});

test("cpuUpgradeRoster: with zero budget, spends nothing and adds nobody", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  await loadSampleRoster();
  const result = cpuUpgradeRoster({ players: [] }, 0, new Set());
  assert.deepEqual(result, { spent: 0, added: [], notes: [] });
});

test("cpuUpgradeRoster: a real budget buys at least one player and never exceeds it", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  await loadSampleRoster();
  const team = { players: [] };
  const result = cpuUpgradeRoster(team, 300, new Set());
  assert.ok(result.spent <= 300, `spent ${result.spent} should never exceed the 300 budget`);
  assert.ok(team.players.length > 0, "an empty roster with real budget should buy somebody");
});

test("autoFillTeam: builds a full roster with a coach and an assistant", async () => {
  const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
  await loadSampleRoster();
  const squad = autoFillTeam("CPU Squad", 8);
  assert.equal(squad.name, "CPU Squad");
  assert.ok(squad.players.length >= 8);
  assert.ok(squad.coach);
  assert.ok(squad.assistant);
  assert.equal(squad.isCpu, true);
});

test("teamPowerLabel: the rounded average OVR of the roster", () => {
  const team = {
    players: [
      fakePlayer("a", { scoring: 80, defense: 80, pass: 80, rebound: 80 }),
      fakePlayer("b", { scoring: 60, defense: 60, pass: 60, rebound: 60 }),
    ],
  };
  const label = teamPowerLabel(team);
  assert.ok(Number.isInteger(label));
  assert.ok(label > 0);
});
