/**
 * 能力值体现不出的「暗属性」——不进 OVR，但强烈影响模拟。
 * 同一张赛季卡用 bref+season 稳定随机，保证可复现。
 */
import { careerArcIntangibleBias, estimateAge } from "./careerArc.js";

export const INTANGIBLE_DEFS = {
  gravity: { name: "引力", desc: "吸引协防，给队友创造空位" },
  shotCreation: { name: "自主造投", desc: "强干扰下仍能挤出出手" },
  toughness: { name: "硬气", desc: "高疲劳时仍能维持效率" },
  leadership: { name: "领袖气场", desc: "在场抬升全队士气与专注" },
  motor: { name: "马达", desc: "二次争抢、回防更积极" },
  composure: { name: "抗压冷静", desc: "关键回合降低失误" },
  killerInstinct: { name: "杀手本能", desc: "分差胶着/末节命中加成" },
  switchability: { name: "换防弹性", desc: "防错位不至于崩盘" },
  chemistryMagnet: { name: "化学反应核", desc: "在场显著提升阵容化学反应" },
  clutchVision: { name: "决胜视野", desc: "关键球更容易找到最优选择" },
  /** 越高越容易在晋级赛中受伤缺阵（波尔津吉斯类） */
  injuryRisk: { name: "伤病风险", desc: "晋级赛连续作战时更容易受伤缺席" },
  /** 真实比赛影响力——纸面数据体现不出；妖人高、高薪低能低 */
  winningImpact: { name: "致胜成色", desc: "关键球与体系贡献，决定贵不贵是否好用" },
  /** 隐藏上限——纸面巨星若此项低，会被拖成「看起来强、打起来一般」；对的体系可部分解锁 */
  ceiling: { name: "隐藏上限", desc: "限制纸面→效率；高薪低能在对口体系/教练下可解锁接近身价" },
  /** 持球依赖——越高越需要球权才能发挥（威少类）；可把另一人设无球化解 */
  ballNeed: {
    name: "持球依赖",
    desc: "需要控球发动才有效；双核同场可把一人设成无球定点，不必硬冲突",
  },
  /** 无球能力——越高越能在旁观者角色里开火（汤普森/科沃尔类） */
  offBall: {
    name: "无球能力",
    desc: "离球跑位、接球就投、空切；有大核时吃香。无球能力差时设无球仍可共存，但火力会被间接削弱",
  },
  /** 体系适配——妖人普遍高；高薪低能偏低，更挑教练与战术 */
  systemAdapt: { name: "体系适配", desc: "换体系仍能贡献的能力；吉诺比利类高，恩比德类更挑体系" },
};

/** 持球大核 / 球权饥渴 */
export const BALL_HOG_BREF = {
  westbru01: 28, // Westbrook
  doncilu01: 26, // Doncic
  hardeti01: 24, // Harden
  irvinky01: 18,
  iversal01: 22,
  paulch01: 16,
  foxde01: 17,
  moranja01: 15,
  youngtr01: 20,
  lillada01: 17,
  walljo01: 16,
  roseede01: 14,
  rosede01: 18,
  bryantko01: 14,
  jordami01: 12,
  onealsh01: 10,
};

/** 无球射手 / 体系齿轮 */
export const OFF_BALL_BREF = {
  thompkl01: 22, // Klay
  korveky01: 24,
  redicjj01: 20,
  bowenbr01: 18,
  allenra02: 16,
  millspa01: 10,
  greendr01: 8, // Dray more connector but off-ball gravity
  horfoal01: 12,
  ginobem01: 14,
  belinma01: 16,
  batumni01: 12,
  harruto01: 11,
  duranke01: 18, // KD: catch-and-shoot / size spacer — true plug-and-play
  jamesle01: 6, // can play off-ball but prefers creation
  antetgi01: 5,
};

/**
 * Approximate league-average salary by season (USD, nominal).
 * Used only as a relative scale for market pricing — not real payroll data.
 */
export const LEAGUE_AVG_SALARY = [
  [1955, 8000],
  [1965, 18000],
  [1975, 90000],
  [1985, 350000],
  [1990, 750000],
  [1995, 1800000],
  [2000, 3200000],
  [2005, 4500000],
  [2010, 5300000],
  [2015, 5000000],
  [2017, 7100000],
  [2019, 8300000],
  [2021, 9100000],
  [2023, 11000000],
  [2025, 12500000],
];

/** 妖人候选加成：只有够高才会进「妖人」档（其余只是略便宜的好轮换） */
export const BARGAIN_BREF = {
  ginobem01: 22, // Manu
  ginobili: 22,
  bowenbr01: 18,
  battish01: 16,
  korveky01: 15,
  parketo01: 15, // Tony Parker
  belinma01: 14,
  millspa01: 13,
  arizatr01: 13,
  lowryky01: 12,
  crowdae01: 11,
  crowdda01: 11,
  fisherde01: 10,
  conleymi01: 10,
  dragicg01: 9,
  millspa02: 9,
  hilarne01: 9,
  billuro01: 8,
  ibakase01: 8,
  greenege02: 8,
  nashst01: 7,
  allenra02: 6,
};

/** 高薪低能 / 纸面强上限低：恩比德、Fox 等 */
export const OVERPAID_BREF = {
  embiijo01: 20,
  foxde01: 22, // De'Aaron Fox
  westbru01: 16,
  walljo01: 14,
  simmobe01: 18,
  aytonde01: 17,
  wisemde01: 19,
  fultzma01: 18,
  wiggian01: 12, // early max years
  irvinky01: 10,
  russeda01: 11,
  ballla01: 12,
  smithja08: 10, // Jabari late?
  porzikr01: 8, // also glass — expensive when healthy on paper
  bamba01: 14,
};

