/**
 * C1 of docs/CAREER_LIFE_ROADMAP.md: per-game settlement for a season/career game.
 *
 * `settleGame` turns one finished game snapshot into a small report (the facts of the night plus
 * EMPTY reward slots that C2-C6 fill: player XP, highlights, epiphanies, coach XP, the game goal).
 * `foldBatch` folds many reports into one "this stretch" summary, so a bulk sim shows one card
 * instead of 40.
 *
 * Pure and snapshot-driven: nothing here is saved (principle 7: aggregates only, never per-game
 * logs -- the localStorage quota is the reason), and no number is invented -- every figure comes
 * from the box score that is already on screen.
 */
import { gameScore } from "../engine/matchExplain.js";

export const STAR_COUNT = 3;

/** The reward slots later steps fill. Rendering skips any that are empty. */
export const emptyRewards = () => ({ playerXp: [], highlights: [], insights: [], coachXp: null, goal: null });

const num = (value) => Number(value) || 0;
const line = (player) => {
  const s = player.stats || {};
  return {
    id: player.id,
    // When the same player is on BOTH teams the engine renames its copies for the play-by-play
    // ("DEN·Nikola Jokić"). This card only lists your side, so it shows the card's own name.
    name: player.cardName || player.name,
    min: num(s.min),
    pts: num(s.pts),
    reb: num(s.reb),
    ast: num(s.ast),
    stl: num(s.stl),
    blk: num(s.blk),
    tov: num(s.tov),
    score: Math.round(gameScore(s) * 10) / 10,
  };
};

/**
 * "Played" is any trace in the box score, not just `min > 0`: the snapshot rounds minutes, so a
 * player who checked in for 20 seconds and hit a shot reads as 0 min -- and his points must still
 * be in the lines or the totals stop adding up.
 */
const TRACE_KEYS = ["min", "fga", "fta", "pts", "reb", "ast", "stl", "blk", "tov", "pf"];
const played = (player) => TRACE_KEYS.some((key) => num(player.stats?.[key]) > 0);

/** Your players who actually played, best box-score night first (ties: more points). */
const playedLines = (roster) => (roster || [])
  .filter(played)
  .map(line)
  .sort((a, b) => b.score - a.score || b.pts - a.pts);

/**
 * @param snap a completed game snapshot ({ home, away, score, ... })
 * @param youSide "home" | "away" -- which side is the user
 * @returns the report, or null when the snapshot isn't a finished game
 */
export function settleGame(snap, youSide) {
  const side = youSide === "away" ? "away" : "home";
  const other = side === "home" ? "away" : "home";
  if (!snap?.score || !Array.isArray(snap[side]?.roster) || !snap[other]) return null;
  const you = num(snap.score[side]);
  const opp = num(snap.score[other]);
  const lines = playedLines(snap[side].roster);
  return {
    youSide: side,
    won: you > opp,
    tied: you === opp,
    score: { you, opp },
    margin: you - opp,
    teamName: snap[side].name || "",
    opponentName: snap[other].name || "",
    stars: lines.slice(0, STAR_COUNT),
    // Everyone who played (best night first): `foldBatch` needs the whole rotation, not just the top
    // three, or a bench player's one good night would average out as a season-long star.
    lines,
    rewards: emptyRewards(),
  };
}

/**
 * One summary for a stretch of games. `leaders` rank by TOTAL box-score contribution over the
 * stretch (so a single 40-point night can't outrank a month of 25s), shown as per-game averages;
 * `best` is the single best night, with its game attached.
 */
export function foldBatch(reports) {
  const games = (reports || []).filter(Boolean);
  const out = { games: games.length, wins: 0, losses: 0, pointDiff: 0, leaders: [], best: null, growth: [] };
  const byPlayer = new Map();
  const growthBy = new Map();
  for (const report of games) {
    if (!report.tied) out[report.won ? "wins" : "losses"] += 1;
    out.pointDiff += report.margin;
    for (const entry of report.rewards?.playerXp || []) {
      const acc = growthBy.get(entry.id) || { id: entry.id, name: entry.name, xp: 0, leveled: new Map() };
      acc.xp += entry.xp;
      Object.assign(acc, { total: entry.total, progress: entry.progress, capped: entry.capped });
      // Level-ups of the same attribute across the stretch read as one gain: 72 -> 74, not two lines.
      for (const up of entry.leveled) {
        const seen = acc.leveled.get(up.attribute);
        acc.leveled.set(up.attribute, { attribute: up.attribute, from: seen ? seen.from : up.from, to: up.to });
      }
      growthBy.set(entry.id, acc);
    }
    for (const player of report.lines) {
      const acc = byPlayer.get(player.id) || { id: player.id, name: player.name, games: 0, pts: 0, reb: 0, ast: 0, total: 0 };
      acc.games += 1;
      acc.pts += player.pts;
      acc.reb += player.reb;
      acc.ast += player.ast;
      acc.total += player.score;
      byPlayer.set(player.id, acc);
      if (!out.best || player.score > out.best.score) {
        out.best = { ...player, opponentName: report.opponentName, won: report.won, game: { you: report.score.you, opp: report.score.opp } };
      }
    }
  }
  out.leaders = [...byPlayer.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, STAR_COUNT)
    .map((acc) => ({
      id: acc.id,
      name: acc.name,
      games: acc.games,
      ppg: acc.pts / acc.games,
      rpg: acc.reb / acc.games,
      apg: acc.ast / acc.games,
      total: Math.round(acc.total * 10) / 10,
    }));
  out.growth = [...growthBy.values()]
    .map((acc) => ({ ...acc, leveled: [...acc.leveled.values()] }))
    .sort((a, b) => b.leveled.length - a.leveled.length || b.xp - a.xp);
  return out;
}
