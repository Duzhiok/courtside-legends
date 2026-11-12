/**
 * Gold-challenge archive (B50): when a gold-challenge bracket ends for good (eliminated, or the last tier won) the
 * save slot is cleared, but the run must not just vanish. It leaves ONE read-only record that My World lists under
 * "My Games" (its own "History" section) with no way to continue it. The record lives on the account
 * (`account.challengeArchive`); a guest without an account gets a small device key. Pure entry builder + writer,
 * capped, newest first. Field set follows docs/implementation/b50-gold-archive-design.md: a summary only -- wins,
 * gold, finals score and the team that eliminated you; never a lineup (the first-five names/OVR the first version
 * stored are gone by design).
 */
import { getAccount, saveAccount } from "./account.js";

export const MAX_ARCHIVE = 20;
const GUEST_KEY = "cls_challenge_archive_v1";
const OUTCOMES = ["champion", "eliminated"];

/** One run's stable key, minted when the bracket starts (bootCareerBracket) and stamped on legacy runs at archive time. */
export function makeRunId(now = Date.now()) {
  return `run-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Your finished matches, in play order: archived stages from bracketLog, then the current stage's pods. */
function yourMatches(c) {
  const out = [];
  for (const stage of c.bracketLog || []) {
    for (const m of stage?.matches || []) if (m?.yours) out.push(m);
  }
  return out;
}

function podMatches(c) {
  const out = [];
  for (const pod of c.pods || []) {
    for (const m of [pod?.openerA, pod?.openerB, pod?.winnersMatch, pod?.revivalMatch, pod?.deciderMatch]) {
      if (m?.yours && m.done) out.push(m);
    }
  }
  return out;
}

/**
 * Wins / losses across the whole run. Finals games are NOT in the pods until the series is decided (and the deciding
 * game is then counted in the series too), so a finals run counts bracketLog + the series, never the pods; any other
 * stage counts bracketLog + the current pods.
 */
function countYourResults(c) {
  const logged = yourMatches(c);
  const count = (list) => ({
    wins: list.filter((m) => m.winner?.bracketId === "you").length,
    losses: list.filter((m) => m.loser?.bracketId === "you").length,
  });
  if ((c.finals || c.stageSize === 2) && c.series) {
    const a = count(logged);
    return { wins: a.wins + (Number(c.series.wins) || 0), losses: a.losses + (Number(c.series.losses) || 0) };
  }
  const a = count(logged);
  const b = count(podMatches(c));
  return { wins: a.wins + b.wins, losses: a.losses + b.losses };
}

/** The team that ended the run, or null (champions are not eliminated by anyone). */
function eliminatedByName(c, outcome) {
  if (outcome !== "eliminated") return null;
  if ((c.finals || c.stageSize === 2) && c.series?.opp?.name) return String(c.series.opp.name);
  const all = [...podMatches(c), ...yourMatches(c).reverse()];
  const lost = all.find((m) => m.loser?.bracketId === "you");
  return lost?.winner?.name ? String(lost.winner.name) : null;
}

/** What a finished run keeps: no cards, no lineup, nothing that could resume it. Null when it was not a real finish. */
export function challengeArchiveEntry(c, outcome, now = Date.now()) {
  if (!c || !OUTCOMES.includes(outcome)) return null;
  const finals = !!(c.finals || c.stageSize === 2);
  const { wins, losses } = countYourResults(c);
  return {
    id: `gc_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    runId: typeof c.runId === "string" && c.runId ? c.runId : makeRunId(now),
    kind: "career",
    fieldSource: typeof c.fieldSource === "string" ? c.fieldSource : "random",
    tier: c.challengeTier || (c.fromCustom ? "custom" : "gold"),
    outcome,
    finals,
    round: Number(c.round) || 1,
    wins,
    losses,
    gold: Math.max(0, Math.round(Number(c.gold) || 0)),
    finalsScore: finals && c.series ? `${Number(c.series.wins) || 0}-${Number(c.series.losses) || 0}` : null,
    eliminatedBy: eliminatedByName(c, outcome),
    teamName: String(c.team?.name || ""),
    finishedAt: now,
  };
}

/** Whatever is stored, only well-formed records come back (storage is user-editable). Old records without a runId, or with the retired roster, still read fine. */
export function normalizeArchive(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.id === "string" && OUTCOMES.includes(e.outcome) && Number.isFinite(e.finishedAt))
    .map((e) => ({
      id: e.id,
      runId: typeof e.runId === "string" && e.runId ? e.runId : null,
      kind: "career",
      fieldSource: typeof e.fieldSource === "string" ? e.fieldSource : "random",
      tier: typeof e.tier === "string" ? e.tier : "gold",
      outcome: e.outcome,
      finals: !!e.finals,
      round: Number(e.round) || 1,
      wins: Math.max(0, Math.round(Number(e.wins) || 0)),
      losses: Math.max(0, Math.round(Number(e.losses) || 0)),
      gold: Math.max(0, Math.round(Number(e.gold) || 0)),
      finalsScore: typeof e.finalsScore === "string" && e.finalsScore ? e.finalsScore : null,
      eliminatedBy: typeof e.eliminatedBy === "string" && e.eliminatedBy ? e.eliminatedBy : null,
      teamName: typeof e.teamName === "string" ? e.teamName : "",
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

function persistChallengeArchive(accountId, list) {
  if (accountId) {
    const account = getAccount(accountId);
    if (!account) return false;
    account.challengeArchive = list;
    saveAccount(account);
    return true;
  }
  store()?.setItem(GUEST_KEY, JSON.stringify(list));
  return true;
}

/**
 * Idempotent per run: the same runId twice is a no-op (a double tap on "back to home" leaves one record). Entries
 * without a runId (written before runId existed) still dedup on their storage id. Never throws; `ok:false` means it
 * could not be saved (the caller still clears the slot).
 */
export function recordChallengeArchive(accountId, entry) {
  if (!entry?.id) return { ok: false };
  const list = readChallengeArchive(accountId);
  if (list.some((e) => (entry.runId && e.runId === entry.runId) || e.id === entry.id)) {
    return { ok: true, changed: false, list };
  }
  const next = normalizeArchive([entry, ...list]);
  try {
    if (!persistChallengeArchive(accountId, next)) return { ok: false };
  } catch {
    return { ok: false };
  }
  return { ok: true, changed: true, list: next };
}

/** Delete one record (runId, or the storage id for pre-runId records). Never throws. */
export function deleteChallengeArchive(accountId, key) {
  if (!key) return { ok: false, changed: false, list: readChallengeArchive(accountId) };
  const list = readChallengeArchive(accountId);
  const next = list.filter((e) => e.runId !== key && e.id !== key);
  if (next.length === list.length) return { ok: true, changed: false, list };
  try {
    if (!persistChallengeArchive(accountId, next)) return { ok: false, changed: false, list };
  } catch {
    return { ok: false, changed: false, list };
  }
  return { ok: true, changed: true, list: next };
}
