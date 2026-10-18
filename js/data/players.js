import { buildCareerSpanIndex } from "./careerArc.js";
import { attachIntangibles } from "./intangibles.js";
import {
  applyLegendTwilightFloor,
  isTwilightSeason,
  legendMeta,
  teamLabel,
} from "./legends.js";
import { resolveCardPhoto } from "./photo.js";
import { impactOvrFloor, resolve2KRatings } from "./ratings2k.js";
import {
  fetchRosterJson,
  loadCachedPlayers,
  loadCachedPlayersFast,
  saveCachedPlayers,
} from "./rosterCache.js";
import { assignSkillPacks } from "./skills.js";

export const HIDDEN_TIERS = {
  undrafted_gleague: { weight: 22, label: "落选+短期合同+D联盟" },
  water_cooler: { weight: 18, label: "饮水机管理员" },
  bench: { weight: 20, label: "bench player" },
  starter: { weight: 16, label: "starters" },
  star: { weight: 10, label: "球星" },
  allstar: { weight: 7, label: "全明星" },
  hof: { weight: 4, label: "名人堂" },
  nba50: { weight: 2, label: "NBA 50 大巨星" },
  superstar: { weight: 1, label: "超级巨星" },
};

/** @type {any[]} */
export let PLAYERS = [];

let _loaded = false;
let _loading = null;

export function playersReady() {
  return _loaded;
}

/**
 * Convert raw per-game season row → game card with attributes + hidden tier.
 * Attributes follow NBA 2K yearly scales (see ratings2k.js); landmark seasons
 * use published 2K-band anchors when available.
 */
