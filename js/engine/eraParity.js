/**
 * 跨时代对等（Era Parity）
 *
 * 问题：1973-74 之前 NBA 不统计盖帽 / 抢断，1979-80 之前没有三分线。
 * 这些年代的卡片防守 / 盖帽 / 抢断 / 三分全是缺数据时的默认值（拉塞尔防守 42），
 * 现代卡片又直接套 2K 评分，跨时代对决天然不公平。
 *
 * 做法：缺失的能力用「同时代 + 同位置」里的代理数据排名（百分位），
 * 再映射到统计完整时期（1980–2009）同位置的真实分布上。
 * 只抬不压：已有的真实数据永远不会被调低。
 * 只返回新卡片，不改原卡 —— 只应用于时空对决的比赛副本。
 */

const REFERENCE_FROM = 1980;
const REFERENCE_TO = 2009;
const NO_DEFENSE_STATS_BEFORE = 1974;
const NO_THREE_LINE_BEFORE = 1980;
// 没有三分线的年代：按中投手感换算后打折，算保守估计
const THREE_TRANSLATION = 0.85;
// 现代训练：三分出手倾向往「同等三分能力的现代球员」靠拢一半，保留个人风格
const MODERN_SHOT_DIET_FROM = 2015;
const MODERN_TRAINING_PULL = 0.5;
const THREE_BIN = 10;

const n = (v, fallback = 50) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** 代理分：缺数据时，用哪些已记录的数据来估这个人的排名 */
const PROXIES = {
  defense: (c) => n(c.rebound) * 0.3 + n(c.iq) * 0.25 + n(c.intangibles?.winningImpact) * 0.25 + n(c.heightCm, 200) * 0.2,
  block: (c) => n(c.rebound) * 0.55 + n(c.heightCm, 200) * 0.45,
  steal: (c) => n(c.speed) * 0.4 + n(c.pass) * 0.3 + n(c.iq) * 0.3,
  three: (c) => n(c.mid),
};

const GAP_RULES = [
  { attr: "defense", before: NO_DEFENSE_STATS_BEFORE },
  { attr: "block", before: NO_DEFENSE_STATS_BEFORE },
  { attr: "steal", before: NO_DEFENSE_STATS_BEFORE },
  { attr: "three", before: NO_THREE_LINE_BEFORE, scale: THREE_TRANSLATION },
];

export function eraBucket(season) {
  const s = Number(season) || 2000;
  if (s < 1960) return "1950s";
  return `${Math.floor(s / 10) * 10}s`;
}

const posOf = (c) => String(c.pos || "SF").toUpperCase();
const sortAsc = (arr) => arr.sort((a, b) => a - b);

function percentileIn(sorted, value) {
  if (!sorted.length) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return (below + equal / 2) / sorted.length;
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * 从全名册建模型（只需建一次，可缓存）。
 * reference[attr][pos] = 1980–2009 同位置的真实分布
 * proxies[attr][era|pos] = 缺数据年代同时代同位置的代理分分布
 */
export function buildEraParityModel(cards) {
  const reference = {};
  const proxies = {};
  const modernThreeTend = {};
  for (const card of cards || []) {
    const season = Number(card.season) || 0;
    const pos = posOf(card);
    if (season >= MODERN_SHOT_DIET_FROM) {
      (modernThreeTend[threeBin(card.three)] ||= []).push(n(card.threeTend, 0));
    }
    for (const { attr, before } of GAP_RULES) {
      if (season >= REFERENCE_FROM && season <= REFERENCE_TO) {
        ((reference[attr] ||= {})[pos] ||= []).push(n(card[attr]));
      }
      if (season < before) {
        ((proxies[attr] ||= {})[`${eraBucket(season)}|${pos}`] ||= []).push(PROXIES[attr](card));
      }
    }
  }
  for (const byPos of [...Object.values(reference), ...Object.values(proxies)]) {
    for (const key of Object.keys(byPos)) sortAsc(byPos[key]);
  }
  const modernThreeTendByBin = {};
  for (const [bin, values] of Object.entries(modernThreeTend)) {
    modernThreeTendByBin[bin] = quantile(sortAsc(values), 0.5);
  }
  return { reference, proxies, modernThreeTendByBin };
}

function threeBin(three) {
  return Math.floor(Math.max(0, n(three, 0)) / THREE_BIN) * THREE_BIN;
}

/** 现代训练后的三分出手倾向（只升不降） */
export function modernThreeTend(card, model) {
  const own = n(card.threeTend, 0);
  const modern = model?.modernThreeTendByBin?.[threeBin(card.three)];
  if (modern == null || modern <= own) return own;
  return Math.round(own + (modern - own) * MODERN_TRAINING_PULL);
}

/** 某张卡某项缺失能力的对等估值（无需估算时返回 null） */
export function parityValue(card, attr, model) {
  const rule = GAP_RULES.find((r) => r.attr === attr);
  if (!rule || !model) return null;
  const season = Number(card.season) || 0;
  if (season >= rule.before) return null;
  const pos = posOf(card);
  const proxyDist = model.proxies?.[attr]?.[`${eraBucket(season)}|${pos}`];
  const refDist = model.reference?.[attr]?.[pos];
  if (!proxyDist?.length || !refDist?.length) return null;
  const pct = percentileIn(proxyDist, PROXIES[attr](card));
  const mapped = quantile(refDist, pct) * (rule.scale ?? 1);
  return Math.round(Math.min(99, mapped));
}

/**
 * 返回对等后的新卡片（原卡不变）。OVR 改按能力值计算，不再套 2K 评分。
 * modernTraining：三分出手倾向现代化（「如果他们接受现代三分训练」）
 */
export function applyEraParity(card, model, { modernTraining = true } = {}) {
  if (!card) return card;
  const next = structuredClone(card);
  const lifted = {};
  for (const { attr } of GAP_RULES) {
    const value = parityValue(card, attr, model);
    if (value != null && value > n(card[attr], 0)) {
      next[attr] = value;
      lifted[attr] = { from: n(card[attr], 0), to: value };
    }
  }
  if (modernTraining) {
    const tend = modernThreeTend(next, model);
    if (tend > n(card.threeTend, 0)) {
      lifted.threeTend = { from: n(card.threeTend, 0), to: tend };
      next.threeTend = tend;
    }
  }
  if (next.ratingSource === "anchor") next.ratingSource = "parity";
  next.eraParity = { lifted };
  return next;
}
