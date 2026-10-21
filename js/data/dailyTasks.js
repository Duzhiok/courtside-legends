/**
 * 每日任务 + 新手礼包: the answer to "one free pull a day is too slow".
 *
 * Tasks pay 抽卡券 (extra pulls), never gold or cards directly, so progress
 * always goes through the same pity / 成色 rules. Everything is capped:
 *  - daily tasks: at most 2 tickets a day;
 *  - win milestone: 1 ticket per MILESTONE_WINS ranked wins (lifetime).
 */
import { saveAccount, todayKey } from "./account.js";

export const WELCOME_TICKETS = 4;
export const MILESTONE_WINS = 5;

export const DAILY_TASKS = [
  { id: "play", label: "打 1 场排位", tickets: 1, done: (day) => day.played >= 1 },
  { id: "win", label: "排位赢 1 场", tickets: 1, done: (day) => day.won >= 1 },
];

/** One-time gift. Idempotent, so it is safe to call whenever an account opens. */
export function grantWelcomeTickets(account) {
  if (!account || account.welcomeGranted) return 0;
  account.welcomeGranted = true;
  account.tickets = (account.tickets || 0) + WELCOME_TICKETS;
  saveAccount(account);
  return WELCOME_TICKETS;
}

/** Today's progress; a new day starts from zero. */
export function dailyState(account, today = todayKey()) {
  const day = account.daily;
  if (day?.day === today) return day;
  account.daily = { day: today, played: 0, won: 0, claimed: [] };
  return account.daily;
}

export function winMilestone(account) {
  const wins = account.rankedWins || 0;
  const earned = Math.floor(wins / MILESTONE_WINS);
  return { wins, earned, claimed: account.milestoneClaimed || 0, next: (earned + 1) * MILESTONE_WINS };
}

/**
 * Call after a ranked game (and after recordRankedResult, which bumps the win
 * count). Returns what was granted so the result screen can say so.
 */
export function recordRankedTasks(account, won, today = todayKey()) {
  const day = dailyState(account, today);
  day.played += 1;
  if (won) day.won += 1;

  const granted = [];
  for (const task of DAILY_TASKS) {
    if (day.claimed.includes(task.id) || !task.done(day)) continue;
    day.claimed.push(task.id);
    account.tickets = (account.tickets || 0) + task.tickets;
    granted.push({ id: task.id, label: task.label, tickets: task.tickets });
  }

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

/** What the draw screen shows: each task with its state. */
export function taskBoard(account, today = todayKey()) {
  const day = account.daily?.day === today ? account.daily : { played: 0, won: 0, claimed: [] };
  const milestone = winMilestone(account);
  return {
    tasks: DAILY_TASKS.map((task) => ({ id: task.id, label: task.label, tickets: task.tickets, claimed: day.claimed.includes(task.id) })),
    milestone: { wins: milestone.wins, next: milestone.next, perTicket: MILESTONE_WINS },
    tickets: account.tickets || 0,
  };
}
