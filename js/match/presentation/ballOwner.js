/**
 * Who has the ball, from GameSim's own actor ids — never guessed, never simulated.
 *
 * `ballHolders(kind, meta)` answers, for one event: who held the ball just before it (`before`) and who holds it just after
 * (`after`). `undefined` means "this event says nothing about the ball"; `null` means "nobody has it" (in the air, loose, dead).
 *
 *   pass      passerId -> receiverId
 *   shot      shooterId -> null (in flight)
 *   dunk      the dunker -> null
 *   rebound   -> rebounderId
 *   turnover  the ball handler -> the stealer on a steal (forcedById), otherwise null
 *
 * `openingHolder(events, from)` is who has the ball when a possession starts: the first player an event of that same possession
 * names as holding it. GameSim resolves the whole possession before anything is shown, so this reads facts already decided; it
 * does not look into a future the sim has not played.
 *
 * Pure: no DOM, no randomness, no engine imports.
 */

export function ballHolders(kind, meta = {}) {
  const m = meta || {};
  if (m.pass?.passerId) return { before: m.pass.passerId, after: m.pass.receiverId ?? null };
  if (m.shot?.shooterId) return { before: m.shot.shooterId, after: null };
  if (kind === "dunk" && m.player?.id) return { before: m.player.id, after: null };
  if (m.reb?.rebounderId) return { before: undefined, after: m.reb.rebounderId };
  if (m.turnover?.actorId) {
    return { before: m.turnover.actorId, after: m.turnover.kind === "steal" ? m.turnover.forcedById ?? null : null };
  }
  return {};
}

/** The first player named as holding the ball by the events after `from`, up to the next possession start; null if none does. */
export function openingHolder(events = [], from = 0) {
  for (let i = from + 1; i < events.length; i++) {
    const evt = events[i];
    if (!evt || evt.kind === "possession_start") break;
    const { before } = ballHolders(evt.kind, evt.meta);
    if (before) return before;
  }
  return null;
}
