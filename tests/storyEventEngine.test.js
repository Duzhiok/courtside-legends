import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCareerReport,
  deriveEnding,
  getStoryEvent,
  listStoryEvents,
  queueNextStoryEvent,
  queueStoryEvent,
  resolveStoryEvent,
} from "../js/story/eventEngine.js";

function rootFixture(overrides = {}) {
  return {
    activeMode: "timeTravel",
    leagueCareer: {
      season: { year: 1992 },
      management: { seasonHistory: [] },
    },
    story: {
      startYear: 1991,
      currentChapter: "prologue",
      futureKnowledge: 2,
      frontOfficeTrust: 50,
      mediaPressure: 20,
      timelineDivergence: 0,
      relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
      flags: {},
      eventLog: [],
      pendingDecision: null,
      ending: null,
    },
    ...overrides,
  };
}

test("story catalog exposes choices without leaking mutable definitions", () => {
  const catalog = listStoryEvents();
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].choices.length, 3);
  const event = getStoryEvent(catalog[0].id);
  event.choices[0].label = "tampered";
  assert.notEqual(getStoryEvent(catalog[0].id).choices[0].label, "tampered");
});

test("queue and resolve story event preserve immutable root and record consequences", () => {
  const root = rootFixture();
  const pending = queueStoryEvent(root, "first-year-owner-test", { year: 1992 });
  assert.equal(root.story.pendingDecision, null);
  assert.deepEqual(pending.story.pendingDecision, {
    type: "story-event",
    eventId: "first-year-owner-test",
    year: 1992,
  });
  const resolved = resolveStoryEvent(pending, "protect-the-plan");
  assert.equal(resolved.story.pendingDecision, null);
  assert.equal(resolved.story.frontOfficeTrust, 54);
  assert.equal(resolved.story.relationships.owner, 2);
  assert.equal(resolved.story.flags.longPlanProtected, true);
  assert.equal(resolved.story.eventLog[0].eventId, "first-year-owner-test");
  assert.throws(() => resolveStoryEvent(resolved, "protect-the-plan"), /pending/);
});

test("story events advance in order and stop after the chapter chain", () => {
  const root = rootFixture();
  const first = queueNextStoryEvent(root, { year: 1992 });
  assert.equal(first.story.pendingDecision.eventId, "first-year-owner-test");
  const afterFirst = resolveStoryEvent(first, "protect-the-plan");
  const second = queueNextStoryEvent(afterFirst, { year: 1992 });
  assert.equal(second.story.pendingDecision.eventId, "core-player-commitment");
  const afterSecond = resolveStoryEvent(second, "share-the-ball");
  assert.equal(queueNextStoryEvent(afterSecond).story.pendingDecision, null);
});

test("event engine rejects duplicate events and invalid choices", () => {
  const resolved = resolveStoryEvent(
    queueStoryEvent(rootFixture(), "first-year-owner-test"),
    "ask-for-evidence",
  );
  assert.throws(() => queueStoryEvent(resolved, "first-year-owner-test"), /already resolved/);
  assert.throws(() => queueStoryEvent(resolved, "missing"), /unknown story event/);
  assert.throws(
    () => resolveStoryEvent(queueStoryEvent(rootFixture(), "core-player-commitment"), "missing"),
    /unknown choice/,
  );
});

test("career report summarizes history and derives a meaningful ending", () => {
  const summaries = Array.from({ length: 5 }, (_, index) => ({
    year: 1991 + index,
    teamId: "CHI",
    teamName: "Bulls",
    record: { w: 50 + index, l: 32 - index },
    finish: index < 2 ? "champion" : "playoffs",
    championId: index < 2 ? "CHI" : "LAL",
  }));
  const root = rootFixture({
    leagueCareer: { season: { year: 1996 }, management: { seasonHistory: summaries } },
    story: { ...rootFixture().story, frontOfficeTrust: 60 },
  });
  const report = buildCareerReport(root);
  assert.equal(report.championships, 2);
  assert.equal(report.seasons.length, 5);
  assert.deepEqual(report.ending, {
    id: "dynasty-builder",
    label: "王朝建筑师",
    tone: "success",
  });
  assert.deepEqual(deriveEnding(root), report.ending);
});
