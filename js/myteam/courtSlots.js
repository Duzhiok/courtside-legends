/**
 * Starting-five court layout (pure). Positions are looked up by NAME, never by array index: the old court listed its
 * spots as [C, PF, SF, SG, PG] but filled them from a PG→C sorted list, so the point guard stood under the rim.
 *
 * Coordinates are percentages of the court box, basket at the TOP (C under the rim, forwards on the elbows, guards
 * out by the arc). The same table drives desktop and phone; only the box height changes (see myTeamClubhouse.css).
 */
export const SLOT_ORDER = Object.freeze(["PG", "SG", "SF", "PF", "C"]);

export const COURT_SLOTS = Object.freeze({
  C: Object.freeze({ left: 50, top: 15 }),
  PF: Object.freeze({ left: 26, top: 46 }),
  SF: Object.freeze({ left: 74, top: 46 }),
  PG: Object.freeze({ left: 22, top: 82 }),
  SG: Object.freeze({ left: 78, top: 82 }),
});

/** Where a starter goes when his own spot is already taken: the closest positions first. */
const NEAREST = Object.freeze({
  PG: ["SG", "SF", "PF", "C"],
  SG: ["PG", "SF", "PF", "C"],
  SF: ["SG", "PF", "PG", "C"],
  PF: ["C", "SF", "SG", "PG"],
  C: ["PF", "SF", "SG", "PG"],
});

/**
 * @param {object[]} starters  up to five cards
 * @param {(card: object) => string} posOf  the card's slot position (PG/SG/SF/PF/C)
 * @param {(card: object) => number} [strength]  higher keeps the natural spot when two starters claim it
 * @returns {{PG: object|null, SG: object|null, SF: object|null, PF: object|null, C: object|null}}
 */
export function assignCourtSlots(starters, posOf, strength = () => 0) {
  const placed = { PG: null, SG: null, SF: null, PF: null, C: null };
  const list = (Array.isArray(starters) ? starters : []).slice(0, SLOT_ORDER.length);
  const leftovers = [];
  for (const card of [...list].sort((a, b) => strength(b) - strength(a))) {
    const pos = posOf(card);
    if (pos in placed && !placed[pos]) placed[pos] = card;
    else leftovers.push(card);
  }
  for (const card of leftovers) {
    const pos = posOf(card);
    const order = [...(NEAREST[pos] || []), ...SLOT_ORDER];
    const free = order.find((slot) => !placed[slot]);
    if (free) placed[free] = card;
  }
  return placed;
}