/** Known fragile / load-managed stars — bref id → risk bump */
export const GLASS_CANNON_BREF = {
  porzikr01: 32, // Kristaps Porzingis
  embiijo01: 18,
  davisan02: 16,
  rosede01: 26,
  griffbl01: 17,
  walljo01: 20,
  bargnan01: 14,
  yao01: 22,
  mingya01: 22,
  ballzi01: 19, // Zion
  wembyvi01: 15,
  wembany01: 15,
  leonardk01: 14, // Kawhi load management
  duranke01: 12,
  ilyasbe01: 16,
  bargoke01: 14,
  gasolpa01: 10,
  cityge01: 12,
  boshch01: 14,
  oquinky01: 13,
  bolbo01: 18,
  shaunli01: 11,
};

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd(seed, i) {
  let x = (seed + i * 9973) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Attach intangibles object (0–99) onto a player card. */
export function attachIntangibles(player) {
  const seed = hashSeed(`${player.bref || player.id}|${player.season}|${player.name}`);
  const base = (key, bias = 50) => clamp(Math.round(bias + (rnd(seed, key.length + bias) - 0.5) * 40), 15, 96);
  const age = player.age ?? estimateAge({ bref: player.bref, season: player.season });
  const arcBias = careerArcIntangibleBias(age);

  // Injury risk: low stamina / sparse GP seasons / known glass bodies
  const gp = player.raw?.gp ?? 70;
  const mpg = player.raw?.mpg ?? 20;
  const glassBump = glassBumpFor(player);
  let injuryBias =
    38 +
    (100 - (player.stamina || 50)) * 0.25 +
    (100 - (player.strength || 50)) * 0.08 +
    (gp < 50 ? (50 - gp) * 0.35 : 0) +
    (mpg > 34 && gp < 60 ? 12 : 0) +
    glassBump;

  const bargainBump = bargainBumpFor(player);
  const overpaidBump = overpaidBumpFor(player);
  const ppg = player.raw?.ppg ?? 0;
  const apg = player.raw?.apg ?? 0;
  const tpg = player.raw?.tpg ?? 2;
  // Efficiency proxy: scoring + playmaking per turnover / minutes
  const eff =
    (ppg + apg * 1.2 + (player.raw?.spg || 0) * 1.5 + (player.raw?.bpg || 0) * 1.2) /
    Math.max(mpg / 36, 0.35);

  // Winning impact: not the same as box-score OVR
  let impactBias =
    42 +
    eff * 4.5 +
    (player.iq || 50) * 0.12 +
    (player.personality?.team || 50) * 0.1 -
    tpg * 2.5 -
    glassBump * 0.25 +
    bargainBump * 0.9 -
    overpaidBump * 0.85;

  // Ceiling: paper stars with drama/availability/ego get capped
  let ceilingBias =
    55 +
    (player.iq || 50) * 0.15 +
    (player.stamina || 50) * 0.12 +
    bargainBump * 0.35 -
    overpaidBump * 1.1 -
    glassBump * 0.35 -
    Math.max(0, (player.personality?.ego || 50) - 70) * 0.35;

  const intangibles = {
    gravity: base("gravity", 40 + (player.scoring || 50) * 0.25 + (player.three || 40) * 0.15),
    shotCreation: base("shot", 35 + (player.scoring || 50) * 0.35 + (player.mid || 50) * 0.1),
    toughness: base("tough", 45 + (player.strength || 50) * 0.2 + (player.stamina || 50) * 0.15),
    leadership: base("lead", 40 + (player.personality?.team || 50) * 0.25 + (player.iq || 50) * 0.15),
    motor: base("motor", 45 + (player.steal || 40) * 0.15 + (player.rebound || 50) * 0.15),
    composure: base("comp", 40 + (player.personality?.calm || 50) * 0.35 + (player.iq || 50) * 0.1),
    killerInstinct: base("kill", 40 + (player.clutch || 50) * 0.4),
    switchability: base("sw", 40 + (player.defense || 50) * 0.2 + (player.speed || 50) * 0.2),
    chemistryMagnet: base("chem", 40 + (player.pass || 50) * 0.2 + (player.personality?.team || 50) * 0.25),
    clutchVision: base("vision", 40 + (player.pass || 50) * 0.25 + (player.iq || 50) * 0.25),
    injuryRisk: base("inj", injuryBias),
    winningImpact: base("win", impactBias),
    ceiling: base("ceil", ceilingBias),
    // Tighter RNG for role attrs — too much noise breaks dual-core clash detection
    ballNeed: clamp(Math.round(ballNeedBiasFor(player, ppg, apg, tpg, mpg) + (rnd(seed, 11) - 0.5) * 12), 15, 96),
    offBall: clamp(Math.round(offBallBiasFor(player, ppg, apg) + (rnd(seed, 13) - 0.5) * 12), 15, 96),
    systemAdapt: clamp(
      Math.round(systemAdaptBiasFor(player, bargainBump, overpaidBump) + (rnd(seed, 17) - 0.5) * 10),
      15,
      96
    ),
  };

  // Career age: rookies = motor; vets = leadership / composure / killer instinct
  for (const [k, delta] of Object.entries(arcBias || {})) {
    if (intangibles[k] == null || !delta) continue;
    intangibles[k] = clamp(intangibles[k] + delta, 15, 99);
  }

  // Archetype flavor bumps
  const arch = player.archetype || "";
  if (arch.includes("shooter") || arch.includes("spacing")) {
    intangibles.gravity = clamp(intangibles.gravity + 8, 15, 99);
    intangibles.offBall = clamp(intangibles.offBall + 12, 20, 99);
    intangibles.ballNeed = clamp(intangibles.ballNeed - 8, 15, 90);
  }
  // KD-type: on-ball or off-ball, size mismatch, high system fit (mercenary / plug-and-play)
  if (arch.includes("versatile_scorer")) {
    intangibles.gravity = clamp(intangibles.gravity + 10, 15, 99);
    intangibles.shotCreation = clamp(intangibles.shotCreation + 12, 15, 99);
    intangibles.offBall = clamp(intangibles.offBall + 14, 40, 99);
    intangibles.ballNeed = clamp(intangibles.ballNeed - 6, 28, 68);
    intangibles.systemAdapt = clamp(intangibles.systemAdapt + 16, 55, 99);
    intangibles.switchability = clamp(intangibles.switchability + 10, 40, 99);
    intangibles.winningImpact = clamp(intangibles.winningImpact + 8, 55, 99);
    intangibles.ceiling = clamp(intangibles.ceiling + 12, 60, 99);
    intangibles.killerInstinct = clamp(intangibles.killerInstinct + 6, 40, 99);
  }
  if (arch.includes("iso") || arch.includes("mamba") || arch.includes("goat")) {
    intangibles.shotCreation = clamp(intangibles.shotCreation + 10, 15, 99);
    intangibles.killerInstinct = clamp(intangibles.killerInstinct + 8, 15, 99);
    intangibles.ballNeed = clamp(intangibles.ballNeed + 14, 25, 99);
    intangibles.offBall = clamp(intangibles.offBall - 10, 15, 90);
  }
  if (arch.includes("connector") || arch.includes("floor_general") || arch.includes("playmaking")) {
    intangibles.chemistryMagnet = clamp(intangibles.chemistryMagnet + 10, 15, 99);
    intangibles.clutchVision = clamp(intangibles.clutchVision + 8, 15, 99);
    intangibles.winningImpact = clamp(intangibles.winningImpact + 6, 15, 99);
  }
  if (arch.includes("floor_general") || arch.includes("iso_creator") || arch.includes("engine")) {
    intangibles.ballNeed = clamp(intangibles.ballNeed + 10, 25, 99);
  }
  if (arch.includes("pest") || arch.includes("two_way")) {
    intangibles.motor = clamp(intangibles.motor + 8, 15, 99);
    intangibles.switchability = clamp(intangibles.switchability + 10, 15, 99);
  }

  // 全能换防核（詹姆斯等）：换防弹性拉满
  if (
    (player.skills || []).includes("positionless") ||
    String(player.bref || "").toLowerCase() === "jamesle01"
  ) {
    intangibles.switchability = clamp(Math.max(intangibles.switchability, 92), 88, 99);
    intangibles.systemAdapt = clamp(intangibles.systemAdapt + 10, 55, 99);
  }

  // Named fingerprints
  const hog = ballHogBumpFor(player);
  const spacer = offBallBumpFor(player);
  if (hog) {
    // Ball-dominant stars (Westbrook / Luka): high need, poor off-ball
    intangibles.ballNeed = clamp(intangibles.ballNeed + hog, 72, 99);
    intangibles.offBall = clamp(intangibles.offBall - hog * 0.85, 12, 48);
  }
  if (spacer) {
    intangibles.offBall = clamp(intangibles.offBall + spacer, 55, 99);
    intangibles.ballNeed = clamp(intangibles.ballNeed - spacer * 0.35, 12, 75);
  }
  // Stat-driven: usage monsters without catch-shoot profile stay ball-hungry
  if (ppg >= 22 && apg >= 7 && (player.three || 0) < 78) {
    intangibles.ballNeed = clamp(Math.max(intangibles.ballNeed, 78), 78, 99);
    intangibles.offBall = clamp(Math.min(intangibles.offBall, 52), 12, 52);
  }
  // Bigs with high minutes historically wear down
  if (["C", "PF"].includes(player.pos) && mpg >= 32) {
    intangibles.injuryRisk = clamp(intangibles.injuryRisk + 6, 15, 99);
  }

  // Force archetype fingerprints so paper stars can still be "不好用"
  if (overpaidBump >= 14) {
    intangibles.winningImpact = clamp(intangibles.winningImpact - overpaidBump * 1.35, 28, 66);
    intangibles.ceiling = clamp(intangibles.ceiling - overpaidBump * 1.5, 22, 58);
    intangibles.composure = clamp(intangibles.composure - 8, 20, 90);
    // Still talented — just picky. Low adapt, unlocked by the right coach/tactic.
    intangibles.systemAdapt = clamp(intangibles.systemAdapt - overpaidBump * 0.55, 18, 58);
  }
  // Only strong named bargains get fingerprint lifts (Manu-tier, not every depth guy)
  if (bargainBump >= 16) {
    intangibles.winningImpact = clamp(intangibles.winningImpact + bargainBump * 0.7, 68, 99);
    intangibles.ceiling = clamp(intangibles.ceiling + 10, 62, 99);
    intangibles.chemistryMagnet = clamp(intangibles.chemistryMagnet + 6, 20, 99);
    intangibles.systemAdapt = clamp(intangibles.systemAdapt + bargainBump * 0.9, 70, 99);
  }

  // Market salary vs league average (relative contract size)
  const market = estimateMarketContract(player, intangibles);
  player.market = market;

  player.intangibles = intangibles;
  const tags = new Set(player.tags || []);
  if (intangibles.injuryRisk >= 68 || glassBump >= 20) tags.add("玻璃人");
  else if (intangibles.injuryRisk <= 32) tags.add("铁人");

  // Value archetype from salary multiple vs true impact
  const value = classifyValueArchetype(
    market.salaryMult,
    intangibles.winningImpact,
    intangibles.ceiling,
    { overpaidBump, bargainBump },
    intangibles.systemAdapt
  );
  player.valueArchetype = value.id;
  // 「妖人」是隐藏发现项，不写入可见 tags；高薪低能仍可标注
  if (value.tag && value.id !== "bargain") tags.add(value.tag);
  tags.delete("妖人");
  player.tags = [...tags].slice(0, 4);
  return player;
}

export function leagueAvgSalary(season) {
  const y = Number(season) || 2000;
  const table = LEAGUE_AVG_SALARY;
  if (y <= table[0][0]) return table[0][1];
  if (y >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [y0, s0] = table[i];
    const [y1, s1] = table[i + 1];
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      return Math.round(s0 + (s1 - s0) * t);
    }
  }
  return 5000000;
}

