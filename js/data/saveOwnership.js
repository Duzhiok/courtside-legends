/**
 * Save ownership (ADR-008a Q1). The two save slots are device-wide: the long-career root (cls_root_v3) and the
 * mid-session autosave (cls_savegame_v1). Neither records WHO it belongs to -- root.profile.accountId is only
 * "whoever wrote last". This module keeps that answer under its own key and never touches either save's format.
 *
 *   entry = { owner, sig }
 *     owner: an account id | "guest" | null  (null = a local save from before ownership existed: unassociated)
 *     sig:   which save instance the entry describes (career: storyId || careerId; session: "session")
 *
 * Rules: an existing save without an entry is stamped UNASSOCIATED, never auto-assigned. Writing the same career
 * again keeps its owner; only a new career is attributed to whoever is playing. The session slot has no instance
 * id, so it keeps its owner only when this page resumed it through Continue. A signed-in player may claim an
 * unassociated save after explicit confirmation; a claimed save can't be claimed again. Claiming only manages
 * ownership -- it can't prove the claimer was the original player.
 */
import { ACTIVE_ACCOUNT_KEY } from "./accountKeys.js";

export const OWNERS_KEY = "cls_save_owners_v1";
export const GUEST = "guest";

const store = (storage) => storage ?? globalThis.localStorage ?? null;
let ready = false; // writes before the boot-time stamp are not attributed (they are legacy migration)
const resumed = { session: false };

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

export const careerSig = (root) => (root?.leagueCareer ? root.story?.storyId || root.leagueCareer.careerId || "career" : null);
export const sessionSig = (data) => (data ? "session" : null);

/** Boot: any save that exists without an entry is a legacy local save -> unassociated. Stale entries go. */
export function stampLegacySaves({ career = null, session = null } = {}, storage) {
  const all = readAll(storage);
  let changed = false;
  for (const [slot, sig] of [["career", careerSig(career)], ["session", sessionSig(session)]]) {
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

export function markSessionResumed() {
  resumed.session = true;
}

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
  const sameInstance = prev && (slot === "session" ? resumed.session : prev.sig === sig);
  if (sameInstance) return;
  all[slot] = { owner: currentOwner(storage), sig };
  writeAll(all, storage);
}

export function clearSaveOwner(slot, storage) {
  if (slot === "session") resumed.session = false;
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
  return entry.owner === currentOwner(storage) ? "mine" : "other";
}

/** Explicit claim of an unassociated save by the signed-in account. Never deletes or edits the save. */
export function claimSave(slot, sig, storage) {
  const owner = currentOwner(storage);
  if (owner === GUEST) return { ok: false, reason: "guest" };
  if (!sig) return { ok: false, reason: "missing" };
  const all = readAll(storage);
  const entry = all[slot];
  if (entry && entry.sig === sig && entry.owner != null) {
    return { ok: false, reason: entry.owner === owner ? "already_yours" : "claimed" };
  }
  all[slot] = { owner, sig, claimedAt: Date.now() };
  return writeAll(all, storage) ? { ok: true } : { ok: false, reason: "storage" };
}

/** Test seam: forget module state between unit tests. */
export function _resetOwnershipForTests() {
  ready = false;
  resumed.session = false;
}
