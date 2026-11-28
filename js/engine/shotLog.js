/**
 * Shot-zone and signature-move tallies (Skills M1a). Pure bookkeeping: no RNG, no game rule reads it.
 *
 * Lives on `player.shotLog`, NOT on `player.stats` (stats are spread, summed key by key and shown in box scores; a nested object
 * there would break them). The log is created on a player's first tallied shot, so a player who never shot, and every old save,
 * simply has none: "no log" means unknown or none, never a fabricated zero.
 *
 *   shotLog = { paint|mid|three: { a, m, sa, sm }, sig: { [skillId]: { u, m } } }
 *     a / m    field-goal attempts / makes in that zone (same rule as `stats.fga`: a miss that draws a shooting foul is not an attempt)
 *     sa / sm  the same, only when the shot was SELF-CREATED: nobody fed him a kick-out / hand-off / pick-and-roll pass this possession
 *     u / m    times the signature move fired / times that shot went in
 *
 * Honest limit: the engine records no shot TYPE (no stepback, no post-up). "Self-created" is the real fact that separates an
 * off-the-dribble three from a catch-and-shoot one, and a driven or posted paint shot from a fed finish. It is a proxy for the
 * move, not proof of it, and the awakening text must say so.
 */
export const SHOT_ZONES = Object.freeze(["paint", "mid", "three"]);

const slot = () => ({ a: 0, m: 0, sa: 0, sm: 0 });

function logOf(p) {
  if (!p.shotLog) p.shotLog = { paint: slot(), mid: slot(), three: slot(), sig: {} };
  return p.shotLog;
}

/** One resolved field-goal attempt. `sigId`: the signature move that fired on this shot, if any. */
export function tallyShot(p, zone, { made = false, selfCreated = false, sigId = null } = {}) {
  if (!p || !SHOT_ZONES.includes(zone)) return;
  const z = logOf(p)[zone];
  z.a += 1;
  if (selfCreated) z.sa += 1;
  if (made) {
    z.m += 1;
    if (selfCreated) z.sm += 1;
    if (sigId) tallySignature(p, sigId, { made: true });
  }
}

/** A signature move fired (`made` false) or its shot went in (`made` true). */
export function tallySignature(p, id, { made = false } = {}) {
  if (!p || !id) return;
  const sig = logOf(p).sig;
  const row = sig[id] || (sig[id] = { u: 0, m: 0 });
  if (made) row.m += 1;
  else row.u += 1;
}

/** A plain-data copy for a game report, or null when the player never shot. */
export function shotLogOf(p) {
  if (!p?.shotLog) return null;
  const { paint, mid, three, sig } = p.shotLog;
  return { paint: { ...paint }, mid: { ...mid }, three: { ...three }, sig: Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, { ...v }])) };
}