/**
 * Estimate that season's contract as a multiple of league-average salary.
 * Stars / high-usage → higher mult; role bargains stay near or below 1.0.
 */
export function estimateMarketContract(player, intangibles = player.intangibles || {}) {
  const season = player.season || 2000;
  const avg = leagueAvgSalary(season);
  const ppg = player.raw?.ppg ?? 0;
  const mpg = player.raw?.mpg ?? 20;
  const gp = player.raw?.gp ?? 60;
  const tier = player.hiddenTier || "bench";

  let mult = 0.55;
  if (tier === "water_cooler" || tier === "undrafted_gleague") mult = 0.35;
  else if (tier === "bench") mult = 0.55;
  else if (tier === "starter") mult = 0.95;
  else if (tier === "star") mult = 1.55;
  else if (tier === "allstar") mult = 2.35;
  else if (tier === "superstar" || tier === "hof" || tier === "nba50") mult = 3.25;

  // Usage / scoring inflation (Fox-type scoring PG gets paid)
  mult += Math.max(0, ppg - 12) * 0.055;
  mult += Math.max(0, mpg - 28) * 0.025;
  if (ppg >= 22 && ["PG", "SG"].includes(player.pos)) mult += 0.35; // lead-guard max deals
  if (ppg >= 27) mult += 0.45; // franchise scorer tax
  if (gp < 50) mult *= 0.92; // shorter deals / injury years slightly cheaper on market average

  const over = overpaidBumpFor(player);
  const bargain = bargainBumpFor(player);
  // Overpaid names: market loves the brand → salary ahead of impact
  mult *= 1 + over * 0.028;
  // Bargains: sixth-man deals / team-friendly — market underprices them
  mult *= 1 - bargain * 0.016;

  // Paper aura (leadership/gravity) slightly lifts asking price without guaranteeing impact
  const aura = ((intangibles.gravity || 50) + (intangibles.leadership || 50)) / 200;
  mult *= 0.92 + aura * 0.2;

  mult = clamp(mult, 0.2, 4.8);
  const salaryEst = Math.round(avg * mult);
  return {
    leagueAvg: avg,
    salaryEst,
    salaryMult: Math.round(mult * 100) / 100,
    season,
  };
}

