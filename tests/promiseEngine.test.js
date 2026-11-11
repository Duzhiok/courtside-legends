/**
 * Unified promise engine — tests.
 *
 * Pins the product ruling: one promise, one fact, one settlement, one
 * outcome. Two stores (inbox + relationship) keep their saved shape; the
 * engine reads both as one contract, settles each promise exactly once, and
 * applies each effect exactly once.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInboxContext,
  createInbox,
  defaultInboxState,
  queueInboxEvents,
  recordGameEvidence,
  screenInboxEvents,
} from "../js/career/careerInbox.js";
import { applyDecision, LEGACY_PROMISE_YEAR } from "../js/career/careerDecisions.js";
import { canonicalPromise, listCanonicalPromises, settleGamePromises } from "../js/career/promiseEngine.js";
import { PROMISE_EFFECTS, effectsForType } from "../js/career/promiseEffects.js";
import { makePromise, legacyOf, promisesOf, recordPerson, PROMISE_TRUST_BROKEN, PROMISE_TRUST_FULFILLED } from "../js/career/careerRelationships.js";
import { rebornPromiseWindow, settleRebornPromises } from "../js/reborn/promiseSettle.js";
import { promiseBannerHtml } from "../js/ui/promiseBannerView.js";

function demandInbox() {
  let inbox = createInbox({ teamId: "CHI" });
  const ctx = buildInboxContext({
    gameIndex: 10, week: 3, losingStreak: 3, coreLastPts: 8, coreAvgPts: 18,
    prospect: { bref: "bryanko01", name: "Kobe Bryant" },
    veteran: { id: "parish", name: "Robert Parish", age: 43 },
    contenderName: "Jazz", coreName: "Michael Jordan",
  });
  inbox = queueInboxEvents(inbox, screenInboxEvents(inbox, ctx));
  return inbox;
}

/** An inbox + state holding one open 5-game / 15-pts promise made at game 10. */
function withPromise() {
  const out = applyDecision(demandInbox(), defaultInboxState(), "core-demands-touches", "promise-touches", { gameIndex: 10 });
  return { inbox: out.inbox, state: out.state, promise: out.result.promise };
}

function playGames(inbox, from, to, corePts) {
  let next = inbox;
  for (let g = from; g <= to; g += 1) next = recordGameEvidence(next, { gameIndex: g, corePts });
  return next;
}

function account() {
  const a = { playerIds: [] };
  recordPerson(a, { id: "coach", name: "Coach", role: "coach" });
  recordPerson(a, { id: "me", name: "Me", role: "player", bref: "me01" });
  return a;
}

const minutesPromise = (a, over = {}) =>
  makePromise(a, {
    makerId: "coach", targetId: "me", kind: "minutes", text: "20 mpg", madeSeason: 1996, madeGame: 0,
    check: { type: "minutes", minGames: 3, minMpg: 20, dueAfterGames: 5 }, ...over,
  });

test("one effect table feeds both stores (and the old constants still read it)", () => {
  assert.equal(effectsForType("inbox").fulfilled.trust, 5);
  assert.equal(effectsForType("relationship").broken.relationship, -12);
  assert.equal(PROMISE_TRUST_FULFILLED, PROMISE_EFFECTS.relationship.fulfilled.trust);
  assert.equal(PROMISE_TRUST_BROKEN, PROMISE_EFFECTS.relationship.broken.trust);
  assert.equal(effectsForType("nonsense"), PROMISE_EFFECTS.inbox);
});

