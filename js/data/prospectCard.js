/**
 * A generated prospect (js/engine/leagueDraft.js) is a rating-only card: ten attributes, a height and a weight.
 * GameSim reads shooting percentages and sub-attributes straight off the card, so a bare prospect has
 * `ft`/`paintFg`/`midFg`/`threeFg` = undefined -> every shot and free throw is NaN -> he can never score
 * (found by the Career 2.0 rookie probe: 0-for-9 FG, 0-for-6 FT over a whole stretch, trust spiralling to DNP).
 *
 * This fills ONLY what is missing, from the ratings, with the same mapping the real 1997 cards follow
 * (least-squares fit of the zone FG% / FT% that seasonToCard derives from real stats, n = 423 cards):
 *   threeFg = 0.231 + 0.00188 * three      midFg = 0.238 + 0.00269 * mid
 *   paintFg = 0.277 + 0.00337 * paint      ft    = 0.467 + 0.00435 * (three + mid) / 2
 * clamped to the ranges seasonToCard uses. It never changes a rating, so OVR is untouched; a card that
 * already has a field keeps it (idempotent: safe on old saves and on already-complete cards).
 * Pure: no randomness, no storage, the input is not mutated.
 */
import { deriveSubAttributes } from "./players.js";
import { clamp } from "../core/seededRandom.js";

const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** Sub-attributes the engine reads that deriveSubAttributes supplies. */
const SUB_KEYS = ["handle", "perimDef", "interiorDef", "catchShoot", "offDribble", "offReb", "defReb"];

export function completeProspectCard(card) {
  if (!card || typeof card !== "object") return card;
  const three = num(card.three, 45);
  const mid = num(card.mid, 55);
  const paint = num(card.paint, 55);
  const fills = {
    threeFg: clamp(0.231 + 0.00188 * three, 0.05, 0.5),
    midFg: clamp(0.238 + 0.00269 * mid, 0.28, 0.55),
    paintFg: clamp(0.277 + 0.00337 * paint, 0.35, 0.72),
    ft: clamp(0.467 + 0.00435 * ((three + mid) / 2), 0.4, 0.95),
  };
  const subs = SUB_KEYS.every((key) => Number.isFinite(card[key])) ? {} : deriveSubAttributes(card);
  const out = { ...card };
  for (const [key, value] of Object.entries({ ...subs, ...fills })) {
    if (!Number.isFinite(out[key])) out[key] = value;
  }
  return out;
}