export function seasonToCard(r) {
  const repaired = repairSeasonStats(r);
  const ppg = repaired.ppg;
  const rpg = repaired.rpg;
  const apg = repaired.apg;
  const spg = repaired.spg;
  const bpg = repaired.bpg;
  const tpg = repaired.tpg;
  const mpg = repaired.mpg;
  const gp = repaired.gp;
  const fg = repaired.fg;
  const tp = repaired.tp;
  const ft = repaired.ft;
  const fga = repaired.fga;
  const tpa = repaired.tpa;
  const pos = repaired.pos;
  const threeRate = tpa / Math.max(fga, 1);
  // use repaired row for archetype / tags
  r = { ...r, ...repaired };

  let {
    attrs,
    ovrHint,
    source: ratingSource,
    age,
    careerPhase,
    careerPhaseLabel,
  } = resolve2KRatings(r);
  const twilightApplied = applyLegendTwilightFloor(r, attrs, ovrHint);
  attrs = twilightApplied.attrs;
  ovrHint = twilightApplied.ovrHint;
  const twilight = twilightApplied.twilight || isTwilightSeason(r);
  if (twilightApplied.twilight && ratingSource === "formula") ratingSource = "twilight";
  let {
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
  } = attrs;
  const { heightCm, weightKg } = derivePhysique(r, { pos, strength, speed, rebound });
  // 体型回写速度/力量：瘦高更快更轻，壮高更慢更沉（奥尼尔/加内特等特体除外）
  const ath = applyPhysiqueToAthleticism(
    { speed, strength },
    { heightCm, weightKg, bref: r.bref }
  );
  speed = ath.speed;
  strength = ath.strength;
  const tends = deriveShotTendencies(r, {
    three,
    mid,
    paint,
    scoring,
    speed,
    pos,
    threeRate,
    tpa,
    fga,
    ppg,
    apg,
  });

  // Approximate zone FG% from overall / 3P tendencies (not exact shot-zone data)
  const threeFg = clamp(tp || 0.28, 0.05, 0.5);
  const paintFg = clamp(0.48 + (fg - 0.42) * 0.7 + (["C", "PF"].includes(pos) ? 0.04 : 0), 0.35, 0.72);
  const midFg = clamp(fg * 0.95, 0.28, 0.55);

  const prod = ppg * 1.0 + rpg * 0.7 + apg * 0.9 + spg * 1.5 + bpg * 1.4;
  let hiddenTier = "bench";
  if (prod < 8 || mpg < 12) hiddenTier = "water_cooler";
  if (prod < 5 && gp < 30) hiddenTier = "undrafted_gleague";
  if (prod >= 14 && mpg >= 22) hiddenTier = "starter";
  if (prod >= 22 && ppg >= 14) hiddenTier = "star";
  if (prod >= 28 && ppg >= 18) hiddenTier = "allstar";
  if (prod >= 34 && ppg >= 24) hiddenTier = "superstar";
  // Old legends production curve was different — bump era stars
  if (r.season <= 1979 && ppg >= 20) hiddenTier = "hof";
  if (r.season <= 1979 && ppg >= 27) hiddenTier = "nba50";

  // Young cards keep ceiling room; vets are more "finished"
  let growth = clamp(
    Math.round(100 - (r.season - 1950) * 0.15 - ppg * 1.2 + (mpg < 20 ? 25 : 0)),
    5,
    95
  );
  if ((age || 26) <= 22) growth = clamp(growth + 18, 25, 95);
  else if ((age || 26) <= 25) growth = clamp(growth + 8, 15, 95);
  else if ((age || 26) >= 33) growth = clamp(growth - 20, 5, 55);
  const growthSpeed = clamp(growth - 5, 5, 95);

  const displayName = r.nameZh || r.name;
  const leg = legendMeta(r.bref);
  const nbaId = r.nbaId || leg?.nbaId || null;
  // Era map (decade Wikimedia/Google) → NBA CDN → BRef → avatar
  const photoMeta = resolveCardPhoto({
    name: displayName,
    bref: r.bref || null,
    nbaId,
    season: r.season,
  });

  const card = {
    id: r.id,
    name: displayName,
    nameEn: r.name,
    season: r.season,
    team: r.team,
    teamLabel: teamLabel(r.team),
    pos,
    nbaId,
    bref: r.bref || null,
    photo: photoMeta.photo,
    photoCareerDefault: photoMeta.photoCareerDefault,
    photoSource: photoMeta.photoSource,
    twilight,
    scoring,
    three,
    mid,
    paint,
    defense,
    rebound,
    pass,
    speed,
    strength,
    heightCm,
    weightKg,
    stamina,
    iq,
    clutch,
    steal,
    block,
    // 2K-style tendencies / offense style (drive shot selection, not just make%)
    shotTend: tends.shotTend,
    threeTend: tends.threeTend,
    midTend: tends.midTend,
    paintTend: tends.paintTend,
    offenseStyle: tends.offenseStyle,
    paintFg,
    midFg,
    threeFg,
    ft: clamp(ft || 0.75, 0.4, 0.95),
    personality: {
      ego: clamp(Math.round(30 + ppg * 1.5 - ((age || 26) >= 32 ? 6 : 0)), 15, 95),
      team: clamp(
        Math.round(70 - ppg * 0.6 + apg * 3 + ((age || 26) >= 30 ? 10 : (age || 26) <= 22 ? -6 : 0)),
        25,
        95
      ),
      fiery: clamp(
        Math.round(35 + spg * 10 + (ppg > 25 ? 15 : 0) - ((age || 26) >= 32 ? 8 : 0)),
        15,
        95
      ),
      calm: clamp(
        Math.round(55 + (apg > 6 ? 15 : 0) - (ppg > 28 ? 10 : 0) + ((age || 26) >= 30 ? 10 : 0)),
        20,
        95
      ),
    },
    growth,
    growthSpeed,
    age: age || null,
    careerPhase: careerPhase || null,
    careerPhaseLabel: careerPhaseLabel || null,
    archetype: inferArchetype(r, { three, pass, defense, paint, steal, block, mid, scoring }),
    hiddenTier,
    tags: buildTags(r, hiddenTier),
    raw: { ppg, rpg, apg, spg, bpg, tpg, mpg, gp, fg, tp, ft, fga, tpa },
    // 2K calibration metadata
    ovr2k: ovrHint,
    ratingSource,
  };
  assignSkillPacks(card);
  return attachIntangibles(card);
}

