/**
 * Career History — tests.
 *
 * Pins: one-line rendering for choices and settled promises (zh/en);
 * filtering by kind; the decision trail; the promise record
 * (kept / broken / open); the career summary aggregates.
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
import { applyDecision, checkPromises } from "../js/career/careerDecisions.js";
import {
  careerSummary,
  choiceTrail,
  describeHistoryEntry,
  historyFor,
  promiseRecord,
} from "../js/career/careerHistory.js";

function inboxWithSettledPromise() {
  let inbox = createInbox({ teamId: "CHI" });
  const screened = screenInboxEvents(inbox, buildInboxContext({
    gameIndex: 0, week: 1, losingStreak: 3, coreLastPts: 8, coreAvgPts: 12,
  }));
  inbox = queueInboxEvents(inbox, screened);
  let state = defaultInboxState();
  const applied = applyDecision(inbox, state, "core-demands-touches", "promise-touches", { gameIndex: 0 });
  inbox = applied.inbox;
  state = applied.state;
  for (let game = 0; game <= 4; game++) {
    inbox = recordGameEvidence(inbox, { gameIndex: game, corePts: 18, won: true });
  }
  const settled = checkPromises(inbox, state, { gameIndex: 5 });
  return { inbox: settled.inbox, state: settled.state };
}

test("describe: a choice line names the event, the choice and the trust delta", () => {
  const { inbox } = inboxWithSettledPromise();
  const choice = historyFor(inbox, { kind: "story-choice" })[0];
  assert.match(describeHistoryEntry(choice, "zh"), /core-demands-touches → promise-touches/);
  assert.match(describeHistoryEntry(choice, "zh"), /信任 \+2/);
  assert.match(describeHistoryEntry(choice, "en"), /chose core-demands-touches → promise-touches/);
  const settled = historyFor(inbox, { kind: "promise-settled" })[0];
  assert.match(describeHistoryEntry(settled, "zh"), /承诺兑现/);
  assert.match(describeHistoryEntry(settled, "zh"), /场均 18 分/);
  assert.match(describeHistoryEntry(settled, "en"), /promise kept/);
});

test("historyFor: filters by kind, keeps order", () => {
  const { inbox } = inboxWithSettledPromise();
  assert.equal(historyFor(inbox).length, 2);
  assert.equal(historyFor(inbox, { kind: "story-choice" }).length, 1);
  assert.equal(historyFor(inbox, { kind: "promise-settled" }).length, 1);
  assert.equal(historyFor(inbox, { kind: "no-such-kind" }).length, 0);
});

test("choiceTrail + promiseRecord: the decision trail and the commitment record", () => {
  const { inbox } = inboxWithSettledPromise();
  assert.deepEqual(choiceTrail(inbox), [
    { eventId: "core-demands-touches", choiceId: "promise-touches", gameIndex: 0, year: 1997, trustDelta: 2 },
  ]);
  assert.deepEqual(promiseRecord(inbox), { kept: 1, broken: 0, open: 0 });
});

test("careerSummary: aggregates decisions, promises, divergence and the record", () => {
  const { inbox, state } = inboxWithSettledPromise();
  const summary = careerSummary(inbox, state, { wins: 3, losses: 2, games: 5 });
  assert.equal(summary.choices, 1);
  assert.equal(summary.promisesKept, 1);
  assert.equal(summary.promisesBroken, 0);
  assert.equal(summary.wins, 3);
  assert.equal(summary.games, 5);
  assert.equal(summary.trust, 32); // 25 + 2 promise + 5 kept
  assert.equal(summary.divergence, 0);
});
