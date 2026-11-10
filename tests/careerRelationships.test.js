import test from "node:test";
import assert from "node:assert/strict";
import {
  RELATIONSHIP_KINDS,
  PROMISE_KINDS,
  addRelationship,
  adjustRelationship,
  applyPromiseTrustToRoot,
  coachingTrustFor,
  evaluatePromise,
  legacySummaryFor,
  makePromise,
  markTrustEffectsApplied,
  negotiationStanding,
  pendingTrustEffects,
  personById,
  promiseEffect,
  recordCareerTransition,
  recordDivergence,
  recordDraftDecision,
  recordPerson,
  recordRivalryGame,
  recordTradeDecision,
  relationshipsStore,
  resolveDuePromises,
  rivalryStakes,
} from "../js/career/careerRelationships.js";

const freshAccount = () => ({ id: "acc-1", name: "Test" });

const seedPeople = (account) => {
  recordPerson(account, { id: "coach-1", kind: "coach", name: "主教练" });
  recordPerson(account, { id: "bryanko01", kind: "player", name: "Kobe Bryant", bref: "bryanko01", teamId: "LAL" });
  recordPerson(account, { id: "jordami01", kind: "player", name: "Michael Jordan", bref: "jordami01", teamId: "CHI" });
  return account;
};

test("empty / invalid store reads as empty and never throws", () => {
  assert.deepEqual(relationshipsStore(null), { version: 1, people: [], relationships: [], promises: [], legacy: [] });
  assert.deepEqual(relationshipsStore({}), { version: 1, people: [], relationships: [], promises: [], legacy: [] });
  assert.deepEqual(relationshipsStore({ careerRelationships: "nope" }), { version: 1, people: [], relationships: [], promises: [], legacy: [] });
  assert.deepEqual(relationshipsStore({ careerRelationships: { people: "nope", promises: null } }), {
    version: 1,
    people: [],
    relationships: [],
    promises: [],
    legacy: [],
  });
  assert.equal(personById(null, "x"), null);
  assert.equal(coachingTrustFor(freshAccount(), "c", "p"), 50);
});

test("recordPerson upserts by id; personById finds", () => {
  const account = freshAccount();
  recordPerson(account, { id: "bryanko01", kind: "player", name: "Kobe" });
  recordPerson(account, { id: "bryanko01", kind: "player", name: "Kobe Bryant", bref: "bryanko01" });
  assert.equal(personById(account, "bryanko01").name, "Kobe Bryant");
  assert.equal(personById(account, "bryanko01").bref, "bryanko01");
  assert.equal(relationshipsStore(account).people.length, 1);
  recordPerson(account, { id: "", kind: "player", name: "?" });
  assert.equal(relationshipsStore(account).people.length, 1);
});

test("addRelationship is idempotent per (pair, kind) and direction-free", () => {
  const account = seedPeople(freshAccount());
  const a = addRelationship(account, { aId: "bryanko01", bId: "jordami01", kind: "rivalry", strength: 70, season: 1996 });
  const b = addRelationship(account, { aId: "jordami01", bId: "bryanko01", kind: "rivalry", strength: 20 });
  assert.equal(a.id, b.id);
  assert.equal(b.strength, 70);
  const other = addRelationship(account, { aId: "bryanko01", bId: "jordami01", kind: "mentorship", strength: 30 });
  assert.notEqual(other.id, a.id);
  assert.equal(relationshipsStore(account).relationships.length, 2);
  assert.equal(addRelationship(account, { aId: "x", bId: "x", kind: "rivalry" }), null);
  assert.equal(addRelationship(account, { aId: "x", bId: "y", kind: "nope" }), null);
});

test("adjustRelationship clamps 0-100 and records history", () => {
  const account = seedPeople(freshAccount());
  const rel = addRelationship(account, { aId: "coach-1", bId: "bryanko01", kind: "coaching-trust", strength: 90 });
  adjustRelationship(account, rel.id, 50, "great game");
  assert.equal(relationshipsStore(account).relationships[0].strength, 100);
  adjustRelationship(account, rel.id, -250, "bust-up");
  assert.equal(relationshipsStore(account).relationships[0].strength, 0);
  assert.equal(relationshipsStore(account).relationships[0].history.length, 2);
  assert.equal(adjustRelationship(account, "missing", 5), null);
});

test("coachingTrustFor reads the recorded value, defaults neutral", () => {
  const account = seedPeople(freshAccount());
  assert.equal(coachingTrustFor(account, "coach-1", "bryanko01"), 50);
  addRelationship(account, { aId: "coach-1", bId: "bryanko01", kind: "coaching-trust", strength: 82 });
  assert.equal(coachingTrustFor(account, "coach-1", "bryanko01"), 82);
  assert.equal(coachingTrustFor(account, "bryanko01", "coach-1"), 82);
});

