/**
 * Promise effect table — the ONE place the trust / relationship numbers of a
 * kept or broken promise live (Career 2.0 E, unified promise engine).
 *
 * Both promise stores settle against this table, keyed by promiseType:
 *   - "inbox"        a promise made in a Career Inbox decision (core scoring).
 *   - "relationship" a promise between two people (minutes, role, start, ...).
 * The sizes differ on purpose (a relationship promise is a personal
 * commitment, so the relationship swings harder), but they are configuration
 * of one engine, not two engines. Pure data, no imports.
 */
export const PROMISE_EFFECTS = Object.freeze({
  inbox: Object.freeze({
    fulfilled: Object.freeze({ trust: 5, relationship: 3 }),
    broken: Object.freeze({ trust: -6, relationship: -4 }),
  }),
  relationship: Object.freeze({
    fulfilled: Object.freeze({ trust: 3, relationship: 8 }),
    broken: Object.freeze({ trust: -5, relationship: -12 }),
  }),
});

/** The effect pair for one promise type; unknown types fall back to "inbox". */
export function effectsForType(promiseType) {
  return PROMISE_EFFECTS[promiseType] || PROMISE_EFFECTS.inbox;
}