/**
 * Safety net for old caches / partial scrapes.
 * Root cause fixed in build_full_roster.py: BRef wraps league-leading cells in
 * <strong>/<a>, so a naive ([^<]*) parse wiped BLK/STL/TRB/AST for leaders
 * (Ibaka 2013 BPG, CP3 steals, DJ rebounds, Harden assists, etc.).
 */
const WIPED_STAT_PATCH = {
  "ibakase01:2013": { bpg: 3.0 },
  "davisan02:2014": { bpg: 2.8 },
  "davisan02:2015": { bpg: 2.9 },
  "davisan02:2018": { bpg: 2.6 },
  "whiteha01:2016": { bpg: 3.7 },
  "whiteha01:2020": { bpg: 2.9 },
  "goberru01:2017": { bpg: 2.6 },
  "turnemy01:2019": { bpg: 2.7 },
  "turnemy01:2021": { bpg: 3.4 },
  "jacksja02:2022": { bpg: 2.3 },
  "jacksja02:2023": { bpg: 3.0 },
  "wembavi01:2024": { bpg: 3.6 },
  "wembavi01:2025": { bpg: 3.8 },
};

/**
 * 史源本职纠错：talldata 生涯主位置 / BRef 单季标签偶发把 PF 标成 C。
 * 例：诺维茨基早期赛季大量标 C，但生涯身份是大前锋。
 */
const POS_OVERRIDES = {
  nowitdi01: "PF", // Dirk Nowitzki
  willija02: "PG", // Jason Williams (White Chocolate)
};

/** Recover wiped box-score fields (some scrape rows lost PPG/FGA/BPG/…). */
function repairSeasonStats(r) {
  let ppg = +r.ppg || 0;
  let rpg = +r.rpg || 0;
  let apg = +r.apg || 0;
  let fga = +r.fga || 0;
  let spg = +r.spg || 0;
  let bpg = +r.bpg || 0;
  const tpg = +r.tpg || 0;
  const mpg = +r.mpg || 15;
  const gp = +r.gp || 20;
  const fg = +r.fg || 0.42;
  const tp = +r.tp || 0;
  let ft = +r.ft || 0.75;
  if (ft <= 0) ft = 0.75;
  const tpa = +r.tpa || 0;
  const brefKey = String(r.bref || "").toLowerCase();
  const pos = POS_OVERRIDES[brefKey] || r.pos || "SF";
  if (r.bref && r.season) {
    const patched = WIPED_STAT_PATCH[`${r.bref}:${r.season}`];
    if (patched) {
      if (bpg <= 0 && patched.bpg) bpg = patched.bpg;
      if (spg <= 0 && patched.spg) spg = patched.spg;
      if (rpg <= 0 && patched.rpg) rpg = patched.rpg;
      if (apg <= 0 && patched.apg) apg = patched.apg;
    }
  }
  if (fga < 4 && tpa >= 4) fga = Math.max(tpa + 8, Math.round((tpa / 0.38) * 10) / 10);
  if (fga < 4 && ppg >= 15) fga = Math.max(12, Math.round((ppg / Math.max(fg * 2.15, 0.9)) * 10) / 10);
  if (ppg < 3 && fga >= 8) {
    const fgm = fga * fg;
    const tpm = tpa * tp;
    const fta = fga * 0.3;
    ppg = Math.round((fgm * 2 + tpm + fta * ft) * 10) / 10;
  }
  return { ppg, rpg, apg, spg, bpg, tpg, mpg, gp, fg, tp, ft, fga, tpa, pos };
}

