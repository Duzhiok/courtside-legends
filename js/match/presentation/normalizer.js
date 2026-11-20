/**
 * PresentationEventNormalizer — 3D-S1A (docs/implementation/3D-MATCH-VIEWER-PHASE0-AUDIT.md §7).
 *
 * Merges the two event streams a match viewer can be fed into ONE stable,
 * sequenced shape:
 *   - GameSim raw `emit` events (`score` / `miss` / `dunk` / `pass` / `reb` /
 *     `coach`, each carrying the sim snapshot spread into the payload), and
 *   - `js/engine/domainEvents.js` derived events (`POSSESSION_START` /
 *     `SUBSTITUTION` / `PERIOD_START` / `PERIOD_END` / `MATCH_END`).
 *
 * Normalized shape (every field is copied from the source event/snapshot —
 * the normalizer never invents game facts):
 *
 *   {
 *     seq,         // 0-based position in THIS presentation stream: re-merging the same inputs yields the same seqs
 *     simSeq,      // GameSim's own event number (emit() stamps it) or null; for a derived event, the last raw event before it
 *     eventId,     // stable identity: "sim:<seq>" for a raw event, "drv:<after simSeq>:<kind>:<n>" for a derived one; null if unknown
 *     kind,        // "score" | "miss" | "dunk" | "pass" | "reb" | "coach" |
 *                  // "possession_start" | "substitution" | "period_start" |
 *                  // "period_end" | "match_end" (unknown types pass through, lowercased)
 *     source,      // "raw" | "derived"
 *     text,        // GameSim feed string (raw only; "" for derived events)
 *     gameTime,    // { quarter, clock } — clock seconds remaining, from the snapshot
 *     score,       // { home, away } — GameSim score at the event, from the snapshot
 *     possession,  // "home" | "away" | null, from the snapshot
 *     snapshot,    // the source snapshot, as given (reference, not cloned)
 *     meta,        // raw meta passthrough ({ shot, pass, reb, foul, turnover, sub, ... })
 *   }
 *
 * Merge order (deterministic, documented so the choreographer and the
 * preview can rely on it): quarter ascending, then clock DESCENDING (the
 * game clock counts down inside a quarter, so a smaller clock is later),
 * then a type priority that puts a period/possession START before the plays
 * that happen in it and PERIOD_END / MATCH_END after them, then arrival
 * order as the final tie-break. Events with no snapshot carry no game time
 * or score and cannot be sequenced or displayed, so they are dropped
 * (counted on the class as `dropped`; the pure function just excludes them).
 *
 * Pure module: no DOM, no Math.random, no sim imports, no GameSim changes.
 * GameSim stays the only authority — this layer only re-shapes what the
 * engine already emitted.
 */

const DERIVED_KIND = Object.freeze({
  POSSESSION_START: "possession_start",
  SUBSTITUTION: "substitution",
  PERIOD_START: "period_start",
  PERIOD_END: "period_end",
  MATCH_END: "match_end",
});

/** START events sort before the plays in their period/possession; END events sort after them. */
const TYPE_PRIORITY = Object.freeze({
  possession_start: 0,
  period_start: 0,
  period_end: 2,
  match_end: 2,
});

