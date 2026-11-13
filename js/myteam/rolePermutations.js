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
