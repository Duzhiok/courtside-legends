/**
 * Player Reborn — simulate to the next meaningful event (integration sprint,
 * workstream A).
 *
 * An 82-game season is the season length, never a demand to play 82 games
 * by hand. fastForward plays games one at a time through the existing
 * playGame driver and stops at the first meaningful event:
 *
 *   - training: the next week starts and no focus is chosen for it (the
 *     player picks a focus, then resumes — the run never sims past a
 *     training choice the player has not made, except for the week the run
 *     starts in, whose choice is already on screen);
 *   - key-game: the next game is against a team with a superstar (best
 *     card OVR >= KEY_GAME_STAR_OVR) — the player plays that one;
 *   - takeover: a clutch moment just happened in the game played;
 *   - reveal: the trust-40 identity reveal just happened;
 *   - role / starter: trust crossed a role tier (starter is its own event);
 *   - season-end: the schedule is done — go settle the contract.
 *
 * The driver never invents outcomes: every game is a real playGame, the
 * takeover hook is the real one (the dialog appears mid-run and the sim
 * waits for the player's pick), and the stop rules are pure given the
 * reports. nextFastForwardTarget predicts the nearest *predictable* event
 * (training / key-game / season-end) without simming, for the button label;
 * the driver may stop earlier on an unpredictable one (takeover / reveal /
 * role). Tests inject a stub playOne — nothing here asserts on random game
 * results.
 */
import { isWeekBoundary, GAMES_PER_WEEK } from "../career/calendar.js";
import { ROLE_LABEL } from "./trust.js";
import { playGame, rosterCards } from "./season.js";
import { overall } from "../data/players.js";

/** An opponent whose best card is at least this OVR counts as a key game. */
export const KEY_GAME_STAR_OVR = 85;

export const FAST_FORWARD_EVENTS = [
  "training",
  "key-game",
  "takeover",
  "reveal",
  "role",
  "starter",
  "season-end",
];

/** Week number (1-based) for a 0-based game index. Mirrors the view. */
export function weekForGameIndex(index) {
  return Math.floor(index / GAMES_PER_WEEK) + 1;
}

/** The opponent's best card (rosterCards sorts best first) — the star you face. */
export function opponentStar(players, teamId, season) {
  const cards = rosterCards(players, teamId, season);
  return cards.length ? cards[0] : null;
}

/** Is this game a key game — the opponent has a superstar? */
export function isKeyGame(players, game, myTeamId, season) {
  if (!game) return false;
  const oppId = game.homeId === myTeamId ? game.awayId : game.homeId;
  const star = opponentStar(players, oppId, season);
  return star ? overall(star) >= KEY_GAME_STAR_OVR : false;
}

function keyGameDetail(players, game, myTeamId, season) {
  const oppId = game.homeId === myTeamId ? game.awayId : game.homeId;
  const star = opponentStar(players, oppId, season);
  return { opp: oppId, star: star?.name || null, starOvr: star ? overall(star) : null };
}

/**
 * The next predictable event, without simming. Returns
 * { type, gameIndex, detail } — gameIndex is the 0-based index the event
 * sits at (the game to play for training / key-game, the schedule length
 * for season-end). Training is only predicted after the run's first game:
 * the week the run starts in already shows its training choice on screen.
 */
export function nextFastForwardTarget(reborn, season, players) {
  const teamId = reborn.player.teamId;
  const start = season.index;
  if (start >= season.games.length) {
    return { type: "season-end", gameIndex: season.games.length, detail: null };
  }
  for (let i = start; i < season.games.length; i++) {
    if (i > start && isWeekBoundary(i, GAMES_PER_WEEK)) {
      const week = weekForGameIndex(i);
      if (reborn.player.training?.week !== week) {
        return { type: "training", gameIndex: i, detail: { week } };
      }
    }
    if (isKeyGame(players, season.games[i], teamId, season.year)) {
      return {
        type: "key-game",
        gameIndex: i,
        detail: keyGameDetail(players, season.games[i], teamId, season.year),
      };
    }
  }
  return { type: "season-end", gameIndex: season.games.length, detail: null };
}