function normalizeKind(type, source) {
  if (source === "derived") {
    return DERIVED_KIND[type] || String(type || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }
  return String(type || "unknown").toLowerCase();
}

function toNormalized(evt, source, arrivalIndex) {
  const snap = evt?.snapshot;
  // Raw GameSim emits spread the snapshot into the payload itself
  // (emit() does `{ type, text, ...this.snapshot() }`), so a raw event
  // without a nested `snapshot` key still carries quarter/clock/score.
  const s = snap && typeof snap === "object" ? snap : evt;
  if (!s || typeof s !== "object" || typeof s.quarter !== "number" || typeof s.clock !== "number") {
    return null;
  }
  const kind = normalizeKind(evt?.type, source);
  return {
    seq: -1, // assigned after the merge sort
    simSeq: source === "raw" && Number.isInteger(evt?.seq) ? evt.seq : null,
    eventId: source === "raw" && Number.isInteger(evt?.seq) ? `sim:${evt.seq}` : null,
    kind,
    source,
    text: typeof evt?.text === "string" ? evt.text : "",
    gameTime: { quarter: s.quarter, clock: s.clock },
    score: { home: s.score?.home ?? 0, away: s.score?.away ?? 0 },
    possession: s.possession === "away" ? "away" : s.possession === "home" ? "home" : null,
    snapshot: snap && typeof snap === "object" ? snap : s,
    meta: evt?.meta && typeof evt.meta === "object" ? evt.meta : {},
    _arrival: arrivalIndex,
    _priority: TYPE_PRIORITY[kind] ?? 1,
  };
}

/**
 * Pure merge: raw GameSim emit events + derived domain events → one
 * stable-sequenced array of normalized events. Re-merging the same inputs
 * (in any interleaving of the two arrays) yields the same order and seqs.
 */
export function mergePresentationEvents(rawEvents = [], domainEvents = []) {
  const tagged = [];
  let arrival = 0;
  for (const evt of rawEvents || []) {
    const n = toNormalized(evt, "raw", arrival++);
    if (n) tagged.push(n);
  }
  for (const evt of domainEvents || []) {
    const n = toNormalized(evt, "derived", arrival++);
    if (n) tagged.push(n);
  }
  tagged.sort((a, b) => {
    if (a.gameTime.quarter !== b.gameTime.quarter) return a.gameTime.quarter - b.gameTime.quarter;
    if (a.gameTime.clock !== b.gameTime.clock) return b.gameTime.clock - a.gameTime.clock;
    if (a._priority !== b._priority) return a._priority - b._priority;
    return a._arrival - b._arrival;
  });
  for (let i = 0; i < tagged.length; i++) {
    tagged[i].seq = i;
    delete tagged[i]._arrival;
    delete tagged[i]._priority;
  }
  return tagged;
}

/**
 * Stateful ingester for live use: the app feeds raw events as GameSim emits them and derived events as the domain adapter fires
 * them, then drains a sequenced batch (once per possession). Seq numbers continue across drains so the choreographer sees one
 * unbroken stream.
 *
 * ORDER IS ARRIVAL ORDER, not a clock sort. Raw events arrive while GameSim resolves a possession; the derived POSSESSION_START
 * arrives right after, from onTick, carrying the snapshot AFTER that possession (possession already flipped to the next team) and
 * the very same clock as the possession's events. A clock sort therefore put every start in front of the possession it had just
 * closed, so the 3D court drew the next team on offense while the previous team's shot was still playing (the shooter stood on
 * defense and shot at the wrong rim). Arrival order is the causal order, so a start now heads the possession it announces.
 */
export function createPresentationEventNormalizer() {
  let buf = [];
  let nextSeq = 0;
  let dropped = 0;
  let lastRawSeq = null; // GameSim seq of the latest raw event seen
  const derivedAfter = new Map(); // `${simSeq}:${kind}` -> how many derived events of that kind followed that raw event

  const ingest = (evt, source) => {
    const n = toNormalized(evt, source, buf.length);
    if (!n) { dropped++; return; }
    delete n._arrival;
    delete n._priority;
    if (source === "raw") {
      if (n.simSeq != null) lastRawSeq = n.simSeq;
    } else {
      const key = `${lastRawSeq}:${n.kind}`;
      const k = derivedAfter.get(key) || 0;
      derivedAfter.set(key, k + 1);
      n.simSeq = lastRawSeq;
      n.eventId = `drv:${lastRawSeq ?? "start"}:${n.kind}:${k}`;
    }
    buf.push(n);
  };

  return {
    /** Feed one raw GameSim emit payload. */
    feedRaw(evt) { ingest(evt, "raw"); },
    /** Feed one derived domain event ({ type, meta, snapshot }). */
    feedDerived(evt) { ingest(evt, "derived"); },
    /** Drain everything buffered so far as sequenced normalized events, in arrival order. */
    flush() {
      const out = buf;
      buf = [];
      for (const evt of out) evt.seq = nextSeq++;
      return out;
    },
    /** Events dropped so far for lacking a usable snapshot. */
    get dropped() {
      return dropped;
    },
    /** Forget all buffered state (new game). Seq restarts at 0. */
    reset() {
      buf = [];
      nextSeq = 0;
      dropped = 0;
      lastRawSeq = null;
      derivedAfter.clear();
    },
  };
}
