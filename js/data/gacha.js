/**
 * Gacha rules: rate table, rotating banners, wishlist and crafting.
 * Pure functions — randomness (`rng`) and OVR (`ovrOf`) are injected so the
 * economy can be unit-tested without the 23k-card roster.
 *
 * No pity: draws are pure random at the advertised rates (user decision
 * 2026-11-07 — the old newbie / 10-pull / 50-pull forced upgrades are gone).
 */
import { hashSeed } from "../core/seededRandom.js";

/**
 * Designed pull rates by OVR band. 90+ is 7% (was 14%) so a 90+ pull still
 * feels like an event; pity below makes the drought predictable.
 */
export const RATE_TABLE = [
  { id: "myth", min: 96, max: 200, p: 0.008, label: "神话+", labelEn: "Myth+" },
  { id: "legend", min: 93, max: 96, p: 0.017, label: "传奇", labelEn: "Legend" },
  { id: "superstar", min: 90, max: 93, p: 0.045, label: "超巨", labelEn: "Superstar" },
  { id: "allstar", min: 85, max: 90, p: 0.11, label: "全明星", labelEn: "All-Star" },
  { id: "starter", min: 80, max: 85, p: 0.2, label: "先发", labelEn: "Starter" },
  { id: "rotation", min: 74, max: 80, p: 0.27, label: "轮换", labelEn: "Rotation" },
  { id: "common", min: 0, max: 74, p: 0.35, label: "普通", labelEn: "Common" },
];

/** Chance that a pull landing in a band holding a wishlist card becomes it. */
export const WISHLIST_REDIRECT = 0.3;

export const EXTRA_DRAW = { cost: 200, perDay: 2 };
export const MAX_STARS = 5;
export const SOULS_PER_STAR = 3;

/** Gold refund for low pulls — the generic currency's main faucet besides ranked. */
const GOLD_FOR_BAND = { common: 20, rotation: 10 };
/** Crafting a specific wishlist season card costs gold by its band. */
const CRAFT_COST = {
  common: 60,
  rotation: 120,
  starter: 240,
  allstar: 480,
  superstar: 900,
  legend: 1600,
  myth: 2600,
};

