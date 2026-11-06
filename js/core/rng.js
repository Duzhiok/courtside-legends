/**
 * Injectable randomness for the match engine (M2b-0).
 *
 * `rand()` forwards to whatever source is current -- `Math.random` unless a caller wrapped the work
 * in `withRng(source, fn)`. With no source injected the call order and values are exactly what they
 * were when the engine called Math.random directly, so default play is byte-for-byte unchanged.
 *
 * Scope is module-level (one game at a time per JS realm): fine for a browser tab and for tests
 * that run in sequence. A server that ever simulates games in parallel in one process must pass the
 * source explicitly instead.
 */
/** null = "whatever Math.random is right now" (looked up per call, so tests that swap it still work). */
let source = null;

/** Next value in [0, 1) from the current source. */
export function rand() {
  return source ? source() : Math.random();
}

/** Run `fn` with `rng` as the source (nesting-safe, always restored). No `rng` -> just run `fn`. */
export function withRng(rng, fn) {
  if (typeof rng !== "function") return fn();
  const prev = source;
  source = rng;
  try {
    return fn();
  } finally {
    source = prev;
  }
}
