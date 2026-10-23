/**
 * Tiny deterministic RNG helpers shared by card rolls, banners and tests.
 * Pure functions only — no Math.random inside, callers inject randomness.
 */

/** FNV-1a 32-bit string hash → unsigned int seed. */
export function hashSeed(str) {
  let h = 2166136261;
  const text = String(str);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: returns a () => [0, 1) stream for the given seed. */
export function seededStream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Fisher-Yates shuffle, returning a new array (never mutates `arr`). Defaults to Math.random for
 * call sites that don't care about determinism, but accepts an injected rng (e.g. a seededStream)
 * for reproducible tests -- this used to be copy-pasted identically into five different files
 * (app.js, draft.js, seasonDraft.js, season.js, careerBracket.js); one copy here, please.
 */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
