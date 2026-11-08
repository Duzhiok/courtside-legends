/**
 * My Team Season results (ADR-010 T2 follow-up): what a finished season leaves behind.
 * `myTeamResult` is pure; `recordMyTeamResult` is the only writer of `account.myTeamSeasons` (a small, optional,
 * capped list). Starting "one more season" replaces the save slot, so the record lives on the account instead.
 * Records carry `variant`, so a 20-game and an 82-game season are never summed together.
 */
import { getAccount, saveAccount } from "../data/account.js";

export const MAX_SEASON_RECORDS = 20;

/** The user's result once the season is `done` (null before). */
export function myTeamResult(st) {
  if (!st?.myTeam || st.phase !== "done") return null;
  const rec = st.standings?.[st.userTeamId] || {};
  return {
    seasonId: st.myTeam.seasonId,
    variant: st.myTeam.rules?.variant || "quick",
    games: st.myTeam.rules?.seasonLength || 0,
    w: rec.w || 0,
    l: rec.l || 0,
    champion: !!st.userTeamId && st.playoffs?.championId === st.userTeamId,
    finishedAt: Date.now(),
  };
}

/** Idempotent per seasonId; newest first; capped. Never touches cards, gold or the saved lineup. */
export function recordMyTeamResult(accountId, result) {
  const account = accountId ? getAccount(accountId) : null;
  if (!account || !result?.seasonId) return { ok: false };
  const list = Array.isArray(account.myTeamSeasons) ? account.myTeamSeasons : [];
  if (list.some((r) => r?.seasonId === result.seasonId)) return { ok: true, changed: false, list };
  account.myTeamSeasons = [result, ...list].slice(0, MAX_SEASON_RECORDS);
  saveAccount(account);
  return { ok: true, changed: true, list: account.myTeamSeasons };
}

/** Short line for the "season over" bar. Counts titles per variant, never across them. */
export function seasonRecordSummary(list, variant, lang = "zh") {
  const same = (Array.isArray(list) ? list : []).filter((r) => r?.variant === variant);
  const titles = same.filter((r) => r.champion).length;
  const en = lang === "en";
  const kind = variant === "full" ? (en ? "82-game" : "82 场") : en ? "20-game" : "20 场";
  return en ? `${same.length} ${kind} season(s) played · ${titles} title(s)` : `${kind}赛季已打 ${same.length} 季 · ${titles} 冠`;
}
