/**
 * M3 domain-event adapter (ROADMAP §6).
 *
 * The engine's `emit` only has 5 raw types (`coach` / `dunk` / `miss` /
 * `reb` / `score`) at possession-summary granularity (BASELINE_AUDIT §3).
 * This adapter derives the event types that have no dedicated emit from
 * snapshot diffs, so the render layer (and future milestones) can subscribe
 * to a typed stream without the engine growing a second event format:
 *
 *   POSSESSION_START — snapshot.possession flips (or the first observation)
 *   SUBSTITUTION     — onCourt id sets change on either side
 *   PERIOD_END       — snapshot.quarter increments (the period that ended)
 *   PERIOD_START     — the new period begins
 *   MATCH_END        — observeEnd() with the final snapshot
 *
 * Meta fields reuse the M2b naming conventions (noun-keyed objects, `*Id`
 * fields — meta.shot / meta.skill / meta.clutchOutcome): the derived events
 * carry `meta.sub = { inId, outId, side }` etc. Raw events are NOT re-emitted
 * here; the app keeps calling handleSimEvent for them. Derivation runs only
 * on ticks (onTick fires once per resolved possession in live games), never
 * on raw events, so one game fact is never derived twice. In `_quiet` mode
 * (runFast) onTick does not fire and the adapter stays silent — by design.
 *
 * Pure module: no DOM, no Math.random, no sim imports. The app wires it as:
 *   adapter.observeTick(snap) inside both onTick handlers
 *   adapter.observeEnd(snap) inside both onEnd handlers
 */

export const DOMAIN_EVENT_TYPES = Object.freeze([
  "POSSESSION_START",
  "SUBSTITUTION",
  "PERIOD_END",
  "PERIOD_START",
  "MATCH_END",
]);

function onCourtIds(team) {
  return (team?.onCourt || []).map((p) => p.id);
}

function diffSubs(prevIds, nextIds) {
  const prev = new Set(prevIds);
  const next = new Set(nextIds);
  const out = prevIds.filter((id) => !next.has(id));
  const inn = nextIds.filter((id) => !prev.has(id));
  // Pair them in order; a rotation that swaps two at once yields two pairs.
  const pairs = [];
  for (let i = 0; i < Math.max(out.length, inn.length); i++) {
    pairs.push({ outId: out[i] ?? null, inId: inn[i] ?? null });
  }
  return pairs;
}

export function createDomainEventAdapter({ onDomainEvent } = {}) {
  if (typeof onDomainEvent !== "function") {
    throw new Error("createDomainEventAdapter needs onDomainEvent");
  }
  let prev = null;
  let ended = false;

  const emit = (type, meta, snapshot) => {
    onDomainEvent({ type, meta, snapshot });
  };

  return {
    /** Feed the latest snapshot (from onTick). Derives and emits any new domain events. */
    observeTick(snap) {
      if (!snap || typeof snap !== "object" || ended) return [];
      const out = [];
      const fire = (type, meta) => {
        const evt = { type, meta, snapshot: snap };
        out.push(evt);
        emit(type, meta, snap);
      };
      if (!prev) {
        // Tip-off: the first possession is already in progress.
        if (snap.possession) {
          fire("POSSESSION_START", {
            possession: snap.possession,
            quarter: snap.quarter,
            clock: snap.clock,
          });
        }
        prev = snap;
        return out;
      }
      if (snap.quarter !== prev.quarter) {
        fire("PERIOD_END", { quarter: prev.quarter, nextQuarter: snap.quarter });
        fire("PERIOD_START", { quarter: snap.quarter, clock: snap.clock });
      }
      if (snap.possession && snap.possession !== prev.possession) {
        fire("POSSESSION_START", {
          possession: snap.possession,
          quarter: snap.quarter,
          clock: snap.clock,
        });
      }
      for (const side of ["home", "away"]) {
        const pairs = diffSubs(onCourtIds(prev[side]), onCourtIds(snap[side]));
        for (const pair of pairs) {
          if (!pair.inId && !pair.outId) continue;
          fire("SUBSTITUTION", { sub: { ...pair, side } });
        }
      }
      prev = snap;
      return out;
    },

    /** The game is over: emit MATCH_END once with the final snapshot. */
    observeEnd(snap) {
      if (ended || !snap || typeof snap !== "object") return null;
      ended = true;
      const evt = { type: "MATCH_END", meta: { score: { ...(snap.score || {}) } }, snapshot: snap };
      emit("MATCH_END", evt.meta, snap);
      return evt;
    },

    /** Forget everything (new game / restore): the next tick is a tip-off again. */
    reset() {
      prev = null;
      ended = false;
    },
  };
}