function inferArchetype(r, a) {
  const ppg = r.ppg || 0;
  const apg = r.apg || 0;
  const tpg = r.tpg || 0;
  const pos = r.pos || "";
  // KD-type: elite scorer who can on/off ball, stretch + size (plug-and-play)
  if (
    ppg >= 24 &&
    a.three >= 78 &&
    a.mid >= 78 &&
    a.scoring >= 90 &&
    apg <= 7 &&
    (pos === "SF" || pos === "PF" || pos === "SG")
  ) {
    return "versatile_scorer";
  }
  // High-usage creators who live on the ball (Westbrook / Harden profile)
  if (ppg >= 20 && apg >= 6 && tpg >= 3.2 && (pos === "PG" || pos === "SG")) return "iso_creator";
  if (apg >= 7 && (pos === "PG" || pos === "SG")) return "floor_general";
  if ((r.bpg || 0) >= 2.2) return "pest";
  if ((r.spg || 0) >= 2.0 && ppg < 18) return "pest";
  if (a.three >= 88 && apg <= 4 && a.scoring < 90) return "shooter";
  if (a.three >= 88 && ppg < 20) return "shooter";
  if ((r.rpg || 0) >= 11) return "rebounder";
  if (a.paint >= 88 && ["C", "PF"].includes(pos)) return "dominant_big";
  if (apg >= 5 && ["C", "PF"].includes(pos)) return "playmaking_big";
  if (a.defense >= 86 && ppg >= 16) return "two_way_wing";
  if (ppg >= 22) return "iso_scorer";
  return "connector";
}

