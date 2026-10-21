/**
 * Player search shared by the wishlist picker and the free 时空对决 sandbox.
 * Matches Chinese name, English name, bref id and nickname ("黑曼巴" → Kobe).
 * A 4-digit token is treated as a season filter: "乔丹 1991".
 */
import { NICKNAMES } from "./nicknames.js";

const SEASON_MIN = 1946;
const SEASON_MAX = 2035;

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s.·'’-]+/g, "");
}

export function parseQuery(query) {
  const terms = [];
  let season = null;
  for (const token of String(query || "").trim().split(/\s+/).filter(Boolean)) {
    const year = Number(token);
    if (/^\d{4}$/.test(token) && year >= SEASON_MIN && year <= SEASON_MAX) season = year;
    else terms.push(normalizeText(token));
  }
  return { terms: terms.filter(Boolean), season };
}

function haystack(card) {
  return normalizeText(`${card.name}|${card.nameEn}|${card.bref}|${NICKNAMES[card.bref] || ""}`);
}

/** Season cards matching every term (and the season, if given), best OVR first. */
export function searchCards(pool, query, { limit = 30, ovrOf }) {
  const { terms, season } = parseQuery(query);
  if (!terms.length && season == null) return [];
  return pool
    .filter((card) => (season == null || card.season === season) && terms.every((term) => haystack(card).includes(term)))
    .sort((a, b) => ovrOf(b) - ovrOf(a) || b.season - a.season)
    .slice(0, limit);
}

/** One row per real person (for the wishlist), with their best card. */
export function searchPeople(pool, query, { limit = 8, ovrOf }) {
  const people = new Map();
  for (const card of searchCards(pool, query, { limit: Infinity, ovrOf })) {
    const entry = people.get(card.bref);
    if (entry) entry.count += 1;
    else people.set(card.bref, { bref: card.bref, name: card.name, best: card, count: 1 });
  }
  return [...people.values()].slice(0, limit);
}
