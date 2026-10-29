/**
 * Local cache for the full roster:
 * 1) IndexedDB — processed season cards in chunks (skip seasonToCard rebuild)
 * 2) Cache Storage — raw roster.json (skip network on rebuild)
 * 3) roster.meta.json — tiny file to validate cache without parsing 6MB JSON
 *
 * Cards are stored in CHUNKS so reading/writing does not freeze the tab for minutes.
 * Bump SCHEMA when card fields / intangibles logic change so old caches invalidate.
 */
// tests/cardSchema.test.js fails when the cards this app builds change without a bump here.
export const ROSTER_SCHEMA = 55; // bump: Cousins paint_bully was registered in TRAIT_SKILLS but curatedOnly gating only checks SIGNATURE_SKILLS, so it was silently dropped -- moved him + soft_touch into SIGNATURE_SKILLS; added new LeBron signature skill rim_rush (冲框)
// stopped overriding his `three` rating with a flat 66-80 regardless of season -- real NBA2K
// data rated his jumper in the high 70s EVERY year even in his worst shooting seasons (28.5%
// in 2019, 27.0% in 2021) and only matched the box-score formula in his genuinely good
// shooting years (2016 at 38.8%, 2024 at 39.5%). Dropped the anchor override for `three` on
// seasons with real box-score data (2015-2025) so it now swings 46-77 with his actual accuracy
// instead of sitting in the high-70s no matter how he actually shot that year.
// (schema 49 was: Isiah Thomas (thomais01, 活塞坏小子队长) gets a signature
// kit (场上指挥家/传球魔术/杀手时刻/劲爆第一步) instead of no skills at all -- distinct from the
// other Isaiah Thomas (thomais02) one letter off in the name.
// schema 48 was: Isaiah Thomas (thomais02, 微笑刺客) gets a signature kit (杀手时刻/抛投大师/
// 无解单打/节奏大师) instead of no skills at all.
// schema 47 was: Wikipedia auto-discovery tier (photos.wiki.js) adds ~2,560 credited real
// photos covering ~2,630 people who previously had no portrait beyond the bbref hotlink/
// generated avatar -- see scripts/photos/discover-wiki.mjs.
// schema 46 was: Matt Barnes gets 场上恶汉 (enforcer); Paul George drops 三分雨/中投大师
// for 运球节奏大师, keeps 中投刺客. schema 45 was: fixed PF-era players stuck at SF --
// Garnett/Malone/Barkley/Rodman/McHale/Oakley/Willis/Kemp/etc. -- Rondo stuck at SF, Rondo/Butler
// given signature skill kits, hiddenTier no longer requires ppg alone, Middleton height fixed)
const DB_NAME = "courtside-legends";
const STORE = "roster";
const DB_VERSION = 2;
const CACHE_NAME = "courtside-roster-raw";
const META_URL = "./js/data/roster.meta.json";
const LS_KEY = "courtside-roster-cache-key";
const CHUNK = 1500;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb open failed"));
  });
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function yieldPaint() {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * A remembered key from an older ROSTER_SCHEMA must never be loaded. The fast path used to
 * trust whatever key localStorage remembered, so a bump only took effect one reload later —
 * and cards built by old code (with old skills) survived code changes.
 */
export function isCurrentSchemaKey(key) {
  return typeof key === "string" && key.startsWith(`v${ROSTER_SCHEMA}|`);
}

export function rosterCacheKey(meta) {
  return `v${ROSTER_SCHEMA}|${meta.version ?? "?"}|${meta.generated ?? "?"}|${meta.count ?? 0}`;
}

function rememberKey(meta, key) {
  try {
    localStorage.setItem(LS_KEY, key);
  } catch (_) {
    /* private mode / quota */
  }
}

function rememberedKey() {
  try {
    return localStorage.getItem(LS_KEY) || null;
  } catch (_) {
    return null;
  }
}

function chunkKey(base, i) {
  return `${base}::c${i}`;
}

function manifestKey(base) {
  return `${base}::manifest`;
}

/** Tiny metadata fetch (~100 bytes). */
export async function fetchRosterMeta() {
  const res = await fetch(META_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`roster.meta.json HTTP ${res.status}`);
  return res.json();
}

/** Load chunked players for a cache key; yields between chunks for UI. */
async function loadChunks(baseKey, onProgress) {
  const man = await idbGet(manifestKey(baseKey));
  if (!man?.chunks || !man.count) {
    // Legacy single-blob format (schema ≤4)
    const legacy = await idbGet(baseKey);
    if (legacy?.players?.length) return legacy.players;
    return null;
  }
  const out = new Array(man.count);
  let filled = 0;
  for (let i = 0; i < man.chunks; i++) {
    const part = await idbGet(chunkKey(baseKey, i));
    const arr = part?.players;
    if (!arr?.length) return null;
    for (let j = 0; j < arr.length; j++) out[filled++] = arr[j];
    onProgress?.(0.1 + 0.75 * ((i + 1) / man.chunks), "cache");
    await yieldPaint();
  }
  if (filled !== man.count) return null;
  return out;
}

/**
 * Fast path: IndexedDB processed cards without parsing roster.json.
 */
export async function loadCachedPlayersFast(onProgress) {
  onProgress?.(0.04, "cache");
  await yieldPaint();

  try {
    const tryLoad = async (key) => {
      if (!key) return null;
      onProgress?.(0.08, "cache");
      await yieldPaint();
      return loadChunks(key, onProgress);
    };

    const remembered = rememberedKey();
    const hit = isCurrentSchemaKey(remembered) ? await tryLoad(remembered) : null;
    if (hit?.length) {
      revalidateMetaInBackground(remembered);
      onProgress?.(0.92, "cache");
      return hit;
    }

    onProgress?.(0.1, "cache");
    const meta = await fetchRosterMeta();
    const key = rosterCacheKey(meta);
    const hit2 = await tryLoad(key);
    if (hit2?.length) {
      rememberKey(meta, key);
      onProgress?.(0.92, "cache");
      return hit2;
    }
  } catch (e) {
    console.warn("[rosterCache] fast path failed", e);
  }
  return null;
}

function revalidateMetaInBackground(cachedKey) {
  if (!cachedKey) return;
  fetchRosterMeta()
    .then((meta) => {
      const next = rosterCacheKey(meta);
      if (next !== cachedKey) {
        console.info("[rosterCache] meta changed — next reload will rebuild", { cachedKey, next });
        try {
          localStorage.removeItem(LS_KEY);
        } catch (_) {
          /* ignore */
        }
      }
    })
    .catch(() => {});
}

export async function loadCachedPlayers(meta) {
  try {
    const key = rosterCacheKey(meta);
    const players = await loadChunks(key, null);
    if (players?.length && players.length === (meta.count || players.length)) {
      rememberKey(meta, key);
      return players;
    }
  } catch (e) {
    console.warn("[rosterCache] read failed", e);
  }
  return null;
}

/** Persist processed cards in chunks (background OK). */
export async function saveCachedPlayers(meta, players) {
  const key = rosterCacheKey(meta);
  try {
    const chunks = Math.ceil(players.length / CHUNK);
    await idbPut(manifestKey(key), {
      key,
      meta,
      schema: ROSTER_SCHEMA,
      count: players.length,
      chunks,
      chunkSize: CHUNK,
      savedAt: Date.now(),
    });
    for (let i = 0; i < chunks; i++) {
      const slice = players.slice(i * CHUNK, (i + 1) * CHUNK);
      await idbPut(chunkKey(key, i), { i, players: slice });
      await yieldPaint();
    }
    // Drop legacy blob if present
    try {
      await idbDelete(key);
    } catch (_) {
      /* ignore */
    }
    rememberKey(meta, key);
    console.info(`[rosterCache] saved ${players.length} cards in ${chunks} chunks → ${key}`);
  } catch (e) {
    console.warn("[rosterCache] write failed (quota?). Rebuild will run every visit until this works.", e);
    try {
      localStorage.removeItem(LS_KEY);
    } catch (_) {
      /* ignore */
    }
  }
}

/** Fetch roster.json via Cache Storage when possible. */
export async function fetchRosterJson(url = "./js/data/roster.json", onProgress) {
  onProgress?.(0.05, "download");
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        onProgress?.(0.1, "cache");
        await yieldPaint();
        const data = await hit.json();
        onProgress?.(0.2, "download");
        return { data, fromCache: true };
      }
    } catch (e) {
      console.warn("[rosterCache] cache read", e);
    }
  }

  onProgress?.(0.08, "download");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`roster.json HTTP ${res.status}`);
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url, res.clone());
    } catch (e) {
      console.warn("[rosterCache] cache write", e);
    }
  }
  onProgress?.(0.12, "download");
  await yieldPaint();
  const data = await res.json();
  onProgress?.(0.2, "download");
  return { data, fromCache: false };
}

export async function clearRosterCache() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (_) {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
  } catch (_) {
    /* ignore */
  }
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {
    /* ignore */
  }
}