function buildTags(r, tier) {
  const tags = [];
  if (r.season <= 1969) tags.push("上古神兽");
  else if (r.season <= 1989) tags.push("古典时代");
  if ((r.ppg || 0) >= 30) tags.push("得分爆炸");
  if ((r.apg || 0) >= 10) tags.push("助攻核");
  if ((r.bpg || 0) >= 3) tags.push("盖帽威胁");
  if ((r.spg || 0) >= 2.5) tags.push("抢断威胁");
  if ((r.bpg || 0) >= 2.5 && (r.fg || 0) >= 0.52 && ["C", "PF"].includes(r.pos || "")) {
    tags.push("护框中投");
  }
  if (isTwilightSeason(r)) tags.push("生涯末期");
  // Do not tag productive rotation players as「边缘人」
  if (
    (tier === "water_cooler" || tier === "undrafted_gleague") &&
    (r.mpg || 0) < 14 &&
    (r.ppg || 0) < 6 &&
    !isTwilightSeason(r)
  ) {
    tags.push("板凳深度");
  }
  return tags.slice(0, 3);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * NBA 2K-style shot / three tendencies + offense style.
 * Tendency gates WHETHER they take the shot; rating gates WHETHER it goes in.
 */
function deriveShotTendencies(r, a) {
  const tpa = a.tpa || 0;
  const fga = Math.max(a.fga || 1, 1);
  const threeRate = a.threeRate ?? tpa / fga;
  const pos = a.pos || "SF";
  const ppg = a.ppg || 0;
  const apg = a.apg || 0;

  // Three tendency: driven by actual 3PA volume, crushed for traditional bigs
  let threeTend = Math.round(threeRate * 200 + Math.min(tpa, 10) * 5.5 + (a.three - 45) * 0.4);
  if (tpa < 0.35 && ["C", "PF"].includes(pos)) threeTend = Math.min(threeTend, 10);
  if (tpa < 0.15) threeTend = Math.min(threeTend, 6);
  if (tpa < 1.0 && ["C", "PF"].includes(pos)) threeTend = Math.min(threeTend, 18);
  if ((a.three || 40) < 42) threeTend = Math.min(threeTend, Math.round((a.three || 40) * 0.28));
  if ((a.three || 40) < 50 && tpa < 2) threeTend = Math.min(threeTend, 22);
  threeTend = clamp(threeTend, 1, 99);

  // Overall shot creation hunger
  const shotTend = clamp(Math.round(32 + ppg * 1.35 + Math.min(fga, 22) * 1.6), 20, 99);

  // Zone tendencies
  let paintTend = clamp(
    Math.round(28 + (1 - Math.min(threeRate, 0.55)) * 45 + (["C", "PF"].includes(pos) ? 18 : 4) + (a.paint - 50) * 0.35),
    15,
    99
  );
  let midTend = clamp(
    Math.round(30 + (a.mid - 50) * 0.55 + (1 - Math.min(threeRate, 0.5)) * 18 - (["C"].includes(pos) ? 6 : 0)),
    12,
    95
  );
  if (threeTend >= 60) {
    paintTend = Math.round(paintTend * 0.85);
    midTend = Math.round(midTend * 0.9);
  }
  if (threeTend <= 15) {
    paintTend = clamp(paintTend + 12, 20, 99);
    midTend = clamp(midTend + 4, 12, 95);
  }

  // Offense style package
  let offenseStyle = "balanced";
  if (["C", "PF"].includes(pos) && threeTend <= 22 && paintTend >= 60) offenseStyle = "post";
  else if (threeTend >= 62 && (a.three || 0) >= 72) offenseStyle = "stretch";
  else if (threeTend >= 48 && (a.three || 0) >= 68 && apg < 5) offenseStyle = "spot";
  else if ((a.speed || 50) >= 74 && paintTend >= 55 && threeTend < 55) offenseStyle = "slash";
  else if (apg >= 7 || (a.scoring || 0) < 78 && apg >= 5) offenseStyle = "playmake";
  else if ((a.mid || 0) >= 82 && midTend >= 55) offenseStyle = "midiso";

  return { shotTend, threeTend, midTend, paintTend, offenseStyle };
}

export const OFFENSE_STYLE_LABELS = {
  post: "低位强打",
  stretch: "空间射手",
  spot: "定点接投",
  slash: "突破杀伤",
  playmake: "持球组织",
  midiso: "中距离单打",
  balanced: "均衡进攻",
};

export function tendencyLabel(p) {
  if (!p) return "";
  const style = OFFENSE_STYLE_LABELS[p.offenseStyle] || "";
  return `投篮倾向${p.shotTend ?? "—"} · 三分倾向${p.threeTend ?? "—"} · ${style}`;
}

/** Stable 0..n-1 hash from player id (same season card → same body). */
function physHash(key, mod) {
  let h = 2166136261;
  const s = String(key || "x");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

/** 已知球员身高体重（cm / kg）——覆盖公式抖动，避免詹姆斯被算成 201cm. */
const PHYS_OVERRIDES = {
  jamesle01: { heightCm: 206, weightKg: 113 }, // 6'9" / 250lb
  onealsh01: { heightCm: 216, weightKg: 147 },
  garneke01: { heightCm: 211, weightKg: 100 },
  jordami01: { heightCm: 198, weightKg: 98 },
  bryanko01: { heightCm: 198, weightKg: 96 },
  duranke01: { heightCm: 211, weightKg: 109 },
  antetgi01: { heightCm: 211, weightKg: 110 },
  chambwi01: { heightCm: 216, weightKg: 125 },
  // Marcus Morris — 6'8" / ~245lb 厚实侧翼，不是瘦高
  morrima03: { heightCm: 203, weightKg: 110 },
};

/**
 * Height/weight for UI + future matchup use.
 * Prefer real roster fields when present; else derive from pos / strength / speed.
 */
function derivePhysique(r, { pos, strength, speed, rebound }) {
  const ov = PHYS_OVERRIDES[String(r.bref || "").toLowerCase()];
  if (ov) {
    return {
      heightCm: clamp(ov.heightCm, 170, 231),
      weightKg: clamp(ov.weightKg, 70, 160),
    };
  }
  if (r.heightCm && r.weightKg) {
    return {
      heightCm: clamp(Math.round(+r.heightCm), 170, 231),
      weightKg: clamp(Math.round(+r.weightKg), 70, 160),
    };
  }
  // inches / lbs from scrape → convert
  if (r.heightIn || r.weightLb) {
    const cm = r.heightIn ? Math.round(+r.heightIn * 2.54) : null;
    const kg = r.weightLb ? Math.round(+r.weightLb * 0.453592) : null;
    if (cm && kg) {
      return { heightCm: clamp(cm, 170, 231), weightKg: clamp(kg, 70, 160) };
    }
  }
  // NBA-ish position means (cm / kg); jitter keeps individuals distinct
  const base = {
    PG: [188, 88],
    SG: [198, 95],
    SF: [206, 102],
    PF: [211, 113],
    C: [215, 120],
  }[pos] || [200, 98];
  const key = r.bref || r.id || r.name || "x";
  const hJ = physHash(key, 13) - 6; // -6..+6
  const wJ = physHash(key + "|w", 17) - 8; // -8..+8
  // 身高跟帽/板走，不要跟力量绑死（否则瘦高中锋会又高又被算成壮）
  const block = r.bpg != null ? Number(r.bpg) : 0;
  const heightCm = clamp(
    Math.round(
      base[0] +
        hJ +
        (rebound - 50) * 0.06 +
        (block >= 1.5 ? 3 : block >= 0.8 ? 1 : 0) +
        (["C", "PF"].includes(pos) ? Math.max(0, (strength - 70) * 0.04) : 0)
    ),
    170,
    231
  );
  // 力量低 → 明显更轻，呈现瘦高
  const weightKg = clamp(
    Math.round(
      base[1] +
        wJ +
        (strength - 55) * 0.38 +
        (rebound - 50) * 0.06 -
        (speed - 60) * 0.14 -
        (block >= 1.8 && strength < 72 ? 6 : 0)
    ),
    70,
    160
  );
  return { heightCm, weightKg };
}

/** e.g. "216cm / 102kg · 瘦高" */
export function physiqueLabel(p) {
  if (!p?.heightCm || !p?.weightKg) return "";
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  let build = "";
  if (p.heightCm >= 208 && bmi < 24.5) build = " · 瘦高";
  else if (p.heightCm >= 205 && bmi < 24.8 && (p.strength || 50) < 68) build = " · 瘦高";
  else if (bmi >= 29 || (p.strength || 50) >= 88) build = " · 壮硕";
  else if (bmi >= 26.5 && (p.strength || 50) >= 72) build = " · 厚实";
  else if (bmi >= 27 && (p.strength || 50) >= 80) build = " · 厚实";
  return `${p.heightCm}cm / ${p.weightKg}kg${build}`;
}

/**
 * 体型 ↔ 速度/力量：瘦高更快更轻，壮高更慢更沉。
 * 特例（巅峰奥尼尔 / 加内特等）保留原稿，不被体型公式改写。
 */
const PHYSIQUE_ATH_EXCEPTIONS = new Set([
  "onealsh01", // Shaq — 壮硕仍有惊人第一步
  "garneke01", // KG — 瘦高却兼具力量与机动
  "antetgi01", // Giannis
  "jamesle01", // LeBron
  "barklch01", // Barkley — 矮壮坦克
  "robinda01", // Admiral
  "olajuha01", // Hakeem
  "chambwi01", // Wilt
]);

function bodyMassIndex(heightCm, weightKg) {
  const h = Number(heightCm) || 0;
  const w = Number(weightKg) || 0;
  if (h < 150 || w < 50) return null;
  return w / (h / 100) ** 2;
}

/**
 * @returns {{ speed: number, strength: number, build: string|null }}
 */
export function applyPhysiqueToAthleticism(attrs, { heightCm, weightKg, bref = "" } = {}) {
  const speed0 = Number(attrs?.speed) || 50;
  const strength0 = Number(attrs?.strength) || 50;
  const out = { speed: speed0, strength: strength0, build: null };
  if (!heightCm || !weightKg) return out;
  if (PHYSIQUE_ATH_EXCEPTIONS.has(String(bref || "").toLowerCase())) {
    out.build = "特体";
    return out;
  }
  const bmi = bodyMassIndex(heightCm, weightKg);
  if (bmi == null) return out;
  const tall = heightCm >= 203;
  const veryTall = heightCm >= 211;
  let speed = speed0;
  let strength = strength0;
  let build = null;

  if (tall && bmi < 23.8) {
    // 极瘦高：机动换吨位
    const lean = clamp((23.8 - bmi) / 3.5, 0, 1);
    speed += Math.round(5 + lean * (veryTall ? 6 : 4));
    strength -= Math.round(6 + lean * (veryTall ? 8 : 5));
    build = "瘦高";
  } else if (tall && bmi < 25.2) {
    const lean = clamp((25.2 - bmi) / 2.2, 0, 1);
    speed += Math.round(3 + lean * 3);
    strength -= Math.round(3 + lean * 4);
    build = "瘦高";
  } else if (tall && bmi >= 29.2) {
    // 壮高：吨位换脚步
    const thick = clamp((bmi - 29.2) / 4.5, 0, 1);
    speed -= Math.round(5 + thick * (veryTall ? 7 : 5));
    strength += Math.round(4 + thick * 5);
    build = "壮硕";
  } else if (tall && bmi >= 27.2) {
    const thick = clamp((bmi - 27.2) / 2.5, 0, 1);
    speed -= Math.round(2 + thick * 3);
    strength += Math.round(2 + thick * 3);
    build = "厚实";
  }

  out.speed = clamp(Math.round(speed), 28, 99);
  out.strength = clamp(Math.round(strength), 28, 99);
  out.build = build;
  return out;
}

/**
 * Overall: curated anchors may reach 98–100 (phenomenon).
 * Formula cards use efficiency / irreplaceability and hard-cap at 97.
 */
export function overall(p) {
  if (p?.ovr2k != null && p.ratingSource === "anchor") {
    return clamp(Math.round(p.ovr2k), 40, 100);
  }
  const shooting = ((p.three || 50) + (p.mid || 50) + (p.paint || 50)) / 3;
  const offense =
    (p.scoring || 50) * 0.48 + shooting * 0.3 + (p.pass || 50) * 0.12 + (p.iq || 50) * 0.1;
  const defense =
    (p.defense || 50) * 0.48 +
    (p.steal || 50) * 0.18 +
    (p.block || 40) * 0.18 +
    (p.rebound || 50) * 0.16;
  const athleticism = (p.speed || 50) * 0.42 + (p.strength || 50) * 0.28 + (p.stamina || 50) * 0.3;
  const mental = (p.clutch || 50) * 0.55 + (p.iq || 50) * 0.45;
  const pos = p.playPos || p.pos || "SF";
  let wOff = 0.48;
  let wDef = 0.24;
  let wAth = 0.14;
  let wMen = 0.14;
  if (pos === "PG") {
    wOff = 0.52;
    wDef = 0.2;
    wAth = 0.16;
  } else if (pos === "C") {
    wOff = 0.4;
    wDef = 0.32;
  } else if (pos === "PF") {
    wOff = 0.44;
    wDef = 0.28;
  } else if (pos === "SG") {
    wOff = 0.5;
    wDef = 0.22;
  }
  let ovr = offense * wOff + defense * wDef + athleticism * wAth + mental * wMen;
  if (p?.ovr2k != null) ovr = ovr * 0.65 + p.ovr2k * 0.35;
  ovr = Math.max(ovr, productionOvrFloor(p));
  const arch = p.archetype || "";
  if (arch === "versatile_scorer") ovr += 0.6;
  if (arch === "iso_creator" && (p.raw?.apg || 0) >= 10) ovr += 0.4;
  if ((p.ratingSource === "twilight" || p.twilight) && p.ovr2k != null) {
    ovr = Math.max(ovr, p.ovr2k);
    return clamp(Math.round(ovr), 40, 100);
  }
  // 98–100 = phenomenon only (anchors). Formula never hands out 99 for volume.
  return clamp(Math.round(Math.min(ovr, 97)), 40, 97);
}

/** Efficiency-aware floor — empty counting stats cannot unlock 99. */
function productionOvrFloor(p) {
  if (!p?.raw) return 0;
  return impactOvrFloor({
    ppg: p.raw.ppg || 0,
    rpg: p.raw.rpg || 0,
    apg: p.raw.apg || 0,
    spg: p.raw.spg || 0,
    bpg: p.raw.bpg || 0,
    tpg: p.raw.tpg || 0,
    fg: p.raw.fg ?? 0.42,
    tp: p.raw.tp ?? p.threeFg ?? 0.34,
    ft: p.raw.ft ?? 0.75,
    fga: p.raw.fga || Math.max(8, (p.raw.ppg || 0) * 0.7),
    tpa: p.raw.tpa || 0,
  });
}

export function clonePlayer(p) {
  return structuredClone(p);
}

/**
 * Load full historical roster (async). Safe to call multiple times.
 * Uses Cache Storage (raw JSON) + IndexedDB (processed cards) when available.
 * @param {(p: number, phase: string) => void} [onProgress] 0–1 progress callback
 */
export function loadPlayers(onProgress) {
  if (_loaded) return Promise.resolve(PLAYERS);
  if (_loading) return _loading;
  const report = (p, phase) => {
    try {
      onProgress?.(p, phase);
    } catch (_) {
      /* ignore UI errors */
    }
  };
  _loading = (async () => {
    // Fast path FIRST: IndexedDB processed cards — do NOT parse 6MB roster.json
    const fast = await loadCachedPlayersFast(report);
    if (fast?.length) {
      PLAYERS = fast;
      _loaded = true;
      report(1, "done");
      console.info(`[roster] loaded ${PLAYERS.length} cards from IndexedDB (skipped roster.json)`);
      return PLAYERS;
    }

    const { data, fromCache } = await fetchRosterJson("./js/data/roster.json", report);
    const meta = {
      version: data.version,
      generated: data.generated,
      count: (data.players || []).length,
    };
    report(0.22, fromCache ? "cache" : "download");

    // Secondary: IDB keyed by freshly parsed meta (e.g. localStorage cleared)
    const cached = await loadCachedPlayers(meta);
    if (cached?.length) {
      PLAYERS = cached;
      _loaded = true;
      report(1, "done");
      console.info(`[roster] loaded ${PLAYERS.length} cards from IndexedDB cache`);
      return PLAYERS;
    }

    const raw = data.players || [];
    buildCareerSpanIndex(raw);
    const list = new Array(raw.length);
    // Larger chunks = fewer yields = faster wall-clock on cold build
    const chunk = 800;
    report(0.25, "build");
    for (let i = 0; i < raw.length; i += chunk) {
      const end = Math.min(i + chunk, raw.length);
      for (let j = i; j < end; j++) list[j] = seasonToCard(raw[j]);
      report(0.25 + 0.7 * (end / raw.length), "build");
      await new Promise((r) => setTimeout(r, 0));
    }
    PLAYERS = list;
    _loaded = true;
    report(0.98, "build");
    console.info(`[roster] loaded ${PLAYERS.length} season cards (building cache…)`);
    // Persist in background — don't block entering home
    saveCachedPlayers(meta, PLAYERS).catch(() => {});
    report(1, "done");
    return PLAYERS;
  })().catch((err) => {
    _loading = null;
    console.error(err);
    throw err;
  });
  return _loading;
}
