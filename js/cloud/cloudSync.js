/**
 * Cloud save sync for the long-career root save (DB Phase 1, docs/implementation/DB-PHASE0-AUDIT.md).
 * NO network and NO credentials here: the server is an injected `transport`
 *   get({ slot })                                          -> { revision, schemaVersion, data } | null
 *   put({ slot, expectedRevision, schemaVersion, data, idempotencyKey }) -> { revision } | { conflict: true, revision }
 * so every rule below is unit-testable against an in-memory fake, and a real Supabase project is just one more transport.
 *
 * Rules (audit "Consequences for the design"):
 *   - compare-and-swap on `revision`; a stale write is a CONFLICT the player resolves, never last-writer-wins;
 *   - the idempotency key is derived from (slot, expected revision, content), so a retried or lost-response upload
 *     is applied once;
 *   - cloud data is validated through importRootSave (same checks + migration as a file import) before anything local
 *     is touched; the local save is backed up first, and writeRootSave keeps its own save-ownership guard;
 *   - nothing is ever overwritten silently: sync() only ever UPLOADS when the cloud has not moved; everything else is
 *     reported (`cloud-newer`, `conflict`) and waits for restore() / keepLocal().
 */
import { ROOT_SAVE_VERSION, exportRootSave, importRootSave, readRootSave, writeRootSave } from "../data/saveRoot.js";

export const SYNC_STATE_KEY = "cls_cloud_sync_v1";
export const SYNC_BACKUP_KEY = "cls_cloud_backup_v1";
export const CAREER_SLOT = "career";

/** FNV-1a 32-bit as hex: a stable content fingerprint. */
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Fingerprint of what the player did, not of when it was written (savedAt moves on every save). */
export function contentHash(root) {
  const { savedAt: _ignored, ...rest } = root;
  return fnv(JSON.stringify(rest));
}

/** Does the cloud row hold the same content as this root? (An unreadable row counts as "no".) */
function cloudHolds(remote, root) {
  try {
    return contentHash(importRootSave(remote.data)) === contentHash(root);
  } catch {
    return false;
  }
}

export function createCloudSync({ storage, transport, slot = CAREER_SLOT }) {
  const readState = () => {
    try {
      return JSON.parse(storage.getItem(SYNC_STATE_KEY) || "{}")[slot] || { revision: 0, hash: null };
    } catch {
      return { revision: 0, hash: null };
    }
  };
  const remember = (entry) => {
    let all = {};
    try {
      all = JSON.parse(storage.getItem(SYNC_STATE_KEY) || "{}");
    } catch {
      all = {};
    }
    storage.setItem(SYNC_STATE_KEY, JSON.stringify({ ...all, [slot]: entry }));
  };

  async function upload(root, expectedRevision) {
    const hash = contentHash(root);
    let res;
    try {
      res = await transport.put({
        slot,
        expectedRevision,
        schemaVersion: ROOT_SAVE_VERSION,
        data: exportRootSave(root),
        idempotencyKey: `${slot}:${expectedRevision}:${hash}`,
      });
    } catch (error) {
      return { status: "offline", error: error.message };
    }
    if (res.conflict) return { status: "conflict", cloudRevision: res.revision };
    remember({ revision: res.revision, hash });
    return { status: "uploaded", revision: res.revision };
  }

  /** Look at both sides and upload only when that is provably safe. */
  async function sync() {
    const root = readRootSave(storage);
    let remote;
    try {
      remote = await transport.get({ slot });
    } catch (error) {
      return { status: "offline", error: error.message };
    }
    const known = readState();
    const localChanged = !!root && contentHash(root) !== known.hash;
    if (!remote) return root ? upload(root, 0) : { status: "empty" };
    if (remote.revision === known.revision) return localChanged ? upload(root, remote.revision) : { status: "up-to-date", revision: remote.revision };
    // The cloud moved. If it already holds exactly what this device has (a lost-response retry, or the same career
    // opened on two devices), adopt its revision instead of calling it a conflict.
    if (localChanged && cloudHolds(remote, root)) {
      remember({ revision: remote.revision, hash: contentHash(root) });
      return { status: "up-to-date", revision: remote.revision };
    }
    return localChanged ? { status: "conflict", cloudRevision: remote.revision } : { status: "cloud-newer", cloudRevision: remote.revision };
  }

  /** The player chose the cloud copy. Validates first, backs the local save up, never writes an invalid or foreign save. */
  async function restore() {
    let remote;
    try {
      remote = await transport.get({ slot });
    } catch (error) {
      return { status: "offline", error: error.message };
    }
    if (!remote) return { status: "empty" };
    let incoming;
    try {
      incoming = importRootSave(remote.data);
    } catch (error) {
      return { status: "invalid-cloud", error: error.message };
    }
    const current = readRootSave(storage);
    if (current) storage.setItem(SYNC_BACKUP_KEY, exportRootSave(current));
    try {
      writeRootSave(incoming, storage);
    } catch (error) {
      return { status: "blocked", error: error.message };
    }
    remember({ revision: remote.revision, hash: contentHash(incoming) });
    return { status: "restored", revision: remote.revision, backedUp: !!current };
  }

  /** The player chose this device's copy: an explicit, informed overwrite of the cloud (still compare-and-swap). */
  async function keepLocal() {
    const root = readRootSave(storage);
    if (!root) return { status: "empty" };
    let remote;
    try {
      remote = await transport.get({ slot });
    } catch (error) {
      return { status: "offline", error: error.message };
    }
    return upload(root, remote ? remote.revision : 0);
  }

  return { sync, restore, keepLocal, state: readState };
}