function classifyValueArchetype(salaryMult, winningImpact, ceiling, bumps = {}, systemAdapt = 50) {
  const impact = winningImpact ?? 50;
  const ceil = ceiling ?? 50;
  const adapt = systemAdapt ?? 50;
  const { overpaidBump = 0, bargainBump = 0 } = bumps;
  // 妖人：稀有。必须同时便宜 + 成色/上限/体系适配明显超出身价（吉诺比利级）
  if (bargainBump >= 18 && salaryMult <= 1.25 && impact >= 78 && ceil >= 72 && adapt >= 72) {
    return { id: "bargain", tag: "妖人", label: "性价比妖人" };
  }
  if (bargainBump >= 14 && salaryMult <= 1.1 && impact >= 82 && ceil >= 76 && adapt >= 74) {
    return { id: "bargain", tag: "妖人", label: "性价比妖人" };
  }
  // 无名单加成：极苛刻的纯统计路径（以前 impact≥62 太松）
  if (
    bargainBump === 0 &&
    salaryMult <= 0.92 &&
    impact >= 86 &&
    ceil >= 80 &&
    adapt >= 76
  ) {
    return { id: "bargain", tag: "妖人", label: "性价比妖人" };
  }
  // True impact monsters (Finals KD / MVP) are never "高薪低能"
  if (impact >= 88 && ceil >= 62) {
    return { id: "fair_plus", tag: null, label: "报价合理偏强" };
  }
  // 高薪低能：贵、纸面可以，但成色/上限拖后腿
  if (overpaidBump >= 16 && salaryMult >= 1.7 && impact < 80) {
    return { id: "overpaid", tag: "高薪低能", label: "高薪低能" };
  }
  if (salaryMult >= 2.0 && impact <= 62 && ceil <= 58) {
    return { id: "overpaid", tag: "高薪低能", label: "高薪低能" };
  }
  if (salaryMult >= 1.7 && impact <= 55) {
    return { id: "overpaid", tag: "高薪低能", label: "高薪低能" };
  }
  if (salaryMult >= 1.4 && impact >= 70 && ceil >= 65) {
    return { id: "fair_plus", tag: null, label: "报价合理偏强" };
  }
  return { id: "fair", tag: null, label: "市场公允" };
}

function glassBumpFor(player) {
  const bref = String(player.bref || "").toLowerCase();
  if (bref && GLASS_CANNON_BREF[bref]) return GLASS_CANNON_BREF[bref];
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/porzingis|波尔津吉斯|porzingis/.test(name)) return 28;
  if (/derrick rose|德里克.?罗斯/.test(name)) return 24;
  if (/yao ming|姚明/.test(name)) return 22;
  if (/zion|锡安/.test(name)) return 18;
  if (/embiid|恩比德/.test(name)) return 16;
  if (/anthony davis|浓眉|安东尼.?戴维斯/.test(name)) return 15;
  if (/kawhi|伦纳德/.test(name)) return 14;
  if (/blake griffin|格里芬/.test(name)) return 16;
  if (/wemby|文班亚马|wembanyama/.test(name)) return 15;
  if (/bol bol/.test(name)) return 18;
  return 0;
}

function ballNeedBiasFor(player, ppg, apg, tpg, mpg) {
  // High usage + assists + turnovers ⇒ ball-dominant profile (guards/creators)
  const guard = player.pos === "PG" || player.pos === "SG";
  const wing = player.pos === "SF";
  let bias =
    28 +
    ppg * (guard ? 0.85 : wing ? 0.45 : 0.2) +
    apg * 2.8 +
    tpg * (guard ? 3.2 : 1.2) +
    Math.max(0, mpg - 30) * (guard ? 0.7 : 0.25) -
    (player.three || 50) * 0.1;
  if (guard && apg >= 6) bias += 10;
  if (guard && apg >= 8 && ppg >= 20) bias += 8;
  // Post scorers / rim protectors do not "need the rock" like Westbrook
  if (["C", "PF"].includes(player.pos) && apg < 6) bias = Math.min(bias, 58);
  if (["C", "PF"].includes(player.pos) && apg < 4) bias = Math.min(bias, 48);
  return clamp(bias, 18, 92);
}

function offBallBiasFor(player, ppg, apg) {
  // Catch-shoot / low-assist scorers thrive off ball
  let bias =
    38 +
    (player.three || 50) * 0.35 +
    Math.max(0, 8 - apg) * 2.5 +
    (player.personality?.team || 50) * 0.12 -
    ppg * 0.15;
  if (apg <= 3 && (player.three || 0) >= 70) bias += 12;
  return clamp(bias, 18, 92);
}

function ballHogBumpFor(player) {
  const bref = String(player.bref || "").toLowerCase();
  if (bref && BALL_HOG_BREF[bref]) return BALL_HOG_BREF[bref];
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/westbrook|威斯布鲁克|威少/.test(name)) return 28;
  if (/donci|dončić|东契奇|luka/.test(name)) return 26;
  if (/harden|哈登/.test(name)) return 24;
  if (/iverson|艾弗森/.test(name)) return 22;
  if (/trae young|特雷.?杨/.test(name)) return 20;
  if (/kyrie|欧文/.test(name)) return 18;
  return 0;
}

function offBallBumpFor(player) {
  const bref = String(player.bref || "").toLowerCase();
  if (bref && OFF_BALL_BREF[bref]) return OFF_BALL_BREF[bref];
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/klay|汤普森/.test(name)) return 22;
  if (/korver|科沃尔/.test(name)) return 24;
  if (/redick|雷迪克/.test(name)) return 20;
  if (/ginob|吉诺比利/.test(name)) return 14;
  if (/durant|杜兰特/.test(name)) return 18;
  return 0;
}

/** True primary ball-handler (not a post scorer with inflated usage). */
export function isBallHandlerCore(p) {
  const need = p.intangibles?.ballNeed ?? 50;
  if (need < 68) return false;
  const guard = p.pos === "PG" || p.pos === "SG";
  const wing = p.pos === "SF";
  const apg = p.raw?.apg ?? 0;
  const pass = p.pass ?? 50;
  if (guard && need >= 68) return true;
  if (wing && need >= 72 && (pass >= 70 || apg >= 5)) return true;
  // Playmaking big / point-center (Jokic), not Duncan-style post scorers
  if (["C", "PF"].includes(p.pos) && need >= 70 && (pass >= 72 || apg >= 6)) return true;
  return false;
}

/** Coach ordered this player into an off-ball / low-usage role. */
export function isOrderedOffBall(p) {
  const o = p?.orders || {};
  return (
    o.action === "spot" ||
    o.action === "crash" ||
    o.usage === "defend" ||
    o.usage === "hustle" ||
    o.attack === "putback" ||
    o.aggression === "lock_d" ||
    o.aggression === "low"
  );
}

