/**
 * 每日任务 + 新手礼包: the answer to "one free pull a day is too slow".
 *
 * Tasks pay 抽卡券 (extra pulls), never gold or cards directly, so progress
 * always goes through the same pity / 成色 rules. Everything is capped:
 *  - daily tasks: at most 3 tickets a day (play 1 ranked + win 1 ranked +
 *    win 1 gold-ladder game). The career task exists because the ranked pair
 *    alone made day one too cheap: a welcome gift + free pull + two ranked
 *    tickets handed out premium pulls before any real play (R47 rebalance --
 *    the gift was cut 4 -> 2 and the third daily ticket moved into the
 *    gold tournament, the mode the user asked to matter daily);
 *  - daily challenge: 1 randomly-assigned hard task a day, worth
 *    CHALLENGE_TICKETS more on top -- without this, "2 extra pulls" was
 *    trivially farmable from a single ranked game, so there was no reason
 *    to ever touch the gold tournament or a time-travel season just for
 *    ticket income;
 *  - win milestone: 1 ticket per MILESTONE_WINS ranked wins (lifetime).
 */
import { saveAccount, todayKey } from "./account.js";

export const WELCOME_TICKETS = 2;
export const MILESTONE_WINS = 5;
export const CHALLENGE_TICKETS = 2;

export const DAILY_TASKS = [
  { id: "play", label: "打 1 场排位", tickets: 1, done: (day) => day.played >= 1 },
  { id: "win", label: "排位赢 1 场", tickets: 1, done: (day) => day.won >= 1 },
  { id: "careerWin", label: "金币挑战赛赢 1 场", tickets: 1, done: (day) => (day.careerWon || 0) >= 1 },
];

/**
 * Pool for today's one randomly-assigned hard task. Each id is reported by whatever game-mode
 * completion hook matches it (see recordChallengeProgress callers in app.js) -- these are real
 * accomplishments, not "play one more match" busywork, so they're worth more than a 每日任务.
 */
export const DAILY_CHALLENGES = [
  { id: "goldChampion", label: "金币晋级赛 / 预算轮抽夺冠", tickets: CHALLENGE_TICKETS },
  { id: "timeTravelSeason", label: "穿越生涯打完一个完整赛季", tickets: CHALLENGE_TICKETS },
  { id: "leagueSeason", label: "联盟经理打完一个完整赛季", tickets: CHALLENGE_TICKETS },
];

function pickChallenge(rng = Math.random) {
  return DAILY_CHALLENGES[Math.floor(rng() * DAILY_CHALLENGES.length)];
}

/** One-time gift. Idempotent, so it is safe to call whenever an account opens. */
export function grantWelcomeTickets(account) {
  if (!account || account.welcomeGranted) return 0;
  account.welcomeGranted = true;
  account.tickets = (account.tickets || 0) + WELCOME_TICKETS;
  saveAccount(account);
  return WELCOME_TICKETS;
}

/** Today's progress; a new day starts from zero and rolls a fresh random challenge. */
export function dailyState(account, today = todayKey(), rng = Math.random) {
  const day = account.daily;
  if (day?.day === today) return day;
  account.daily = { day: today, played: 0, won: 0, careerWon: 0, claimed: [], challengeId: pickChallenge(rng).id };
  saveAccount(account); // persist the day's challenge pick immediately, so a reload can't re-roll it
  return account.daily;
}

export function winMilestone(account) {
  const wins = account.rankedWins || 0;
  const earned = Math.floor(wins / MILESTONE_WINS);
  return { wins, earned, claimed: account.milestoneClaimed || 0, next: (earned + 1) * MILESTONE_WINS };
}

/** Claim every daily task whose condition the day now satisfies. */
function claimReadyTasks(account, day) {
  const granted = [];
  for (const task of DAILY_TASKS) {
    if (day.claimed.includes(task.id) || !task.done(day)) continue;
    day.claimed.push(task.id);
    account.tickets = (account.tickets || 0) + task.tickets;
    granted.push({ id: task.id, label: task.label, tickets: task.tickets });
  }
  return granted;
}

/**
 * Call after a ranked game (and after recordRankedResult, which bumps the win
 * count). Returns what was granted so the result screen can say so.
 */
export function recordRankedTasks(account, won, today = todayKey()) {
  const day = dailyState(account, today);
  day.played += 1;
  if (won) day.won += 1;

  const granted = claimReadyTasks(account, day);

  const milestone = winMilestone(account);
  const fresh = milestone.earned - milestone.claimed;
  if (fresh > 0) {
    account.milestoneClaimed = milestone.earned;
    account.tickets = (account.tickets || 0) + fresh;
    granted.push({ id: "milestone", label: `排位累计 ${milestone.earned * MILESTONE_WINS} 胜`, tickets: fresh });
  }
  saveAccount(account);
  return granted;
}

/**
 * Call after a 金币晋级赛 (career) game. Only wins move the 金币挑战赛 daily
 * task; losses change nothing. Returns what was granted, like recordRankedTasks.
 */
export function recordCareerTasks(account, won, today = todayKey()) {
  if (!account) return [];
  const day = dailyState(account, today);
  if (won) day.careerWon = (day.careerWon || 0) + 1;
  const granted = claimReadyTasks(account, day);
  if (granted.length || won) saveAccount(account);
  return granted;
}

/**
 * Call this from whatever game-mode completion hook matches a DAILY_CHALLENGES id (a gold
 * tournament championship, a finished time-travel season, ...). No-op if that id isn't today's
 * assigned challenge, or it's already claimed -- so grinding the same accomplishment twice in one
 * day (or every accomplishment "just in case") doesn't pay out more than once.
 */
export function recordChallengeProgress(account, challengeId, today = todayKey()) {
  if (!account || !challengeId) return null;
  const day = dailyState(account, today);
  if (day.challengeId !== challengeId || day.claimed.includes(challengeId)) return null;
  const def = DAILY_CHALLENGES.find((c) => c.id === challengeId);
  if (!def) return null;
  day.claimed.push(challengeId);
  account.tickets = (account.tickets || 0) + def.tickets;
  saveAccount(account);
  return { id: def.id, label: def.label, tickets: def.tickets };
}

/** What the draw screen shows: each task with its state. */
export function taskBoard(account, today = todayKey()) {
  const day = dailyState(account, today);
  const milestone = winMilestone(account);
  const challengeDef = DAILY_CHALLENGES.find((c) => c.id === day.challengeId) || DAILY_CHALLENGES[0];
  return {
    tasks: DAILY_TASKS.map((task) => ({ id: task.id, label: task.label, tickets: task.tickets, claimed: day.claimed.includes(task.id) })),
    challenge: { id: challengeDef.id, label: challengeDef.label, tickets: challengeDef.tickets, claimed: day.claimed.includes(challengeDef.id) },
    milestone: { wins: milestone.wins, next: milestone.next, perTicket: MILESTONE_WINS },
    tickets: account.tickets || 0,
  };
}
