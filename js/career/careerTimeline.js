/**
 * Career Timeline (Career 2.0, workstream A).
 *
 * Time advance for the shared career world, with the three speeds the
 * user asked for:
 *
 *   - next-game — play one game, then stop;
 *   - next-event — keep playing until an inbox event is pending (any
 *     urgency) or a season key node is reached;
 *   - next-key-node — keep playing until the next season key node
 *     (week boundary, trade-deadline window, season end).
 *
 * Rhythm rule (user): ordinary games can be fast, important decisions
 * must be slow. An urgent event pauses the timeline the moment it is
 * screened — the driver never sims past a fate-changing decision the
 * player has not made. Ordinary events only go to the news feed.
 *
 * The driver is agnostic about what "playing a game" means: callers
 * inject `playOne` (the real GameSim driver in the view, a stub in
 * tests). Every game is a real game through that driver — the timeline
 * never invents a result, and it never calls sim.js itself. After each
 * game it records the evidence (for promise checks), re-screens the
 * inbox, and settles any promises whose deadline passed.
 *
 * Shape mirrors js/reborn/fastForward.js (nextFastForwardTarget +
 * fastForward): a pure predictor for the button label, and an async
 * driver that returns { inbox, state, reports, stoppedAt }.
 */
import { GAMES_PER_WEEK } from "./calendar.js";
import {
  TRADE_DEADLINE_OPENS_AT,
  screenInboxEvents,
  queueInboxEvents,
  recordGameEvidence,
} from "./careerInbox.js";
import { checkPromises } from "./careerDecisions.js";

export const TIMELINE_SPEEDS = ["next-game", "next-event", "next-key-node"];

/** Season key nodes, in game-index order: week boundaries, the trade deadline, season end. */
export const TIMELINE_KEY_NODES = ["week", "trade-deadline", "season-end"];

/** 0-based index of the first game of the next week boundary at or after `from`. */
export function nextWeekBoundary(from, gamesPerWeek = GAMES_PER_WEEK) {
  if (!Number.isInteger(from) || from < 0) return 0;
  const next = Math.ceil((from + 1) / gamesPerWeek) * gamesPerWeek;
  return next;
}

/**
 * The next predictable stop, without simming. Returns
 * { type, gameIndex, detail } — the game index the stop sits at.
 * Training (week) and the trade deadline are predictable from the
 * calendar; inbox events are not (they depend on game outcomes), so the
 * driver may stop earlier on one.
 */
export function nextTimelineTarget({ gameIndex = 0, gamesTotal = 82 } = {}) {
  if (gameIndex >= gamesTotal) {
    return { type: "season-end", gameIndex: gamesTotal, detail: null };
  }
  const weekAt = nextWeekBoundary(gameIndex);
  const candidates = [];
  if (weekAt < gamesTotal) candidates.push({ type: "week", gameIndex: weekAt, detail: { week: Math.floor(weekAt / GAMES_PER_WEEK) + 1 } });
  if (gameIndex < TRADE_DEADLINE_OPENS_AT && TRADE_DEADLINE_OPENS_AT < gamesTotal) {
    candidates.push({ type: "trade-deadline", gameIndex: TRADE_DEADLINE_OPENS_AT, detail: null });
  }
  candidates.push({ type: "season-end", gameIndex: gamesTotal, detail: null });
  candidates.sort((a, b) => a.gameIndex - b.gameIndex);
  return candidates[0];
}

/** Button label for the next predictable stop. */
export function describeTimelineTarget(target, lang = "zh") {
  const zh = lang !== "en";
  if (!target) return null;
  if (target.type === "week") {
    return zh ? `模拟到第 ${target.detail.week} 周` : `Sim to week ${target.detail.week}`;
  }
  if (target.type === "trade-deadline") {
    return zh ? "模拟到交易截止日" : "Sim to the trade deadline";
  }
  return zh ? "模拟到赛季结束" : "Sim to season end";
}

/** One line for the stop the run ended at. */
export function describeTimelineStop(stoppedAt, lang = "zh") {
  const zh = lang !== "en";
  if (!stoppedAt) return null;
  const d = stoppedAt.detail || {};
  switch (stoppedAt.type) {
    case "game":
      return zh ? `打完了第 ${d.game + 1} 场。` : `Game ${d.game + 1} is done.`;
    case "event":
      return zh
        ? `有新的职业事件需要你决定：${d.title || ""}。`
        : `A career event needs your call: ${d.titleEn || d.title || ""}.`;
    case "urgent-event":
      return zh
        ? `重要事件出现了，时间线已暂停：${d.title || ""}。`
        : `An important event appeared — the timeline is paused: ${d.titleEn || d.title || ""}.`;
    case "week":
      return zh ? `第 ${d.week} 周到了，看看收件箱和训练。` : `Week ${d.week} is here — check the inbox and training.`;
    case "trade-deadline":
      return zh ? "交易截止日窗口到了。" : "The trade-deadline window is here.";
    case "season-end":
      return zh ? "赛季打完了。" : "The season is over.";
    case "promise":
      return zh ? `一个承诺到期了：${d.text || ""}` : `A promise came due: ${d.textEn || d.text || ""}`;
    default:
      return null;
  }
}

