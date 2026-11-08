/**
 * Courtside Radio library: the player's own imported audio, kept in this browser (IndexedDB) and nowhere else.
 * Nothing is uploaded, synced or committed. If IndexedDB is unavailable the list lives in memory for the session.
 * Scoped by profile, so an account's songs are not offered to the guest or to another account.
 */

export const MAX_TRACKS = 30;
export const MAX_BYTES = 30 * 1024 * 1024;
const DB = "cls-radio-v1";
const STORE = "tracks";
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

let memory = []; // used when IndexedDB is missing/blocked, and by tests
let persistent = true;

const openDb = () =>
  new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("no-indexeddb"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async (mode, fn) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
};

const idb = {
  all: () => tx("readonly", (s) => s.getAll()),
  put: (rec) => tx("readwrite", (s) => s.put(rec)),
  del: (id) => tx("readwrite", (s) => s.delete(id)),
};

async function viaIdb(op, ...args) {
  if (!persistent) return null;
  try { return await idb[op](...args); } catch { persistent = false; return null; }
}

export const isPersistent = () => persistent;
export const _resetForTests = () => { memory = []; persistent = false; };

export const isAudioFile = (f) => !!f && (String(f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name || ""));
const titleOf = (name) => String(name || "Untitled").replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Untitled";

/** Tracks of one profile, oldest first. Blobs are not loaded into the list (they stay in storage until played). */
export async function listTracks(profile) {
  const rows = (await viaIdb("all")) || memory;
  return rows.filter((r) => r.profile === profile).sort((a, b) => a.addedAt - b.addedAt).map(({ id, name, size, addedAt }) => ({ id, name, size, addedAt }));
}

export async function getBlob(profile, id) {
  const rows = (await viaIdb("all")) || memory;
  const rec = rows.find((r) => r.id === id && r.profile === profile);
  return rec?.blob || null;
}

/** Add files; returns what was kept and what was refused (with a reason) so the UI can say so. */
export async function addFiles(profile, files) {
  const added = [];
  const rejected = [];
  let count = (await listTracks(profile)).length;
  for (const f of Array.from(files || [])) {
    if (!isAudioFile(f)) { rejected.push({ name: f.name, reason: "not-audio" }); continue; }
    if (f.size > MAX_BYTES) { rejected.push({ name: f.name, reason: "too-big" }); continue; }
    if (count >= MAX_TRACKS) { rejected.push({ name: f.name, reason: "full" }); continue; }
    const rec = { id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, profile, name: titleOf(f.name), size: f.size, addedAt: Date.now(), blob: f };
    if ((await viaIdb("put", rec)) === null) memory.push(rec);
    added.push({ id: rec.id, name: rec.name, size: rec.size, addedAt: rec.addedAt });
    count++;
  }
  return { added, rejected };
}

export async function removeTrack(profile, id) {
  memory = memory.filter((r) => !(r.id === id && r.profile === profile));
  await viaIdb("del", id);
}
