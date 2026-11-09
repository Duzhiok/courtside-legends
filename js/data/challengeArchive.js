/**
 * Gold-challenge archive (B50): when a gold-challenge bracket ends for good (eliminated, or the last tier won) the
 * save slot is cleared, but the run must not just vanish. It leaves ONE read-only record that My World lists under
 * "My Games" with no way to continue it. The record lives on the account (`account.challengeArchive`); a guest
 * without an account gets a small device key. Pure entry builder + a single writer, capped, newest first.
 */
import { getAccount, saveAccount } from "./account.js";
import { overall } from "./players.js";

export const MAX_ARCHIVE = 20;
const GUEST_KEY = "cls_challenge_archive_v1";
const OUTCOMES = ["champion", "eliminated"];

/** What a finished run keeps: no cards, no gold, nothing that could resume it. Null when it was not a real finish. */
export function challengeArchiveEntry(c, outcome, now = Date.now()) {
  if (!c || !OUTCOMES.includes(outcome)) return null;
  const roster = (c.team?.players || [])
    .map((p) => ({ name: String(p?.name || ""), ovr: Math.round(overall(p) || 0) }))
    .filter((p) => p.name)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 5);
  return {
    id: `gc_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tier: c.challengeTier || (c.fromCustom ? "custom" : "gold"),
    outcome,
    finals: !!(c.finals || c.stageSize === 2),
    round: Number(c.round) || 1,
    losses: Number(c.losses?.you) || 0,
    teamName: String(c.team?.name || ""),
    roster,
    finishedAt: now,
  };
}

/** Whatever is stored, only well-formed records come back (storage is user-editable). */
export function normalizeArchive(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.id === "string" && OUTCOMES.includes(e.outcome) && Number.isFinite(e.finishedAt))
    .map((e) => ({
      id: e.id,
      tier: typeof e.tier === "string" ? e.tier : "gold",
      outcome: e.outcome,
      finals: !!e.finals,
      round: Number(e.round) || 1,
      losses: Number(e.losses) || 0,
      teamName: typeof e.teamName === "string" ? e.teamName : "",
      roster: (Array.isArray(e.roster) ? e.roster : []).filter((p) => p && typeof p.name === "string").slice(0, 5).map((p) => ({ name: p.name, ovr: Number(p.ovr) || 0 })),
      finishedAt: e.finishedAt,
    }))
    .slice(0, MAX_ARCHIVE);
}

const store = () => (typeof localStorage === "undefined" ? null : localStorage);

export function readChallengeArchive(accountId) {
  if (accountId) return normalizeArchive(getAccount(accountId)?.challengeArchive);
  try {
    return normalizeArchive(JSON.parse(store()?.getItem(GUEST_KEY) || "[]"));
  } catch {
    return [];
  }
}

/** Idempotent per record id. Never throws; `ok:false` means it could not be saved (the caller still clears the slot). */
export function recordChallengeArchive(accountId, entry) {
  if (!entry?.id) return { ok: false };
  const list = readChallengeArchive(accountId);
  if (list.some((e) => e.id === entry.id)) return { ok: true, changed: false, list };
  const next = normalizeArchive([entry, ...list]);
  try {
    if (accountId) {
      const account = getAccount(accountId);
      if (!account) return { ok: false };
      account.challengeArchive = next;
      saveAccount(account);
    } else {
      store()?.setItem(GUEST_KEY, JSON.stringify(next));
    }
  } catch {
    return { ok: false };
  }
  return { ok: true, changed: true, list: next };
}
