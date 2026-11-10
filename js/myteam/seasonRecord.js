/**
 * My Team Season results (ADR-010 T2 follow-up): what a finished season leaves behind.
 * `myTeamResult` is pure; `recordMyTeamResult` is the only writer of `account.myTeamSeasons` (a small, optional,
 * capped list). Starting "one more season" replaces the save slot, so the record lives on the account instead.
 * Records carry `variant`, so a 20-game and an 82-game season are never summed together.
 */
import { getAccount, saveAccount } from "../data/account.js";
import { overall } from "../data/players.js";
import { seasonFinish, seasonRank, myPlayerLines } from "./seasonReport.js";

export const MAX_SEASON_RECORDS = 20;

/** The five who started the season (what the Legacy Room shows for a title). Small on purpose: ids + display fields. */
function startingFive(st) {
  const ids = st.myTeam.start?.starterIds || [];
  const roster = st.teams?.[st.userTeamId]?.players || [];
  return ids
    .map((id) => roster.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, nameEn: p.nameEn || null, season: p.season ?? null, team: p.team || null, pos: p.pos || null, ovr: overall(p) }));
}

/** The user's result once the season is `done` (null before). `year` and `lineup` are additive: older records lack them. */
export function myTeamResult(st) {
  if (!st?.myTeam || st.phase !== "done") return null;
  const rec = st.standings?.[st.userTeamId] || {};
  return {
    seasonId: st.myTeam.seasonId,
    variant: st.myTeam.rules?.variant || "quick",
    games: st.myTeam.rules?.seasonLength || 0,
    year: Number(st.year) || null,
    lineup: startingFive(st),
    w: rec.w || 0,
    l: rec.l || 0,
    champion: !!st.userTeamId && st.playoffs?.championId === st.userTeamId,
    finish: seasonFinish(st),
    rank: seasonRank(st).rank,
    star: (([p]) => (p ? { name: p.name, ppg: p.ppg } : null))(myPlayerLines(st)),
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