/**
 * Advance the timeline. `playOne` must behave like the real game driver:
 * it plays the next game and returns { report } (or null when the
 * schedule is exhausted). The report carries at least
 * { game, won, corePts } — the evidence the inbox screens and checks
 * promises against. `onGame` fires after every simmed game (progress).
 *
 * After each game, in order: record evidence, settle due promises,
 * re-screen the inbox. Stops, in priority order:
 *   1. an urgent event was just screened (pause — always, any speed);
 *   2. a promise was just settled (the player should see it);
 *   3. speed next-game: after one game;
 *   4. speed next-event: any pending event exists;
 *   5. speed next-key-node: a key node (week / deadline / season end)
 *      is reached.
 */
export async function advanceTimeline(
  inbox,
  state,
  { playOne, speed = "next-event", gameIndex = 0, gamesTotal = 82, onGame = null } = {},
) {
  if (!TIMELINE_SPEEDS.includes(speed)) throw new RangeError(`unknown timeline speed: ${speed}`);
  if (typeof playOne !== "function") throw new TypeError("playOne is required");
  let currentInbox = inbox;
  let currentState = state;
  let index = gameIndex;
  const reports = [];
  let stoppedAt = null;
  const startIndex = gameIndex;

  // A pending event is already waiting: next-event stops at once instead
  // of simming another game past a decision the player has not made.
  if (speed === "next-event" && currentInbox.pending.length) {
    const first = currentInbox.pending[0];
    stoppedAt = {
      type: "event",
      gameIndex: index,
      detail: { eventId: first.eventId, title: first.title, titleEn: first.titleEn },
    };
    return { inbox: currentInbox, state: currentState, reports, stoppedAt, gameIndex: index };
  }

  while (index < gamesTotal) {
    // Before-game stop: a key node sits exactly here (week boundary or
    // the deadline window) and this is not the run's first game.
    if (index > startIndex) {
      if (speed === "next-key-node" || speed === "next-event") {
        if (index % GAMES_PER_WEEK === 0) {
          stoppedAt = { type: "week", gameIndex: index, detail: { week: Math.floor(index / GAMES_PER_WEEK) + 1 } };
          break;
        }
        if (index === TRADE_DEADLINE_OPENS_AT) {
          stoppedAt = { type: "trade-deadline", gameIndex: index, detail: null };
          break;
        }
      }
    }
    const out = await playOne({ gameIndex: index });
    if (!out || !out.report) break;
    const report = out.report;
    reports.push(report);
    if (typeof onGame === "function") onGame(report);
    index += 1;

    // Evidence first, then promise settlement, then screening — in that
    // order, so a promise due this game is settled before new events
    // are screened on the same state.
    currentInbox = recordGameEvidence(currentInbox, {
      gameIndex: report.game ?? index - 1,
      corePts: report.corePts ?? null,
      won: report.won ?? null,
    });
    const settled = checkPromises(currentInbox, currentState, { gameIndex: index });
    currentInbox = settled.inbox;
    currentState = settled.state;
    if (settled.settled.length) {
      const first = settled.settled[0];
      stoppedAt = {
        type: "promise",
        gameIndex: index,
        detail: { text: first.reason, textEn: first.reasonEn, fulfilled: first.fulfilled },
      };
      break;
    }
    const ctx = typeof out.context === "function" ? out.context() : out.context;
    if (ctx) {
      const screened = screenInboxEvents(currentInbox, { ...ctx, currentGame: index });
      if (screened.length) {
        currentInbox = queueInboxEvents(currentInbox, screened);
        const urgent = screened.find((entry) => entry.urgency === "urgent");
        const first = urgent || screened[0];
        stoppedAt = {
          type: urgent ? "urgent-event" : "event",
          gameIndex: index,
          detail: { eventId: first.eventId, title: first.title, titleEn: first.titleEn },
        };
        break;
      }
    }
    if (speed === "next-game") {
      stoppedAt = { type: "game", gameIndex: index - 1, detail: { game: index - 1 } };
      break;
    }
  }
  if (!stoppedAt) {
    stoppedAt = { type: "season-end", gameIndex: index, detail: null };
  }
  return { inbox: currentInbox, state: currentState, reports, stoppedAt, gameIndex: index };
}