/** Coach still pushing this player as an on-ball creator. */
export function isOrderedOnBall(p) {
  const o = p?.orders || {};
  return (
    o.action === "iso" ||
    o.action === "pnr" ||
    o.action === "drive_kick" ||
    o.action === "post" ||
    o.usage === "score" ||
    o.usage === "organize" ||
    o.usage === "balanced" ||
    o.aggression === "high"
  );
}

/**
 * Still fighting for the rock after orders + off-ball talent.
 * 设成无球定点 / 有足够无球能力 → 不坚持抢球，不算持球冲突。
 * primaryId：教练指定的持球发起人——其他人默认让球（除非也被明确设成持球打法）。
 */
export function isInsistingOnBall(p, { primaryId = null } = {}) {
  if (!isBallHandlerCore(p)) return false;
  if (isOrderedOffBall(p)) return false;
  if (primaryId) {
    // 教练已点名持球人：只有他算发起点，其余人让球（无球能力差则火力软削）
    if (p.id === primaryId) return !isOrderedOffBall(p);
    return false;
  }
  if (isOrderedOnBall(p)) return true;
  const need = p.intangibles?.ballNeed ?? 50;
  const off = p.intangibles?.offBall ?? 50;
  // 自动：无球够用就能让球，不必冲突
  if (off >= 60) return false;
  if (off >= 52 && need < 82) return false;
  return true;
}

/** Lineup ball-sharing: clash only when 2+ still insist on the rock. */
export function ballSharingFit(players, { primaryId = null } = {}) {
  if (!players?.length) return { fitDelta: 0, chemDelta: 0, note: "" };
  const opts = { primaryId: primaryId || null };
  const cores = players
    .map((p) => ({
      p,
      need: p.intangibles?.ballNeed ?? 50,
      off: p.intangibles?.offBall ?? 50,
      handler: isBallHandlerCore(p),
      insist: isInsistingOnBall(p, opts),
    }))
    .sort((a, b) => b.need - a.need);
  const high = cores.filter((c) => c.handler);
  const insisting = high.filter((c) => c.insist);
  const yielding = high.filter((c) => !c.insist);
  const spacers = cores.filter((c) => c.off >= 68 && c.need < 62 && !c.handler);
  let fitDelta = 0;
  let chemDelta = 0;
  let note = "";

  if (insisting.length >= 2) {
    // 真冲突：两人都还在抢球（未设无球 / 无球能力不够）
    const clash = insisting.length - 1;
    const topNeed = insisting[0].need + insisting[1].need;
    fitDelta -= 9 * clash + Math.max(0, topNeed - 150) * 0.15;
    chemDelta -= 5 * clash;
    const names = insisting
      .slice(0, 3)
      .map((c) => c.p.name)
      .join(" / ");
    note = `持球冲突：${names}`;
  } else if (high.length >= 2 && insisting.length <= 1) {
    // 双核同场，但有人让球 / 教练指定持球人 / 有无球能力 → 可共存
    const weakOff = yielding.filter((c) => c.off < 52);
    const primary =
      (primaryId && high.find((c) => c.p.id === primaryId)) || insisting[0] || high[0];
    const support = yielding.length ? yielding : high.filter((c) => c.p.id !== primary.p.id);
    if (weakOff.length) {
      // 无球偏弱：不打冲突标签，只轻扣适配；火力削弱在 ballRolePlayFactor
      fitDelta -= 1.5 * weakOff.length;
      note = `无球偏弱：${weakOff.map((c) => c.p.name).join(" / ")}（可共存，火力略削）`;
    } else {
      fitDelta += 4 + Math.min(4, support.length * 2);
      chemDelta += 2;
      const offNames = support.map((c) => c.p.name).join(" / ");
      note = primaryId
        ? `指定持球：${primary.p.name} · ${offNames} 无球配合`
        : `双核分工：${primary.p.name} 持球 · ${offNames} 无球`;
    }
  } else if (high.length === 1 && spacers.length >= 2) {
    fitDelta += 7 + Math.min(6, spacers.length * 2);
    chemDelta += 3;
    note = `持球核 ${high[0].p.name} + ${spacers.length} 名无球点`;
  } else if (high.length === 0 && spacers.length >= 3) {
    fitDelta -= 4; // 没人组织
    note = "缺少持球发起点";
  } else if (high.length === 1 || (primaryId && insisting.length === 1)) {
    fitDelta += 2;
    if (primaryId && insisting[0]) note = `指定持球：${insisting[0].p.name}`;
  }

  return {
    fitDelta: clamp(fitDelta, -28, 18),
    chemDelta: clamp(chemDelta, -18, 10),
    note,
    // 战术适配看「仍在坚持持球」的人数，而非纸面持球核人数
    highNeedCount: insisting.length || (high.length === 1 ? 1 : 0),
    spacerCount: spacers.length + yielding.filter((c) => c.off >= 55).length,
    handlerCount: high.length,
  };
}

/**
 * Per-possession multiplier from ball role fit on current lineup.
 * 真抢球才重罚；让球且无球能力够 → 正常/加成；无球弱 → 间接削火力。
 */
export function ballRolePlayFactor(player, onCourt, { primaryId = null } = {}) {
  if (!player || !onCourt?.length) return 1;
  const need = player.intangibles?.ballNeed ?? 50;
  const off = player.intangibles?.offBall ?? 50;
  const opts = { primaryId: primaryId || null };
  const meCore = isBallHandlerCore(player);
  const meInsist = isInsistingOnBall(player, opts);
  const others = onCourt.filter((p) => p.id !== player.id);
  const rivalCores = others.filter(isBallHandlerCore).length;
  const rivalInsist = others.filter((p) => isInsistingOnBall(p, opts)).length;
  const hasPrimary = rivalInsist >= 1 || meInsist || (meCore && rivalCores === 0);

  let f = 1;
  if (meCore && rivalCores >= 1) {
    if (meInsist && rivalInsist >= 1) {
      // 双方都抢球
      f -= 0.05 + rivalInsist * 0.04 + (need - 70) * 0.0015;
    } else if (!meInsist) {
      // 自己让球：无球能力决定火力是否被间接削弱
      if (off >= 68) f += 0.025 + (off - 68) * 0.0006;
      else if (off >= 55) f += 0.005;
      else if (off >= 45) f -= 0.025 + (52 - off) * 0.001;
      else f -= 0.05 + (45 - off) * 0.0012;
    } else if (meInsist && rivalInsist === 0) {
      // 自己持球，队友已让开
      f += 0.025;
    }
  } else if (meCore && rivalCores === 0) {
    f += 0.03;
  }
  if (off >= 68 && need < 60 && hasPrimary && rivalInsist <= 1) {
    f += 0.035 + (off - 68) * 0.0008;
  }
  // Pure off-ball forced into creation
  if (off >= 72 && need <= 42 && rivalInsist === 0 && rivalCores === 0 && (player.pass || 50) < 58) {
    f -= 0.04;
  }
  return clamp(f, 0.78, 1.1);
}

