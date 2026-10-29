/**
 * Condition-based event pool (A2 of docs/CAREER_LIFE_ROADMAP.md).
 *
 * The original design (docs/CAREER_LIFE_ROADMAP.md's "before") hardcoded six events to a single
 * linear chapter chain keyed off `startOffset` (years since the career began). That can't express
 * anything B-F actually need: an event that only fires if you were just fired, a press conference
 * that only fires after a blowout, a recruiting pitch that only fires with enough reputation.
 *
 * This module replaces `startOffset` with `conditions` (tenure year range, trust/pressure/mood/
 * reputation range, required/forbidden flags, repeatable + cooldown) and a pure matching/selection
 * algorithm. js/story/eventEngine.js owns the actual 6 events (EVENT_POOL lives there, not here --
 * this module only owns the *mechanics* of picking from a pool, so it has no opinion about what
 * events exist) and keeps its public API identical; this file is purely internal machinery.
 *
 * Selection stays deterministic: among eligible events, the one with the lowest `order` wins,
 * ties broken by pool order (Array.prototype.sort is stable). That exactly reproduces the old
 * find-the-first-eligible-event behavior for events that still use a single `order` value per
 * tenure year. Probabilistic selection is opt-in via pickWeightedRandom(), which nothing calls
 * yet -- future phases (e.g. E2 press conferences) can reach for it when they actually want
 * flavor-event randomness instead of a fixed story beat.
 */

/** True when every condition on the event is satisfied by ctx. ctx fields are all optional;
 * an event with no matching condition for a given dimension is simply not gated by it. */
export function eventMatches(event, ctx) {
  const c = event.conditions || {};
  const checks = [
    [c.minTenureYear, ctx.tenureYear, (v, t) => t >= v],
    [c.maxTenureYear, ctx.tenureYear, (v, t) => t <= v],
    [c.minTrust, ctx.trust, (v, t) => t >= v],
    [c.maxTrust, ctx.trust, (v, t) => t <= v],
    [c.minPressure, ctx.pressure, (v, t) => t >= v],
    [c.maxPressure, ctx.pressure, (v, t) => t <= v],
    [c.minMood, ctx.mood, (v, t) => t >= v],
    [c.maxMood, ctx.mood, (v, t) => t <= v],
    [c.minReputation, ctx.reputation, (v, t) => t >= v],
    [c.maxReputation, ctx.reputation, (v, t) => t <= v],
  ];
  for (const [threshold, actual, test] of checks) {
    if (!Number.isFinite(threshold)) continue;
    if (!Number.isFinite(actual) || !test(threshold, actual)) return false;
  }
  const flags = ctx.flags || {};
  if (Array.isArray(c.requiresFlags) && !c.requiresFlags.every((flag) => flags[flag])) {
    return false;
  }
  if (Array.isArray(c.forbidsFlags) && c.forbidsFlags.some((flag) => flags[flag])) {
    return false;
  }
  return true;
}

function resolvedYears(eventId, eventLog) {
  return eventLog
    .filter((entry) => entry.type === "story-choice" && entry.eventId === eventId)
    .map((entry) => entry.year)
    .filter((year) => Number.isInteger(year));
}

/**
 * True once an event can no longer fire right now: a non-repeatable event that has fired even
 * once is done forever (same as the old isEventResolved() rule); a repeatable event is blocked
 * only while still inside its own cooldownYears window since its most recent occurrence.
 */
export function eventOnCooldown(event, eventLog, currentYear) {
  const years = resolvedYears(event.id, eventLog);
  if (years.length === 0) return false;
  if (!event.repeatable) return true;
  const cooldown = Number.isFinite(event.conditions?.cooldownYears) ? event.conditions.cooldownYears : 0;
  if (cooldown <= 0) return false;
  const mostRecent = Math.max(...years);
  return !Number.isInteger(currentYear) || currentYear - mostRecent < cooldown;
}

/** Events from `pool` that could fire right now, in pool order. */
export function eligibleEvents(pool, eventLog, ctx) {
  return pool.filter(
    (event) => !eventOnCooldown(event, eventLog, ctx.currentYear) && eventMatches(event, ctx),
  );
}

/** Deterministic pick: lowest `order` among eligible events, ties broken by pool order. */
export function pickNextEvent(pool, eventLog, ctx) {
  const eligible = eligibleEvents(pool, eventLog, ctx);
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
}

/**
 * Weighted random pick among a caller-supplied candidate list (not tied to cooldown/matching --
 * callers run eligibleEvents() first). `rng` is injectable so this stays deterministically
 * testable; defaults to Math.random for real play. Events without a `weight` count as 1.
 */
export function pickWeightedRandom(candidates, rng = Math.random) {
  if (!candidates.length) return null;
  const weights = candidates.map((event) =>
    Number.isFinite(event.weight) && event.weight > 0 ? event.weight : 1,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
