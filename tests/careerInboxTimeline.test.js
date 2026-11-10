/**
 * Career Timeline (inbox time advance) — tests.
 *
 * Pins: the three speeds stop where they should (next game = one game;
 * next event = the first screened event, or at once when one is already
 * pending; next key node = the next week boundary / deadline / season
 * end); an urgent event pauses the timeline on ANY speed; a promise
 * settling stops the run so the player sees it; the predictor names
 * the nearest predictable stop without simming.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInboxContext,
  createInbox,
  defaultInboxState,
  queueInboxEvents,
  screenInboxEvents,
} from "../js/career/careerInbox.js";
import {
  advanceTimeline,
  describeTimelineStop,
  describeTimelineTarget,
  nextTimelineTarget,
  nextWeekBoundary,
} from "../js/career/careerTimeline.js";

/**
 * Stub game driver. Every game is a loss with the core at 8 pts (below
 * his 12-pt average), so the core demand screens once the streak hits 3
 * — the timeline's stop rules are exercised without a real GameSim.
 * `screenFrom` is the game index after which the context reports the
 * losing streak (Infinity = never screen).
 */
function stubDriver({ screenFrom = Infinity } = {}) {
  return async ({ gameIndex }) => {
    const played = gameIndex + 1;
    const streak = played;
    return {
      report: { game: gameIndex, won: false, corePts: 8 },
      context: buildInboxContext({
        gameIndex: played,
        week: Math.floor(played / 4) + 1,
        losingStreak: played >= screenFrom ? streak : 0,
        coreLastPts: 8,
        coreAvgPts: 12,
        coreName: "Test Core",
      }),
    };
  };
}

function quietDriver() {
  return async ({ gameIndex }) => ({
    report: { game: gameIndex, won: true, corePts: 20 },
    context: buildInboxContext({ gameIndex: gameIndex + 1, week: Math.floor((gameIndex + 1) / 4) + 1 }),
  });
}

test("predictor: the nearest predictable stop, without simming", () => {
  assert.equal(nextTimelineTarget({ gameIndex: 0, gamesTotal: 82 }).type, "week");
  assert.equal(nextTimelineTarget({ gameIndex: 0, gamesTotal: 82 }).gameIndex, 4);
  assert.equal(nextTimelineTarget({ gameIndex: 3, gamesTotal: 82 }).gameIndex, 4);
  assert.equal(nextTimelineTarget({ gameIndex: 4, gamesTotal: 82 }).gameIndex, 8);
  assert.equal(nextTimelineTarget({ gameIndex: 48, gamesTotal: 82 }).type, "trade-deadline");
  assert.equal(nextTimelineTarget({ gameIndex: 48, gamesTotal: 82 }).gameIndex, 50);
  assert.equal(nextTimelineTarget({ gameIndex: 50, gamesTotal: 82 }).type, "week");
  assert.equal(nextTimelineTarget({ gameIndex: 82, gamesTotal: 82 }).type, "season-end");
  assert.equal(nextWeekBoundary(0), 4);
  assert.equal(nextWeekBoundary(4), 8);
  assert.equal(describeTimelineTarget(nextTimelineTarget({ gameIndex: 0, gamesTotal: 82 }), "zh"), "模拟到第 2 周");
  assert.equal(describeTimelineTarget(nextTimelineTarget({ gameIndex: 48, gamesTotal: 82 }), "en"), "Sim to the trade deadline");
});

test("next-game: exactly one game, then stop", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: quietDriver(),
    speed: "next-game",
    gameIndex: 0,
    gamesTotal: 82,
  });
  assert.equal(out.reports.length, 1);
  assert.equal(out.stoppedAt.type, "game");
  assert.equal(out.gameIndex, 1);
  assert.equal(out.inbox.evidence.length, 1);
  assert.equal(out.inbox.evidence[0].corePts, 20);
});

test("next-event: stops at the first screened event — urgent pauses the run", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: stubDriver({ screenFrom: 3 }),
    speed: "next-event",
    gameIndex: 0,
    gamesTotal: 82,
  });
  assert.equal(out.reports.length, 3);
  assert.equal(out.stoppedAt.type, "urgent-event");
  assert.equal(out.stoppedAt.detail.eventId, "core-demands-touches");
  assert.equal(out.inbox.pending.length, 1);
  assert.match(describeTimelineStop(out.stoppedAt, "zh"), /重要事件出现了/);
});

