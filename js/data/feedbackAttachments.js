/**
 * Player Voice attachment DRAFT, per owner, on this device only. Images live in IndexedDB (a few MB of screenshots
 * would blow the localStorage quota that saves share). Nothing here uploads anything; the screen hands the blobs to
 * the injected submit function, and only a confirmed success clears the draft.
 * The backend is injectable: tests use memoryBackend(); the browser uses IndexedDB, or null when it is unavailable.
 */
import { FEEDBACK_IMAGE_MAX, FEEDBACK_IMAGE_TYPES } from "./feedbackImages.js";

const DB = "cls_feedback_files";
const STORE = "drafts";
const keyOf = (owner) => `attach_v1:${owner || "guest"}`;

export function memoryBackend() {
  const m = new Map();
  return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } };
}

/** IndexedDB backend, or null when the browser has none / blocks it (private mode, disabled storage). */
export function idbBackend(factory = globalThis.indexedDB) {
  if (!factory) return null;
  const open = () => new Promise((resolve, reject) => {
    const req = factory.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
  const run = async (mode, fn) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const out = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(out?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("aborted"));
      });
    } finally {
      db.close();
    }
  };
  return {
    get: (k) => run("readonly", (s) => s.get(k)),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)),
    del: (k) => run("readwrite", (s) => s.delete(k)),
  };
}

const isBlob = (b) => !!b && typeof b === "object" && typeof b.size === "number" && typeof b.slice === "function";

/** Whatever storage hands back is coerced into valid attachments; anything malformed is dropped. */
export function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object" && typeof a.id === "string" && isBlob(a.blob) && a.blob.size > 0 && FEEDBACK_IMAGE_TYPES.includes(a.type))
    .slice(0, FEEDBACK_IMAGE_MAX)
    .map((a) => ({ id: a.id, name: String(a.name || "image").slice(0, 60), type: a.type, size: a.blob.size, width: Number(a.width) || 0, height: Number(a.height) || 0, blob: a.blob }));
}

export async function readAttachments(owner, backend = idbBackend()) {
  try {
    return backend ? normalizeAttachments(await backend.get(keyOf(owner))) : [];
  } catch {
    return [];
  }
}

/** An empty list removes the entry. Returns false when the browser refused (the screen says so; nothing throws). */
export async function writeAttachments(owner, list, backend = idbBackend()) {
  try {
    if (!backend) return false;
    const clean = normalizeAttachments(list);
    if (clean.length) await backend.set(keyOf(owner), clean);
    else await backend.del(keyOf(owner));
    return true;
  } catch {
    return false;
  }
}

export const clearAttachments = (owner, backend) => writeAttachments(owner, [], backend);
