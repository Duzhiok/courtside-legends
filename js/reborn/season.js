/**
 * Player Reborn PR2 — season loop (ADR-005 §3, prep doc).
 *
 * Drives the 1996-97 season game by game: each game is a real GameSim
 * (autoOffense / autoDefense / autoRotation all on — the player does not
 * coach), built from the 1996-97 roster rows with the cloned player in his
 * team's lineup. After each game the player's line feeds the trust update
 * and the season log (aggregates only, never per-possession logs).
 *
 * Takeover seam (PR4): after every possession the driver checks whether the
 * game is in the takeover window (4th quarter / OT, last 2:00, margin <= 5,
 * your ball, you on court). If it is, it calls the `onTakeover` hook once
 * for that game; the hook returns the chosen decision
 * ({ shooterId, actionHint }) or null, and the driver submits it through
 * the M2b decision interface. The driver never invents a shot itself.
 *
 * The season is driven possession by possession (not runFast) so the
 * takeover hook can fire mid-game. One game costs a few hundred ms; the
 * view plays game by game with a button, it never bulk-sims silently.
 */
import { generateSchedule } from "../engine/season.js";
import { GameSim } from "../engine/sim.js";
import { gameScore } from "../engine/matchExplain.js";
import { seasonToCard, overall } from "../data/players.js";
import { seededStream, hashSeed } from "../core/seededRandom.js";
import { isWeekBoundary, GAMES_PER_WEEK } from "../career/calendar.js";
import { roleForTrust, updateTrust, ROLE_MINUTES } from "./trust.js";
import { applyGameGrowth } from "./training.js";
import {
  buildPlayerCard,
  applyIdentityToRoster,
  maybeReveal,
  REBORN_EAST_IDS,
  REBORN_WEST_IDS,
  REBORN_TEAM_IDS,
} from "./identity.js";

export const REBORN_GAMES_PER_WEEK = GAMES_PER_WEEK;

/** All cards of one team in one season, best first. */
export function rosterCards(players, team, season) {
  return (players || [])
    .filter((r) => r && r.team === team && Number(r.season) === season)
    .map(seasonToCard)
    .sort((a, b) => overall(b) - overall(a));
}

function conferenceById() {
  return Object.fromEntries([
    ...REBORN_EAST_IDS.map((id) => [id, "east"]),
    ...REBORN_WEST_IDS.map((id) => [id, "west"]),
  ]);
}

/**
 * Build a season for a reborn run: the 82-game schedule filtered to the
 * player's team's games, in day order. `games` overrides the generated
 * schedule (test hook — a short schedule keeps tests fast).
 */
export function buildSeason(reborn, _players, { games = null } = {}) {
  const year = reborn.startYear + 1;
  const teamId = reborn.player.teamId;
  if (games) return { year, teamId, games: [...games], index: 0 };
  const schedule = generateSchedule(REBORN_TEAM_IDS, hashSeed(`${reborn.seed}|${year}`), {
    eastIds: REBORN_EAST_IDS,
    westIds: REBORN_WEST_IDS,
    confById: conferenceById(),
  });
  const myGames = [];
  schedule.forEach((night, day) => {
    for (const g of night) {
      if (g.homeId === teamId || g.awayId === teamId) myGames.push({ ...g, day: day + 1 });
    }
  });
  return { year, teamId, games: myGames, index: 0 };
}

/** Starters: best five by overall; a starter-role player is swapped in. */
function startersFor(cards, playerCard, isMyTeam, role) {
  const five = [...cards].sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => p.id);
  if (isMyTeam && role === "starter" && !five.includes(playerCard.id)) five[4] = playerCard.id;
  return five;
}

/**
 * Takeover window (PR4): 4th quarter or OT, last 2:00, margin <= 5, your
 * possession, you on court, no decision already armed.
 */