test("next-event: an already-pending event stops the run without playing", async () => {
  let inbox = createInbox({ teamId: "CHI" });
  const screened = screenInboxEvents(inbox, buildInboxContext({
    gameIndex: 10, week: 3, losingStreak: 3, coreLastPts: 8, coreAvgPts: 12,
  }));
  inbox = queueInboxEvents(inbox, screened);
  let played = 0;
  const out = await advanceTimeline(inbox, defaultInboxState(), {
    playOne: async () => { played += 1; return { report: { game: 0, won: true, corePts: 20 } }; },
    speed: "next-event",
    gameIndex: 10,
    gamesTotal: 82,
  });
  assert.equal(played, 0);
  assert.equal(out.stoppedAt.type, "event");
  assert.equal(out.stoppedAt.detail.eventId, "core-demands-touches");
});

test("next-key-node: stops at the next week boundary without playing it", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: quietDriver(),
    speed: "next-key-node",
    gameIndex: 1,
    gamesTotal: 82,
  });
  assert.equal(out.reports.length, 3); // games 1, 2, 3 — stops before game 4
  assert.equal(out.stoppedAt.type, "week");
  assert.equal(out.stoppedAt.gameIndex, 4);
  assert.equal(out.stoppedAt.detail.week, 2);
});

test("next-key-node: an urgent event still pauses the run mid-way", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: stubDriver({ screenFrom: 3 }),
    speed: "next-key-node",
    gameIndex: 0,
    gamesTotal: 82,
  });
  assert.equal(out.stoppedAt.type, "urgent-event");
  assert.equal(out.reports.length, 3);
});

test("next-key-node: the deadline window is a stop", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: quietDriver(),
    speed: "next-key-node",
    gameIndex: 48,
    gamesTotal: 82,
  });
  assert.equal(out.reports.length, 2); // games 48, 49 — stops before game 50
  assert.equal(out.stoppedAt.type, "trade-deadline");
  assert.equal(out.stoppedAt.gameIndex, 50);
});

test("promise: a settling promise stops the run so the player sees it", async () => {
  // A 3-game promise (made before game 0, due after game 2) so it
  // settles before the week boundary at game 4 — the full 5-game
  // choice path is covered in careerDecisions.test.js.
  const inbox = createInbox({ teamId: "CHI" });
  inbox.promises.push({
    id: "promise:test:core-touches",
    instanceId: "core-demands-touches",
    eventId: "core-demands-touches",
    choiceId: "promise-touches",
    kind: "core-touches",
    text: "未来 3 场给核心更多出手",
    textEn: "More touches for the core over the next 3 games",
    madeAtGame: 0,
    dueGame: 2,
    condition: { minCorePtsPerGame: 15, games: 3 },
    status: "open",
    resolvedAtGame: null,
    at: Date.now(),
  });
  const state = defaultInboxState();
  // The core delivers: 18 a night over the 3 promised games.
  const out = await advanceTimeline(inbox, state, {
    playOne: async ({ gameIndex }) => ({
      report: { game: gameIndex, won: true, corePts: 18 },
      context: buildInboxContext({ gameIndex: gameIndex + 1, week: 1 }),
    }),
    speed: "next-key-node",
    gameIndex: 0,
    gamesTotal: 82,
  });
  assert.equal(out.stoppedAt.type, "promise");
  assert.equal(out.stoppedAt.detail.fulfilled, true);
  assert.equal(out.reports.length, 3);
  assert.equal(out.state.trust, state.trust + 5);
});

test("season-end: an exhausted schedule stops at season end", async () => {
  const out = await advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), {
    playOne: quietDriver(),
    speed: "next-event",
    gameIndex: 80,
    gamesTotal: 82,
  });
  assert.equal(out.reports.length, 2);
  assert.equal(out.stoppedAt.type, "season-end");
  assert.equal(out.gameIndex, 82);
});

test("advanceTimeline: unknown speed and missing playOne throw", async () => {
  await assert.rejects(
    () => advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), { playOne: quietDriver(), speed: "turbo" }),
    /unknown timeline speed/,
  );
  await assert.rejects(
    () => advanceTimeline(createInbox({ teamId: "CHI" }), defaultInboxState(), { speed: "next-game" }),
    /playOne is required/,
  );
});
