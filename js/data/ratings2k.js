/**
 * NBA 2K–style attribute derivation from box-score seasons.
 *
 * Official per-attribute dumps for every historical season aren't redistributable
 * here; instead we mirror 2K's rating *scales* and position OVR weights, then
 * apply curated season anchors (launch OVRs / known attribute bands from
 * 2KRatings / HoopsHype / 2K Archive community data).
 *
 * Season year ≈ the NBA season end year that feeds that year's 2K roster
 * (e.g. 2013 stats → 2K14-ish band). Anchors override when bref+season match.
 * Career-arc shaping (careerArc.js) then nudges young athleticism vs vet IQ/pass/clutch.
 */

import { applyCareerArc } from "./careerArc.js";
import { SCRAPED_ANCHORS_2K } from "./ratings2k.scraped.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function softCap(x, soft, hard) {
  if (x <= soft) return x;
  return soft + (hard - soft) * (1 - Math.exp(-(x - soft) / (hard - soft + 8)));
}

/**
 * Hand-curated landmark seasons (phenomenon peaks, pre-archive gaps).
 * Keys: `${bref}:${season}` (season = NBA season end year).
 * Merged with SCRAPED_ANCHORS_2K below — scraped wins on conflict (最新为准).
 */
const HAND_ANCHORS_2K = {
  // Michael Jordan peak / early 90s
  // Peak Jordan = season OVR 100 (cap)
  "jordami01:1991": {
    ovr: 100,
    scoring: 100,
    three: 78,
    mid: 98,
    paint: 92,
    defense: 96,
    rebound: 62,
    pass: 80,
    speed: 94,
    strength: 74,
    stamina: 98,
    iq: 97,
    clutch: 100,
    steal: 94,
    block: 56,
  },
  "jordami01:1992": {
    ovr: 100,
    scoring: 99,
    three: 76,
    mid: 97,
    paint: 91,
    defense: 95,
    rebound: 60,
    pass: 78,
    speed: 93,
    strength: 74,
    stamina: 97,
    iq: 96,
    clutch: 99,
    steal: 92,
    block: 55,
  },
  "jordami01:1996": {
    ovr: 100,
    scoring: 99,
    three: 82,
    mid: 98,
    paint: 90,
    defense: 94,
    rebound: 58,
    pass: 76,
    speed: 90,
    strength: 76,
    stamina: 97,
    iq: 98,
    clutch: 100,
    steal: 90,
    block: 54,
  },
  // LeBron peaks
  "jamesle01:2013": {
    ovr: 99,
    scoring: 96,
    three: 78,
    mid: 86,
    paint: 95,
    defense: 94,
    rebound: 78,
    pass: 90,
    speed: 90,
    strength: 88,
    stamina: 97,
    iq: 95,
    clutch: 96,
    steal: 82,
    block: 62,
  },
  "jamesle01:2018": {
    ovr: 98,
    scoring: 96,
    three: 80,
    mid: 84,
    paint: 94,
    defense: 88,
    rebound: 76,
    pass: 92,
    speed: 86,
    strength: 86,
    stamina: 96,
    iq: 96,
    clutch: 97,
    steal: 78,
    block: 58,
  },
  // Stephen Curry splash years
  "curryst01:2016": {
    ovr: 98,
    scoring: 97,
    three: 99,
    mid: 92,
    paint: 78,
    defense: 72,
    rebound: 52,
    pass: 88,
    speed: 90,
    strength: 48,
    stamina: 94,
    iq: 94,
    clutch: 95,
    steal: 80,
    block: 35,
  },
  "curryst01:2021": {
    ovr: 96,
    scoring: 96,
    three: 99,
    mid: 90,
    paint: 76,
    defense: 70,
    rebound: 50,
    pass: 84,
    speed: 86,
    strength: 48,
    stamina: 92,
    iq: 95,
    clutch: 96,
    steal: 72,
    block: 32,
  },
  // NBA 2K25 launch band (Curry 95 / Booker 93) — ovr hints +1 so 0.94 blend lands on published
  "curryst01:2024": {
    ovr: 96,
    scoring: 95,
    three: 98,
    mid: 90,
    paint: 74,
    defense: 68,
    rebound: 48,
    pass: 82,
    speed: 82,
    strength: 48,
    stamina: 90,
    iq: 96,
    clutch: 96,
    steal: 68,
    block: 30,
  },
  "curryst01:2025": {
    ovr: 96,
    scoring: 94,
    three: 97,
    mid: 89,
    paint: 72,
    defense: 70,
    rebound: 48,
    pass: 84,
    speed: 80,
    strength: 48,
    stamina: 88,
    iq: 96,
    clutch: 95,
    steal: 72,
    block: 30,
  },
  "bookede01:2024": {
    ovr: 94,
    scoring: 95,
    three: 84,
    mid: 94,
    paint: 82,
    defense: 66,
    rebound: 46,
    pass: 82,
    speed: 82,
    strength: 58,
    stamina: 94,
    iq: 88,
    clutch: 92,
    steal: 68,
    block: 32,
  },
  "bookede01:2025": {
    ovr: 94,
    scoring: 94,
    three: 82,
    mid: 93,
    paint: 80,
    defense: 66,
    rebound: 44,
    pass: 84,
    speed: 80,
    strength: 58,
    stamina: 94,
    iq: 88,
    clutch: 91,
    steal: 68,
    block: 28,
  },
  // Shaq / Duncan / KG / Kobe / KD / Jokic / Giannis / Harden / Westbrook
  "onealsh01:2000": {
    ovr: 98,
    scoring: 96,
    three: 25,
    mid: 62,
    paint: 99,
    defense: 90,
    rebound: 95,
    pass: 58,
    speed: 68,
    strength: 99,
    stamina: 90,
    iq: 78,
    clutch: 88,
    steal: 48,
    block: 88,
  },
  "duncati01:2003": {
    ovr: 98,
    scoring: 92,
    three: 40,
    mid: 88,
    paint: 96,
    defense: 96,
    rebound: 94,
    pass: 72,
    speed: 58,
    strength: 90,
    stamina: 94,
    iq: 97,
    clutch: 94,
    steal: 62,
    block: 90,
  },
  "garneke01:2004": {
    ovr: 99,
    scoring: 94,
    three: 55,
    mid: 86,
    paint: 92,
    defense: 97,
    rebound: 96,
    pass: 78,
    speed: 78,
    strength: 88,
    stamina: 96,
    iq: 92,
    clutch: 90,
    steal: 78,
    block: 86,
  },
  "bryanko01:2006": {
    ovr: 98,
    scoring: 99,
    three: 82,
    mid: 97,
    paint: 88,
    defense: 86,
    rebound: 55,
    pass: 72,
    speed: 88,
    strength: 68,
    stamina: 95,
    iq: 92,
    clutch: 98,
    steal: 78,
    block: 45,
  },
  "bryanko01:2008": {
    ovr: 98,
    scoring: 97,
    three: 80,
    mid: 96,
    paint: 86,
    defense: 88,
    rebound: 54,
    pass: 74,
    speed: 86,
    strength: 70,
    stamina: 94,
    iq: 94,
    clutch: 97,
    steal: 76,
    block: 44,
  },
  "duranke01:2014": {
    ovr: 96,
    scoring: 97,
    three: 90,
    mid: 96,
    paint: 88,
    defense: 78,
    rebound: 70,
    pass: 72,
    speed: 82,
    strength: 68,
    stamina: 92,
    iq: 88,
    clutch: 94,
    steal: 62,
    block: 58,
  },
  "jokicni01:2023": {
    ovr: 98,
    scoring: 94,
    three: 82,
    mid: 90,
    paint: 96,
    defense: 78,
    rebound: 92,
    pass: 97,
    speed: 62,
    strength: 86,
    stamina: 94,
    iq: 99,
    clutch: 94,
    steal: 70,
    block: 55,
  },
  "antetgi01:2020": {
    ovr: 97,
    scoring: 95,
    three: 68,
    mid: 72,
    paint: 97,
    defense: 92,
    rebound: 90,
    pass: 78,
    speed: 90,
    strength: 94,
    stamina: 95,
    iq: 84,
    clutch: 90,
    steal: 72,
    block: 78,
  },
  "hardeja01:2019": {
    ovr: 97,
    scoring: 98,
    three: 88,
    mid: 86,
    paint: 92,
    defense: 68,
    rebound: 60,
    pass: 90,
    speed: 86,
    strength: 72,
    stamina: 96,
    iq: 92,
    clutch: 94,
    steal: 78,
    block: 48,
  },
  "westbru01:2017": {
    ovr: 95,
    scoring: 94,
    three: 72,
    mid: 78,
    paint: 90,
    defense: 72,
    rebound: 84,
    pass: 92,
    speed: 94,
    strength: 74,
    stamina: 97,
    iq: 82,
    clutch: 90,
    steal: 80,
    block: 42,
  },
  "howardw01:2009": {
    ovr: 94,
    scoring: 88,
    three: 28,
    mid: 48,
    paint: 95,
    defense: 92,
    rebound: 97,
    pass: 42,
    speed: 72,
    strength: 92,
    stamina: 92,
    iq: 68,
    clutch: 78,
    steal: 58,
    block: 92,
  },
  // T-Mac peak (Orlando) — twilight 2012 ATL is separate floor in legends.js
  "mcgratr01:2003": {
    ovr: 98,
    scoring: 98,
    three: 82,
    mid: 94,
    paint: 88,
    defense: 72,
    rebound: 70,
    pass: 78,
    speed: 90,
    strength: 68,
    stamina: 94,
    iq: 86,
    clutch: 95,
    steal: 70,
    block: 55,
  },
  "mcgratr01:2002": {
    ovr: 96,
    scoring: 96,
    three: 80,
    mid: 92,
    paint: 86,
    defense: 70,
    rebound: 72,
    pass: 76,
    speed: 90,
    strength: 66,
    stamina: 92,
    iq: 84,
    clutch: 92,
    steal: 68,
    block: 52,
  },
  // Serge Ibaka OKC — rim protector + mid-range (2013 BPG was wiped in scrape → patched 3.0)
  "ibakase01:2012": {
    ovr: 84,
    scoring: 76,
    three: 42,
    mid: 82,
    paint: 84,
    defense: 90,
    rebound: 80,
    pass: 38,
    speed: 68,
    strength: 82,
    stamina: 86,
    iq: 72,
    clutch: 70,
    steal: 48,
    block: 95,
  },
  "ibakase01:2013": {
    ovr: 86,
    scoring: 80,
    three: 58,
    mid: 86,
    paint: 88,
    defense: 92,
    rebound: 80,
    pass: 40,
    speed: 70,
    strength: 84,
    stamina: 90,
    iq: 74,
    clutch: 74,
    steal: 48,
    block: 96,
  },
  "ibakase01:2014": {
    ovr: 87,
    scoring: 82,
    three: 62,
    mid: 85,
    paint: 86,
    defense: 90,
    rebound: 84,
    pass: 44,
    speed: 70,
    strength: 84,
    stamina: 92,
    iq: 74,
    clutch: 76,
    steal: 50,
    block: 92,
  },
  "mutomdi01:2001": {
    ovr: 90,
    scoring: 62,
    three: 25,
    mid: 45,
    paint: 72,
    defense: 96,
    rebound: 88,
    pass: 48,
    speed: 58,
    strength: 86,
    stamina: 88,
    iq: 82,
    clutch: 70,
    steal: 48,
    block: 97,
  },
};

