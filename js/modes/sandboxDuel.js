/**
 * 时空对决 (free sandbox): any cards, any seasons, duplicates allowed —
 * five 1991 Jordans vs five 2006 Kobes is a valid matchup.
 * Only this mode lifts the one-person-per-roster rule.
 */
import { clonePlayer } from "../data/players.js";
import { applyEraParity, buildEraParityModel } from "../engine/eraParity.js";

export const SANDBOX_MIN = 5;
export const SANDBOX_MAX = 12;

let parityModel = null;
let parityModelSize = -1;

function parityModelFor(pool) {
  if (parityModelSize !== pool.length) {
    parityModel = buildEraParityModel(pool);
    parityModelSize = pool.length;
  }
  return parityModel;
}

/** Sim and box score key by id, so every duplicate needs its own. */
export function sandboxCopy(card, slot) {
  const copy = clonePlayer(card);
  copy.id = `${card.id}~sbx${slot}`;
  copy.sandboxSourceId = card.id;
  return copy;
}

export function addToSide(side, card) {
  if (side.length >= SANDBOX_MAX) throw new Error(`每队最多 ${SANDBOX_MAX} 人`);
  return [...side, card];
}

export function removeFromSide(side, index) {
  return side.filter((_, i) => i !== index);
}

/** Fill a side with N copies of one card ("五个乔丹"). */
export function fillWithCopies(card, count = SANDBOX_MIN) {
  return Array.from({ length: Math.min(SANDBOX_MAX, count) }, () => card);
}

/**
 * Match-ready team. `eraParity` fills stats the old eras never recorded
 * (blocks/steals before 1974, threes before 1980) on the match copies only.
 */
export function buildSandboxTeam(name, cards, { eraParity = false, pool = [], slotOffset = 0 } = {}) {
  if (cards.length < SANDBOX_MIN) throw new Error(`每队至少 ${SANDBOX_MIN} 人`);
  if (cards.length > SANDBOX_MAX) throw new Error(`每队最多 ${SANDBOX_MAX} 人`);
  const model = eraParity && pool.length ? parityModelFor(pool) : null;
  const players = cards.map((card, i) => {
    const copy = sandboxCopy(card, slotOffset + i);
    return model ? applyEraParity(copy, model) : copy;
  });
  return { name, players, tacticId: "balanced", gold: 0, isCpu: false };
}
