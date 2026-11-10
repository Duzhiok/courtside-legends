/**
 * Career Decisions — tests.
 *
 * Pins: decisions validate (unknown event / choice / no pending instance
 * all throw, nothing half-updated); every decision records its reason,
 * its effects and its follow-up; promises are recorded with a deadline
 * and settled automatically against the per-game evidence log —
 * fulfilled raises trust, broken costs trust and flags the break;
 * missing evidence never silently passes a promise.
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
import {
  applyDecision,
  applyInboxEffects,
  checkPromises,
  openPromises,
  validateDecision,
} from "../js/career/careerDecisions.js";

function liveCtx(overrides = {}) {
  return buildInboxContext({
    gameIndex: 10,
    week: 3,
    losingStreak: 3,
    coreLastPts: 8,
    coreAvgPts: 18,
    prospect: { bref: "bryanko01", name: "Kobe Bryant" },
    veteran: { id: "parish", name: "Robert Parish", age: 43 },
    contenderName: "爵士（Karl Malone）",
    coreName: "Michael Jordan",
    ...overrides,
  });
}

/** An inbox with the core demand pending at game 10. */
function inboxWithCoreDemand() {
  let inbox = createInbox({ teamId: "CHI" });
  const screened = screenInboxEvents(inbox, liveCtx());
  inbox = queueInboxEvents(inbox, screened);
  return inbox;
}

test("validate: unknown event, unknown choice, and no pending instance all throw", () => {
  const inbox = createInbox({ teamId: "CHI" });
  assert.throws(() => validateDecision(inbox, "no-such-event", "x"), /unknown inbox event/);
  assert.throws(() => validateDecision(inbox, "core-demands-touches", "no-such-choice"), /unknown choice/);
  assert.throws(() => validateDecision(inbox, "core-demands-touches", "promise-touches"), /no pending inbox event/);
});

test("apply: the promise choice records reason + effects + follow-up + promise", () => {
  const inbox = inboxWithCoreDemand();
  const state = defaultInboxState();
  const { inbox: next, state: nextState, result } = applyDecision(inbox, state, "core-demands-touches", "promise-touches", { gameIndex: 10 });
  assert.equal(next.pending.length, 1); // the scout report remains (the deadline is not in window at game 10)
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].type, "story-choice");
  assert.equal(next.history[0].eventId, "core-demands-touches");
  assert.equal(next.history[0].choiceId, "promise-touches");
  assert.equal(nextState.trust, 27); // +2 now
  assert.equal(nextState.relationships.players, 2);
  assert.equal(result.promise.kind, "core-touches");
  assert.equal(result.promise.madeAtGame, 10);
  assert.equal(result.promise.dueGame, 14); // last of the 5 promised games (indexes 10-14)
  assert.equal(result.promise.status, "open");
  assert.equal(result.followUp.length, 1);
  assert.equal(result.followUp[0].kind, "promise");
  assert.match(result.reason, /承诺未来 5 场给他更多出手/);
  assert.equal(openPromises(next).length, 1);
  // Deciding the same event twice is impossible — it is no longer pending.
  assert.throws(() => validateDecision(next, "core-demands-touches", "hold-system"), /no pending inbox event/);
});

test("apply: refusing costs trust and flags the core as unhappy", () => {
  const inbox = inboxWithCoreDemand();
  const { state: nextState } = applyDecision(inbox, defaultInboxState(), "core-demands-touches", "hold-system", { gameIndex: 10 });
  assert.equal(nextState.trust, 21); // 25 - 4
  assert.equal(nextState.relationships.players, -2);
  assert.equal(nextState.mediaPressure, 12);
  assert.equal(nextState.flags.coreUnhappy, true);
});

test("apply: the scout choice flags the prospect by bref, namespaced", () => {
  const inbox = inboxWithCoreDemand();
  const { inbox: next, state: nextState } = applyDecision(inbox, defaultInboxState(), "scout-report-gem", "investigate", { gameIndex: 10 });
  assert.equal(next.flags["prospect-investigate:bryanko01"], true);
  assert.equal(nextState.flags["prospect-investigate:bryanko01"], true);
  assert.equal(next.flags["prospect-passed:bryanko01"], undefined);
  const passed = applyDecision(inbox, defaultInboxState(), "scout-report-gem", "pass", { gameIndex: 10 });
  assert.equal(passed.inbox.flags["prospect-passed:bryanko01"], true);
});

test("apply: effects clamp trust and pressure to 0-100", () => {
  const low = applyInboxEffects({ trust: 2, mediaPressure: 99, divergence: 0, relationships: {}, flags: {} }, { trust: -10, mediaPressure: 10 });
  assert.equal(low.trust, 0);
  assert.equal(low.mediaPressure, 100);
});

test("promises: fulfilled when the core averages 15+ over the promised games", () => {
  let inbox = inboxWithCoreDemand();
  let state = defaultInboxState();
  const applied = applyDecision(inbox, state, "core-demands-touches", "promise-touches", { gameIndex: 10 });
  inbox = applied.inbox;
  state = applied.state;
  // Evidence for the 5 promised games (indexes 10-14), all above the bar.
  for (let game = 10; game <= 14; game++) {
    inbox = recordGameEvidence(inbox, { gameIndex: game, corePts: 18, won: true });
  }
  const before = state.trust;
  const out = checkPromises(inbox, state, { gameIndex: 15 });
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].fulfilled, true);
  assert.equal(out.state.trust, before + 5);
  assert.equal(out.state.relationships.players, 5); // +2 promise, +3 kept
  assert.equal(out.inbox.promises[0].status, "fulfilled");
  assert.equal(out.inbox.history.filter((e) => e.type === "promise-settled").length, 1);
  // Settling twice settles nothing — the promise is no longer open.
  assert.equal(checkPromises(out.inbox, out.state, { gameIndex: 16 }).settled.length, 0);
});

test("promises: broken when the core falls short — trust drops and the break is flagged", () => {
  let inbox = inboxWithCoreDemand();
  let state = defaultInboxState();
  const applied = applyDecision(inbox, state, "core-demands-touches", "promise-touches", { gameIndex: 10 });
  inbox = applied.inbox;
  state = applied.state;
  for (let game = 10; game <= 14; game++) {
    inbox = recordGameEvidence(inbox, { gameIndex: game, corePts: 9, won: false });
  }
  const out = checkPromises(inbox, state, { gameIndex: 15 });
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].fulfilled, false);
  assert.equal(out.state.trust, state.trust - 6);
  assert.equal(out.state.flags[`promise-broken:${out.settled[0].promise.id}`], true);
  assert.match(out.settled[0].reason, /承诺违约/);
});

test("promises: not due yet settles nothing; missing evidence counts as 0", () => {
  let inbox = inboxWithCoreDemand();
  let state = defaultInboxState();
  const applied = applyDecision(inbox, state, "core-demands-touches", "promise-touches", { gameIndex: 10 });
  inbox = applied.inbox;
  state = applied.state;
  assert.equal(checkPromises(inbox, state, { gameIndex: 14 }).settled.length, 0);
  // Only 2 of the 5 games observed (both strong) — still broken: the
  // window is short, and unobserved games count as 0, not as a pass.
  inbox = recordGameEvidence(inbox, { gameIndex: 10, corePts: 30, won: true });
  inbox = recordGameEvidence(inbox, { gameIndex: 11, corePts: 30, won: true });
  const out = checkPromises(inbox, state, { gameIndex: 15 });
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].fulfilled, false);
});
