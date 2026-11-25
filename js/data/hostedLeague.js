/**
 * Hosted league (B47, ADR-008 §4): offline games settled when the player comes back. PURE and not wired to any
 * screen yet. The game itself is injected (`playGame`), so this file owns only the rules:
 *   - one calendar day = up to DAILY_GAMES games, settled the next time the player is back (never "today");
 *   - gold and XP taper by game index in the day (ADR-008 table); gold is priced at PRICE_SHARE of ranked;
 *   - a HARD weekly cap: after WEEKLY_PAID_GAMES paid games the week pays nothing (records are still kept);
 *   - the seed of every game is hash(account, day, index): reloading or settling late cannot reroll a result;
 *   - XP goes through trainingCamp.bankXp, so the tier budget is the only ceiling (no second growth route);
 *   - never ranked, never online bonuses, never trades/buys/pulls (it only touches gold, one card's XP bank, a log).
 * Numbers are starting values from docs/implementation/b47-hosted-league-economy.md; change them here only.
 */
import { saveAccount } from "./account.js";
import { bankXp } from "./trainingCamp.js";

export const DAILY_GAMES = 20;
export const WEEKLY_PAID_GAMES = 25;
export const MAX_CATCH_UP_DAYS = 7;
export const PRICE_SHARE = 0.5; // of ranked's win 40 / loss 12 (js/data/account.js)
export const RANKED_PAY = { win: 40, loss: 12 };
export const HOSTED_XP_PER_GAME = 8;
/** ADR-008 §4 taper by 1-based game number in the day. */
export const TAPER = [
  { upTo: 5, gold: 1, xp: 1 },
  { upTo: 10, gold: 0.5, xp: 0.5 },
  { upTo: 20, gold: 0, xp: 0.25 },
];
const LOG_KEEP = 20;

export const taperFor = (n) => TAPER.find((t) => n <= t.upTo) || { gold: 0, xp: 0 };

/** Local calendar day number and Monday-based week number (clock = the device's, like the Training Center). */
export const dayOf = (ms) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);
export const weekOf = (day) => Math.floor((day + 3) / 7); // 1970-01-01 was a Thursday

/** FNV-1a: a stable 32-bit seed from text. */
export function hostedSeed(accountId, day, index) {
  let h = 2166136261;
  for (const ch of `${accountId}|${day}|${index}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hostedState(account) {
  const h = account?.hosted || {};
  return { plan: h.plan || null, settledDay: Number.isFinite(h.settledDay) ? h.settledDay : null, paidWeek: h.paidWeek || { week: -1, paid: 0 }, log: Array.isArray(h.log) ? h.log : [] };
}

/** Start (or change) the plan. Games begin counting the next day; changing the plan never re-settles old days. */
export function setHostedPlan(account, { playerId = null, attr = null } = {}, { now = Date.now(), save = saveAccount } = {}) {
  const state = hostedState(account);
  account.hosted = { ...state, plan: { playerId, attr }, settledDay: state.settledDay ?? dayOf(now) };
  save(account);
  return account.hosted.plan;
}

const addXpToCard = (account, plan, earned, pool) => {
  if (!plan?.playerId || !plan.attr || !(account.playerIds || []).includes(plan.playerId)) return 0;
  const { step, t } = bankXp(account, plan.playerId, plan.attr, earned, pool);
  const mods = account.cardMods || (account.cardMods = {});
  mods[plan.playerId] = { merges: 0, skills: [], ...mods[plan.playerId], training: { ...mods[plan.playerId]?.training, ...t } };
  return step.gained;
};

/**
 * Settle every finished day since the last settlement (at most MAX_CATCH_UP_DAYS). Idempotent: a second call with
 * the same clock finds nothing owed. `playGame({ seed, day, index })` returns `{ won }` (injected; deterministic).
 */
export function settleHosted(account, { now = Date.now(), playGame, pool, save = saveAccount } = {}) {
  const state = hostedState(account);
  if (!state.plan || state.settledDay === null) return { days: [], gold: 0, xp: 0, gained: 0 };
  const today = dayOf(now);
  const first = Math.max(state.settledDay + 1, today - MAX_CATCH_UP_DAYS);
  const days = [];
  let paidWeek = { ...state.paidWeek };
  let goldTotal = 0;
  let xpTotal = 0;
  let gained = 0;
  for (let day = first; day < today; day += 1) {
    if (weekOf(day) !== paidWeek.week) paidWeek = { week: weekOf(day), paid: 0 };
    const row = { day, games: 0, wins: 0, paid: 0, gold: 0, xp: 0 };
    for (let index = 1; index <= DAILY_GAMES; index += 1) {
      const won = !!playGame({ seed: hostedSeed(account.id, day, index), day, index }).won;
      row.games += 1;
      row.wins += won ? 1 : 0;
      const tier = taperFor(index);
      const pays = (tier.gold > 0 || tier.xp > 0) && paidWeek.paid < WEEKLY_PAID_GAMES;
      if (!pays) continue;
      paidWeek.paid += 1;
      row.paid += 1;
      row.gold += Math.round((won ? RANKED_PAY.win : RANKED_PAY.loss) * PRICE_SHARE * tier.gold);
      row.xp += Math.round(HOSTED_XP_PER_GAME * tier.xp);
    }
    goldTotal += row.gold;
    xpTotal += row.xp;
    days.push(row);
  }
  if (days.length) {
    account.gold = (account.gold || 0) + goldTotal;
    gained = addXpToCard(account, state.plan, xpTotal, pool);
    account.hosted = { ...state, settledDay: today - 1, paidWeek, log: [...days].reverse().concat(state.log).slice(0, LOG_KEEP) };
    save(account);
  }
  return { days, gold: goldTotal, xp: xpTotal, gained };
}
