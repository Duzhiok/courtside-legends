/**
 * My Team Season results (ADR-010 T2 follow-up): what a finished season leaves behind.
 * `myTeamResult` is pure; `recordMyTeamResult` is the only writer of `account.myTeamSeasons` (a small, optional,
 * capped list). Starting "one more season" replaces the save slot, so the record lives on the account instead.
 * Records carry `variant`, so a 20-game and an 82-game season are never summed together.
 */
import { getAccount, saveAccount } from "../data/account.js";
import { overall } from "../data/players.js";
import { playerSlotPos } from "../engine/gameplan.js";
import { seasonFinish, seasonRank, myPlayerLines } from "./seasonReport.js";
import { SLOT_ORDER } from "./courtSlots.js";

export const MAX_SEASON_RECORDS = 20;

/**
 * The five who started when the season ended, copied from the season's OWN team (the cards were cloned from the
 * collection when the season began, so later sales / upgrades cannot change them). Display fields only — id, name,
 * the slot he played, OVR, and what the portrait needs (bref / season / team). Returns null when the save does not
 * hold a full five: a partial or reconstructed lineup would be a made-up history.
 */
export function startingFiveSnapshot(st) {
  const team = st?.teams?.[st?.userTeamId];
  const ids = Array.isArray(team?.starterIds) && team.starterIds.length ? team.starterIds : st?.myTeam?.start?.starterIds;
  if (!team || !Array.isArray(team.players) || !Array.isArray(ids)) return null;
  const byId = new Map(team.players.map((p) => [p?.id, p]));
  const five = ids.map((id) => byId.get(id)).filter(Boolean);
  if (five.length !== SLOT_ORDER.length) return null;
  return five.map((c) => ({
    id: String(c.id), bref: String(c.bref || ""), name: String(c.name || ""), nameEn: String(c.nameEn || ""),
    pos: playerSlotPos(c), ovr: overall(c), season: c.season ?? "", team: String(c.team || ""),
  }));
}

/** A record's saved starting five, or [] when it has none (older seasons) or the data is damaged. Never guesses. */
export function recordLineup(record) {
  const list = record?.lineup;
  if (!Array.isArray(list) || list.length !== SLOT_ORDER.length) return [];
  const ok = list.every((e) => e && typeof e.id === "string" && typeof e.name === "string" && SLOT_ORDER.includes(e.pos) && Number.isFinite(e.ovr));
  return ok ? list : [];
}

/** The user's result once the season is `done` (null before). */
export function myTeamResult(st) {
  if (!st?.myTeam || st.phase !== "done") return null;
  const rec = st.standings?.[st.userTeamId] || {};
  const lineup = startingFiveSnapshot(st);
  return {
    ...(lineup ? { lineup } : {}),
    seasonId: st.myTeam.seasonId,
    variant: st.myTeam.rules?.variant || "quick",
    games: st.myTeam.rules?.seasonLength || 0,
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