test("canonical contract: both stores map to the same shape", () => {
  const { promise } = withPromise();
  const a = canonicalPromise(promise, "inbox");
  assert.equal(a.source, "inbox");
  assert.equal(a.status, "pending");
  assert.equal(a.createdAt, 10);
  assert.equal(a.dueAt, 14);
  assert.deepEqual(a.evidence.gameIds, [10, 11, 12, 13, 14]);
  assert.equal(a.evidence.requiredCondition.minCorePtsPerGame, 15);
  assert.equal(a.effects.fulfilled.trust, 5);

  const acct = account();
  const rel = canonicalPromise(minutesPromise(acct), "relationship");
  assert.equal(rel.source, "relationship");
  assert.equal(rel.targetId, "me");
  assert.equal(rel.dueAt, 5);
  assert.equal(rel.effects.broken.trust, -5);
  assert.equal(canonicalPromise(null, "inbox"), null);
  assert.equal(canonicalPromise({ id: "x" }, "unknown"), null);
});

test("listCanonicalPromises reports each promiseId once", () => {
  const { inbox, promise } = withPromise();
  const acct = account();
  minutesPromise(acct);
  const dup = structuredClone(promisesOf(acct)[0]);
  dup.id = promise.id; // collide an account promise with the inbox one
  acct.careerRelationships.promises.push(dup);
  const { promises, duplicates } = listCanonicalPromises({ inbox, account: acct });
  assert.equal(promises.filter((p) => p.promiseId === promise.id).length, 1);
  assert.equal(promises.find((p) => p.promiseId === promise.id).source, "inbox"); // first store wins
  assert.equal(duplicates, 1);
});

test("evidence: submitting the same game again adds nothing (cannot fake a 5-game window)", () => {
  let inbox = createInbox({ teamId: "CHI" });
  for (let i = 0; i < 5; i += 1) inbox = recordGameEvidence(inbox, { gameIndex: 10, corePts: 40 });
  assert.equal(inbox.evidence.length, 1);
  // the same game in a different season is different evidence
  inbox = recordGameEvidence(inbox, { gameIndex: 10, corePts: 2, season: 1998 });
  assert.equal(inbox.evidence.length, 2);
});

test("one game recorded five times can no longer fulfil a five-game promise", () => {
  let { inbox, state } = withPromise();
  for (let i = 0; i < 5; i += 1) inbox = recordGameEvidence(inbox, { gameIndex: 10, corePts: 40 });
  const out = settleGamePromises({ inbox, state, gameIndex: 15 });
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].status, "broken"); // only 1 distinct game observed, 5 required
});

test("settlement: kept promise applies the inbox effect once, and a second pass does nothing", () => {
  let { inbox, state } = withPromise();
  inbox = playGames(inbox, 10, 14, 22);
  const first = settleGamePromises({ inbox, state, gameIndex: 15 });
  assert.equal(first.settled.length, 1);
  assert.equal(first.settled[0].status, "fulfilled");
  assert.deepEqual(first.settled[0].effects, { trust: 5, relationship: 3 });
  const trustAfter = first.state.trust;
  assert.equal(trustAfter, state.trust + 5);

  const again = settleGamePromises({ inbox: first.inbox, state: first.state, gameIndex: 15 });
  assert.equal(again.settled.length, 0);
  assert.equal(again.state.trust, trustAfter); // not applied twice
});

test("settlement: a broken promise costs the configured trust and flags the break", () => {
  let { inbox, state } = withPromise();
  inbox = playGames(inbox, 10, 14, 4);
  const out = settleGamePromises({ inbox, state, gameIndex: 15 });
  assert.equal(out.settled[0].status, "broken");
  assert.equal(out.settled[0].effects.trust, -6);
  assert.equal(out.state.flags[`promise-broken:${out.settled[0].promiseId}`], true);
});

test("nothing settles before the deadline", () => {
  let { inbox, state } = withPromise();
  inbox = playGames(inbox, 10, 12, 30);
  assert.equal(settleGamePromises({ inbox, state, gameIndex: 13 }).settled.length, 0);
});