test("makePromise validates input and implies a management relationship", () => {
  const account = seedPeople(freshAccount());
  assert.throws(() => makePromise(account, { makerId: "coach-1", targetId: "bryanko01", kind: "nope", text: "x", check: {} }), /unknown kind/);
  assert.throws(
    () => makePromise(account, { makerId: "coach-1", targetId: "bryanko01", kind: "minutes", text: "more minutes", check: { type: "minutes", minGames: 0, minMpg: 20, dueAfterGames: 5 } }),
    /invalid check/,
  );
  const p = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "minutes",
    text: "未来五场给你更多上场时间",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "minutes", minGames: 5, minMpg: 20, dueAfterGames: 5 },
  });
  assert.equal(p.status, "open");
  assert.equal(p.check.type, "minutes");
  const rel = relationshipsStore(account).relationships.find((r) => r.kind === "management");
  assert.ok(rel, "a promise implies a management relationship");
  assert.equal(rel.strength, 50);
  // Same open promise twice: no duplicate.
  const again = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "minutes",
    text: "未来五场给你更多上场时间",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "minutes", minGames: 5, minMpg: 20, dueAfterGames: 5 },
  });
  assert.equal(again.id, p.id);
  assert.equal(relationshipsStore(account).promises.length, 1);
  assert.throws(() => makePromise(account, { makerId: "a", targetId: "a", kind: "start", text: "x", check: { type: "start", dueAfterGames: 3 } }), /different people/);
  assert.throws(() => makePromise(account, { makerId: "a", targetId: "b", kind: "start", text: "", check: { type: "start", dueAfterGames: 3 } }), /text is required/);
});

test("evaluatePromise: minutes — fulfilled early, broken at deadline, open before", () => {
  const account = seedPeople(freshAccount());
  const p = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "minutes",
    text: "five games, 20 mpg",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "minutes", minGames: 5, minMpg: 20, dueAfterGames: 5 },
  });
  assert.equal(evaluatePromise(p, { season: 1996, game: 12, gamesPlayed: 2, mpg: 22 }), "open");
  assert.equal(evaluatePromise(p, { season: 1996, game: 13, gamesPlayed: 5, mpg: 21 }), "fulfilled");
  assert.equal(evaluatePromise(p, { season: 1996, game: 14, gamesPlayed: 4, mpg: 22 }), "open");
  assert.equal(evaluatePromise(p, { season: 1996, game: 15, gamesPlayed: 4, mpg: 22 }), "broken");
  assert.equal(evaluatePromise(p, { season: 1996, game: 15, gamesPlayed: 5, mpg: 19 }), "broken");
});

test("evaluatePromise: role rank, start, trade and contract deadlines", () => {
  const account = seedPeople(freshAccount());
  const roleP = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "role",
    text: "starter by game 20",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "role", role: "starter", dueAfterGames: 10 },
  });
  assert.equal(evaluatePromise(roleP, { season: 1996, game: 15, role: "rotation" }), "open");
  assert.equal(evaluatePromise(roleP, { season: 1996, game: 15, role: "starter" }), "fulfilled");
  assert.equal(evaluatePromise(roleP, { season: 1996, game: 20, role: "rotation" }), "broken");

  const startP = makePromise(account, {
    makerId: "coach-1",
    targetId: "jordami01",
    kind: "start",
    text: "you will start soon",
    madeSeason: 1996,
    madeGame: 0,
    check: { type: "start", dueAfterGames: 3 },
  });
  assert.equal(evaluatePromise(startP, { season: 1996, game: 2, started: false }), "open");
  assert.equal(evaluatePromise(startP, { season: 1996, game: 2, started: true }), "fulfilled");
  assert.equal(evaluatePromise(startP, { season: 1996, game: 3, started: false }), "broken");

  const tradeP = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "trade",
    text: "trade for a center by 1997",
    madeSeason: 1996,
    check: { type: "trade", dueSeason: 1997 },
  });
  assert.equal(evaluatePromise(tradeP, { season: 1997, traded: false }), "open");
  assert.equal(evaluatePromise(tradeP, { season: 1997, traded: true }), "fulfilled");
  assert.equal(evaluatePromise(tradeP, { season: 1998, traded: false }), "broken");

  const contractP = makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "contract",
    text: "re-sign by 1997",
    madeSeason: 1996,
    check: { type: "contract", dueSeason: 1997 },
  });
  assert.equal(evaluatePromise(contractP, { season: 1998, signed: false }), "broken");
  assert.equal(evaluatePromise(contractP, { season: 1997, signed: true }), "fulfilled");
});

