/**
 * Season start draft: random franchise → ~10 cards (active / historical mix).
 * Role mix is intentionally loose each roll — multi-star, star+bench, starters+bench, etc.
 */
import { FRANCHISES, POS_SLOTS, playersForFranchise } from "../data/franchises.js";
import { clonePlayer, overall, PLAYERS } from "../data/players.js";
import { playerSalary, SEASON_SALARY_CAP } from "./seasonMarket.js";

const OFFER_COUNT = 10;
/** Opening draft fills to this size when salary space runs out. */
export const SEASON_DRAFT_TARGET = 12;
const MIN_SIGN_SALARY = 25;

/** Franchises with real history (skip expansion LAS). */
export function draftableFranchises() {
  return FRANCHISES.filter((f) => f.id !== "LAS" && (f.aliases || []).length);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickOne(list) {
  if (!list?.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Bucket by rough NBA roster role using OVR + hidden tier. */
function roleBucket(p) {
  const o = overall(p);
  const t = p.hiddenTier || "";
  if (
    o >= 90 ||
    t === "superstar" ||
    t === "nba50" ||
    t === "hof" ||
    (t === "allstar" && o >= 86)
  ) {
    return "star";
  }
  if (o >= 80 || t === "allstar" || t === "star" || (t === "starter" && o >= 78)) {
    return "starter";
  }
  if (o >= 72 || t === "starter") return "rotation";
  return "bench";
}

/**
 * Random soft targets for this pack — not a fixed 1+3+3+3.
 * Shortfalls just spill into whatever else is available.
 */
function rollMixTargets() {
  const recipes = [
    () => ({ star: randInt(2, 4), starter: randInt(1, 3), rotation: randInt(1, 3), bench: randInt(1, 4) }),
    () => ({ star: 1, starter: randInt(0, 2), rotation: randInt(1, 3), bench: randInt(4, 7) }),
    () => ({ star: 0, starter: randInt(3, 5), rotation: randInt(2, 4), bench: randInt(2, 5) }),
    () => ({ star: randInt(0, 1), starter: randInt(1, 2), rotation: randInt(2, 4), bench: randInt(3, 6) }),
    () => ({ star: randInt(3, 5), starter: randInt(2, 4), rotation: randInt(0, 2), bench: randInt(0, 2) }),
    () => ({ star: 0, starter: randInt(0, 2), rotation: randInt(3, 5), bench: randInt(4, 7) }),
    () => {
      // pure random scatter
      const star = randInt(0, 4);
      const starter = randInt(0, 4);
      const rotation = randInt(0, 4);
      const bench = Math.max(0, OFFER_COUNT - star - starter - rotation);
      return { star, starter, rotation, bench };
    },
  ];
  return pickOne(recipes)();
}

/**
 * @param {object} franchise
 * @param {Set<string>} [excludeIds] already chosen / offered ids
 * @param {Set<string>} [excludeBrefs] soft-avoid same person
 */
export function drawFranchiseOffers(franchise, excludeIds = new Set(), excludeBrefs = new Set()) {
  let pool = playersForFranchise(PLAYERS, franchise).filter((p) => !excludeIds.has(p.id));
  if (pool.length < 8) {
    pool = PLAYERS.filter((p) => !excludeIds.has(p.id));
  }

  const buckets = { star: [], starter: [], rotation: [], bench: [] };
  for (const p of pool) {
    buckets[roleBucket(p)].push(p);
  }
  for (const k of Object.keys(buckets)) buckets[k] = shuffle(buckets[k]);

  const targets = rollMixTargets();
  const order = shuffle(["star", "starter", "rotation", "bench"]);
  const picked = [];
  const usedBref = new Set(excludeBrefs);

  const take = (list, n) => {
    let got = 0;
    for (const p of list) {
      if (got >= n) break;
      if (excludeIds.has(p.id)) continue;
      if (p.bref && usedBref.has(p.bref)) continue;
      if (picked.some((x) => x.id === p.id)) continue;
      picked.push(clonePlayer(p));
      if (p.bref) usedBref.add(p.bref);
      got++;
    }
    return got;
  };

  for (const bucket of order) {
    if (picked.length >= OFFER_COUNT) break;
    const need = Math.min(targets[bucket] || 0, OFFER_COUNT - picked.length);
    if (need > 0) take(buckets[bucket], need);
  }

  // Fill remainder from shuffled full pool (any roles)
  if (picked.length < OFFER_COUNT) {
    const rest = shuffle(pool.filter((p) => !picked.some((x) => x.id === p.id)));
    take(rest, OFFER_COUNT - picked.length);
    if (picked.length < OFFER_COUNT) {
      for (const p of rest) {
        if (picked.length >= OFFER_COUNT) break;
        if (picked.some((x) => x.id === p.id)) continue;
        picked.push(clonePlayer(p));
      }
    }
  }

  return shuffle(picked.slice(0, OFFER_COUNT)).map((p) => {
    p.salary = playerSalary(p);
    return p;
  });
}

/** Shuffle-bag: go through all clubs before a team can appear again (avoids 鹈鹕×4). */
let franchiseBag = [];

export function resetFranchiseBag() {
  franchiseBag = [];
}

function refillFranchiseBag() {
  franchiseBag = shuffle(draftableFranchises());
}

/**
 * Next franchise from the bag. Same team only after the bag cycles
 * (≈30 clubs). Optional `_preferNotId` avoids back-to-back same club when reshuffling.
 */
export function rollRandomFranchise(preferNotId = null) {
  if (!franchiseBag.length) refillFranchiseBag();
  if (preferNotId && franchiseBag.length > 1 && franchiseBag[franchiseBag.length - 1]?.id === preferNotId) {
    // avoid immediate repeat when bag just reshuffled onto same last team
    const alt = franchiseBag.findIndex((f) => f.id !== preferNotId);
    if (alt >= 0) {
      const [f] = franchiseBag.splice(alt, 1);
      return f;
    }
  }
  return franchiseBag.pop() || pickOne(draftableFranchises());
}

export function offerLabel(p) {
  const o = overall(p);
  const role =
    roleBucket(p) === "star"
      ? "球星"
      : roleBucket(p) === "starter"
        ? "首发"
        : roleBucket(p) === "rotation"
          ? "轮换"
          : "板凳";
  return { ovr: o, role, salary: playerSalary(p) };
}

function naturalPos(p) {
  const raw = String(p.playPos || p.pos || "SF").toUpperCase();
  if (POS_SLOTS.some((s) => s.id === raw)) return raw;
  if (raw.includes("G")) return raw.startsWith("P") ? "PG" : "SG";
  if (raw.includes("C")) return "C";
  if (raw.includes("F")) return raw.includes("P") ? "PF" : "SF";
  return "SF";
}

function posCounts(roster) {
  const c = Object.fromEntries(POS_SLOTS.map((s) => [s.id, 0]));
  for (const p of roster) {
    const pos = naturalPos(p);
    if (c[pos] != null) c[pos]++;
  }
  return c;
}

/**
 * When salary space is gone: no choice — fill remaining spots by position need + cheap cards.
 * @param {object[]} roster already chosen
 * @param {{ target?: number, cap?: number }} [opts]
 * @returns {{ roster: object[], added: object[] }}
 */
export function autoFillSeasonDraft(roster, opts = {}) {
  const target = opts.target ?? SEASON_DRAFT_TARGET;
  const cap = opts.cap ?? SEASON_SALARY_CAP;
  const list = (roster || []).map((p) => clonePlayer(p));
  const added = [];
  const usedIds = new Set(list.map((p) => p.id));
  const usedBrefs = new Set(list.map((p) => p.bref).filter(Boolean));

  const payroll = () => list.reduce((s, p) => s + playerSalary(p), 0);

  while (list.length < target) {
    const space = cap - payroll();
    if (space < MIN_SIGN_SALARY) break;

    const counts = posCounts(list);
    // Prefer scarce positions first (need at least ~2 per slot on a 12-man)
    const ideal = Math.max(1, Math.ceil(target / POS_SLOTS.length));
    const posOrder = POS_SLOTS.map((s) => s.id).sort((a, b) => {
      const da = counts[a] - ideal;
      const db = counts[b] - ideal;
      if (da !== db) return da - db;
      return counts[a] - counts[b];
    });

    const pool = PLAYERS.filter((p) => {
      if (usedIds.has(p.id)) return false;
      if (p.bref && usedBrefs.has(p.bref)) return false;
      const sal = playerSalary(p);
      if (sal > space) return false;
      // Prefer depth / cheap; allow a bit higher if desperately short
      const o = overall(p);
      if (list.length >= target - 2) return o <= 82;
      return o <= 76;
    });

    if (!pool.length) {
      // last resort: any affordable unique card
      const desperate = PLAYERS.filter((p) => {
        if (usedIds.has(p.id)) return false;
        return playerSalary(p) <= space;
      });
      if (!desperate.length) break;
      const p = clonePlayer(pickOne(shuffle(desperate)));
      p.salary = playerSalary(p);
      p._seasonAuto = true;
      list.push(p);
      added.push(p);
      usedIds.add(p.id);
      if (p.bref) usedBrefs.add(p.bref);
      continue;
    }

    // Score: position gap > cheap salary > not too high OVR
    let best = null;
    let bestScore = -Infinity;
    const sample = shuffle(pool).slice(0, Math.min(120, pool.length));
    for (const p of sample) {
      const pos = naturalPos(p);
      const gap = ideal - (counts[pos] || 0);
      const sal = playerSalary(p);
      const o = overall(p);
      const posRank = posOrder.indexOf(pos);
      const score =
        gap * 40 +
        (posRank < 0 ? 0 : (POS_SLOTS.length - posRank) * 6) +
        (space - sal) * 0.15 -
        o * 0.35 +
        Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    const card = clonePlayer(best);
    card.salary = playerSalary(card);
    card._seasonAuto = true;
    list.push(card);
    added.push(card);
    usedIds.add(card.id);
    if (card.bref) usedBrefs.add(card.bref);
  }

  return { roster: list, added };
}

/** True when remaining cap space can't support continuing voluntary picks. */
export function seasonDraftOutOfMoney(roster, offerPack = [], cap = SEASON_SALARY_CAP) {
  if ((roster || []).length >= SEASON_DRAFT_TARGET) return false;
  const pay = (roster || []).reduce((s, p) => s + playerSalary(p), 0);
  const space = cap - pay;
  if (space < MIN_SIGN_SALARY) return true;
  if (offerPack?.length) {
    const anyAffordable = offerPack.some((p) => pay + playerSalary(p) <= cap);
    if (!anyAffordable) return true;
  }
  return false;
}

export { OFFER_COUNT, roleBucket };