const ERA_DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
/** Franchise groups survive relocations (SEA→OKC etc.). */
const FRANCHISES = [
  { id: "CHI", name: "公牛", codes: ["CHI"] },
  { id: "LAL", name: "湖人", codes: ["LAL", "MNL"] },
  { id: "BOS", name: "凯尔特人", codes: ["BOS"] },
  { id: "GSW", name: "勇士", codes: ["GSW", "SFW", "PHW"] },
  { id: "SAS", name: "马刺", codes: ["SAS"] },
  { id: "MIA", name: "热火", codes: ["MIA"] },
  { id: "HOU", name: "火箭", codes: ["HOU", "SDR"] },
  { id: "DET", name: "活塞", codes: ["DET", "FTW"] },
  { id: "PHI", name: "76人", codes: ["PHI", "SYR"] },
  { id: "NYK", name: "尼克斯", codes: ["NYK"] },
  { id: "OKC", name: "超音速/雷霆", codes: ["SEA", "OKC"] },
  { id: "DEN", name: "掘金", codes: ["DEN"] },
  { id: "MIL", name: "雄鹿", codes: ["MIL"] },
  { id: "UTA", name: "爵士", codes: ["UTA", "NOJ"] },
  { id: "PHO", name: "太阳", codes: ["PHO"] },
  { id: "DAL", name: "独行侠", codes: ["DAL"] },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Monday 2024-01-01 — banner week 0. */
const BANNER_EPOCH = Date.UTC(2024, 0, 1);

export function bandOf(ovr) {
  return RATE_TABLE.find((band) => ovr >= band.min && ovr < band.max) || RATE_TABLE.at(-1);
}

export function weekIndex(date = new Date()) {
  return Math.max(0, Math.floor((date.getTime() - BANNER_EPOCH) / WEEK_MS));
}

/**
 * Banners on offer this week: permanent all-history + one rotating decade +
 * one rotating franchise. Rotation (not free choice) stops everyone from
 * camping the single best pool forever and gives a reason to come back.
 */
export function currentBanners(date = new Date()) {
  const week = weekIndex(date);
  const decade = ERA_DECADES[week % ERA_DECADES.length];
  const franchise = FRANCHISES[hashSeed(`fr|${week}`) % FRANCHISES.length];
  return [
    { id: "standard", kind: "standard", name: "全历史常驻池" },
    { id: `era-${decade}`, kind: "era", decade, name: `本周年代池 · ${decade}年代` },
    {
      id: `team-${franchise.id}`,
      kind: "team",
      codes: franchise.codes,
      name: `本周球队池 · ${franchise.name}`,
    },
  ];
}

/** Whole days until this week's banners rotate (1 = last day). */
export function daysUntilRotation(date = new Date()) {
  const next = BANNER_EPOCH + (weekIndex(date) + 1) * WEEK_MS;
  return Math.max(1, Math.ceil((next - date.getTime()) / (WEEK_MS / 7)));
}

export function bannerFilter(banner) {
  if (!banner || banner.kind === "standard") return () => true;
  if (banner.kind === "era") {
    return (p) => p.season >= banner.decade && p.season < banner.decade + 10;
  }
  const codes = new Set(banner.codes || []);
  return (p) => codes.has(p.team);
}

export function freshGachaState() {
  // sinceAllstar / sinceLegend / hadAllstar are inert telemetry now (pity was
  // removed 2026-11-07); the fields stay so old saves load unchanged.
  return { sinceAllstar: 0, sinceLegend: 0, pulls: 0, hadAllstar: false, wishlist: null, souls: {}, extra: null };
}

function rollBand(rng) {
  const eligible = RATE_TABLE;
  const total = eligible.reduce((sum, band) => sum + band.p, 0);
  let roll = rng() * total;
  for (const band of eligible) {
    roll -= band.p;
    if (roll <= 0) return band;
  }
  return eligible.at(-1);
}

/** Cards in the band; empty band → nearest lower band, then nearest higher. */
function cardsNearBand(pool, band, ovrOf) {
  const index = RATE_TABLE.indexOf(band);
  const order = [
    index,
    ...RATE_TABLE.slice(index + 1).map((_, i) => index + 1 + i),
    ...RATE_TABLE.slice(0, index).map((_, i) => index - 1 - i),
  ];
  for (const i of order) {
    const target = RATE_TABLE[i];
    const cards = pool.filter((p) => {
      const ovr = ovrOf(p);
      return ovr >= target.min && ovr < target.max;
    });
    if (cards.length) return cards;
  }
  return pool;
}

function pickOne(list, rng) {
  return list[Math.floor(rng() * list.length)] || list[0];
}

const globalOvrCache = new WeakMap();

/** All OVRs of the full pool, best first (cached per pool array). */
function globalSortedOvr(pool, ovrOf) {
  const hit = globalOvrCache.get(pool);
  if (hit && hit.size === pool.length) return hit.sorted;
  const sorted = pool.map(ovrOf).sort((a, b) => b - a);
  globalOvrCache.set(pool, { size: pool.length, sorted });
  return sorted;
}

/** Tie-break inside equal OVRs: real production, then id (stable, no randomness). */
function production(card) {
  const raw = card.raw || {};
  return (raw.ppg || 0) + (raw.rpg || 0) * 0.5 + (raw.apg || 0) * 0.7;
}

/**
 * 池内相对档位: rate a card by where it stands inside its banner pool, mapped
 * onto the same standing in the full pool. The 1950s pool's best 0.2% rolls as
 * 神话档 even though its raw OVRs are low, so old-era banners are not all filler.
 *
 * OVRs come in big ties (the 2000s pool has 450 cards at exactly 72), so ranking
 * by OVR alone would drop a whole tie group into one band and leave other bands
 * with 3 cards that get pulled constantly. Ties are broken by production.
 */
export function relativeRater(pool, source, ovrOf) {
  const global = globalSortedOvr(pool, ovrOf);
  const ranked = source
    .map((card) => ({ card, ovr: ovrOf(card), prod: production(card) }))
    .sort((a, b) => b.ovr - a.ovr || b.prod - a.prod || String(a.card.id).localeCompare(String(b.card.id)));
  const rated = new Map();
  ranked.forEach(({ card }, i) => {
    const q = (i + 0.5) / ranked.length;
    rated.set(card.id, global[Math.min(global.length - 1, Math.floor(q * global.length))]);
  });
  return (card) => rated.get(card.id) ?? global.at(-1);
}

/**
 * One pull. Returns { player, band, wishHit } and the next gacha
 * state — never mutates its inputs. Pure random at the rate table: no
 * pity, no forced upgrades.
 */
export function pullCard({ pool, gacha = freshGachaState(), banner = null, rng = Math.random, ovrOf }) {
  const bannerPool = pool.filter(bannerFilter(banner));
  const source = bannerPool.length ? bannerPool : pool;
  if (!source.length) throw new Error("卡池为空，无法抽卡");
  const relative = !!banner && banner.kind !== "standard" && source !== pool;
  const rate = relative ? relativeRater(pool, source, ovrOf) : ovrOf;

  const band = rollBand(rng);
  const candidates = cardsNearBand(source, band, rate);

  const wish = gacha.wishlist;
  const wishCards = wish ? candidates.filter((p) => p.bref === wish) : [];
  const wishHit = wishCards.length > 0 && rng() < WISHLIST_REDIRECT;
  const player = pickOne(wishHit ? wishCards : candidates, rng);

  const rated = rate(player);
  const realOvr = ovrOf(player);
  const next = {
    ...gacha,
    // pity counters follow the pool-relative standing, so a weak-era pool cannot jam them
    sinceAllstar: rated >= 85 ? 0 : (gacha.sinceAllstar || 0) + 1,
    sinceLegend: rated >= 93 ? 0 : (gacha.sinceLegend || 0) + 1,
    pulls: (gacha.pulls || 0) + 1,
    hadAllstar: !!gacha.hadAllstar || realOvr >= 85,
  };
  return { player, band: bandOf(rated), wishHit, relative, gacha: next };
}

/** A coach draw still counts as a draw: it walks every pity counter forward. */
export function registerNonPlayerPull(gacha) {
  return {
    ...gacha,
    sinceAllstar: (gacha.sinceAllstar || 0) + 1,
    sinceLegend: (gacha.sinceLegend || 0) + 1,
    pulls: (gacha.pulls || 0) + 1,
  };
}

export function goldForPull(ovr) {
  return GOLD_FOR_BAND[bandOf(ovr).id] || 0;
}

export function craftCost(ovr) {
  return CRAFT_COST[bandOf(ovr).id];
}

/** Extra paid-with-gold draws left today. */
export function extraDrawsLeft(gacha, todayKey) {
  const used = gacha?.extra?.day === todayKey ? gacha.extra.count : 0;
  return Math.max(0, EXTRA_DRAW.perDay - used);
}

export function recordExtraDraw(gacha, todayKey) {
  const used = gacha?.extra?.day === todayKey ? gacha.extra.count : 0;
  return { ...gacha, extra: { day: todayKey, count: used + 1 } };
}

/** What a player wants to know before choosing a banner: size, best cards, wished person. */
export function bannerStats(pool, banner, ovrOf, wishBref = null) {
  const source = pool.filter(bannerFilter(banner));
  const best = [...source].sort((a, b) => ovrOf(b) - ovrOf(a) || String(a.id).localeCompare(String(b.id)));
  const top = [];
  for (const card of best) {
    if (top.length === 3) break;
    if (!top.some((t) => t.bref === card.bref)) top.push({ bref: card.bref, name: card.name, season: card.season, ovr: ovrOf(card) });
  }
  return {
    cards: source.length,
    people: new Set(source.map((card) => card.bref)).size,
    top,
    wishCards: wishBref ? source.filter((card) => card.bref === wishBref).length : null,
  };
}
