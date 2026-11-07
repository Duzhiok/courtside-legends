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
 * Write guard (P0 data integrity): the storage writers call assertSlotWritable() before replacing or deleting a slot.
 *   - another live identity's save (an account, or the guest) is read-only for everyone else ("other");
 *   - an unassociated save (pre-ownership, or its owner account was deleted) is read-only too ("unassociated"):
 *     only continuing that same save, or an explicit delete the player confirmed (`release`), may replace it.
 *     It is claimable, exportable and deletable, so it never traps the slot -- but nothing overwrites it silently.
 * Hiding a save is not protecting it. A signed-in account may claim a guest's save (explicitly; the guest then loses
 * it). There is one slot per kind, so a claim can never overwrite a different destination save.
 * Limits (MVP): the metadata lives in localStorage on this device only -- clearing site data clears it, and nothing
 * here is server-checked or synced across devices.
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
  /** reason: "other" (another identity's save) | "unassociated" (a save nobody owns: claim, export or delete it first) */
  constructor(slot, reason = "other") {
    super(`this device's ${slot} save is ${reason === "other" ? "another player's" : "unassociated"}; refusing to overwrite it`);
    this.name = "ForeignSaveError";
    this.slot = slot;
    this.reason = reason;
  }
}

/** Is a recorded owner nobody can be any more (none, or a deleted account)? */
const unowned = (entry, storage) =>
  entry.owner == null || (entry.owner !== currentOwner(storage) && !ownerExists(entry.owner, storage));

/**
 * Why a write/delete of this slot must be refused right now, or null. `present` = the slot holds data.
 * opts.sig: the save being written (career: continuing the same storyId is not an overwrite); opts.release: the
 * player explicitly confirmed deleting an unassociated save. Session/season continue only when resumed this page.
 */
export function slotLockReason(slot, present, { sig = null, release = false } = {}, storage) {
  if (!present) return null;
  if (foreignOwnerOf(slot, storage)) return "other";
  if (!ready || release) return null; // before the boot stamp: legacy migration, not a player write
  const entry = readAll(storage)[slot];
  if (!entry || entry.mirror || !unowned(entry, storage)) return null; // a mirror is a copy: the real save is the root
  const continuing = RESUMABLE.includes(slot) ? resumed[slot] : sig != null && sig === entry.sig;
  return continuing ? null : "unassociated";
}

/** Storage writers call this before replacing or deleting a slot. */
export function assertSlotWritable(slot, present, storage, opts) {
  const reason = slotLockReason(slot, present, opts, storage);
  if (reason) throw new ForeignSaveError(slot, reason);
}

/** Non-throwing form for the UI: is this slot protected right now? */
export const slotLocked = (slot, present, storage, opts) => Boolean(slotLockReason(slot, present, opts, storage));

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

/** Is this quick-season slot just the long career's compat copy (same league year and team as the root's season)? */
const mirrorsCareer = (season, career) => {
  const cs = career?.leagueCareer?.season;
  return Boolean(season && typeof season === "object" && cs && season.year === cs.year && season.userTeamId === cs.userTeamId);
};

/**
 * Boot: any save that exists without an entry is a legacy local save -> unassociated (an old build's compat copy of
 * the career in the root is stamped as that mirror instead). Stale entries go. `season` may be the parsed season.
 */
export function stampLegacySaves({ career = null, session = null, season = null } = {}, storage) {
  const all = readAll(storage);
  let changed = false;
  for (const [slot, sig] of [["career", careerSig(career)], ["session", sessionSig(session)], ["season", seasonSig(season)]]) {
    if (sig && !all[slot]) {
      all[slot] = slot === "season" && mirrorsCareer(season, career) ? { owner: null, sig, mirror: true } : { owner: null, sig };
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

/** The long career rewrote its compat copy into the quick-season slot: tag it as a mirror, never as an owned save. */
export function recordMirrorWrite(slot, storage) {
  if (!ready) return;
  const all = readAll(storage);
  all[slot] = { owner: null, sig: slot, mirror: true };
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

/**
 * "none" (no save) | "mine" | "unassociated" | "guest" (the guest's save, seen by a signed-in account: claimable,
 * not resumable) | "other" (another account's: hide it entirely) | "mirror" (the career's quick-season copy).
 */
export function saveVisibility(slot, sig, storage) {
  if (!sig) return "none";
  const entry = readAll(storage)[slot];
  if (entry?.mirror) return "mirror"; // the long career's compat copy: not a save of its own
  if (!entry || entry.sig !== sig || entry.owner == null) return "unassociated";
  const me = currentOwner(storage);
  if (entry.owner === me) return "mine";
  if (entry.owner === GUEST) return "guest"; // me is an account here (a guest viewer would have matched "mine")
  return ownerExists(entry.owner, storage) ? "other" : "unassociated"; // a deleted owner can't come back for it
}

/** Saves this player must not see or resume: another account's, or the guest's until it is claimed. */
export const hiddenFromMe = (state) => state === "other" || state === "guest";

/** Explicit claim of an unassociated (or the guest's) save by the signed-in account. Never deletes or edits the save. */
export function claimSave(slot, sig, storage) {
  const owner = currentOwner(storage);
  if (owner === GUEST) return { ok: false, reason: "guest" };
  if (!sig) return { ok: false, reason: "missing" };
  const all = readAll(storage);
  const entry = all[slot];
  // Another account's save is never claimable; the guest's is (the guest is this device's anonymous player).
  if (entry && entry.sig === sig && entry.owner != null && entry.owner !== GUEST && (entry.owner === owner || ownerExists(entry.owner, storage))) {
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
