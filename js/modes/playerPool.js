/**
 * Player pool for the 3v3 half-court picker: deal a random pool of cards to
 * draft from, instead of always typing the same famous names into the search
 * box. Pure — no DOM, no account, no saves.
 *
 * The deal is tiered so every pool is playable: a couple of stars you
 * recognise, mids to build around, role players to fill in. One season card
 * per person per pool (no Jordan 1991 + Jordan 1992 in the same deal).
 * Deterministic for a given seed + card list, so tests and replays agree.
 */
import { hashSeed, seededStream, shuffle } from "../core/seededRandom.js";

export const PLAYER_POOL_SIZE = 12;
/** { min, max, count } per tier; bands are OVR. */
export const PLAYER_POOL_TIERS = [
  { min: 85, max: 99, count: 3 },
  { min: 75, max: 84, count: 4 },
  { min: 0, max: 74, count: 5 },
];

const personKey = (card) => card?.bref || card?.id;

/**
 * Deal `count` distinct-person cards from `cards`.
 * `ovrOf(card)` rates a card; `seed` fixes the deal. Cards already taken
 * (passed in `excludeIds`, e.g. already picked for either team) never deal.
 * A short tier is topped up from the remaining pool, so the function is total
 * even for a tiny test pool.
 */
export function dealPlayerPool(cards, { count = PLAYER_POOL_SIZE, seed = "pool", ovrOf, excludeIds = [] } = {}) {
  const rng = seededStream(hashSeed(String(seed)));
  const excluded = new Set(excludeIds);
  // One season card per person: the first card of each bref wins.
  const available = [];
  const seenPersons = new Set();
  for (const c of cards || []) {
    if (!c || excluded.has(c.id)) continue;
    const person = personKey(c);
    if (seenPersons.has(person)) continue;
    seenPersons.add(person);
    available.push(c);
  }
  const dealt = [];
  const takeFrom = (list, n) => {
    for (const card of shuffle(list, rng)) {
      if (dealt.length >= count || n <= 0) break;
      dealt.push(card);
      n -= 1;
    }
  };
  for (const tier of PLAYER_POOL_TIERS) {
    if (dealt.length >= count) break;
    takeFrom(
      available.filter((c) => {
        const ovr = ovrOf(c);
        return ovr >= tier.min && ovr <= tier.max;
      }),
      tier.count,
    );
  }
  // Short tiers (or a pool smaller than the tier counts) top up from whatever is left.
  if (dealt.length < count) {
    const dealtIds = new Set(dealt.map((c) => c.id));
    takeFrom(available.filter((c) => !dealtIds.has(c.id)), count - dealt.length);
  }
  return dealt;
}