/**
 * Final anchor table: hand peaks first, then scraped 2K archive (2014+).
 * Same bref:season → scraped overwrites (later 2K edition already won inside scrape).
 */
export const RATING_ANCHORS_2K = {
  ...HAND_ANCHORS_2K,
  ...SCRAPED_ANCHORS_2K,
};

const ATTR_KEYS = [
  "scoring",
  "three",
  "mid",
  "paint",
  "defense",
  "rebound",
  "pass",
  "speed",
  "strength",
  "stamina",
  "iq",
  "clutch",
  "steal",
  "block",
];

/**
 * Approximate advanced rates from box score (no team-context RAPM dump available).
 * Used to punish empty volume ("弱队刷分") and reward efficient irreplaceability.
 */
export function advancedFromBox(r) {
  const ppg = +r.ppg || 0;
  const rpg = +r.rpg || 0;
  const apg = +r.apg || 0;
  const spg = +r.spg || 0;
  const bpg = +r.bpg || 0;
  const tpg = +r.tpg || 0;
  const fg = +r.fg || 0.42;
  const tp = +r.tp || 0;
  const ft = +r.ft || 0.75;
  const fga = Math.max(+r.fga || 1, 1);
  const tpa = Math.max(+r.tpa || 0, 0);
  const threeRate = tpa / fga;
  // eFG% ≈ FG% + 0.5 * 3P% * (3PA/FGA)
  const efg = clamp(fg + 0.5 * tp * threeRate, 0.28, 0.72);
  // Points per FGA (FTA missing → crude; still separates chuckers)
  const pps = clamp(ppg / fga, 0.7, 1.85);
  const astTo = apg / Math.max(tpg, 0.45);
  const stocks = spg + bpg;
  // High FGA with mediocre eFG = volume tax (stat-padding on bad teams)
  const volumeTax = Math.max(0, fga - 18) * Math.max(0, 0.535 - efg) * 55;
  // Multi-category impact — efficiency weighted, not raw counting
  // Efficient 34/9/10 ≈ mid-50s peri; empty 32ppg chucker stays lower after tax
  const periVal =
    ppg * (0.55 + efg * 0.95) +
    rpg * 0.55 +
    apg * (0.9 + Math.min(astTo, 3.2) * 0.14) +
    stocks * 2.2 -
    tpg * 1.05 -
    volumeTax;
  return { efg, pps, astTo, stocks, volumeTax, periVal, fga, threeRate, ft };
}