test("promiseEffect values: kept +3 trust / broken -5 trust", () => {
  assert.deepEqual(
    { trustDelta: promiseEffect(null, "fulfilled").trustDelta, relationshipDelta: promiseEffect(null, "fulfilled").relationshipDelta },
    { trustDelta: 3, relationshipDelta: 8 },
  );
  assert.deepEqual(
    { trustDelta: promiseEffect(null, "broken").trustDelta, relationshipDelta: promiseEffect(null, "broken").relationshipDelta },
    { trustDelta: -5, relationshipDelta: -12 },
  );
});

test("resolveDuePromises: resolves, moves the relationship, writes legacy, idempotent", () => {
  const account = seedPeople(freshAccount());
  makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "minutes",
    text: "未来五场给你更多上场时间",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "minutes", minGames: 5, minMpg: 20, dueAfterGames: 5 },
  });
  const first = resolveDuePromises(account, { season: 1996, game: 13, gamesPlayed: 5, mpg: 21 });
  assert.equal(first.count, 1);
  assert.equal(first.resolved[0].outcome, "fulfilled");
  assert.equal(first.resolved[0].trustDelta, 3);
  const promise = relationshipsStore(account).promises[0];
  assert.equal(promise.status, "fulfilled");
  assert.equal(promise.resolvedSeason, 1996);
  const rel = relationshipsStore(account).relationships.find((r) => r.kind === "management");
  assert.equal(rel.strength, 58);
  const legacy = relationshipsStore(account).legacy;
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].type, "promise");
  // Second call with the same state resolves nothing.
  const second = resolveDuePromises(account, { season: 1996, game: 13, gamesPlayed: 5, mpg: 21 });
  assert.equal(second.count, 0);
  assert.equal(relationshipsStore(account).legacy.length, 1);

  // A broken promise moves the relationship the other way.
  const account2 = seedPeople(freshAccount());
  makePromise(account2, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "start",
    text: "you will start",
    madeSeason: 1996,
    madeGame: 0,
    check: { type: "start", dueAfterGames: 3 },
  });
  const broken = resolveDuePromises(account2, { season: 1996, game: 3, started: false });
  assert.equal(broken.resolved[0].outcome, "broken");
  assert.equal(broken.resolved[0].trustDelta, -5);
  const rel2 = relationshipsStore(account2).relationships.find((r) => r.kind === "management");
  assert.equal(rel2.strength, 38);
});

test("pendingTrustEffects + markTrustEffectsApplied + applyPromiseTrustToRoot", () => {
  const account = seedPeople(freshAccount());
  makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "minutes",
    text: "more minutes",
    madeSeason: 1996,
    madeGame: 10,
    check: { type: "minutes", minGames: 5, minMpg: 20, dueAfterGames: 5 },
  });
  resolveDuePromises(account, { season: 1996, game: 13, gamesPlayed: 5, mpg: 21 });
  const pending = pendingTrustEffects(account);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].trustDelta, 3);
  assert.equal(pending[0].targetBref, "bryanko01");

  // Applies to the matching Reborn run, clamps, logs.
  const root = {
    reborn: { identity: { bref: "bryanko01", kind: "historical" }, player: { coachTrust: 98 } },
    story: { eventLog: [] },
  };
  const next = applyPromiseTrustToRoot(root, pending);
  assert.equal(next.reborn.player.coachTrust, 100);
  assert.equal(root.reborn.player.coachTrust, 98, "the input root is not mutated");
  assert.equal(next.story.eventLog.length, 1);
  assert.equal(next.story.eventLog[0].type, "promise-resolved");
  assert.equal(next.story.eventLog[0].delta, 3);

  // Effects for another player are skipped.
  const other = applyPromiseTrustToRoot(root, [{ promiseId: "p", trustDelta: 5, targetBref: "jordami01" }]);
  assert.equal(other, root);
  // No Reborn run: returned unchanged (same reference).
  const noReborn = { story: {} };
  assert.equal(applyPromiseTrustToRoot(noReborn, pending), noReborn);

  markTrustEffectsApplied(account, [pending[0].promiseId]);
  assert.equal(pendingTrustEffects(account).length, 0);
});