function bargainBumpFor(player) {
  const bref = String(player.bref || "").toLowerCase();
  if (bref && BARGAIN_BREF[bref]) return BARGAIN_BREF[bref];
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/ginob|吉诺比利|马努/.test(name)) return 22;
  if (/tony parker|帕克/.test(name)) return 14;
  if (/bruce bowen|鲍文/.test(name)) return 18;
  if (/korver|科沃尔/.test(name)) return 13;
  if (/kyle lowry|洛瑞/.test(name)) return 11;
  return 0;
}

function overpaidBumpFor(player) {
  const bref = String(player.bref || "").toLowerCase();
  if (bref && OVERPAID_BREF[bref]) return OVERPAID_BREF[bref];
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/embiid|恩比德/.test(name)) return 20;
  if (/de'?aaron fox|fox|福克斯/.test(name)) return 22;
  if (/westbrook|威少|威斯布鲁克/.test(name)) return 16;
  if (/ben simmons|西蒙斯/.test(name)) return 18;
  if (/deandre ayton|艾顿/.test(name)) return 16;
  return 0;
}

export function topIntangibles(player, n = 3) {
  const entries = Object.entries(player.intangibles || {});
  const risk = player.intangibles?.injuryRisk;
  const impact = player.intangibles?.winningImpact;
  const ceil = player.intangibles?.ceiling;
  const need = player.intangibles?.ballNeed;
  const off = player.intangibles?.offBall;
  const adapt = player.intangibles?.systemAdapt;
  let sorted = entries.sort((a, b) => b[1] - a[1]);
  const pin = [];
  if (risk >= 68) pin.push(["injuryRisk", risk]);
  // Do not pin bargain fingerprints — players should discover「妖人」themselves
  if (player.valueArchetype === "overpaid" && ceil != null) pin.push(["ceiling", ceil]);
  if (player.valueArchetype === "overpaid" && adapt != null) pin.push(["systemAdapt", adapt]);
  // Surface ball role so dual-core clashes are readable in draft/setup
  if (need >= 70) pin.push(["ballNeed", need]);
  else if (off >= 72 && (need ?? 50) < 55) pin.push(["offBall", off]);
  if (pin.length) {
    const keys = new Set(pin.map(([k]) => k));
    sorted = [...pin, ...sorted.filter(([k]) => !keys.has(k))];
  }
  return sorted
    .slice(0, n)
    .map(([k, v]) => ({ key: k, value: v, ...(INTANGIBLE_DEFS[k] || { name: k, desc: "" }) }));
}

function systemAdaptBiasFor(player, bargainBump, overpaidBump) {
  let bias = 48 + (player.personality?.team || 50) * 0.12 + (player.iq || 50) * 0.08;
  bias += bargainBump * 1.1;
  bias -= overpaidBump * 0.9;
  // Connectors / sixth-man profiles travel better across schemes
  const arch = player.archetype || "";
  if (/connector|shooter|spacing|pest|fundamentals|versatile_scorer/.test(arch)) bias += 10;
  if (/iso_|mamba|goat|engine|creator|dominant/.test(arch)) bias -= 6;
  if (/versatile_scorer/.test(arch)) bias += 8;
  return clamp(bias, 22, 88);
}

/**
 * Position + lineup context can raise (or lower) hidden attrs.
 * Example: Kyrie drafted as PG, moved to SG beside a floor general → off-ball / adapt / ceiling up.
 * Returns deltas (can be negative). Does not mutate player.
 */
export function positionContextBoosts(player, lineup = []) {
  if (!player) return {};
  const slot = player.playPos || player.pos;
  const natural = player.pos;
  const pass = player.pass || 50;
  const iq = player.iq || 50;
  const three = player.three || 50;
  const others = (lineup || []).filter((p) => p && p.id !== player.id);
  const boosts = {
    systemAdapt: 0,
    chemistryMagnet: 0,
    clutchVision: 0,
    offBall: 0,
    ballNeed: 0,
    winningImpact: 0,
    ceiling: 0,
    leadership: 0,
  };

  const orgAtPg = others.find((p) => {
    if ((p.playPos || p.pos) !== "PG") return false;
    const pass = p.pass || 0;
    const apg = p.raw?.apg || 0;
    const iq = p.iq || 0;
    return (pass >= 65 || apg >= 7.5) && iq >= 55;
  });
  const scoringMate = others.find((p) => (p.scoring || 0) >= 88);

  // True organizer at the 1: lifts whole-unit glue when they run point
  if (slot === "PG" && pass >= 72) {
    boosts.chemistryMagnet += 6 + Math.min(6, Math.round((pass - 72) * 0.25));
    boosts.clutchVision += 5;
    boosts.leadership += 4;
    boosts.systemAdapt += 3;
  }
  // Scoring guard / Kyrie-type: natural PG parked at 2 next to an organizer
  if (slot === "SG" && (natural === "PG" || natural === "SG")) {
    if (orgAtPg) {
      boosts.offBall += 12;
      boosts.systemAdapt += 10;
      boosts.ceiling += 8;
      boosts.ballNeed -= 10;
      boosts.winningImpact += 5;
    } else if (natural === "PG" && pass < 78) {
      // Forced to create without a true PG — adapt still OK if scorer, but less glue
      boosts.offBall += 3;
      boosts.systemAdapt += 2;
    }
  }
  // Pure PG stuck at SG without help → slight misfit
  if (slot === "SG" && natural === "PG" && pass >= 82 && !orgAtPg && !scoringMate) {
    boosts.systemAdapt -= 4;
    boosts.chemistryMagnet -= 3;
  }
  // Wing scorer at natural / adjacent with space
  if ((slot === "SF" || slot === "PF") && three >= 78 && (player.scoring || 0) >= 88) {
    boosts.offBall += 6;
    boosts.systemAdapt += 5;
    if (orgAtPg) boosts.ceiling += 4;
  }
  // Versatile / plug-and-play archetype loves any coherent slot
  if ((player.archetype || "").includes("versatile")) {
    boosts.systemAdapt += 4;
    if (positionAdjacent(natural, slot)) boosts.ceiling += 3;
  }
  // 全能：打任何位置都不算错位
  if ((player.skills || []).includes("positionless") || String(player.bref || "").toLowerCase() === "jamesle01") {
    boosts.systemAdapt += 8;
    boosts.winningImpact += 4;
    if (slot !== natural) boosts.ceiling += 5;
    if (slot === "PG" && pass >= 68) {
      boosts.chemistryMagnet += 4;
      boosts.clutchVision += 3;
    }
  }
  // IQ connectors gain vision when running secondary creation at 2/3
  if ((slot === "SG" || slot === "SF") && iq >= 80 && pass >= 65) {
    boosts.clutchVision += 4;
    boosts.chemistryMagnet += 3;
  }

  return boosts;
}