/** Button label for the next predictable event. */
export function describeFastForwardTarget(target, lang = "zh") {
  const zh = lang !== "en";
  if (!target) return null;
  if (target.type === "training") {
    return zh
      ? `模拟到第 ${target.detail.week} 周训练`
      : `Sim to week ${target.detail.week} training`;
  }
  if (target.type === "key-game") {
    return zh
      ? `模拟到硬仗（vs ${target.detail.opp}）`
      : `Sim to the key game (vs ${target.detail.opp})`;
  }
  return zh ? "模拟到赛季结束" : "Sim to season end";
}

/** One line for the event the run stopped at. */
export function describeFastForwardEvent(event, lang = "zh") {
  const zh = lang !== "en";
  if (!event) return null;
  const d = event.detail || {};
  switch (event.type) {
    case "training":
      return zh
        ? `第 ${d.week} 周训练时间到了，选一个训练方向再继续。`
        : `Week ${d.week} training is here — pick a focus to continue.`;
    case "key-game":
      return zh
        ? `下一场是硬仗，对阵 ${d.opp}${d.star ? `（${d.star} 在对面）` : ""}——亲自打这场吧。`
        : `Next up is a key game vs ${d.opp}${d.star ? ` (${d.star} on the other side)` : ""} — play this one yourself.`;
    case "takeover":
      return zh ? "关键回合你接管了比赛，看看结果。" : "You took over the clutch moment — see how it went.";
    case "reveal":
      return zh ? "你的真实身份揭示了。" : "Your real identity is revealed.";
    case "starter":
      return zh ? "你进首发了！" : "You're a starter now!";
    case "role":
      return zh
        ? `教练信任跨过了一个档位：你现在是${ROLE_LABEL[d.roleAfter]?.zh || d.roleAfter}。`
        : `Your role changed: you're ${ROLE_LABEL[d.roleAfter]?.en || d.roleAfter} now.`;
    case "season-end":
      return zh ? "赛季打完了，去结算合同。" : "Season over — settle your contract.";
    default:
      return null;
  }
}

/**
 * Simulate forward until the next meaningful event. `playOne` defaults to
 * the real playGame and must behave like it (advance season.index, return
 * { reborn, report } or null when the schedule is exhausted). Returns
 * { reborn, reports, stoppedAt }.
 */
export async function fastForward(
  reborn,
  season,
  players,
  { playOne = playGame, onTakeover = null } = {},
) {
  let current = reborn;
  const reports = [];
  const startIndex = season.index;
  let stoppedAt = null;
  while (season.index < season.games.length) {
    const i = season.index;
    const week = weekForGameIndex(i);
    // Before-game stops: a new week's training (not the run's first game —
    // that week's choice is already on screen), then a key game.
    if (i > startIndex && isWeekBoundary(i, GAMES_PER_WEEK)) {
      if (current.player.training?.week !== week) {
        stoppedAt = { type: "training", gameIndex: i, detail: { week } };
        break;
      }
    }
    const game = season.games[i];
    if (isKeyGame(players, game, current.player.teamId, season.year)) {
      stoppedAt = {
        type: "key-game",
        gameIndex: i,
        detail: keyGameDetail(players, game, current.player.teamId, season.year),
      };
      break;
    }
    const out = await playOne(current, season, players, {
      onTakeover,
      trainingDone: current.player.training?.week === week,
    });
    if (!out) break;
    current = out.reborn;
    reports.push(out.report);
    // After-game stops, in priority order: the moment you lived, then the
    // reveal, then a role change (starter is its own event).
    if (out.report.takeover) {
      stoppedAt = { type: "takeover", gameIndex: i, detail: { option: out.report.takeover.option } };
      break;
    }
    if (out.report.revealedNow) {
      stoppedAt = { type: "reveal", gameIndex: i, detail: null };
      break;
    }
    if (out.report.roleAfter !== out.report.roleBefore) {
      const starter = out.report.roleAfter === "starter";
      stoppedAt = {
        type: starter ? "starter" : "role",
        gameIndex: i,
        detail: {
          roleBefore: out.report.roleBefore,
          roleAfter: out.report.roleAfter,
          trust: out.report.trustAfter,
        },
      };
      break;
    }
  }
  if (!stoppedAt) {
    stoppedAt = { type: "season-end", gameIndex: season.index, detail: null };
  }
  return { reborn: current, reports, stoppedAt };
}
