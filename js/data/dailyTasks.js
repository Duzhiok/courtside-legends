/**
 * 每日任务 + 每日抽卡 + 新手礼包 (economy simplified 2026-11-09):
 *
 * One regular player card a day, earned by completing any 2 of the 3 daily
 * tasks (or, while a banked balance lasts, by spending one legacy 抽卡券).
 * The daily-draw slot is the unit of enforcement — task route and ticket
 * route both claim the same slot, so no source can stack a second card in
 * one day. The claim is manual, idempotent per day (day.claimed marker),
 * account-scoped, and resets at the existing daily boundary.
 *
 * Repeatable ticket income is gone: the daily challenge pays Account XP,
 * the ranked win milestone pays gold. One-time grants stay: the welcome
 * pack (2 tickets, spendable through the same slot) and the Account Level
 * card packs (Lv.5 / Lv.50, claimed once per level). The coin extra draw
 * (¤200, 2/day) and the unconditional free daily pull are deleted.
 */
import { saveAccount, todayKey } from "./account.js";
import { awardAccountXp, recordDailyTaskXp } from "./accountLevel.js";
import { drawOneCard } from "./accountGacha.js";
import { MAX_CARDS, cardRoom } from "./accountRecycle.js";
import { PLAYERS } from "./players.js";

export const WELCOME_TICKETS = 2;
export const MILESTONE_WINS = 10;
/** Daily challenge completion pays Account XP (2x a daily task's +20). */
export const CHALLENGE_XP = 40;
/** One ranked win milestone (per MILESTONE_WINS lifetime wins) pays gold. */
export const MILESTONE_GOLD = 50;
/** How many of the 3 daily tasks must be done to unlock today's card. */
export const DAILY_DRAW_TASKS_NEEDED = 2;
/** Claimed marker for the daily draw, stored in the day's `claimed` list. */
export const DAILY_DRAW_ID = "dailyDraw";

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
 * accomplishments, not "play one more match" busywork, so they're worth CHALLENGE_XP Account XP
 * (2x a daily task), not a card.
 */
