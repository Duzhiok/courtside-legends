/**
 * Gold Challenge skill pack purchase (pure). Spends the run's own gold
 * (`career.gold`) only, moves the offer from the shelf into the run's skill
 * inventory. Returns { ok, reason?, cost?, offer? }; the caller owns alerts
 * and re-rendering. Never touches account gold or My Team cards.
 */
import { SKILL_PACKS } from "../data/skills.js";

export function buySkillOffer(career, skillId) {
  if (!career || career.kind !== "career") return { ok: false, reason: "no-career" };
  const offer = (career.skillShop || []).find((x) => x.id === skillId);
  if (!offer) return { ok: false, reason: "not-on-shelf" };
  if (SKILL_PACKS[skillId]?.duo || SKILL_PACKS[skillId]?.exclusive) return { ok: false, reason: "not-purchasable" };
  const cost = offer.cost || 99;
  const gold = career.gold || 0;
  if (gold < cost) return { ok: false, reason: "short", cost, gold, offer };
  if (!Array.isArray(career.skillInventory)) career.skillInventory = [];
  career.gold = gold - cost;
  career.skillInventory.push({
    id: offer.id,
    name: offer.name,
    desc: offer.desc,
    rarity: offer.rarity,
    rarityLabel: offer.rarityLabel,
    cost,
  });
  career.skillShop = career.skillShop.filter((x) => x.id !== skillId);
  return { ok: true, cost, offer };
}
