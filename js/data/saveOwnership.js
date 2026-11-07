/**
 * Save ownership (ADR-008a Q1). Three save slots are device-wide: the long-career root (cls_root_v3), the
 * mid-session autosave (cls_savegame_v1) and the quick single season (cls_season_v1). None records WHO it belongs
 * to -- root.profile.accountId is only "whoever wrote last". This module keeps that answer under its own key and
 * never touches any save's format.
 *
 *   entry = { owner, sig }
 *     owner: an account id | "guest" | null  (null = a local save from before ownership existed: unassociated)
 *     sig:   which save instance the entry describes (career: storyId || careerId; session/season: the slot name)
 *
 * Rules: an existing save without an entry is stamped UNASSOCIATED, never auto-assigned. Writing the same career
 * again keeps its owner; only a new career is attributed to whoever is playing. The session slot has no instance
 * id, so it keeps its owner only when this page resumed it through Continue (same for the season slot). A signed-in
 * player may claim an unassociated save after explicit confirmation; a claimed save can't be claimed again. Claiming
 * only manages ownership -- it can't prove the claimer was the original player.
 *
 * Write guard (P0 data integrity): a slot holding ANOTHER account's save is read-only for everyone else -- the
 * storage writers call assertSlotWritable() and refuse to overwrite or delete it. Hiding a save is not protecting
 * it. A save whose owner account has since been deleted counts as unassociated again (nobody can sign in as that
 * owner any more), so it never locks the slot forever.
 */
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "./accountKeys.js";

export const OWNERS_KEY = "cls_save_owners_v1";
export const GUEST = "guest";

const store = (storage) => storage ?? globalThis.localStorage ?? null;
let ready = false; // writes before the boot-time stamp are not attributed (they are legacy migration)
const RESUMABLE = ["session", "season"]; // slots with no instance id: "same save" = resumed through Continue
const resumed = { session: false, season: false };