export function takeoverEligible(sim, playerId) {
  if (!sim || !sim.running) return false;
  if (sim.quarter < 4) return false;
  if (sim.clock > 120) return false;
  if (Math.abs(sim.score.home - sim.score.away) > 5) return false;
  if (sim.possession !== sim.youSide) return false;
  const you = sim.youSide === "home" ? sim.home : sim.away;
  if (!you.onCourt?.some((p) => p.id === playerId)) return false;
  if (sim.clutchDecision) return false;
  return true;
}

/**
 * Ask the hook for a takeover decision and submit it through the M2b
 * interface. Returns the submitted decision or null (not eligible / skipped
 * / rejected). Purely the interface call — the choice itself comes from the
 * hook (PR4 builds the options, the player picks).
 */
export async function attemptTakeover(sim, playerId, onTakeover) {
  if (!takeoverEligible(sim, playerId)) return null;
  if (typeof onTakeover !== "function") return null;
  const decision = await onTakeover({ sim, playerId });
  if (!decision || !decision.shooterId || !decision.actionHint) return null;
  const attemptId = sim.issueAttemptId();
  const res = sim.submitDecision({
    attemptId,
    kind: "clutch_shooter",
    shooterId: decision.shooterId,
    actionHint: decision.actionHint,
  });
  if (!res.accepted) return { ...decision, attemptId, accepted: false, reason: res.reason };
  return { ...decision, attemptId, accepted: true };
}

/** Drive one live game possession by possession; the takeover hook fires at most once. */
export async function driveGame(sim, playerId, { onTakeover = null } = {}) {
  sim._quiet = true;
  sim.running = true;
  sim.paused = false;
  sim.breakReason = null;
  let takeover = null;
  let guard = 0;
  while (sim.running && guard++ < 8000) {
    sim.step();
    if (!takeover && onTakeover && takeoverEligible(sim, playerId)) {
      takeover = await attemptTakeover(sim, playerId, onTakeover);
    }
  }
  return { takeover };
}

/**
 * Play the next game of the season. Returns { reborn, report } or null when
 * the schedule is exhausted. `reborn` is returned as a new object; the
 * input is never mutated. `trainingDone` marks that this week's training
 * was completed (PR3 wires the real value).
 */
