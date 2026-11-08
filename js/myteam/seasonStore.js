/**
 * My Team Season save slot (ADR-010 T2): `cls_myteam_season_v1`, separate from the quick-season, career and
 * session slots. The file IS a season object with a `myTeam` block (see mySeason.js), so loading reuses
 * prepareSeasonState. Ownership: the slot is signed by `myTeam.seasonId`, so the shared guard (saveOwnership)
 * refuses to overwrite another player's / the guest's / an unlinked save, and continuing the same season is fine.
 */
import { compactSeasonForSave, prepareSeasonState } from "../engine/season.js";
import { ForeignSaveError, assertSlotWritable, clearSaveOwner, keyHasData, myTeamSig, recordSaveWrite } from "../data/saveOwnership.js";

export const MYTEAM_SEASON_KEY = "cls_myteam_season_v1";
const SLOT = "myteam";
const store = (storage) => storage ?? globalThis.localStorage;

export const hasMyTeamSeason = (storage) => keyHasData(MYTEAM_SEASON_KEY, storage);

/** Shape gate: a damaged or foreign blob is "no save", never a crash. */
export function validMyTeamSeason(st) {
  const m = st?.myTeam;
  return !!(
    m && m.schema === 1 && typeof m.seasonId === "string" && m.seasonId
    && ["full", "quick"].includes(m.rules?.variant)
    && [20, 82].includes(st.rsGames ?? 82)
    && st.teams && st.teams[st.userTeamId] && Array.isArray(st.schedule)
  );
}

/** The parsed slot (no state preparation: enough to sign and label it), or null. */
export function readMyTeamSeason(storage) {
  try {
    const st = JSON.parse(store(storage).getItem(MYTEAM_SEASON_KEY));
    return validMyTeamSeason(st) ? st : null;
  } catch {
    return null;
  }
}

/** The slot ready to play (engine state prepared), or null. */
export function loadMyTeamSeason(storage) {
  const raw = readMyTeamSeason(storage);
  return raw ? prepareSeasonState(raw) : null;
}

/** @returns {{ ok: true } | { ok: false, reason: "invalid" | "other" | "unassociated" | "storage" }} */
export function saveMyTeamSeason(st, storage) {
  const sig = myTeamSig(st);
  if (!sig || !validMyTeamSeason(st)) return { ok: false, reason: "invalid" };
  try {
    assertSlotWritable(SLOT, hasMyTeamSeason(storage), storage, { sig });
  } catch (error) {
    if (error instanceof ForeignSaveError) return { ok: false, reason: error.reason };
    throw error;
  }
  // Same compaction + quota fallback as the quick-season slot; a failure touches nothing else.
  try {
    compactSeasonForSave(st);
    store(storage).setItem(MYTEAM_SEASON_KEY, JSON.stringify(st));
  } catch {
    try {
      compactSeasonForSave(st, { dropBoxes: true });
      store(storage).setItem(MYTEAM_SEASON_KEY, JSON.stringify(st));
    } catch {
      return { ok: false, reason: "storage" };
    }
  }
  recordSaveWrite(SLOT, sig, storage);
  return { ok: true };
}

/** Delete the slot. `release` = the player confirmed deleting an unlinked save. Throws ForeignSaveError if protected. */
export function clearMyTeamSeason({ release = false } = {}, storage) {
  assertSlotWritable(SLOT, hasMyTeamSeason(storage), storage, { release });
  store(storage).removeItem(MYTEAM_SEASON_KEY);
  clearSaveOwner(SLOT, storage);
}
