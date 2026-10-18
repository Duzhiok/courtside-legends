/**
 * 自定义对战：巅峰卡池 + 档位价（块）。
 * 定价 = max(历史定位底价, 能力值档) —— 十大 5 / 五十大≥4 / 七十五大增补≥3 / 其余看 OVR。
 * 每人预算 CUSTOM_BUDGET；0 价角色球员仍需轮流点选直到名单满员。
 */

import { PLAYERS, clonePlayer, overall } from "./players.js";

export const CUSTOM_BUDGET = 15;
export const CUSTOM_ROSTER_SIZE = 8;
export const CUSTOM_REFRESH_COST = 1; // 刷新卡包花 1 块（可花光）

/**
 * NBA 历史前十大（本游戏定价用）→ 底价 5
 * MJ / 詹皇 / 贾巴尔 / 魔术师 / 大鸟 / 张伯伦 / 拉塞尔 / 邓肯 / 鲨鱼 / 科比
 */
export const NBA_TOP10_BREF = {
  jordami01: 5, // Michael Jordan
  jamesle01: 5, // LeBron James
  abdulka01: 5, // Kareem Abdul-Jabbar
  johnsma02: 5, // Magic Johnson
  birdla01: 5, // Larry Bird
  chambwi01: 5, // Wilt Chamberlain
  russebi01: 5, // Bill Russell
  duncati01: 5, // Tim Duncan
  onealsh01: 5, // Shaquille O'Neal
  bryanko01: 5, // Kobe Bryant
};

/**
 * NBA 五十大巨星（1996）→ 底价 4（已在十大里的仍为 5）
 * 含六十大常见名单成员；bref 以本项目 roster 为准。
 */
export const NBA_TOP50_BREF = {
  // already in top10 also listed for completeness of the 50
  jordami01: 4,
  abdulka01: 4,
  johnsma02: 4,
  birdla01: 4,
  chambwi01: 4,
  russebi01: 4,
  // rest of NBA 50
  bayloel01: 4, // Elgin Baylor
  roberos01: 4, // Oscar Robertson
  westje01: 4, // Jerry West
  ervinju01: 4, // Julius Erving
  mikange01: 4, // George Mikan
  pettibo01: 4, // Bob Pettit
  cousybo01: 4, // Bob Cousy
  hayesel01: 4, // Elvin Hayes
  unselwe01: 4, // Wes Unseld
  cowenda01: 4, // Dave Cowens
  havlijo01: 4, // John Havlicek
  jonessa01: 4, // Sam Jones
  debusda01: 4, // Dave DeBusschere
  reedwi01: 4, // Willis Reed
  greerha01: 4, // Hal Greer
  wilkele01: 4, // Lenny Wilkens
  lucasje01: 4, // Jerry Lucas
  thurmna01: 4, // Nate Thurmond
  arizipa01: 4, // Paul Arizin
  schaydo01: 4, // Dolph Schayes
  barryri01: 4, // Rick Barry
  maravpe01: 4, // Pete Maravich
  archina01: 4, // Nate Archibald
  monroea01: 4, // Earl Monroe
  fraziwa01: 4, // Walt Frazier
  bingda01: 4, // Dave Bing
  cunnibi01: 4, // Billy Cunningham
  mcadobo01: 4, // Bob McAdoo
  malonmo01: 4, // Moses Malone
  thomais01: 4, // Isiah Thomas
  malonka01: 4, // Karl Malone
  stockjo01: 4, // John Stockton
  olajuha01: 4, // Hakeem Olajuwon
  robinda01: 4, // David Robinson
  barklch01: 4, // Charles Barkley
  pippesc01: 4, // Scottie Pippen
  drexlcl01: 4, // Clyde Drexler
  ewingpa01: 4, // Patrick Ewing
  paytoga01: 4, // Gary Payton
  gervige01: 4, // George Gervin
  englial01: 4, // Alex English
  wilkido01: 4, // Dominique Wilkins
  worthja01: 4, // James Worthy
  parisro01: 4, // Robert Parish
  waltobi01: 4, // Bill Walton
};

/**
 * NBA 七十五大增补 / 近现代超级巨星（不在五十大名单）→ 底价 3
 * 能力值够高时仍可被抬到 4–5。
 */
