/**
 * Career History (Career 2.0, workstream A).
 *
 * The career record: everything the inbox decided, promised, and saw,
 * in order. This is the raw material workstream E's Legacy Archive
 * presents (My World honours wall, career retrospectives) — this module
 * only aggregates and renders one-line summaries; it owns no
 * presentation of its own beyond that.
 *
 * Record shapes (written by careerInbox.js / careerDecisions.js):
 *   { type: "story-choice", eventId, choiceId, year, gameIndex, effects, at }
 *   { type: "promise-settled", promiseId, fulfilled, avgCorePts,
 *     gamesObserved, year, gameIndex, effects, at }
 * News items live on inbox.news, not here.
 *
 * Pure functions; the inbox history array is the only input.
 */

/** One-line rendering of a history entry (zh by default, en on request). */
export function describeHistoryEntry(entry, lang = "zh") {
  const zh = lang !== "en";
  if (!entry) return "";
  const game = Number.isInteger(entry.gameIndex) ? (zh ? `第 ${entry.gameIndex + 1} 场` : `game ${entry.gameIndex + 1}`) : "";
  if (entry.type === "story-choice") {
    const trust = entry.effects?.trust ? `（${zh ? "信任" : "trust"} ${entry.effects.trust >= 0 ? "+" : ""}${entry.effects.trust}）` : "";
    return zh
      ? `${entry.year} 赛季${game ? ` ${game}` : ""}：决定「${entry.eventId} → ${entry.choiceId}」${trust}`
      : `${entry.year} season${game ? ` ${game}` : ""}: chose ${entry.eventId} → ${entry.choiceId}${trust}`;
  }
  if (entry.type === "promise-settled") {
    return zh
      ? `${entry.year} 赛季${game ? ` ${game}` : ""}：承诺${entry.fulfilled ? "兑现" : "违约"}（核心场均 ${entry.avgCorePts} 分，观察 ${entry.gamesObserved} 场）`
      : `${entry.year} season${game ? ` ${game}` : ""}: promise ${entry.fulfilled ? "kept" : "broken"} (core ${entry.avgCorePts} pts, ${entry.gamesObserved} games observed)`;
  }
  return zh ? `${entry.year || ""} ${entry.type}` : `${entry.year || ""} ${entry.type}`;
}

/** History entries of one kind, in order. kind: "story-choice" | "promise-settled" | null (all). */
export function historyFor(inbox, { kind = null } = {}) {
  const entries = Array.isArray(inbox?.history) ? inbox.history : [];
  return kind ? entries.filter((entry) => entry.type === kind) : [...entries];
}

/** Choices made, with their event ids — the decision trail. */
export function choiceTrail(inbox) {
  return historyFor(inbox, { kind: "story-choice" }).map((entry) => ({
    eventId: entry.eventId,
    choiceId: entry.choiceId,
    gameIndex: entry.gameIndex,
    year: entry.year,
    trustDelta: entry.effects?.trust || 0,
  }));
}

/** Promises kept vs broken — the commitment record. */
export function promiseRecord(inbox) {
  const settled = historyFor(inbox, { kind: "promise-settled" });
  return {
    kept: settled.filter((entry) => entry.fulfilled).length,
    broken: settled.filter((entry) => !entry.fulfilled).length,
    open: (inbox.promises || []).filter((entry) => entry.status === "open").length,
  };
}

/**
 * The career summary: seasons played, decisions made, promises kept /
 * broken, timeline divergence — the seed of the Legacy Archive. The
 * W-L record comes from the caller's season log (the inbox does not own
 * game results); pass it in as { wins, losses, games }.
 */
export function careerSummary(inbox, state, { wins = 0, losses = 0, games = 0 } = {}) {
  const choices = historyFor(inbox, { kind: "story-choice" });
  const promises = promiseRecord(inbox);
  return {
    games,
    wins,
    losses,
    choices: choices.length,
    promisesKept: promises.kept,
    promisesBroken: promises.broken,
    promisesOpen: promises.open,
    divergence: state?.divergence || 0,
    trust: state?.trust ?? 25,
    relationships: { ...(state?.relationships || {}) },
  };
}