test("inbox outcomes are mirrored into the account legacy record exactly once", () => {
  let { inbox, state, promise } = withPromise();
  inbox = playGames(inbox, 10, 14, 22);
  const acct = account();
  settleGamePromises({ inbox, state, gameIndex: 15, account: acct });
  const events = legacyOf(acct).filter((e) => e.id === `promise:${promise.id}`);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "promise");
  assert.equal(events[0].data.source, "inbox");
  assert.equal(events[0].data.outcome, "fulfilled");
  // replay the same settlement input: still one legacy event
  settleGamePromises({ inbox, state, gameIndex: 15, account: acct });
  assert.equal(legacyOf(acct).filter((e) => e.id === `promise:${promise.id}`).length, 1);
});

test("without an account the engine behaves exactly like the old inbox-only settlement", () => {
  let { inbox, state } = withPromise();
  inbox = playGames(inbox, 10, 14, 22);
  const out = settleGamePromises({ inbox, state, gameIndex: 15 });
  assert.equal(out.account, null);
  assert.equal(out.settled.length, 1);
});

test("old saves: an inbox promise without its own year still reads as the 1997 slice", () => {
  let { inbox, state } = withPromise();
  delete inbox.promises[0].year; // as saved before promises recorded a year
  inbox = playGames(inbox, 10, 14, 22);
  const out = settleGamePromises({ inbox, state, gameIndex: 15 });
  const entry = out.inbox.history.find((h) => h.type === "promise-settled");
  assert.equal(entry.year, LEGACY_PROMISE_YEAR);
  // a fresh promise carries the year it was made in
  assert.equal(withPromise().promise.year, 1997);
});

test("Reborn: a minutes promise settles from the season log, moves trust once, never twice", () => {
  const acct = account();
  minutesPromise(acct);
  const reborn = {
    identity: { bref: "me01" },
    player: {
      coachTrust: 40,
      rotationRole: "bench",
      seasonLog: [1, 2, 3].map((g) => ({ year: 1996, game: g, min: 24, pts: 10, role: "bench" })),
    },
  };
  const out = settleRebornPromises(acct, reborn);
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].status, "fulfilled");
  assert.equal(out.settled[0].effects.trust, 3);
  assert.equal(out.reborn.player.coachTrust, 43);
  assert.equal(reborn.player.coachTrust, 40); // input not mutated
  assert.equal(promisesOf(acct)[0].effect.applied, true);

  const again = settleRebornPromises(acct, out.reborn);
  assert.equal(again.settled.length, 0);
  assert.equal(again.reborn.player.coachTrust, 43);
});

test("Reborn: the window starts after the game the promise was made", () => {
  const acct = account();
  minutesPromise(acct, { madeGame: 2 }); // 3 games of 20+ mpg needed AFTER game 2
  const log = [
    { year: 1996, game: 1, min: 30, role: "bench" },
    { year: 1996, game: 2, min: 30, role: "bench" },
    { year: 1996, game: 3, min: 22, role: "bench" },
  ];
  const state = rebornPromiseWindow({ player: { seasonLog: log, rotationRole: "bench" } })(promisesOf(acct)[0]);
  assert.equal(state.gamesPlayed, 1); // only game 3 counts
  assert.equal(state.mpg, 22);
});

test("Reborn: a broken minutes promise costs trust at the deadline", () => {
  const acct = account();
  minutesPromise(acct);
  const reborn = {
    identity: { bref: "me01" },
    player: { coachTrust: 40, rotationRole: "bench", seasonLog: [1, 2, 3, 4, 5].map((g) => ({ year: 1996, game: g, min: 8, role: "bench" })) },
  };
  const out = settleRebornPromises(acct, reborn);
  assert.equal(out.settled[0].status, "broken");
  assert.equal(out.reborn.player.coachTrust, 35);
});

test("Reborn: kinds the season log cannot decide are left open, never guessed", () => {
  const acct = account();
  makePromise(acct, { makerId: "coach", targetId: "me", kind: "start", text: "start me", madeSeason: 1996, madeGame: 0, check: { type: "start", dueAfterGames: 2 } });
  const reborn = { identity: { bref: "me01" }, player: { coachTrust: 40, rotationRole: "bench", seasonLog: [1, 2, 3, 4].map((g) => ({ year: 1996, game: g, min: 30, role: "starter" })) } };
  const out = settleRebornPromises(acct, reborn);
  assert.equal(out.settled.length, 0);
  assert.equal(promisesOf(acct)[0].status, "open");
  assert.equal(out.reborn.player.coachTrust, 40);
});