/**
 * Core: box score → season attributes.
 * Efficiency + irreplaceability > empty counting stats.
 * Formula path soft-caps below phenomenon band; 98–100 need curated anchors.
 */
export function attrsFromBoxScore2K(r) {
  const ppg = +r.ppg || 0;
  const rpg = +r.rpg || 0;
  const apg = +r.apg || 0;
  const spg = +r.spg || 0;
  const bpg = +r.bpg || 0;
  const tpg = +r.tpg || 0;
  const mpg = +r.mpg || 15;
  const gp = +r.gp || 20;
  const fg = +r.fg || 0.42;
  const tp = +r.tp || 0;
  const ft = +r.ft || 0.75;
  const fga = Math.max(+r.fga || 1, 1);
  const tpa = +r.tpa || 0;
  const pos = r.pos || "SF";
  const threeRate = tpa / fga;
  const isBig = pos === "C" || pos === "PF";
  const isGuard = pos === "PG" || pos === "SG";
  const adv = advancedFromBox(r);

  // —— Scoring: efficiency-first. High FGA alone no longer buys mid-90s. ——
  // Anchors: efficient 22→84, 27/efg.54→91, empty 32/efg.48→88, elite 30/efg.56→94
  let scoring =
    40 +
    adv.periVal * 0.48 +
    ppg * 0.62 +
    (adv.efg - 0.48) * 65 +
    (adv.pps - 1.18) * 26 +
    Math.min(fga, 20) * 0.2;
  scoring += ft >= 0.85 ? 2 : ft < 0.65 ? -2.5 : 0;
  scoring -= adv.volumeTax * 0.5;
  // Formula almost never hands out 97–100 scoring without an anchor
  scoring = clamp(Math.round(softCap(scoring, 92, 97)), 25, 97);

  // —— Three-Point Shot ——
  // Volume + accuracy. Non-shooting bigs crushed (Howard/Shaq band 25–35).
  let three = 18 + tp * 105 + Math.min(tpa, 11) * 3.8;
  if (tp >= 0.37 && tpa >= 2) three += 6;
  if (tp >= 0.4 && tpa >= 4) three += 5;
  if (tp >= 0.42 && tpa >= 6) three += 4;
  if (tpa < 0.4) three = Math.min(three, isBig ? 32 : 42);
  if (tpa < 1.0 && isBig) three = Math.min(three, 38);
  if (tpa < 0.2) three = Math.min(three, 28);
  if (tp < 0.3 && tpa >= 2) three -= 8;
  // Volume threes at mediocre % shouldn't max the bar
  if (tpa >= 8 && tp < 0.37) three = Math.min(three, 88);
  if (tpa >= 10 && tp < 0.39) three = Math.min(three, 90);
  three = clamp(Math.round(softCap(three, 92, 97)), 18, 97);

  // —— Mid-Range ——
  // High for mid assassins / classic scorers; modern three-hunters slightly lower.
  // Usage floor: low-minute bench players shouldn't sit in the 80s on FG% alone.
  let mid = 28 + fg * 55 + (1 - Math.min(threeRate, 0.6)) * 16 + Math.min(ppg, 28) * 0.85;
  if (threeRate > 0.45) mid -= 6;
  if (ppg >= 22 && threeRate < 0.35) mid += 5;
  if (ppg < 8) mid = Math.min(mid, 62);
  if (ppg < 12) mid = Math.min(mid, 72);
  mid = clamp(Math.round(softCap(mid, 93, 100)), 28, 100);

  // —— Paint / Close Shot ——
  let paint =
    26 +
    fg * 58 +
    (isBig ? 14 : isGuard ? 2 : 6) +
    Math.min(ppg, 28) * 0.75 +
    (1 - Math.min(threeRate, 0.55)) * 8;
  if (fg >= 0.55 && isBig && ppg >= 12) paint += 6;
  if (ppg < 8) paint = Math.min(paint, 64);
  if (ppg < 12 && !isBig) paint = Math.min(paint, 72);
  paint = clamp(Math.round(softCap(paint, 95, 100)), 28, 100);

  // —— Defense (blend perimeter + interior like 2K's single-card readout) ——
  // Stocks matter; high-usage scorers get a mild floor, not elite D.
  let defense =
    38 +
    spg * 8.5 +
    bpg * 10 +
    (mpg > 34 ? 4 : mpg > 30 ? 2 : 0) +
    (isBig ? bpg * 2 : spg * 1.5);
  if (spg + bpg >= 2.5) defense += 6;
  if (ppg >= 26 && spg + bpg < 1.5) defense = Math.min(defense, 82);
  if (ppg >= 28 && spg + bpg < 1.2) defense = Math.min(defense, 78);
  defense = clamp(Math.round(softCap(defense, 92, 97)), 25, 97);

  // —— Rebound ——
  let rebound =
    14 +
    Math.pow(Math.max(rpg, 0), 1.18) * 4.8 +
    Math.min(rpg, 18) * 1.1 +
    (pos === "C" ? 12 : pos === "PF" ? 8 : pos === "SF" ? 0 : -10);
  if (rpg >= 14) rebound += 8;
  else if (rpg >= 11) rebound += 5;
  else if (rpg >= 9) rebound += 2;
  rebound = clamp(Math.round(softCap(rebound, 95, 100)), 12, 100);

  // —— Pass Accuracy (AST/TO matters more than raw APG) ——
  let pass = 30 + apg * 5.6 - tpg * 3.4 + Math.min(adv.astTo, 3.5) * 4.5;
  if (apg >= 8 && adv.astTo >= 2.2) pass += 4;
  if (apg >= 10 && adv.astTo >= 2.4) pass += 4;
  if (apg >= 11 && adv.astTo >= 2.6) pass += 3;
  if (pos === "PG") pass += 3;
  if (isBig && apg >= 5 && adv.astTo >= 2) pass += 6; // Jokic-class
  if (tpg >= 4 && adv.astTo < 2.2) pass -= 5; // high-usage careless
  pass = clamp(Math.round(softCap(pass, 93, 98)), 20, 98);

  // —— Speed / Acceleration ——
  let speed =
    44 +
    (pos === "PG" ? 22 : pos === "SG" ? 16 : pos === "SF" ? 10 : pos === "PF" ? 2 : -6) +
    spg * 5.5 -
    (rpg > 12 ? 8 : rpg > 10 ? 4 : 0) -
    (ppg > 28 && isBig ? 2 : 0);
  speed = clamp(Math.round(softCap(speed, 92, 97)), 30, 97);

  // —— Strength ——
  // 吨位 ≠ 身高/护框。Gobert、Robert Williams 这类瘦高长臂靠盖帽与站位，
  // 不能因为 C + 篮板就给到壮汉级力量；低位得分怪兽（恩比德）才堆力量。
  let strength =
    38 +
    (pos === "C" ? 18 : pos === "PF" ? 14 : pos === "SF" ? 8 : 0) +
    rpg * 0.95 +
    (isBig && ppg >= 18 ? Math.min(7, (ppg - 16) * 0.55) : 0);
  if (isBig && fg >= 0.55 && ppg >= 14) strength += 3;
  if (isBig && fg >= 0.58 && ppg >= 20) strength += 4;
  // 低位造杀伤的主攻大中锋才堆吨位（恩比德），与护框长人分开
  if (isBig && ppg >= 24 && fga >= 15) strength += 6;
  if (isBig && ppg >= 28) strength += 4;
  // 瘦高护框：帽多、得分不高 → 抽掉“中锋默认壮”
  if (isBig && bpg >= 1.6 && ppg < 17) strength -= 7;
  if (isBig && bpg >= 2.0 && ppg < 15) strength -= 5;
  if (isBig && bpg >= 1.4 && spg >= 0.7 && ppg < 14) strength -= 3; // Timelord 类机动内线
  if (isBig && tpa >= 1.5 && tp >= 0.34) strength -= 2; // 空间型长人更偏瘦
  strength = clamp(Math.round(softCap(strength, 94, 99)), 28, 99);

  // —— Stamina ——
  let stamina = 40 + mpg * 1.35 + Math.min(gp, 78) * 0.2;
  if (mpg >= 38) stamina += 4;
  stamina = clamp(Math.round(softCap(stamina, 94, 98)), 35, 98);

  // —— IQ / Basketball IQ ——
  let iq =
    44 +
    apg * 2.2 +
    (adv.efg >= 0.54 ? 7 : adv.efg >= 0.5 ? 4 : adv.efg < 0.46 ? -4 : 0) +
    (adv.astTo >= 2.5 ? 5 : adv.astTo < 1.5 ? -3 : 0) +
    (tpg > 4 ? -5 : tpg < 2.2 ? 3 : 0) +
    Math.min(adv.periVal, 48) * 0.22;
  iq = clamp(Math.round(softCap(iq, 93, 98)), 35, 98);

  // —— Clutch: impact + efficiency, not "scored a lot so clutch" ——
  let clutch =
    38 +
    Math.min(adv.periVal, 50) * 0.55 +
    (adv.efg - 0.48) * 40 +
    apg * 0.7 +
    (adv.astTo >= 2.3 ? 3 : 0);
  if (ppg >= 28 && adv.efg < 0.5) clutch -= 6; // volume star ≠ automatic ice
  clutch = clamp(Math.round(softCap(clutch, 92, 97)), 30, 97);

  // —— Steal / Block (2K lateral ratings) ——
  let steal = 26 + spg * 30;
  if (spg >= 2.0) steal += 4;
  steal = clamp(Math.round(softCap(steal, 92, 97)), 15, 97);

  let block = 20 + bpg * 34;
  if (bpg >= 2.5) block += 5;
  if (!isBig) block = Math.min(block, 70);
  block = clamp(Math.round(softCap(block, 93, 98)), 10, 98);

  return {
    scoring,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    stamina,
    iq,
    clutch,
    steal,
    block,
  };
}

