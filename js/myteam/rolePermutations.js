/** Distinct ordered picks of `k` items from `pool` (by index, so duplicate jobs like two "spacer" slots are fine). */
export function* permutations(pool, k) {
  const n = pool.length;
  const used = new Array(n).fill(false);
  const cur = [];
  function* go() {
    if (cur.length === k) { yield cur.map((i) => pool[i]); return; }
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      if (used[i] || seen.has(pool[i])) continue; // skip equal jobs at this depth: same result, 24x fewer branches
      seen.add(pool[i]);
      used[i] = true;
      cur.push(i);
      yield* go();
      cur.pop();
      used[i] = false;
    }
  }
  yield* go();
}

const listCache = new Map();
/**
 * The same picks as `permutations`, as a list that is built once per (pool, k) and shared: a system's job list is the same for every
 * lineup that is scored (792 per opponent panel), and re-running the generator for each was a third of the role-assignment time.
 * Callers must not edit the returned arrays.
 */
export function permutationList(pool, k) {
  const key = `${pool.join("|")}#${k}`;
  let list = listCache.get(key);
  if (!list) listCache.set(key, (list = [...permutations(pool, k)]));
  return list;
}

