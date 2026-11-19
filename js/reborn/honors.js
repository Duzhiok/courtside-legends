/**
 * Player Reborn — what a playoff run leaves behind (Playoffs v1, slice P3): the player's playoff statistics, the career honours, the timeline line.
 *
 *  - Playoff statistics are DERIVED from the season log (the single record of every game he played, playoff entries carry `po`); nothing is stored twice.
 *  - A title is `reborn.honors` entry `champion:<year>` and a Finals loss is `finalist:<year>`: one per season, so settling twice changes nothing.
 *    The honour records what the player actually did in the run (games, minutes, points in the Finals): a club can win a title with a player who
 *    sat on the bench, and the record says so instead of pretending he won it.
 *  - Nothing here changes a rating, trust or a game: honours and history only.
 */
import { appendLegacyEvent, legacyOf } from "../career/careerRelationships.js";
import { userRun } from "./playoffs.js";

const sum = (list, key) => list.reduce((n, e) => n + (Number.isFinite(e[key]) ? e[key] : 0), 0);
const per = (total, games) => (games ? Math.round((total / games) * 10) / 10 : 0);

/** The player's playoff games of a season (or of the whole career with no year), oldest first. */
export const playoffGames = (reborn, year = null) => (reborn?.player?.seasonLog || []).filter((e) => e.po && (year === null || e.year === year));

/** Playoff statistics, derived from the log. `series` limits it to one series id (the Finals: "F"). */
export function playoffStats(reborn, year = null, { series = null } = {}) {
  const games = playoffGames(reborn, year).filter((e) => !series || e.po.series === series);
  const played = games.filter((e) => (e.min || 0) > 0);
  const [min, pts, reb, ast] = ["min", "pts", "reb", "ast"].map((k) => sum(games, k));
  return {
    year,
    gp: games.length,
    played: played.length,
    started: games.filter((e) => e.started).length,
    wins: games.filter((e) => e.won).length,
    losses: games.filter((e) => !e.won).length,
    min, pts, reb, ast,
    mpg: per(min, played.length), ppg: per(pts, played.length), rpg: per(reb, played.length), apg: per(ast, played.length),
  };
}

const roundOf = (run) => run?.series.at(-1)?.round || 0;
const OUTCOME = (po, run) => (po.status === "champion" ? "champion" : po.status === "missed" ? "missed" : roundOf(run) === 4 ? "finalist" : "eliminated");

/** The honour of a finished run, or null (only a title or a Finals loss is an honour). */
function honorFor(reborn, po, run) {
  const outcome = OUTCOME(po, run);
  if (outcome !== "champion" && outcome !== "finalist") return null;
  const finals = po.series.find((s) => s.id === "F");
  const opp = finals.high === po.userId ? finals.low : finals.high;
  const mine = finals.high === po.userId ? [finals.winsHigh, finals.winsLow] : [finals.winsLow, finals.winsHigh];
  return {
    id: `${outcome}:${po.year}`,
    type: outcome,
    year: po.year,
    teamId: po.userId,
    seed: po.seedOf[po.userId],
    finals: {
      oppId: opp,
      wins: mine[0],
      losses: mine[1],
      games: finals.games.map((g) => ({ n: g.n, homeId: g.homeId, awayId: g.awayId, homeScore: g.homeScore, awayScore: g.awayScore })),
      ...(outcome === "champion" ? { clinchedGameId: finals.games.at(-1).gameId || null } : {}),
    },
    // What he did, so the honour is not a lie about a bench player.
    contribution: { run: playoffStats(reborn, po.year), finals: playoffStats(reborn, po.year, { series: "F" }) },
  };
}

/**
 * Settle a finished playoff season: the honour (title / Finals loss), one timeline line, nothing else. Idempotent per season. A run still in
 * progress, or a season with no playoffs ("unavailable"), changes nothing. Returns a new state, or the same object when there is nothing to do.
 */
export function settlePlayoffSeason(reborn) {
  const po = reborn?.playoffs;
  if (!po || po.status === "active" || po.status === "unavailable") return reborn;
  if ((reborn.timeline?.events || []).some((e) => e.event === "playoffs" && e.year === po.year)) return reborn;
  const run = userRun(po);
  const next = structuredClone(reborn);
  const honor = honorFor(next, po, run);
  if (honor && !(next.honors || []).some((h) => h.id === honor.id)) next.honors = [...(next.honors || []), honor];
  const stats = playoffStats(next, po.year);
  next.timeline = {
    ...(next.timeline || {}),
    events: [...(next.timeline?.events || []), {
      year: po.year,
      event: "playoffs",
      outcome: OUTCOME(po, run),
      seed: po.seedOf[po.userId] ?? null,
      round: roundOf(run),
      championId: po.championId || null,
      gp: stats.gp,
      min: stats.min,
    }],
  };
  return next;
}

export const championships = (reborn) => (reborn?.honors || []).filter((h) => h.type === "champion");

/** The account's legacy log gets an idempotent copy of the run's honours (the run is the truth; deduped by id). */
export function mirrorHonorsToAccount(account, reborn) {
  if (!account || !reborn) return 0;
  let added = 0;
  for (const h of reborn.honors || []) {
    const title = h.type === "champion";
    const before = legacyOf(account).length;
    appendLegacyEvent(account, {
      id: `${h.type}:${reborn.seed}:${h.year}`,
      type: title ? "championship" : "finals",
      season: h.year,
      summary: title ? `${h.year} 总冠军（总决赛 ${h.finals.wins}–${h.finals.losses} ${h.finals.oppId}）` : `${h.year} 总决赛落败（${h.finals.wins}–${h.finals.losses} ${h.finals.oppId}）`,
      summaryEn: title ? `${h.year} champions (Finals ${h.finals.wins}–${h.finals.losses} vs ${h.finals.oppId})` : `${h.year} Finals loss (${h.finals.wins}–${h.finals.losses} vs ${h.finals.oppId})`,
      data: { year: h.year, teamId: h.teamId, oppId: h.finals.oppId, finalsMinutes: h.contribution.finals.min },
    });
    if (legacyOf(account).length > before) added += 1;
  }
  return added;
}

/**
 * Close a season's books for the rollover: keep a small summary in `seasonHistory`, drop the bracket and the league results of that year (a new
 * season starts from nothing). Returns a new state.
 */
export function archivePlayoffSeason(reborn, year) {
  const next = structuredClone(reborn);
  const po = next.playoffs?.year === year ? next.playoffs : null;
  if (po && po.status !== "unavailable") {
    const run = userRun(po);
    next.seasonHistory = {
      ...(next.seasonHistory || {}),
      [year]: { playoffs: { outcome: OUTCOME(po, run), seed: po.seedOf[po.userId] ?? null, round: roundOf(run), championId: po.championId || null, finalsLoserId: po.finalsLoserId || null } },
    };
  }
  if (next.playoffs?.year === year) delete next.playoffs;
  if (next.league?.year === year) delete next.league;
  return next;
}