/**
 * Position-weighted OVR. Formula path soft-caps below phenomenon tier;
 * 98–100 reserved for curated anchors (Jordan / peak legends).
 */
export function overallFrom2KAttrs(attrs, pos = "SF", raw = null, opts = {}) {
  const a = attrs;
  const shoot = (a.three + a.mid + a.paint) / 3;
  const offense = a.scoring * 0.5 + shoot * 0.28 + a.pass * 0.12 + a.iq * 0.1;
  const defense = a.defense * 0.5 + a.steal * 0.17 + a.block * 0.17 + a.rebound * 0.16;
  const athletic = a.speed * 0.45 + a.strength * 0.25 + a.stamina * 0.3;
  const mental = a.clutch * 0.55 + a.iq * 0.45;

  let wOff = 0.52;
  let wDef = 0.2;
  let wAth = 0.14;
  let wMen = 0.14;
  if (pos === "PG") {
    wOff = 0.54;
    wDef = 0.18;
    wAth = 0.15;
  } else if (pos === "C") {
    wOff = 0.42;
    wDef = 0.3;
    wAth = 0.14;
  } else if (pos === "PF") {
    wOff = 0.46;
    wDef = 0.26;
  } else if (pos === "SG") {
    wOff = 0.54;
    wDef = 0.18;
  }

  let ovr = offense * wOff + defense * wDef + athletic * wAth + mental * wMen;

  // Soft floors from efficient impact — never a free ticket to 98+
  if (raw) {
    ovr = Math.max(ovr, impactOvrFloor(raw));
  }

  // Formula ceiling: phenomenon 98–100 only via anchors
  if (opts.uncapped) return clamp(Math.round(ovr), 40, 100);
  return clamp(Math.round(Math.min(ovr, 97)), 40, 97);
}

