/**
 * Skills M1c: the signature-move LOADOUT. A player may OWN many offensive signature moves (innate, awakened, later trained or
 * inherited) but carries only LOADOUT_SLOTS of them as active moves into a game. Pure rules, no DOM, no dice; one record on the run
 * (`reborn.player.loadout`), next to `awakening`: there is no second skill system, the catalogue stays `data/skills.js` and ownership
 * stays the card's skills.
 *
 * - An EQUIPPED move is fired on purpose (M1b) and no longer procs at random for him. An owned move that is NOT equipped goes back to
 *   its original random proc (`card.activeSignatures` carries only the equipped ones).
 * - The shared budget (2 uses a game) does not depend on how many are equipped.
 * - Changing the loadout is a between-games action (it lives on the career screen, never in a decision prompt), free, no currency.
 * - Old saves have no loadout: every owned move is "new", so the first sync equips them in card order, up to the slots, which is
 *   exactly what M1b did for anyone owning three or fewer.
 * - A move he has never used has NO usage record (unknown, never a fabricated zero); the numbers are the engine's own shot log.
 */
export const LOADOUT_SLOTS = 3;
/** Bounded memory of settled games so the usage ledger stays idempotent without growing forever. */
const SETTLED_KEEP = 120;

const list = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);

/** The normalised loadout of a player record (a missing or damaged one is simply empty: owned moves are synced in below). */
export function loadoutOf(player) {
  const l = player?.loadout;
  const stats = {};
  for (const [id, s] of Object.entries(l?.stats && typeof l.stats === "object" ? l.stats : {})) {
    if (Number.isFinite(s?.u) && Number.isFinite(s?.m)) stats[id] = { u: Math.max(0, s.u), m: Math.max(0, Math.min(s.m, s.u)) };
  }
  return { version: 1, equipped: [...new Set(list(l?.equipped))], known: [...new Set(list(l?.known))], stats, settled: list(l?.settled) };
}

/**
 * Bring a loadout in line with what he owns: drop moves he no longer owns, and give a newly owned move a free slot if there is one
 * (a move that arrives while the slots are full waits in the collection until he swaps). Idempotent.
 */
export function syncLoadout(loadout, owned) {
  const have = new Set(owned);
  const equipped = loadout.equipped.filter((id) => have.has(id)).slice(0, LOADOUT_SLOTS);
  const known = new Set(loadout.known.filter((id) => have.has(id)));
  for (const id of owned) {
    if (known.has(id)) continue;
    known.add(id);
    if (equipped.length < LOADOUT_SLOTS) equipped.push(id);
  }
  return { ...loadout, equipped, known: [...known] };
}

/** The moves he carries into a game, in equip order. */
export const equippedOf = (player, owned) => syncLoadout(loadoutOf(player), owned).equipped;

/** Equip one owned move into a free slot. `ok:false` with a plain reason otherwise (nothing changes). */
export function equipSkill(loadout, owned, id) {
  const synced = syncLoadout(loadout, owned);
  if (!owned.includes(id)) return { ok: false, reason: "not-owned", loadout: synced };
  if (synced.equipped.includes(id)) return { ok: false, reason: "already", loadout: synced };
  if (synced.equipped.length >= LOADOUT_SLOTS) return { ok: false, reason: "full", loadout: synced };
  return { ok: true, reason: null, loadout: { ...synced, equipped: [...synced.equipped, id] } };
}

export function unequipSkill(loadout, owned, id) {
  const synced = syncLoadout(loadout, owned);
  if (!synced.equipped.includes(id)) return { ok: false, reason: "not-equipped", loadout: synced };
  return { ok: true, reason: null, loadout: { ...synced, equipped: synced.equipped.filter((x) => x !== id) } };
}

/**
 * Add one settled game's engine counts (`zones.sig`: { move: { u, m } }, random procs AND purposeful uses alike) to the ledger.
 * Once per `gameKey`; a report with no log changes nothing.
 */
export function recordUsage(loadout, gameKey, sig) {
  if (!gameKey || loadout.settled.includes(gameKey)) return loadout;
  const stats = { ...loadout.stats };
  for (const [id, s] of Object.entries(sig && typeof sig === "object" ? sig : {})) {
    if (!Number.isFinite(s?.u) || s.u <= 0) continue;
    const before = stats[id] || { u: 0, m: 0 };
    stats[id] = { u: before.u + s.u, m: before.m + Math.max(0, Math.min(s.m || 0, s.u)) };
  }
  return { ...loadout, stats, settled: [...loadout.settled, gameKey].slice(-SETTLED_KEEP) };
}

/** What the engine has counted for one move, or null when it has never been used (unknown, not zero). */
export const usageOf = (loadout, id) => loadout.stats[id] || null;