function positionAdjacent(a, b) {
  const order = ["PG", "SG", "SF", "PF", "C"];
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return false;
  return Math.abs(i - j) <= 1;
}

/**
 * Bake lineup/position boosts into player.intangibles (keeps _baseIntangibles).
 * Call after any playPos change. Returns short human notes for UI.
 */
export function applyLineupPositionEffects(players) {
  const list = players || [];
  const notes = [];
  for (const p of list) {
    if (!p.intangibles) continue;
    if (!p._baseIntangibles) p._baseIntangibles = { ...p.intangibles };
    const base = p._baseIntangibles;
    const boosts = positionContextBoosts(p, list);
    const next = { ...base };
    const raised = [];
    for (const [k, d] of Object.entries(boosts)) {
      if (!d) continue;
      next[k] = clamp((base[k] ?? 50) + d, 10, 99);
      if (d >= 5) {
        const label = INTANGIBLE_DEFS[k]?.name || k;
        raised.push(`${label}+${d}`);
      }
    }
    p.intangibles = next;
    p._posBoostNote = raised.length ? raised.join(" · ") : "";
    if (raised.length) notes.push(`${p.name}（${p.playPos || p.pos}）：${p._posBoostNote}`);
  }
  return notes;
}

/**
 * How well this player's skills unlock under current coach + tactic (0–100).
 * Bargains (Manu) keep a high floor; overpaid stars (Embiid) swing hard with scheme.
 */
export function systemFitScore(player, coach = null, tactic = null) {
  if (!player) return 50;
  const arch = player.archetype || "";
  const adapt = player.intangibles?.systemAdapt ?? 50;
  const value = player.valueArchetype || "fair";
  let score = 36 + adapt * 0.28;

  if (coach?.preferred?.includes(arch)) score += 18;
  if (tactic?.needs?.includes(arch)) score += 16;

  // Named / positional scheme hints (Embiid loves post iso / grind, hates pure smallball)
  score += schemeHintBonus(player, coach, tactic);

  // Philosophy alignment
  const buffs = coach?.buffs || {};
  const offB = buffs.offense ?? 5;
  const defB = buffs.defense ?? 5;
  if (["iso_scorer", "iso_creator", "mamba", "creator", "dominant_big", "engine"].includes(arch)) {
    if (offB >= 11) score += 7;
    if (offB <= 4) score -= 6;
  }
  if (["pest", "two_way_wing", "two_way_star", "versatile_big"].includes(arch)) {
    if (defB >= 11) score += 7;
    if (defB <= 4) score -= 5;
  }

  if (value === "bargain") {
    // 妖人：换体系仍能贡献，上限略抬、地板很高
    score = Math.max(score, 58 + adapt * 0.12);
    score += 4;
  } else if (value === "overpaid") {
    // 高薪低能：更挑体系——适配差时更惨，对口时能打出身价
    const schemeLean = score - 50;
    score = 28 + adapt * 0.2 + schemeLean * 1.15;
  }

  return clamp(Math.round(score), 8, 96);
}

function schemeHintBonus(player, coach, tactic) {
  const tid = tactic?.id || "";
  const style = `${coach?.style || ""} ${coach?.note || ""}`.toLowerCase();
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  const arch = player.archetype || "";
  const pos = player.playPos || player.pos;
  let b = 0;

  // Embiid / post stars — need the rock + paint touches to earn the max
  if (
    /embiid|恩比德/.test(name) ||
    (["C", "PF"].includes(player.pos) && (player.raw?.ppg || 0) >= 25 && (player.paint || 0) >= 80)
  ) {
    if (tid === "iso_heavy" || tid === "grind" || tid === "triangle") b += 22;
    if (tid === "balanced" || tid === "motion") b += 6;
    if (tid === "smallball" || tid === "pace_space") b -= 14;
    if (style.includes("魔球") || style.includes("小球")) b -= 8;
    if (style.includes("铁血") || style.includes("防守") || style.includes("三角") || style.includes("体系")) b += 6;
  }
  // Fox / speed scoring guards
  if (/fox|福克斯|de'?aaron/.test(name)) {
    if (tid === "pace_space" || tid === "iso_heavy" || tid === "motion") b += 12;
    if (tid === "grind" || tid === "triangle") b -= 8;
  }
  // Westbrook
  if (/westbrook|威少|威斯布鲁克/.test(name)) {
    if (tid === "iso_heavy" || tid === "pace_space") b += 10;
    if (tid === "motion" || tid === "triangle") b -= 6;
  }
  // Ben Simmons
  if (/simmons|西蒙斯/.test(name)) {
    if (tid === "motion" || tid === "grind") b += 10;
    if (tid === "pace_space" || tid === "iso_heavy") b -= 10;
  }
  // Generic big in smallball
  if (["C", "PF"].includes(pos) && (player.three || 0) < 60 && tid === "smallball") b -= 6;
  // Catch-shoot wings love space
  if ((arch.includes("shooter") || arch.includes("spacing")) && (tid === "smallball" || tid === "pace_space" || tid === "motion")) {
    b += 8;
  }
  return b;
}

/** Short UI line: whether this star is unlocked or wasted in current staff/scheme. */
export function systemFitNote(player, coach, tactic) {
  if (!player) return "";
  const fit = systemFitScore(player, coach, tactic);
  const value = player.valueArchetype;
  if (value === "overpaid") {
    if (fit >= 72) return `${player.name}：体系对口，纸面身价能打出来`;
    if (fit >= 55) return `${player.name}：体系尚可，效率一般偏上`;
    if (fit >= 40) return `${player.name}：体系一般，高薪未完全兑现`;
    return `${player.name}：体系不合，纸面强但效率受阻`;
  }
  if (value === "bargain") {
    // Keep wording neutral — never say「妖人」in UI
    if (fit >= 70) return `${player.name}：与多数体系都合拍`;
    return `${player.name}：换体系仍能贡献`;
  }
  if (fit >= 75) return `${player.name}：与当前方针很合拍`;
  if (fit <= 35) return `${player.name}：与当前方针较拧`;
  return "";
}

/**
 * Effective on-court multiplier from hidden ceiling + winning impact.
 * ctx: { coach, tactic } — right system can unlock overpaid paper stars.
 */
