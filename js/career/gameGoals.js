/**
 * C6 of docs/CAREER_LIFE_ROADMAP.md: every game of a managed career comes with small goals. Meet
 * one and that game pays more XP; coach the game yourself and you get a second goal and x1.5.
 *
 * A goal is set BEFORE the game (the hub shows it) and judged from the box score AFTER it, so it has
 * to be remembered in between: `goalsForNextGame` draws it once and keeps it on the season (a few
 * dozen bytes, like `buzz`), so what the card promised is exactly what gets judged -- even if you
 * trade a player in between. The draw is seeded by (year, team, game number): reloading never
 * re-rolls it, and a bulk sim that never showed the goals still judges the same ones.
 *
 * Rewards are player XP and coach XP only: the two things in the game that something can actually
 * be done with. (Energy is reset every week boundary and future knowledge has nothing to buy yet --
 * both wait for stages D/E.) Pure apart from the two `st` helpers, which only touch `st.gameGoals`
 * and `st.gameSeq`.
 */
import { hashSeed, seededStream, shuffle } from "../core/seededRandom.js";
import { resolvedAge } from "../modes/playerDevelopment.js";
import {
  GAME_GOALS_PER_GAME,
  GAME_GOAL_XP_BONUS,
  GOAL_ASSISTS,
  GOAL_DOUBLE_FIGURE_POINTS,
  GOAL_DOUBLE_FIGURE_SCORERS,
  GOAL_MARGIN,
  GOAL_MAX_TURNOVERS,
  GOAL_ROOKIE_MAX_AGE,
  GOAL_ROOKIE_MINUTES,
  GOAL_STAR_POINTS,
  GOAL_STEALS,
  HAND_PLAY_XP_MULTIPLIER,
} from "./balance.js";

const sum = (lines, key) => (lines || []).reduce((total, line) => total + (Number(line[key]) || 0), 0);
const most = (lines, key) => Math.max(0, ...(lines || []).map((line) => Number(line[key]) || 0));

/**
 * One entry per kind of goal. `draw(ctx, rng)` returns the goal's own numbers, or null when the
 * roster can't carry it (no young player). `met(report, goal)` reads a `settleGame` report.
 * `text` is [zh, en]; the stored goal keeps ids and numbers only, so the language can change.
 */
const DEFS = {
  margin: {
    draw: () => ({ n: GOAL_MARGIN }),
    met: (report, goal) => report.won && report.margin >= goal.n,
    text: (goal) => [`赢下 ${goal.n} 分以上`, `Win by ${goal.n}+`],
  },
  assists: {
    draw: () => ({ n: GOAL_ASSISTS }),
    met: (report, goal) => sum(report.lines, "ast") >= goal.n,
    text: (goal) => [`全队 ${goal.n} 次助攻`, `${goal.n} team assists`],
  },
  steals: {
    draw: () => ({ n: GOAL_STEALS }),
    met: (report, goal) => sum(report.lines, "stl") >= goal.n,
    text: (goal) => [`全队 ${goal.n} 次抢断`, `${goal.n} team steals`],
  },
  careful: {
    draw: () => ({ n: GOAL_MAX_TURNOVERS }),
    met: (report, goal) => sum(report.lines, "tov") <= goal.n,
    text: (goal) => [`失误不超过 ${goal.n} 次`, `No more than ${goal.n} turnovers`],
  },
  balance: {
    draw: () => ({ n: GOAL_DOUBLE_FIGURE_SCORERS }),
    met: (report, goal) => (report.lines || []).filter((line) => line.pts >= GOAL_DOUBLE_FIGURE_POINTS).length >= goal.n,
    text: (goal) => [`${goal.n} 人得分上双`, `${goal.n} players in double figures`],
  },
  star: {
    draw: () => ({ n: GOAL_STAR_POINTS }),
    met: (report, goal) => most(report.lines, "pts") >= goal.n,
    text: (goal) => [`有人砍下 ${goal.n}+ 分`, `Someone scores ${goal.n}+`],
  },
  rookie: {
    draw({ players }, rng) {
      const young = players.filter((player) => resolvedAge(player) <= GOAL_ROOKIE_MAX_AGE);
      if (!young.length) return null;
      const pick = young[Math.floor(rng() * young.length)];
      return { n: GOAL_ROOKIE_MINUTES, playerId: pick.id, name: pick.cardName || pick.name };
    },
    // A player who never checked in has no line at all, which reads as 0 minutes -- exactly right.
    met: (report, goal) => (report.lines || []).some((line) => line.id === goal.playerId && line.min >= goal.n),
    text: (goal) => [`${goal.name} 打满 ${goal.n} 分钟`, `${goal.name} plays ${goal.n}+ minutes`],
  },
};

