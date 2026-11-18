/**
 * Gold-challenge coach market: what a coach costs and which coaches are on the board. Moved out of app.js (B61) -- no
 * DOM, no `state`; `rollCareerCoachShop` writes the board onto the career object it is given and returns it.
 */
import { shuffle } from "../core/seededRandom.js";
import { COACHES, isLegendCoach } from "../data/coaches.js";

/** How many coaches the market shows at once. */
export const CAREER_COACH_SHOP_SIZE = 1;

/** Gold cost to hire a coach in 晋级赛 (one-time buyout). */
export function careerCoachPrice(coach) {
  if (!coach) return 80;
  const tier = coach.hiddenTier || "bench";
  const table = {
    nba50: 520,
    hof: 420,
    superstar: 360,
    allstar: 280,
    star: 200,
    starter: 130,
    bench: 70,
    water_cooler: 45,
    undrafted_gleague: 35,
  };
  let price = table[tier] ?? 90;
  if (isLegendCoach(coach)) price = Math.max(price, 380);
  const fame = Number(coach.fame) || 0;
  if (fame >= 90) price += 40;
  else if (fame >= 75) price += 20;
  return price;
}

export function rollCareerCoachShop(c, size = CAREER_COACH_SHOP_SIZE) {
  if (!c) return [];
  // Coach pool is small — only hide current staff + coaches already bought this run
  const blocked = new Set([...(c.hiredCoachIds || [])]);
  if (c.team?.coach?.id) blocked.add(c.team.coach.id);
  if (c.team?.assistant?.id) blocked.add(c.team.assistant.id);
  let pool = shuffle(COACHES.filter((x) => x?.id && !blocked.has(x.id)));
  if (pool.length < size) {
    // Allow previously fired staff back onto the board if pool is thin
    pool = shuffle(COACHES.filter((x) => x?.id && x.id !== c.team?.coach?.id));
  }
  const picks = [];
  for (const coach of pool) {
    if (picks.length >= size) break;
    const card = structuredClone(coach);
    card.hireCost = careerCoachPrice(coach);
    picks.push(card);
  }
  c.coachShop = picks;
  return picks;
}