/**
 * Efficiency-aware OVR floor. High PPG on bad eFG does not unlock MVP bands.
 */
export function impactOvrFloor(raw) {
  const adv = advancedFromBox(raw);
  const ppg = +raw.ppg || 0;
  const v = adv.periVal;
  const efg = adv.efg;
  // Historic efficient monsters (formula can touch 96, not 99)
  if (v >= 62 && efg >= 0.56 && ppg >= 28 && adv.pps >= 1.32) return 96;
  if (v >= 56 && efg >= 0.54 && ppg >= 27 && adv.volumeTax < 5) return 95;
  if (v >= 52 && efg >= 0.52 && ppg >= 26) return 94;
  if (v >= 48 && efg >= 0.51 && ppg >= 24) return 92;
  if (v >= 44 && efg >= 0.5 && ppg >= 22) return 90;
  if (v >= 38 && ppg >= 18) return 85;
  if (v >= 32 && ppg >= 14) return 78;
  if (v >= 24 && ppg >= 10) return 72;
  // Empty volume: usage star, but hard-capped below MVP band
  if (ppg >= 32 && efg < 0.5) return 87;
  if (ppg >= 28 && efg < 0.5) return 85;
  return 0;
}

/** 已知瘦高护框：力量硬顶（再高的盖帽/篮板也不写成壮汉）. */
const LEAN_RIM_PROTECTOR_STRENGTH_CAP = {
  goberru01: 72, // Rudy Gobert
  williro04: 70, // Robert Williams III
};

