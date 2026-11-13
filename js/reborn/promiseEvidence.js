/**
 * Promise evidence adapter (Career 2.0 E).
 *
 * One layer that turns what REALLY happened to the Reborn player into the
 * evidence records the promise engine judges against:
 *
 *   game      { started, minutesPlayed }   from the season log (per game)
 *   contract  { contractEvent }            from the timeline's season-end contract event
 *   trade     { tradeEvent }               from a timeline trade event or the account's
 *                                          legacy "trade" record for this player
 *
 * Every record carries a stable `evidenceId`, and collectEvidence() keeps one
 * record per id, so replaying or re-saving the same game/contract/trade can
 * never count twice. Nothing is inferred: a game saved before `started` was
 * recorded has started === null, and a promise that needs it stays open
 * rather than being guessed broken.
 */
import { legacyOf } from "../career/careerRelationships.js";

/** Contract outcomes that mean the player holds a contract for next season. */
export const SIGNED_OUTCOMES = Object.freeze(["resign", "minimum"]);

export const gameEvidenceId = (seed, year, game) => `game:${seed ?? "run"}:${year}:${game}`;
export const contractEvidenceId = (seed, year) => `contract:${seed ?? "run"}:${year}`;
export const tradeEvidenceId = (seed, year, key) => `trade:${seed ?? "run"}:${year}:${key}`;

const yearOf = (e) => (Number.isInteger(e?.year) ? e.year : Number.isInteger(e?.season) ? e.season : null);

function gameRecords(reborn, playerId) {
  const log = Array.isArray(reborn?.player?.seasonLog) ? reborn.player.seasonLog : [];
  return log.map((e) => ({
    evidenceId: e.gameId || gameEvidenceId(reborn?.seed, e.year, e.game),
    kind: "game",
    seasonId: e.year,
    gameId: e.game,
    playerId,
    started: typeof e.started === "boolean" ? e.started : null,
    minutesPlayed: Number.isFinite(e.min) ? e.min : 0,
    role: e.role ?? null,
  }));
}

function contractRecords(reborn, playerId) {
  const events = Array.isArray(reborn?.timeline?.events) ? reborn.timeline.events : [];
  return events
    .filter((e) => e?.event === "contract" && Number.isInteger(e.year))
    .map((e) => ({
      evidenceId: contractEvidenceId(reborn?.seed, e.year),
      kind: "contract",
      seasonId: e.year,
      playerId,
      contractEvent: { outcome: e.outcome, signed: SIGNED_OUTCOMES.includes(e.outcome) },
    }));
}

function tradeRecords(reborn, account, playerId) {
  const out = [];
  const events = Array.isArray(reborn?.timeline?.events) ? reborn.timeline.events : [];
  events.forEach((e, i) => {
    if (e?.event !== "trade" || yearOf(e) === null) return;
    out.push({ evidenceId: tradeEvidenceId(reborn?.seed, yearOf(e), e.id ?? `t${i}`), kind: "trade", seasonId: yearOf(e), playerId, tradeEvent: { to: e.to ?? null } });
  });
  for (const e of account ? legacyOf(account) : []) {
    if (e.type !== "trade" || !playerId || e.data?.playerBref !== playerId || yearOf(e) === null) continue;
    out.push({ evidenceId: `legacy:${e.id}`, kind: "trade", seasonId: yearOf(e), playerId, tradeEvent: { to: e.data?.toTeam ?? null } });
  }
  return out;
}

/** Every evidence record for this run, one per evidenceId. */
export function collectEvidence(reborn, account = null) {
  const playerId = reborn?.identity?.bref ?? null;
  const seen = new Set();
  const records = [];
  for (const r of [...gameRecords(reborn, playerId), ...contractRecords(reborn, playerId), ...tradeRecords(reborn, account, playerId)]) {
    if (seen.has(r.evidenceId)) continue;
    seen.add(r.evidenceId);
    records.push(r);
  }
  return records;
}

/** Latest season any evidence (or a season-start marker) shows — "what year is it now". */
function latestSeason(records, reborn) {
  const years = records.map((r) => r.seasonId).filter(Number.isInteger);
  for (const e of reborn?.timeline?.events || []) if (Number.isInteger(e?.year)) years.push(e.year);
  return years.length ? Math.max(...years) : null;
}

/**
 * (promise) => the snapshot evaluatePromise() reads, built only from evidence.
 * minutes / role / start are judged over the promise's own game window;
 * contract / trade over the seasons up to and after the deadline.
 */
export function evidenceWindow(records, reborn) {
  const games = records.filter((r) => r.kind === "game");
  const lastGame = games[games.length - 1];
  const season = latestSeason(records, reborn);
  return (promise) => {
    const kind = promise?.kind;
    const madeSeason = Number.isInteger(promise?.madeSeason) ? promise.madeSeason : null;
    const madeGame = Number.isInteger(promise?.madeGame) ? promise.madeGame : 0;
    if (kind === "contract") {
      const signed = records.some((r) => r.contractEvent?.signed && (madeSeason === null || r.seasonId >= madeSeason));
      return { season, signed };
    }
    if (kind === "trade") {
      return { season, traded: records.some((r) => r.kind === "trade" && (madeSeason === null || r.seasonId >= madeSeason)) };
    }
    if (kind !== "minutes" && kind !== "role" && kind !== "start") return { game: null, season: null };

    const inWindow = games.filter((g) => madeSeason === null || g.seasonId > madeSeason || (g.seasonId === madeSeason && g.gameId > madeGame));
    const played = inWindow.filter((g) => g.minutesPlayed > 0);
    const mpg = played.length ? played.reduce((s, g) => s + g.minutesPlayed, 0) / played.length : undefined;
    const startedAny = inWindow.some((g) => g.started === true);
    // "Never started" is only a fact when every game in the window recorded it.
    const startKnown = inWindow.every((g) => g.started !== null);
    // A later season means the game clock restarted: the deadline has passed.
    const clock = lastGame
      ? (madeSeason === null || lastGame.seasonId === madeSeason ? lastGame.gameId : madeGame + 10000)
      : null;
    return {
      season: lastGame?.seasonId ?? null,
      game: kind === "start" && !startedAny && !startKnown ? null : clock,
      gamesPlayed: played.length,
      mpg,
      started: startedAny ? true : undefined,
      role: reborn?.player?.rotationRole ?? lastGame?.role,
    };
  };
}
