/**
 * 每日任务 + 新手礼包: the answer to "one free pull a day is too slow".
 *
 * Tasks pay 抽卡券 (extra pulls), never gold or cards directly, so progress
 * always goes through the same draw rules. The three daily tasks TOGETHER pay
 * exactly 1 ticket a day, and only when all three are complete (user decision
 * 2026-11-07 — per-task tickets are gone; partial completion pays 0, and the
 * grant is idempotent per day). The targets stay 3 played / 2 won ranked +
 * 3 gold-ladder wins, so a single ranked game can no longer farm a ticket.
 *  - daily challenge: 1 randomly-assigned hard task a day, worth
 *    CHALLENGE_TICKETS more on top;
 *  - win milestone: 1 ticket per MILESTONE_WINS ranked wins (lifetime).
 */
import { saveAccount, todayKey } from "./account.js";
import { recordDailyTaskXp } from "./accountLevel.js";

export const WELCOME_TICKETS = 2;
export const MILESTONE_WINS = 10;
export const CHALLENGE_TICKETS = 2;

/** `key` is the day counter the task reads; `target` drives both the label and the check. */
const dailyTask = (id, key, target, zh, en) => ({
  id,
  key,
  target,
  label: zh(target),
  labelEn: en(target),
  done: (day) => (day[key] || 0) >= target,
});

export const DAILY_TASKS = [
  dailyTask("play", "played", 3, (n) => `打 ${n} 场排位`, (n) => `Play ${n} ranked games`),
  dailyTask("win", "won", 2, (n) => `排位赢 ${n} 场`, (n) => `Win ${n} ranked games`),
  dailyTask("careerWin", "careerWon", 3, (n) => `金币挑战赛赢 ${n} 场`, (n) => `Win ${n} gold challenge games`),
];

/**
 * Pool for today's one randomly-assigned hard task. Each id is reported by whatever game-mode
 * completion hook matches it (see recordChallengeProgress callers in app.js) -- these are real
 * accomplishments, not "play one more match" busywork, so they're worth more than a 每日任务.
 */
export const DAILY_CHALLENGES = [
  { id: "goldChampion", label: "金币晋级赛 / 预算轮抽夺冠", labelEn: "Win a gold promotion / budget-draft title", tickets: CHALLENGE_TICKETS },
  { id: "timeTravelSeason", label: "穿越生涯打完一个完整赛季", labelEn: "Finish a full time-travel career season", tickets: CHALLENGE_TICKETS },
  { id: "leagueSeason", label: "联盟经理打完一个完整赛季", labelEn: "Finish a full league-manager season", tickets: CHALLENGE_TICKETS },
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

/** The day's single ticket: all three tasks done, once per day. Partial completion pays 0. */
const DAILY_COMPLETE_ID = "dailyComplete";
function claimDailyCompletion(account, day, lang = "zh") {
  if (day.claimed.includes(DAILY_COMPLETE_ID)) return [];
  if (!DAILY_TASKS.every((task) => task.done(day))) return [];
  day.claimed.push(DAILY_COMPLETE_ID);
  account.tickets = (account.tickets || 0) + 1;
  return [{ id: DAILY_COMPLETE_ID, label: lang === "en" ? "All daily tasks done" : "每日任务全部完成", tickets: 1 }];
}

/**
 * Account XP for each daily task that just became complete (+20 per task,
 * once per task per day — the key in recordDailyTaskXp makes repeat calls
 * no-ops, so this is safe to run after every ranked / career game).
 */
function grantDailyTaskXp(account, day, today) {
  if (!account) return;
  for (const task of DAILY_TASKS) {
    if (task.done(day)) recordDailyTaskXp(account, task.id, today);
  }
}

/**
 * Call after a ranked game (and after recordRankedResult, which bumps the win
 * count). Returns what was granted so the result screen can say so.
 */
export function recordRankedTasks(account, won, today = todayKey(), lang = "zh") {
  const day = dailyState(account, today);
  day.played += 1;
  if (won) day.won += 1;

  grantDailyTaskXp(account, day, today);
  const granted = claimDailyCompletion(account, day, lang);

  const milestone = winMilestone(account);
  const fresh = milestone.earned - milestone.claimed;
  if (fresh > 0) {
    account.milestoneClaimed = milestone.earned;
    account.tickets = (account.tickets || 0) + fresh;
    granted.push({ id: "milestone", label: lang === "en" ? `Ranked total ${milestone.earned * MILESTONE_WINS} wins` : `排位累计 ${milestone.earned * MILESTONE_WINS} 胜`, tickets: fresh });
  }
  saveAccount(account);
  return granted;
}

/**
 * Call after a 金币晋级赛 (career) game. Only wins move the 金币挑战赛 daily
 * task; losses change nothing. Returns what was granted, like recordRankedTasks.
 */
export function recordCareerTasks(account, won, today = todayKey(), lang = "zh") {
  if (!account) return [];
  const day = dailyState(account, today);
  if (won) day.careerWon = (day.careerWon || 0) + 1;
  grantDailyTaskXp(account, day, today);
  const granted = claimDailyCompletion(account, day, lang);
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
const taskLabel = (task, lang) => (lang === "en" ? task.labelEn || task.label : task.label);
export function taskBoard(account, today = todayKey(), lang = "zh") {
  const day = dailyState(account, today);
  const milestone = winMilestone(account);
  const challengeDef = DAILY_CHALLENGES.find((c) => c.id === day.challengeId) || DAILY_CHALLENGES[0];
  const allDone = DAILY_TASKS.every((task) => task.done(day));
  return {
    tasks: DAILY_TASKS.map((task) => ({
      id: task.id,
      label: taskLabel(task, lang),
      claimed: task.done(day),
      progress: Math.min(day[task.key] || 0, task.target),
      target: task.target,
    })),
    completion: {
      label: lang === "en" ? "Complete all three daily tasks" : "三项每日任务全部完成",
      tickets: 1,
      done: allDone,
      claimed: day.claimed.includes(DAILY_COMPLETE_ID),
    },
    challenge: { id: challengeDef.id, label: taskLabel(challengeDef, lang), tickets: challengeDef.tickets, claimed: day.claimed.includes(challengeDef.id) },
    milestone: { wins: milestone.wins, next: milestone.next, perTicket: MILESTONE_WINS },
    tickets: account.tickets || 0,
  };
}