export function hiddenPlayFactor(player, ctx = {}) {
  const impact = player.intangibles?.winningImpact ?? 50;
  const ceil = player.intangibles?.ceiling ?? 55;
  const fit = systemFitScore(player, ctx.coach, ctx.tactic);
  // unlock ≈ -0.3 .. 1.0
  const unlock = clamp((fit - 42) / 50, -0.35, 1);

  let f = 0.86 + impact * 0.0022 + ceil * 0.001;
  const value = player.valueArchetype;

  if (value === "bargain") {
    // 吉诺比利类：地板高、不太挑体系；对口时再小幅拔高
    f += 0.035 + Math.max(0, unlock) * 0.035;
  } else if (value === "overpaid") {
    // 恩比德类：错体系重税；对口体系可打出接近（甚至略超公允）的身价
    // unlock -0.35 → tax ~0.12; unlock 0 → tax 0.06; unlock 1 → bonus ~0.07
    const tax = 0.06 - unlock * 0.13;
    f -= tax;
    if (unlock > 0.22) {
      // Partial paper unlock: scoring / paint / iq bleed through ceiling cap
      const paper =
        ((player.scoring || 50) + (player.paint || player.mid || 50) + (player.iq || 50)) / 3;
      f += (paper - 66) * 0.0014 * Math.max(0, unlock);
      // Soften the baked-in low ceiling when scheme fits
      f += Math.max(0, 58 - ceil) * 0.0016 * Math.max(0, unlock);
    }
  } else {
    f += unlock * 0.028;
  }
  return clamp(f, 0.76, 1.15);
}

/** Roll post-game / between-round injuries for advancement modes. */
export function rollAdvancementInjuries(players, { round = 1, intensity = 1 } = {}) {
  const reports = [];
  for (const p of players) {
    if (p.injuredGames && p.injuredGames > 0) {
      p.injuredGames -= 1;
      if (p.injuredGames <= 0) {
        p.injuredGames = 0;
        p.injuryStatus = null;
        reports.push({ player: p, type: "recover", text: `${p.name} 伤愈归队` });
      } else {
        reports.push({
          player: p,
          type: "out",
          text: `${p.name} 仍在养伤（还需 ${p.injuredGames} 场）`,
        });
      }
      continue;
    }
    let risk = p.intangibles?.injuryRisk ?? 40;
    // 铁人技能：显著降低有效伤病风险
    if ((p.skills || []).includes("iron_body")) risk = Math.max(12, risk - 24);
    // Base chance scales with risk; deeper rounds / finals wear teams down
    const chance = clamp((risk - 45) * 0.0045 * intensity + round * 0.008, 0, 0.42);
    if (Math.random() > chance) continue;
    const gamesOut = risk >= 80 ? 2 + (Math.random() < 0.45 ? 1 : 0) : risk >= 65 ? 1 + (Math.random() < 0.35 ? 1 : 0) : 1;
    p.injuredGames = gamesOut;
    p.injuryStatus = risk >= 78 ? "严重伤病" : "伤停";
    reports.push({
      player: p,
      type: "injury",
      text: `${p.name} ${p.injuryStatus}！预计缺席 ${gamesOut} 场（伤病风险 ${risk}）`,
    });
  }
  return reports;
}

export function isPlayerAvailable(p) {
  return !(p.injuredGames > 0);
}

/**
 * Market price in gold — driven by estimated salary vs that year's league average,
 * NOT by true on-court impact. So 妖人 stay cheap; 高薪低能 stay expensive.
 */
export function playerPrice(p) {
  const market = p.market || estimateMarketContract(p, p.intangibles || {});
  const mult = market.salaryMult || 1;
  // Anchor: 1.0× league-avg salary ≈ ¤120 in-game
  let price = 55 + mult * 115;
  // Mild paper-stat tax so empty min contracts aren't weirdly expensive
  const ovr = ((p.scoring || 50) + (p.defense || 50) + (p.pass || 50) + (p.rebound || 50)) / 4;
  price += (ovr - 60) * 0.45;
  // Era soft-cap: very old seasons use smaller gold numbers
  const season = p.season || 2000;
  if (season < 1980) price *= 0.72;
  else if (season < 1995) price *= 0.85;
  else if (season >= 2018) price *= 1.06;

  if (p.valueArchetype === "bargain") price *= 0.88; // still a steal even after market
  if (p.valueArchetype === "overpaid") price *= 1.12; // brand tax

  return Math.max(35, Math.round(price));
}

/**
 * Short label for UI chips.
 * 「妖人」默认隐藏；买球探包后可通过 scoutLabel 揭示。
 * 「高薪低能」可直接标注。
 */
export function valueLabel(p) {
  if (p.valueArchetype === "overpaid") return "高薪低能";
  return null;
}

/**
 * 板凳匪徒：身价不高、出场不多，但致胜成色/效率够狠——默认隐藏，球探可挖出。
 * 门槛刻意偏严，避免球探一刷一片标。
 */
export function isBenchBandit(p) {
  if (!p || p.valueArchetype === "bargain") return false;
  const impact = p.intangibles?.winningImpact ?? 50;
  const adapt = p.intangibles?.systemAdapt ?? 50;
  const ceil = p.intangibles?.ceiling ?? 50;
  const mult = p.market?.salaryMult ?? 1;
  const mpg = p.raw?.mpg ?? 20;
  const ppg = p.raw?.ppg ?? 0;
  const tier = p.hiddenTier || "";
  const roleOk =
    tier === "bench" ||
    tier === "sixth" ||
    tier === "water_cooler" ||
    (tier === "starter" && mpg <= 24) ||
    mpg <= 24;
  return (
    roleOk &&
    impact >= 74 &&
    adapt >= 68 &&
    ceil >= 66 &&
    mult <= 1.25 &&
    ppg >= 9 &&
    (p.scoring || 50) + (p.defense || 50) >= 145
  );
}

/**
 * Scout-only reveals: 妖人 / 板凳匪徒. Never call unless scout pack is active.
 */
export function scoutLabel(p) {
  if (!p) return null;
  if (p.valueArchetype === "bargain") return "妖人";
  if (isBenchBandit(p)) return "板凳匪徒";
  return null;
}

export function isHiddenGem(p) {
  return p?.valueArchetype === "bargain" || isBenchBandit(p);
}

/** Human-readable salary context for tooltips / meta lines. */
export function marketMeta(p) {
  const m = p.market || estimateMarketContract(p, p.intangibles || {});
  const mil = m.salaryEst >= 1e6 ? `${(m.salaryEst / 1e6).toFixed(1)}M` : `${Math.round(m.salaryEst / 1e3)}K`;
  const avgMil =
    m.leagueAvg >= 1e6 ? `${(m.leagueAvg / 1e6).toFixed(1)}M` : `${Math.round(m.leagueAvg / 1e3)}K`;
  return `估年薪 ${mil}（当季均薪 ${avgMil} · ${m.salaryMult}×）`;
}