export const DAILY_CHALLENGES = [
  { id: "goldChampion", label: "金币晋级赛 / 预算轮抽夺冠", labelEn: "Win a gold promotion / budget-draft title" },
  { id: "timeTravelSeason", label: "穿越生涯打完一个完整赛季", labelEn: "Finish a full time-travel career season" },
  { id: "leagueSeason", label: "联盟经理打完一个完整赛季", labelEn: "Finish a full league-manager season" },
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

/** How many of today's tasks are done — the daily-draw unlock counts tasks, not tickets. */
function tasksDone(day) {
  return DAILY_TASKS.filter((task) => task.done(day)).length;
}

/**
 * One line for the result screens: what this grant actually pays, in the
 * player's language. Gold / XP grants carry the amount; the daily-draw
 * unlock grant carries neither (its label is the whole message).
 */
export function grantNote(grant, lang = "zh") {
  if (!grant) return "";
  const en = lang === "en";
  if (grant.kind === "gold") return en ? `🪙 ${grant.label}, Gold +${grant.gold}` : `🪙 ${grant.label}，金币 +${grant.gold}`;
  if (grant.kind === "xp") return en ? `🎖️ Daily challenge done: ${grant.label}, Account XP +${grant.xp}` : `🎖️ 今日挑战达成：${grant.label}，账号经验 +${grant.xp}`;
  return en ? `🎴 ${grant.label}` : `🎴 ${grant.label}`;
}

/**
 * The daily-draw slot for this account and day: the single unit of
 * enforcement for the 1-card-per-day rule. `payWith` says how this claim
 * would be paid — "tasks" when 2-of-3 are done (free), "ticket" when only a
 * banked ticket can pay. Both routes claim the same slot, so no source can
 * stack a second regular card in one day.
 */
export function dailyDrawState(account, today = todayKey()) {
  const day = dailyState(account, today);
  const done = tasksDone(day);
  const claimed = day.claimed.includes(DAILY_DRAW_ID);
  const taskEligible = done >= DAILY_DRAW_TASKS_NEEDED;
  const tickets = account.tickets || 0;
  return {
    tasksDone: done,
    needed: DAILY_DRAW_TASKS_NEEDED,
    taskEligible,
    tickets,
    claimed,
    canClaim: !claimed && !account.pendingRoll && (taskEligible || tickets > 0),
    payWith: claimed ? null : taskEligible ? "tasks" : tickets > 0 ? "ticket" : null,
  };
}

export function canClaimDailyDraw(account, today = todayKey()) {
  return dailyDrawState(account, today).canClaim;
}

/**
 * Claim today's one regular card. The binder is checked BEFORE anything is
 * marked, and the claim is marked only AFTER a successful pull, so a full
 * binder (or any failed pull) never consumes the day's draw. A pending 成色
 * choice must be settled first, as before. Throws when the slot is already
 * claimed, or when neither 2-of-3 tasks nor a banked ticket can pay for it.
 */
export function claimDailyDraw(account, { bannerId = "standard", rng = Math.random, pool = PLAYERS, date = new Date() } = {}) {
  if (!account) throw new Error("无账号");
  if (cardRoom(account) <= 0) throw new Error(`卡库已满（${MAX_CARDS} 张）——先去「我的球员卡」分解一些`);
  if (account.pendingRoll) throw new Error("先选择成色");
  const today = todayKey(date);
  const state = dailyDrawState(account, today);
  if (state.claimed) throw new Error("今日球员卡已领取");
  if (!state.canClaim) throw new Error(`完成 3 个每日任务中的任意 ${DAILY_DRAW_TASKS_NEEDED} 个即可领取今日球员卡`);
  const usedTicket = state.payWith === "ticket";
  const result = drawOneCard(account, { bannerId, rng, pool, date, paid: { paidGold: 0, usedTicket } });
  if (usedTicket) account.tickets -= 1;
  dailyState(account, today).claimed.push(DAILY_DRAW_ID);
  saveAccount(account);
  return result;
}

/** A note (not a payout) when this game completes the 2nd daily task and unlocks today's card. */
function unlockGrant(day, before, lang = "zh") {
  if (before >= DAILY_DRAW_TASKS_NEEDED || tasksDone(day) < DAILY_DRAW_TASKS_NEEDED) return [];
  return [{ kind: "info", id: "dailyDraw", label: lang === "en" ? "Daily player card unlocked — claim it in the draw screen" : "今日球员卡已解锁，去抽卡领取" }];
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
 * count). Returns what was granted so the result screen can say so: milestone
 * gold, and a daily-draw unlock note when this game completes the 2nd task.
 */
export function recordRankedTasks(account, won, today = todayKey(), lang = "zh") {
  const day = dailyState(account, today);
  const before = tasksDone(day);
  day.played += 1;
  if (won) day.won += 1;

  grantDailyTaskXp(account, day, today);
  const granted = unlockGrant(day, before, lang);

  const milestone = winMilestone(account);
  const fresh = milestone.earned - milestone.claimed;
  if (fresh > 0) {
    account.milestoneClaimed = milestone.earned;
    account.gold = (account.gold || 0) + MILESTONE_GOLD * fresh;
    granted.push({ kind: "gold", id: "milestone", label: lang === "en" ? `Ranked total ${milestone.earned * MILESTONE_WINS} wins` : `排位累计 ${milestone.earned * MILESTONE_WINS} 胜`, gold: MILESTONE_GOLD * fresh });
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
  const before = tasksDone(day);
  if (won) day.careerWon = (day.careerWon || 0) + 1;
  grantDailyTaskXp(account, day, today);
  const granted = unlockGrant(day, before, lang);
  if (granted.length || won) saveAccount(account);
  return granted;
}

/**
 * Call this from whatever game-mode completion hook matches a DAILY_CHALLENGES id (a gold
 * tournament championship, a finished time-travel season, ...). No-op if that id isn't today's
 * assigned challenge, or it's already claimed -- so grinding the same accomplishment twice in one
 * day (or every accomplishment "just in case") doesn't pay out more than once. Pays
 * CHALLENGE_XP Account XP (keyed per day, so a repeat call is a no-op even without the marker).
 */
export function recordChallengeProgress(account, challengeId, today = todayKey()) {
  if (!account || !challengeId) return null;
  const day = dailyState(account, today);
  if (day.challengeId !== challengeId || day.claimed.includes(challengeId)) return null;
  const def = DAILY_CHALLENGES.find((c) => c.id === challengeId);
  if (!def) return null;
  day.claimed.push(challengeId);
  const axp = awardAccountXp(account, CHALLENGE_XP, { source: "dailyChallenge", key: `challenge:${challengeId}:${today}` });
  saveAccount(account);
  return { kind: "xp", id: def.id, label: def.label, xp: axp.gained };
}

/** What the draw screen shows: each task with its state, plus the daily-draw slot. */
const taskLabel = (task, lang) => (lang === "en" ? task.labelEn || task.label : task.label);
export function taskBoard(account, today = todayKey(), lang = "zh") {
  const day = dailyState(account, today);
  const draw = dailyDrawState(account, today);
  const milestone = winMilestone(account);
  const challengeDef = DAILY_CHALLENGES.find((c) => c.id === day.challengeId) || DAILY_CHALLENGES[0];
  return {
    tasks: DAILY_TASKS.map((task) => ({
      id: task.id,
      label: taskLabel(task, lang),
      claimed: task.done(day),
      progress: Math.min(day[task.key] || 0, task.target),
      target: task.target,
    })),
    dailyDraw: {
      tasksDone: draw.tasksDone,
      needed: draw.needed,
      taskEligible: draw.taskEligible,
      claimed: draw.claimed,
      canClaim: draw.canClaim,
      payWith: draw.payWith,
      label: lang === "en" ? "Complete any 2 to claim today's player card" : "完成任意 2 项领取今日球员卡",
    },
    challenge: { id: challengeDef.id, label: taskLabel(challengeDef, lang), xp: CHALLENGE_XP, claimed: day.claimed.includes(challengeDef.id) },
    milestone: { wins: milestone.wins, next: milestone.next, perReward: MILESTONE_WINS, gold: MILESTONE_GOLD },
    tickets: account.tickets || 0,
  };
}