test("Reborn: a promise made to someone else's player does not move this run's trust", () => {
  const acct = account();
  minutesPromise(acct);
  const reborn = {
    identity: { bref: "someone-else01" },
    player: { coachTrust: 40, rotationRole: "bench", seasonLog: [1, 2, 3].map((g) => ({ year: 1996, game: g, min: 24, role: "bench" })) },
  };
  const out = settleRebornPromises(acct, reborn);
  assert.equal(out.settled.length, 1);
  assert.equal(out.reborn.player.coachTrust, 40);
  assert.equal(promisesOf(acct)[0].effect.applied, true); // consumed, not re-applied to anyone later
});

test("settleGamePromises settles relationship promises too when given a snapshot", () => {
  const { inbox, state } = withPromise();
  const acct = account();
  minutesPromise(acct);
  const snap = { season: 1996, game: 3, gamesPlayed: 3, mpg: 25 };
  const out = settleGamePromises({ inbox, state, gameIndex: 11, account: acct, relationshipState: snap });
  const rel = out.settled.find((s) => s.source === "relationship");
  assert.equal(rel.status, "fulfilled");
  assert.deepEqual(rel.effects, { trust: 3, relationship: 8 });
  // without a snapshot relationship promises are not guessed
  const acct2 = account();
  minutesPromise(acct2);
  assert.equal(settleGamePromises({ inbox, state, gameIndex: 11, account: acct2 }).settled.length, 0);
  assert.equal(promisesOf(acct2)[0].status, "open");
});

test("banner: nothing when idle, kept/broken lines when settled, text escaped", () => {
  assert.equal(promiseBannerHtml({ settled: [] }), "");
  const html = promiseBannerHtml({
    settled: [
      { status: "fulfilled", effects: { trust: 3, relationship: 8 }, reason: "承诺兑现：<img src=x onerror=1>", reasonEn: "Promise kept: <img src=x onerror=1>" },
      { status: "broken", effects: { trust: -5, relationship: -12 }, reason: "落空", reasonEn: "Broken" },
    ],
    lang: "en",
  });
  assert.ok(html.includes("kept") && html.includes("broken"));
  assert.ok(html.includes("trust +3") && html.includes("relationship -12"));
  assert.ok(!html.includes("<img"));
  assert.ok(promiseBannerHtml({ settled: [{ status: "fulfilled", effects: {}, reason: "好", reasonEn: "ok" }], lang: "zh" }).includes("承诺结算"));
});

test("Reborn: settling a second promise later never re-applies the first one's trust", () => {
  const acct = account();
  minutesPromise(acct, { text: "first" });
  const log = [1, 2, 3].map((g) => ({ year: 1996, game: g, min: 24, role: "bench" }));
  const reborn = { identity: { bref: "me01" }, player: { coachTrust: 40, rotationRole: "bench", seasonLog: log } };
  const one = settleRebornPromises(acct, reborn);
  assert.equal(one.reborn.player.coachTrust, 43);

  makePromise(acct, {
    makerId: "coach", targetId: "me", kind: "minutes", text: "second", madeSeason: 1996, madeGame: 3,
    check: { type: "minutes", minGames: 2, minMpg: 20, dueAfterGames: 4 },
  });
  const more = structuredClone(one.reborn);
  more.player.seasonLog.push(...[4, 5].map((g) => ({ year: 1996, game: g, min: 26, role: "bench" })));
  const two = settleRebornPromises(acct, more);
  assert.equal(two.settled.length, 1);
  assert.equal(two.reborn.player.coachTrust, 46); // +3 for the second only, not +3 +3
});