test("negotiationStanding: capped at +/-2, counts kept vs broken", () => {
  const account = seedPeople(freshAccount());
  assert.deepEqual(negotiationStanding(account, "coach-1"), { modifier: 0, fulfilled: 0, broken: 0, label: "无承诺记录，正常谈判", labelEn: "No promise history — standard terms" });
  const mk = (kind, check, text) => makePromise(account, { makerId: "coach-1", targetId: "bryanko01", kind, text, madeSeason: 1996, madeGame: 0, check });
  mk("start", { type: "start", dueAfterGames: 1 }, "a");
  mk("role", { type: "role", role: "bench", dueAfterGames: 1 }, "b");
  mk("minutes", { type: "minutes", minGames: 1, minMpg: 1, dueAfterGames: 1 }, "c");
  resolveDuePromises(account, { season: 1996, game: 1, started: true, role: "starter", gamesPlayed: 1, mpg: 5 });
  const standing = negotiationStanding(account, "coach-1");
  assert.equal(standing.fulfilled, 3);
  assert.equal(standing.modifier, 2, "three kept promises cap at +2");
  assert.equal(negotiationStanding(account, "nobody").modifier, 0);
});

test("rivalryStakes + recordRivalryGame move strength and write legacy", () => {
  const account = seedPeople(freshAccount());
  assert.deepEqual(rivalryStakes(account, "jordami01").active, false);
  addRelationship(account, { aId: "bryanko01", bId: "jordami01", kind: "rivalry", strength: 80 });
  const stakes = rivalryStakes(account, "jordami01");
  assert.equal(stakes.active, true);
  assert.equal(stakes.strength, 80);
  assert.equal(stakes.trustSwing, 3);
  const afterWin = recordRivalryGame(account, { season: 1996, opponentBref: "jordami01", won: true });
  assert.equal(afterWin.strength, 84);
  const afterLoss = recordRivalryGame(account, { season: 1996, opponentBref: "jordami01", won: false });
  assert.equal(afterLoss.strength, 80);
  assert.equal(relationshipsStore(account).legacy.filter((e) => e.type === "rivalry-game").length, 2);
  assert.equal(recordRivalryGame(account, { season: 1996, opponentBref: "nobody", won: true }), null);
});

test("legacy record functions dedupe by id and group in the summary", () => {
  const account = seedPeople(freshAccount());
  recordCareerTransition(account, { id: "t1", season: 1996, year: 1996, from: "LAL assistant", to: "LAL head coach", reason: "promotion" });
  recordCareerTransition(account, { id: "t1", season: 1996, from: "x", to: "y" });
  recordTradeDecision(account, { id: "tr1", season: 1996, playerName: "Shaq", fromTeam: "ORL", toTeam: "LAL" });
  recordDraftDecision(account, { id: "d1", season: 1996, pick: 13, playerName: "Kobe Bryant", playerBref: "bryanko01" });
  recordDivergence(account, { id: "dv1", season: 1997, subject: "1996 draft", realOutcome: "Kobe goes 13th to Charlotte, traded to LA", newOutcome: "Kobe goes 1st to Philadelphia", cause: "you traded up" });
  recordDivergence(account, { season: 1996, subject: "", realOutcome: "x", newOutcome: "y" });
  const summary = legacySummaryFor(account);
  assert.equal(summary.transitions.length, 1);
  assert.equal(summary.trades.length, 1);
  assert.equal(summary.drafts.length, 1);
  assert.equal(summary.divergences.length, 1);
  assert.equal(summary.people, 3);
  assert.equal(summary.headlines.length, 4);
  assert.equal(summary.headlines[0].type, "divergence");
  assert.ok(summary.divergences[0].summary.includes("历史偏离"));
  assert.deepEqual(summary.promises, { open: 0, fulfilled: 0, broken: 0 });
});

test("legacySummaryFor counts promises and rivalries", () => {
  const account = seedPeople(freshAccount());
  addRelationship(account, { aId: "bryanko01", bId: "jordami01", kind: "rivalry", strength: 60 });
  addRelationship(account, { aId: "coach-1", bId: "bryanko01", kind: "mentorship", strength: 40 });
  makePromise(account, {
    makerId: "coach-1",
    targetId: "bryanko01",
    kind: "start",
    text: "start soon",
    madeSeason: 1996,
    check: { type: "start", dueAfterGames: 5 },
  });
  const summary = legacySummaryFor(account);
  assert.equal(summary.rivalries, 1);
  assert.equal(summary.mentorships, 1);
  assert.deepEqual(summary.promises, { open: 1, fulfilled: 0, broken: 0 });
});

test("exports list the kinds the brief names", () => {
  assert.ok(RELATIONSHIP_KINDS.includes("rivalry"));
  assert.ok(RELATIONSHIP_KINDS.includes("mentorship"));
  assert.ok(RELATIONSHIP_KINDS.includes("coaching-trust"));
  assert.ok(RELATIONSHIP_KINDS.includes("management"));
  assert.ok(PROMISE_KINDS.includes("minutes"));
  assert.ok(PROMISE_KINDS.includes("trade"));
  assert.ok(PROMISE_KINDS.includes("contract"));
});