export const NBA_75_EXTRA_BREF = {
  // 近现代 GOAT 圈（非十大则至少 3，常被 OVR 抬到 4–5）
  curryst01: 3, // Stephen Curry
  duranke01: 3, // Kevin Durant
  jokicni01: 3, // Nikola Jokić
  antetgi01: 3, // Giannis
  duncati01: 3, // Tim Duncan（十大已覆盖）
  onealsh01: 3,
  bryanko01: 3,
  jamesle01: 3,
  // 七十五大常见增补
  iversal01: 3, // Allen Iverson
  nowitdi01: 3, // Dirk Nowitzki
  nashst01: 3, // Steve Nash
  garneke01: 3, // Kevin Garnett
  piercpa01: 3, // Paul Pierce
  allenra02: 3, // Ray Allen
  wadedw01: 3, // Dwyane Wade
  paulch01: 3, // Chris Paul
  leonaka01: 3, // Kawhi Leonard
  davisan02: 3, // Anthony Davis
  hardeja01: 3, // James Harden
  westbru01: 3, // Russell Westbrook
  lillada01: 3, // Damian Lillard
  mcgratr01: 3, // Tracy McGrady
  cartevi01: 3, // Vince Carter
  gasolpa01: 3, // Pau Gasol
  parketo01: 3, // Tony Parker
  ginobem01: 3, // Manu Ginobili
  kiddja01: 3, // Jason Kidd
  mingya01: 3, // Yao Ming
  anthoca01: 3, // Carmelo Anthony
  howardw01: 3, // Dwight Howard
  griffbl01: 3, // Blake Griffin
  kingbe01: 3, // Bernard King
  dantlad01: 3, // Adrian Dantley
  rodmade01: 3, // Dennis Rodman
  dumarjo01: 3, // Joe Dumars
  doncilu01: 3, // Luka Dončić
  gilgesh01: 3, // Shai Gilgeous-Alexander
  bookede01: 3, // Devin Booker
  embiijo01: 3, // Joel Embiid
  moranja01: 3, // Ja Morant
  tatumja01: 3, // Jayson Tatum
  willizi01: 3, // Zion Williamson
  brownja02: 2, // Jaylen Brown — mild floor
  hardaan01: 3, // Anfernee "Penny" Hardaway
};

/** @deprecated 用历史分层 + OVR；保留空对象以免外部引用报错 */
export const PEAK_PRICE_BY_BREF = { ...NBA_TOP10_BREF };

let _peakCache = null;

function historicalFloor(bref) {
  if (!bref) return 0;
  if (NBA_TOP10_BREF[bref] != null) return NBA_TOP10_BREF[bref];
  if (NBA_TOP50_BREF[bref] != null) return NBA_TOP50_BREF[bref];
  if (NBA_75_EXTRA_BREF[bref] != null) return NBA_75_EXTRA_BREF[bref];
  return 0;
}

/** 能力值档：纯 OVR → 0–5 */
export function ovrPriceBand(ovr) {
  const o = Number(ovr) || 0;
  if (o >= 96) return 5;
  if (o >= 92) return 4;
  if (o >= 86) return 3;
  if (o >= 80) return 2;
  if (o >= 74) return 1;
  return 0;
}

/**
 * Build one card per bref at peak season OVR, with customPrice.
 * Call after loadPlayers(); cache clears if roster reloads.
 */
export function getPeakPool() {
  if (_peakCache?.length && _peakCache.length > 0) return _peakCache;
  const byBref = new Map();
  for (const p of PLAYERS) {
    if (!p?.bref) continue;
    const o = overall(p);
    const prev = byBref.get(p.bref);
    if (!prev || o > prev._o) byBref.set(p.bref, { p, _o: o });
  }
  const pool = [];
  for (const { p, _o } of byBref.values()) {
    const card = clonePlayer(p);
    card.customPrice = priceForPeak(card.bref, _o);
    card.peakLabel = true;
    card.tags = [...(card.tags || []).filter((t) => t !== "巅峰"), "巅峰"].slice(0, 5);
    pool.push(card);
  }
  _peakCache = pool;
  return pool;
}

export function clearPeakPoolCache() {
  _peakCache = null;
}

/**
 * 最终身价：max(历史定位底价, 能力值档)，封顶 5。
 * 十大保底 5；五十大保底 4；七十五大增补保底 3；其余纯看巅峰 OVR。
 */
export function priceForPeak(bref, ovr) {
  const hist = historicalFloor(bref);
  const byOvr = ovrPriceBand(ovr);
  return Math.min(5, Math.max(hist, byOvr));
}

export function customPriceOf(p) {
  if (p?.customPrice != null) return p.customPrice;
  return priceForPeak(p?.bref, overall(p));
}

/**
 * 预算阶段：全部 5→1 块巅峰卡（价高优先，同价 OVR 高优先）。
 */
export function listPaidPeaks(excludeIds = new Set()) {
  return getPeakPool()
    .filter((p) => !excludeIds.has(p.id) && customPriceOf(p) >= 1)
    .sort((a, b) => {
      const ca = customPriceOf(a);
      const cb = customPriceOf(b);
      if (cb !== ca) return cb - ca;
      return overall(b) - overall(a);
    })
    .map((p) => {
      const data = clonePlayer(p);
      data.customPrice = customPriceOf(p);
      data.peakLabel = true;
      return { kind: "player", data };
    });
}

/**
 * 补员阶段：随机抽 0 块角色巅峰卡。
 */
export function drawZeroCostPack(size = 5, excludeIds = new Set()) {
  const pool = getPeakPool().filter((p) => !excludeIds.has(p.id) && customPriceOf(p) === 0);
  const cards = [];
  const used = new Set(excludeIds);
  for (let i = 0; i < size; i++) {
    const avail = pool.filter((x) => !used.has(x.id));
    if (!avail.length) break;
    const pick = avail[Math.floor(Math.random() * avail.length)];
    used.add(pick.id);
    const data = clonePlayer(pick);
    data.customPrice = 0;
    data.peakLabel = true;
    cards.push({ kind: "player", data });
  }
  return cards;
}

/** @deprecated 用 listPaidPeaks + drawZeroCostPack；保留兼容 */
export function drawCustomPack(size = 5, excludeIds = new Set()) {
  return drawZeroCostPack(size, excludeIds);
}

export function peakCardByBref(bref) {
  const pool = getPeakPool();
  return pool.find((p) => p.bref === bref) || null;
}