export function lookupAnchor2K(r) {
  const bref = r.bref || "";
  const season = r.season;
  if (!bref || !season) return null;
  return RATING_ANCHORS_2K[`${bref}:${season}`] || null;
}

function applyLeanBigStrengthCap(attrs, r) {
  const cap = LEAN_RIM_PROTECTOR_STRENGTH_CAP[r?.bref || ""];
  if (cap == null || !attrs) return attrs;
  if ((attrs.strength || 0) > cap) attrs.strength = cap;
  return attrs;
}

/**
 * Merge formula attrs with optional anchor (anchor wins on provided keys),
 * then shape by career age (rookie bounce vs vet IQ / pass / clutch).
 * Returns { attrs, ovrHint, source, age, careerPhase, careerPhaseLabel }.
 */
export function resolve2KRatings(r) {
  const base = applyLeanBigStrengthCap(attrsFromBoxScore2K(r), r);
  const anchor = lookupAnchor2K(r);
  let attrs = base;
  let source = "formula";
  let ovrHint;
  if (anchor) {
    attrs = { ...base };
    for (const k of ATTR_KEYS) {
      if (anchor[k] != null) attrs[k] = clamp(Math.round(anchor[k]), 10, 100);
    }
    // 锚点若漏写 strength，仍用瘦高顶；锚点显式给了更高力量则尊重锚点
    if (anchor.strength == null) applyLeanBigStrengthCap(attrs, r);
    source = "anchor";
    ovrHint = anchor.ovr != null ? anchor.ovr : null;
  }
  const arc = applyCareerArc(attrs, r, { anchored: source === "anchor" });
  attrs = arc.attrs;
  if (source !== "anchor" || anchor?.strength == null) applyLeanBigStrengthCap(attrs, r);
  if (ovrHint == null) ovrHint = overallFrom2KAttrs(attrs, r.pos || "SF", r);
  else {
    // Trust published / scraped 2K OVR (attrs still shape in-game feel)
    ovrHint = clamp(Math.round(ovrHint), 40, 100);
  }
  return {
    attrs,
    ovrHint,
    source,
    age: arc.age,
    careerPhase: arc.careerPhase,
    careerPhaseLabel: arc.careerPhaseLabel,
  };
}