export async function playGame(
  reborn,
  season,
  players,
  { rng = null, onTakeover = null, trainingDone = false } = {},
) {
  const game = season.games[season.index];
  if (!game) return null;
  const year = season.year;
  const teamId = reborn.player.teamId;
  const isHome = game.homeId === teamId;
  const oppId = isHome ? game.awayId : game.homeId;

  const role = roleForTrust(reborn.player.coachTrust);
  const playerCard = buildPlayerCard(reborn.identity, players, {
    growth: reborn.player.growth,
  });
  playerCard.roleExpectation = role === "starter" ? "starter" : role === "rotation" ? "role" : "bench";
  playerCard.targetMinutes = ROLE_MINUTES[role];

  const teamOf = (code) => {
    let cards = rosterCards(players, code, year);
    if (code === teamId) {
      cards = applyIdentityToRoster(cards, reborn.identity, {
        players,
        growth: reborn.player.growth,
        clone: playerCard,
      });
    }
    return cards;
  };
  const homeCards = teamOf(game.homeId);
  const awayCards = teamOf(game.awayId);
  const myCards = isHome ? homeCards : awayCards;
  const myClone = myCards.find((p) => p.id === playerCard.id) || playerCard;

  const sim = new GameSim({
    home: {
      name: game.homeId,
      players: homeCards,
      starterIds: startersFor(homeCards, myClone, isHome, role),
    },
    away: {
      name: game.awayId,
      players: awayCards,
      starterIds: startersFor(awayCards, myClone, !isHome, role),
    },
    youSide: isHome ? "home" : "away",
    injuries: false,
    speed: 3,
    rng: rng || seededStream(hashSeed(`${reborn.seed}|${year}|${season.index}`)),
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.autoOffense = true;
  sim.autoDefense = true;
  sim.autoRotation = true;

  const { takeover } = await driveGame(sim, playerCard.id, { onTakeover });

  const youSide = sim.youSide === "home" ? sim.home : sim.away;
  const stats = youSide.roster.find((p) => p.id === playerCard.id)?.stats || {};
  const line = {
    id: playerCard.id,
    min: Math.round((stats.min || 0) * 10) / 10,
    pts: stats.pts || 0,
    reb: stats.reb || 0,
    ast: stats.ast || 0,
    stl: stats.stl || 0,
    blk: stats.blk || 0,
    tov: stats.tov || 0,
    fgm: stats.fgm || 0,
    fga: stats.fga || 0,
    tpm: stats.tpm || 0,
    tpa: stats.tpa || 0,
    ftm: stats.ftm || 0,
    fta: stats.fta || 0,
    pf: stats.pf || 0,
  };
  const gs = Math.round(gameScore(stats) * 10) / 10;
  const trustBefore = reborn.player.coachTrust;
  const takeoverOutcome = takeover?.accepted
    ? sim.clutchLog.find((o) => o.attemptId === takeover.attemptId) || null
    : null;
  const trustChange = updateTrust(trustBefore, {
    gameScore: gs,
    role,
    trainingDone,
    takeover: takeoverOutcome ? { attempted: takeoverOutcome.attempted, made: takeoverOutcome.made } : null,
  });
  const trustAfter = trustChange.trust;
  const roleAfter = roleForTrust(trustAfter);
  const won = isHome
    ? sim.score.home > sim.score.away
    : sim.score.away > sim.score.home;

  const next = structuredClone(reborn);
  next.player.coachTrust = trustAfter;
  next.player.rotationRole = roleAfter;
  next.identity = maybeReveal(next.identity, trustAfter);
  next.player.seasonLog.push({
    year,
    game: season.index + 1,
    opp: oppId,
    home: isHome,
    min: line.min,
    pts: line.pts,
    reb: line.reb,
    ast: line.ast,
    takeovers: takeoverOutcome ? 1 : 0,
    role: roleAfter,
    won,
  });
  // PR3: the game's XP converts into attribute gains under the current
  // training focus (awardGrowth + ceilings; the ledger is the only store).
  const growthOut = applyGameGrowth(next, {
    year,
    cards: myCards,
    rows: players,
    lines: [{ id: playerCard.id, min: line.min, score: gs }],
  });
  next.player.growth = growthOut.growth;
  season.index += 1;

  return {
    reborn: next,
    report: {
      year,
      game: season.index,
      day: game.day,
      opp: oppId,
      home: isHome,
      score: { ...sim.score },
      won,
      line: { ...line, score: gs },
      gameScore: gs,
      trustBefore,
      trustAfter,
      trustDelta: trustChange.delta,
      trustParts: trustChange.parts,
      roleBefore: role,
      roleAfter,
      growth: growthOut.entries,
      takeover: takeoverOutcome
        ? {
            option: takeover.actionHint,
            shooterId: takeoverOutcome.shooterId,
            attempted: takeoverOutcome.attempted,
            made: takeoverOutcome.made,
            points: takeoverOutcome.points,
            zone: takeoverOutcome.zone,
            reason: takeoverOutcome.reason,
          }
        : null,
      weekBoundary: isWeekBoundary(season.index, REBORN_GAMES_PER_WEEK),
    },
  };
}

/** Play the rest of the season, one game at a time. Returns the final state + summary. */
export async function playSeason(reborn, season, players, opts = {}) {
  let current = reborn;
  const reports = [];
  while (season.index < season.games.length) {
    const out = await playGame(current, season, players, opts);
    if (!out) break;
    current = out.reborn;
    reports.push(out.report);
    opts.onGame?.(out.report);
  }
  const log = current.player.seasonLog;
  return {
    reborn: current,
    reports,
    summary: {
      year: season.year,
      games: reports.length,
      wins: reports.filter((r) => r.won).length,
      pts: log.reduce((n, e) => n + (e.pts || 0), 0),
      takeovers: log.reduce((n, e) => n + (e.takeovers || 0), 0),
      finalTrust: current.player.coachTrust,
      finalRole: current.player.rotationRole,
    },
  };
}