/** A goal as the language wants it, e.g. "赢下 10 分以上". */
export function goalText(goal, lang = "zh") {
  const def = DEFS[goal?.id];
  return def ? def.text(goal)[lang === "en" ? 1 : 0] : "";
}

/** A stored goal must be one we know with sane numbers: a save is not trusted. */
const isGoal = (goal) => Boolean(
  goal && DEFS[goal.id] && Number.isFinite(goal.n) && goal.n > 0
  && (goal.id !== "rookie" || (typeof goal.playerId === "string" && typeof goal.name === "string")),
);

/**
 * Draw one game's goals. The same seed and roster always give the same goals; kinds never repeat.
 * Injured players aren't asked to play 20 minutes.
 */
export function drawGameGoals(seedText, players = []) {
  const rng = seededStream(hashSeed(seedText));
  const ctx = { players: players.filter((player) => !(player.injuredGames > 0)) };
  const goals = [];
  for (const id of shuffle(Object.keys(DEFS), rng)) {
    const own = DEFS[id].draw(ctx, rng);
    if (own) goals.push({ id, ...own });
    if (goals.length === GAME_GOALS_PER_GAME) break;
  }
  return goals;
}

/** How many of the season's games have had their goals settled: the "game number" the draw is seeded with. */
export const gameSeq = (st) => Math.max(0, Math.floor(Number(st?.gameSeq)) || 0);

/**
 * The goals for the user's next game, drawn once and remembered on the season. Anything stale or
 * damaged in `st.gameGoals` (another game number, an unknown kind, junk numbers) is simply redrawn.
 */
export function goalsForNextGame(st, players) {
  const seq = gameSeq(st);
  const saved = st.gameGoals;
  if (saved?.seq === seq && Array.isArray(saved.goals) && saved.goals.length && saved.goals.every(isGoal)) return saved.goals;
  const goals = drawGameGoals(`${st.year}|${st.userTeamId}|${seq}`, players);
  st.gameGoals = { seq, goals };
  return goals;
}

/**
 * Player XP and coach XP are multiplied by this for the game: x1.5 for coaching it yourself, then
 * +25% for every goal met.
 */
export const rewardMultiplier = ({ handPlayed = false, done = 0 } = {}) =>
  (handPlayed ? HAND_PLAY_XP_MULTIPLIER : 1) * (1 + GAME_GOAL_XP_BONUS * Math.max(0, done));

/**
 * Settle the goals of the game that just finished: judge them against its report, use the game up
 * (so the next one gets its own goals), and say what the XP multiplier is.
 * @returns {{ handPlayed: boolean, goals: Array<object>, done: number, multiplier: number }}
 */
export function settleGameGoals(st, players, report, { handPlayed = false } = {}) {
  // The second goal only exists when you coach the game: a sim is judged on the first alone.
  const judged = goalsForNextGame(st, players)
    .slice(0, handPlayed ? GAME_GOALS_PER_GAME : 1)
    .map((goal) => ({ ...goal, done: Boolean(DEFS[goal.id].met(report, goal)) }));
  st.gameSeq = gameSeq(st) + 1;
  delete st.gameGoals;
  const done = judged.filter((goal) => goal.done).length;
  return { handPlayed: Boolean(handPlayed), goals: judged, done, multiplier: rewardMultiplier({ handPlayed, done }) };
}