function readAll(storage) {
  try {
    const raw = store(storage)?.getItem(OWNERS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function writeAll(all, storage) {
  try {
    store(storage)?.setItem(OWNERS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false; // ownership is metadata: failing to store it never touches the save itself
  }
}

export function currentOwner(storage) {
  try {
    return store(storage)?.getItem(ACTIVE_ACCOUNT_KEY) || GUEST;
  } catch {
    return GUEST;
  }
}

/**
 * Can this owner still sign in on this device? Reads the account store the way account.js does (malformed = no
 * accounts: nobody could sign in as the owner then either). Only a storage read that throws keeps the lock.
 */
function ownerExists(owner, storage) {
  if (owner === GUEST) return true;
  let raw;
  try {
    raw = store(storage)?.getItem(ACCOUNTS_KEY);
  } catch {
    return true;
  }
  try {
    const accounts = raw ? JSON.parse(raw)?.accounts : null;
    return Array.isArray(accounts) && accounts.some((a) => a?.id === owner);
  } catch {
    return false;
  }
}

/** The slot's recorded owner when it is a live account other than the current player, else null. */
export function foreignOwnerOf(slot, storage) {
  const entry = readAll(storage)[slot];
  if (!entry || entry.owner == null || entry.owner === currentOwner(storage)) return null;
  return ownerExists(entry.owner, storage) ? entry.owner : null;
}

export class ForeignSaveError extends Error {
  constructor(slot) {
    super(`this device's ${slot} save belongs to another account; refusing to overwrite it`);
    this.name = "ForeignSaveError";
    this.slot = slot;
  }
}

/** Storage writers call this before replacing or deleting a slot. `present` = the slot currently holds data. */
export function assertSlotWritable(slot, present, storage) {
  if (present && foreignOwnerOf(slot, storage)) throw new ForeignSaveError(slot);
}

/** Non-throwing form for the UI: is this slot locked by another account right now? */
export const slotLocked = (slot, present, storage) => Boolean(present && foreignOwnerOf(slot, storage));

/** Does a storage key hold data? Never throws: unusable storage = nothing there (the write itself fails loudly). */
export function keyHasData(key, storage) {
  try {
    return store(storage)?.getItem(key) != null;
  } catch {
    return false;
  }
}

export const careerSig = (root) => (root?.leagueCareer ? root.story?.storyId || root.leagueCareer.careerId || "career" : null);
export const sessionSig = (data) => (data ? "session" : null);
export const seasonSig = (st) => (st ? "season" : null);

/** Boot: any save that exists without an entry is a legacy local save -> unassociated. Stale entries go. */
export function stampLegacySaves({ career = null, session = null, season = null } = {}, storage) {
  const all = readAll(storage);
  let changed = false;
  for (const [slot, sig] of [["career", careerSig(career)], ["session", sessionSig(session)], ["season", seasonSig(season)]]) {
    if (sig && !all[slot]) {
      all[slot] = { owner: null, sig };
      changed = true;
    } else if (!sig && all[slot]) {
      delete all[slot];
      changed = true;
    }
  }
  if (changed) writeAll(all, storage);
  ready = true;
}

export function markSlotResumed(slot) {
  if (RESUMABLE.includes(slot)) resumed[slot] = true;
}
export const markSessionResumed = () => markSlotResumed("session");

/** Called by the save writers after a successful write. */
export function recordSaveWrite(slot, sig, storage) {
  if (!ready) return;
  const all = readAll(storage);
  const prev = all[slot];
  if (!sig) {
    if (prev) {
      delete all[slot];
      writeAll(all, storage);
    }
    return;
  }
  const sameInstance = prev && (RESUMABLE.includes(slot) ? resumed[slot] : prev.sig === sig);
  if (sameInstance) return;
  all[slot] = { owner: currentOwner(storage), sig };
  writeAll(all, storage);
}

/** A save moved slots (boot migration of a quick season into the root): its owner goes with it. */
export function moveSaveOwner(from, to, sig, storage) {
  const all = readAll(storage);
  const entry = all[from];
  if (!entry) return;
  delete all[from];
  if (sig) all[to] = { owner: entry.owner ?? null, sig };
  writeAll(all, storage);
}

export function clearSaveOwner(slot, storage) {
  if (RESUMABLE.includes(slot)) resumed[slot] = false;
  const all = readAll(storage);
  if (!all[slot]) return;
  delete all[slot];
  writeAll(all, storage);
}

/** "none" (no save) | "mine" | "unassociated" | "other" (someone else's: hide it entirely). */
export function saveVisibility(slot, sig, storage) {
  if (!sig) return "none";
  const entry = readAll(storage)[slot];
  if (!entry || entry.sig !== sig || entry.owner == null) return "unassociated";
  if (entry.owner === currentOwner(storage)) return "mine";
  return ownerExists(entry.owner, storage) ? "other" : "unassociated"; // a deleted owner can't come back for it
}

/** Explicit claim of an unassociated save by the signed-in account. Never deletes or edits the save. */
export function claimSave(slot, sig, storage) {
  const owner = currentOwner(storage);
  if (owner === GUEST) return { ok: false, reason: "guest" };
  if (!sig) return { ok: false, reason: "missing" };
  const all = readAll(storage);
  const entry = all[slot];
  if (entry && entry.sig === sig && entry.owner != null && (entry.owner === owner || ownerExists(entry.owner, storage))) {
    return { ok: false, reason: entry.owner === owner ? "already_yours" : "claimed" };
  }
  all[slot] = { owner, sig, claimedAt: Date.now() };
  return writeAll(all, storage) ? { ok: true } : { ok: false, reason: "storage" };
}

/** Test seam: forget module state between unit tests. */
export function _resetOwnershipForTests() {
  ready = false;
  for (const slot of RESUMABLE) resumed[slot] = false;
}
