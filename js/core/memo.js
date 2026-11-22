// Memoize a pure single-argument lookup whose answer repeats across a
// player's season rows (one player spans ~5 rows) but is recomputed per row
// today: signature-name regex scans, photo lookups, name-based bumps.
// The key function must identify the input fully; the tables these lookups
// read are module constants that never change at runtime, so entries never
// go stale. Distinct keys are bounded by distinct players (~4,400), so no
// eviction is needed. Array results are copied on store and on return, so a
// caller mutating its copy can never corrupt the cache.

export function memoize(fn, keyFn) {
  const cache = new Map();
  return (arg) => {
    const key = keyFn(arg);
    if (cache.has(key)) {
      const hit = cache.get(key);
      return Array.isArray(hit) ? [...hit] : hit;
    }
    const value = fn(arg);
    cache.set(key, Array.isArray(value) ? [...value] : value);
    return Array.isArray(value) ? [...value] : value;
  };
}
