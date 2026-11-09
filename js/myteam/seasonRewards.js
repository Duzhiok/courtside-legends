/**
 * My Team Season gold (T2 progression). Idempotent BY CONSTRUCTION: what a season has earned so far is *derived* from its
 * standings/flags (never counted from events), and the account keeps a ledger of what was already paid for that seasonId.
 * Every call pays only the difference, so a refresh, a resume, a bulk sim or a crash between two writes can neither
 * double-pay nor lose a reward. Ranked points are untouched; only `account.gold` and the ledger change.
 *
 * Calibration (existing economy): ranked pays +40 per win / +12 per loss; one extra draw costs ¤200. My Team must stay
 * clearly below ranked per game, but a whole season should still feel like roughly one to three extra draws:
 *   20-game, 12-8, playoffs, no title  ≈ 12*6+8*2+40+30   = 158
 *   20-game champion                   ≈ 158 + 120        = 278  (~1.4 draws)
 *   82-game, 50-32, playoffs, no title ≈ 50*3+32+150+60   = 392
 *   82-game champion                   ≈ 392 + 300        = 692  (~3.5 draws)
 * (20 ranked games at 60% pay 576: ranked stays the better gold source per game played.)
 */
import { getAccount, saveAccount } from "../data/account.js";
import { madePlayoffs } from "../data/accountLevel.js";

export const MY_TEAM_GOLD = {
  quick: { win: 6, loss: 2, completion: 40, playoffs: 30, champion: 120 },
  full: { win: 3, loss: 1, completion: 150, playoffs: 60, champion: 300 },
};
export const GOLD_LEDGER_CAP = 20;
const PARTS = ["games", "completion", "playoffs", "champion"];

/** What the season has earned so far, from its current state. Pure; null if it isn't a My Team season. */
export function goldEntitlement(st) {
  const table = MY_TEAM_GOLD[st?.myTeam?.rules?.variant];
  if (!table || !st.userTeamId) return null;
  const rec = st.standings?.[st.userTeamId] || {};
  const done = st.phase === "done";
  return {
    games: Math.max(0, rec.w || 0) * table.win + Math.max(0, rec.l || 0) * table.loss,
    completion: done ? table.completion : 0,
    playoffs: madePlayoffs(st) ? table.playoffs : 0,
    champion: done && st.playoffs?.championId === st.userTeamId ? table.champion : 0,
  };
}

const total = (parts) => PARTS.reduce((n, k) => n + (parts?.[k] || 0), 0);

/**
 * Pay the difference between what the season has earned and what the ledger says was paid.
 * Only the season's own account is ever credited (cross-account saves can't leak gold).
 * @returns {{gained:number, total:number, parts:object|null}} total = everything this season has paid so far
 */
export function grantSeasonGold(st, { getAcc = getAccount, saveAcc = saveAccount } = {}) {
  const none = { gained: 0, total: 0, parts: null };
  const ent = goldEntitlement(st);
  const account = st?.myTeam?.ownerAccountId ? getAcc(st.myTeam.ownerAccountId) : null;
  const id = st?.myTeam?.seasonId;
  if (!ent || !account || !id) return none;

  const ledger = account.myTeamGold && typeof account.myTeamGold === "object" ? account.myTeamGold : {};
  const paid = ledger[id] || {};
  const next = {};
  let gained = 0;
  for (const k of PARTS) {
    const before = Math.max(0, paid[k] || 0);
    next[k] = Math.max(before, ent[k]); // monotonic: a bad/odd state can never claw back or re-pay
    gained += next[k] - before;
  }
  if (gained > 0) {
    delete ledger[id];
    ledger[id] = next; // re-insert so the newest season is last
    const keys = Object.keys(ledger);
    for (const old of keys.slice(0, Math.max(0, keys.length - GOLD_LEDGER_CAP))) delete ledger[old];
    account.myTeamGold = ledger;
    account.gold = (account.gold || 0) + gained;
    saveAcc(account);
  }
  return { gained, total: total(next), parts: next };
}
