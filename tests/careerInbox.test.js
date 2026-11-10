/**
 * Shared Career Inbox — engine tests.
 *
 * Pins: events are state-driven (no streak / no core slump / wrong week /
 * outside the deadline window => nothing screens); screening is
 * deterministic; pending instances are never duplicated; cooldowns are
 * game-based; news is a capped rolling feed; evidence is recorded per
 * game; the persisted shape validates (and rejects bad shapes).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_EVENTS,
  createInbox,
  createCareerInboxState,
  validateCareerInbox,
  buildInboxContext,
  inboxEventMatches,
  inboxEventOnCooldown,
  screenInboxEvents,
  queueInboxEvents,
  pendingInboxEvents,
  inboxSummary,
  recordNews,
  markNewsRead,
  recordGameEvidence,
  localizeInboxEvent,
} from "../js/career/careerInbox.js";

function ctx(overrides = {}) {
  return buildInboxContext({
    gameIndex: 10,
    week: 3,
    losingStreak: 0,
    coreLastPts: 20,
    coreAvgPts: 18,
    prospect: null,
    veteran: null,
    contenderName: null,
    trust: 25,
    pressure: 10,
    flags: {},
    ...overrides,
  });
}

test("create + validate: the persisted shape is accepted, bad shapes throw", () => {
  const slice = createCareerInboxState({ role: "coach", seasonYear: 1997, teamId: "CHI" });
  assert.doesNotThrow(() => validateCareerInbox(slice));
  assert.equal(slice.inbox.version, 1);
  assert.deepEqual(slice.inbox.pending, []);
  assert.throws(() => validateCareerInbox({ ...slice, version: 2 }), /invalid career inbox save/);
  assert.throws(() => validateCareerInbox({ ...slice, inbox: { ...slice.inbox, pending: {} } }), /invalid career inbox save/);
  assert.throws(() => validateCareerInbox({ ...slice, state: { ...slice.state, trust: "high" } }), /invalid career inbox save/);
});

test("context: coreBelowAverage derives from last game vs season average", () => {
  assert.equal(buildInboxContext({ coreLastPts: 8, coreAvgPts: 18 }).coreBelowAverage, true);
  assert.equal(buildInboxContext({ coreLastPts: 20, coreAvgPts: 18 }).coreBelowAverage, false);
  assert.equal(buildInboxContext({}).coreBelowAverage, false);
});

test("matching: the core demand needs a 3-game skid AND a below-average core", () => {
  const event = INBOX_EVENTS.find((e) => e.id === "core-demands-touches");
  assert.equal(inboxEventMatches(event, ctx({ losingStreak: 3, coreLastPts: 8, coreAvgPts: 18 })), true);
  assert.equal(inboxEventMatches(event, ctx({ losingStreak: 2, coreLastPts: 8, coreAvgPts: 18 })), false);
  assert.equal(inboxEventMatches(event, ctx({ losingStreak: 3, coreLastPts: 20, coreAvgPts: 18 })), false);
  assert.equal(inboxEventMatches(event, ctx({ losingStreak: 5, coreLastPts: 8, coreAvgPts: 18 })), true);
});

test("matching: the scout report needs week 2+ and a prospect", () => {
  const event = INBOX_EVENTS.find((e) => e.id === "scout-report-gem");
  const prospect = { bref: "bryanko01", name: "Kobe Bryant" };
  assert.equal(inboxEventMatches(event, ctx({ week: 2, prospect })), true);
  assert.equal(inboxEventMatches(event, ctx({ week: 1, prospect })), false);
  assert.equal(inboxEventMatches(event, ctx({ week: 5 })), false);
});

test("matching: the deadline event only fires inside the deadline window with a veteran", () => {
  const event = INBOX_EVENTS.find((e) => e.id === "trade-deadline-interest");
  const veteran = { id: "parish", name: "Robert Parish" };
  assert.equal(inboxEventMatches(event, ctx({ gameIndex: 50, veteran })), true);
  assert.equal(inboxEventMatches(event, ctx({ gameIndex: 58, veteran })), true);
  assert.equal(inboxEventMatches(event, ctx({ gameIndex: 49, veteran })), false);
  assert.equal(inboxEventMatches(event, ctx({ gameIndex: 59, veteran })), false);
  assert.equal(inboxEventMatches(event, ctx({ gameIndex: 52 })), false);
});

test("screening: all three events screen from one live state, in pool order", () => {
  const inbox = createInbox({ teamId: "CHI" });
  const screened = screenInboxEvents(inbox, ctx({
    gameIndex: 52,
    week: 14,
    losingStreak: 3,
    coreLastPts: 8,
    coreAvgPts: 18,
    prospect: { bref: "bryanko01", name: "Kobe Bryant" },
    veteran: { id: "parish", name: "Robert Parish" },
    contenderName: "爵士（Karl Malone）",
    coreName: "Michael Jordan",
  }));
  assert.deepEqual(screened.map((s) => s.eventId), [
    "core-demands-touches",
    "scout-report-gem",
    "trade-deadline-interest",
  ]);
  const core = screened[0];
  assert.equal(core.urgency, "urgent");
  assert.equal(core.facts.coreName, "Michael Jordan");
  assert.equal(core.facts.losingStreak, 3);
  const scout = screened[1];
  assert.equal(scout.urgency, "normal");
  assert.equal(scout.instanceId, "scout-report-gem:bryanko01");
  assert.equal(scout.facts.prospect.name, "Kobe Bryant");
  const deadline = screened[2];
  assert.equal(deadline.facts.contenderName, "爵士（Karl Malone）");
  assert.equal(deadline.facts.veteran.name, "Robert Parish");
});

test("screening: a quiet state screens nothing", () => {
  const inbox = createInbox({ teamId: "CHI" });
  assert.deepEqual(screenInboxEvents(inbox, ctx()), []);
});

test("screening: a pending instance is never screened twice", () => {
  let inbox = createInbox({ teamId: "CHI" });
  const live = ctx({ losingStreak: 3, coreLastPts: 8, coreAvgPts: 18 });
  const screened = screenInboxEvents(inbox, live);
  assert.equal(screened.length, 1);
  inbox = queueInboxEvents(inbox, screened);
  assert.deepEqual(screenInboxEvents(inbox, live), []);
});

test("cooldown: the core demand is repeatable after 10 games, not before", () => {
  const inbox = createInbox({ teamId: "CHI" });
  const event = INBOX_EVENTS.find((e) => e.id === "core-demands-touches");
  assert.equal(inboxEventOnCooldown(inbox, event, 20), false);
  const resolved = structuredClone(inbox);
  resolved.resolved.push({ instanceId: "core-demands-touches", eventId: "core-demands-touches", gameIndex: 10 });
  assert.equal(inboxEventOnCooldown(resolved, event, 15), true);
  assert.equal(inboxEventOnCooldown(resolved, event, 19), true);
  assert.equal(inboxEventOnCooldown(resolved, event, 20), false);
  // A non-repeatable event (deadline) never comes back once resolved.
  const deadline = INBOX_EVENTS.find((e) => e.id === "trade-deadline-interest");
  const resolvedDeadline = structuredClone(inbox);
  resolvedDeadline.resolved.push({ instanceId: "trade-deadline-interest", eventId: "trade-deadline-interest", gameIndex: 52 });
  assert.equal(inboxEventOnCooldown(resolvedDeadline, deadline, 80), true);
});

test("queue: no duplicates, pool order kept, urgent first when listed", () => {
  let inbox = createInbox({ teamId: "CHI" });
  const live = ctx({
    gameIndex: 52,
    week: 14,
    losingStreak: 3,
    coreLastPts: 8,
    coreAvgPts: 18,
    prospect: { bref: "bryanko01" },
    veteran: { id: "parish" },
  });
  const screened = screenInboxEvents(inbox, live);
  inbox = queueInboxEvents(inbox, screened);
  inbox = queueInboxEvents(inbox, screened);
  assert.equal(inbox.pending.length, 3);
  const listed = pendingInboxEvents(inbox);
  assert.deepEqual(listed.map((e) => e.urgency), ["urgent", "urgent", "normal"]);
  const summary = inboxSummary(inbox);
  assert.deepEqual(summary, { urgent: 2, pending: 3, unreadNews: 0, openPromises: 0 });
});

test("news: ordinary events append to a capped rolling feed", () => {
  let inbox = createInbox({ teamId: "CHI" });
  inbox = recordNews(inbox, { kind: "streak", text: "3 连败", textEn: "3 losses in a row", gameIndex: 5 });
  assert.equal(inbox.news.length, 1);
  assert.equal(inbox.news[0].read, false);
  assert.equal(inboxSummary(inbox).unreadNews, 1);
  inbox = markNewsRead(inbox, { all: true });
  assert.equal(inboxSummary(inbox).unreadNews, 0);
  for (let i = 0; i < 60; i++) {
    inbox = recordNews(inbox, { kind: "general", text: `news ${i}`, gameIndex: i });
  }
  assert.equal(inbox.news.length, 50);
  assert.equal(inbox.news[0].text, "news 10");
});

test("evidence: one entry per game, kept in order", () => {
  let inbox = createInbox({ teamId: "CHI" });
  inbox = recordGameEvidence(inbox, { gameIndex: 0, corePts: 12, won: false });
  inbox = recordGameEvidence(inbox, { gameIndex: 1, corePts: 22, won: true });
  assert.deepEqual(inbox.evidence.map((e) => e.corePts), [12, 22]);
});

test("localize: English returns the English title and prompt", () => {
  const inbox = createInbox({ teamId: "CHI" });
  const [screened] = screenInboxEvents(inbox, ctx({ losingStreak: 3, coreLastPts: 8, coreAvgPts: 18 }));
  assert.equal(localizeInboxEvent(screened, "en").title, "The Core Wants More Touches");
  assert.equal(localizeInboxEvent(screened, "zh").title, "核心要求更多出手权");
});
