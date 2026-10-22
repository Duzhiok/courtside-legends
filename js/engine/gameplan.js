/**
 * Coach gameplan helpers inspired by NBA 2K:
 * lineup packs, role expectations, minute targets, possession focus.
 */
import { overall } from "../data/players.js";
import { POS_SLOTS } from "../data/franchises.js";

export const PLAYER_ROLES = {
  alpha: { id: "alpha", name: "进攻核心", wantMin: 36, wantUsage: "high" },
  starter: { id: "starter", name: "稳定首发", wantMin: 30, wantUsage: "mid" },
  sixth: { id: "sixth", name: "第六人", wantMin: 24, wantUsage: "mid" },
  role: { id: "role", name: "角色球员", wantMin: 18, wantUsage: "low" },
  bench: { id: "bench", name: "板凳蓝领", wantMin: 12, wantUsage: "low" },
};

export const LINEUP_PACK_DEFS = [
  { id: "scoring", name: "得分阵", hint: "优先得分与造投" },
  { id: "defense", name: "防守阵", hint: "优先防守与硬度" },
  { id: "spacing", name: "空间阵", hint: "优先三分与拉开" },
];

export const FOCUS_PLAYS = [
  { id: "iso_star", name: "核心单打", desc: "球权集中给场上最高进攻点，持续数回合" },
  { id: "post_up", name: "内线要球", desc: "偏好油漆区出手与内线持球" },
  { id: "pace_three", name: "提速三分", desc: "提速并提高三分出手比重" },
  { id: "slow_pace", name: "拖慢节奏", desc: "咬死进攻时间、少仓促出手，拖慢比赛节奏" },
  { id: "hunt_mismatch", name: "清侧翼错位", desc: "攻打较弱对位，拉开单打" },
];

/**
 * 临场比赛节奏（持久拨档，可随时在暂停/节间改）：
 * 领先 → 降速打成功率；落后 → 提速提高回合数。
 * 与「回合重点」叠加：重点管几回合战术，节奏管整场进攻时间与出手质量。
 */
export const TEMPO_OPTIONS = [
  {
    id: "grind",
    name: "降速成功率",
    short: "降速",
    desc: "咬死进攻时间，回合更少；出手更从容、空位更好、失误更低",
    paceMult: 0.7,
    makeBonus: 0.032,
    openBonus: 0.045,
    tovMult: 0.78,
    usedLo: 14,
    usedHi: 28,
  },
  {
    id: "normal",
    name: "正常节奏",
    short: "正常",
    desc: "按战术默认节奏推进",
    paceMult: 1,
    makeBonus: 0,
    openBonus: 0,
    tovMult: 1,
    usedLo: 6,
    usedHi: 24,
  },
  {
    id: "push",
    name: "提速抢回合",
    short: "提速",
    desc: "缩短进攻时间拉高回合数；出手更仓促、失误略增",
    paceMult: 1.32,
    makeBonus: -0.024,
    openBonus: -0.035,
    tovMult: 1.22,
    usedLo: 4,
    usedHi: 14,
  },
];

export function getTempoDef(id) {
  return TEMPO_OPTIONS.find((t) => t.id === id) || TEMPO_OPTIONS.find((t) => t.id === "normal");
}

export function normalizeTempo(id) {
  const t = getTempoDef(id);
  return t?.id || "normal";
}

/**
 * Per-player coach orders (dead-ball / setup).
 * Example: Haliburton → usage=organize, action=drive_kick.
 */
export const ORDER_USAGE = [
  { id: "auto", name: "自由", hint: "按球员本能" },
  { id: "organize", name: "偏组织", hint: "传球发动、突破分球优先；体力消耗略低" },
  { id: "score", name: "偏得分", hint: "终结与造投优先；强打更耗体力" },
  { id: "balanced", name: "攻传均衡", hint: "持球兼顾得分与分球" },
  { id: "defend", name: "偏防守", hint: "降低持球权重，优先当领防人盯持球核；追防更耗体力" },
  {
    id: "hustle",
    name: "蓝领冲抢",
    hint: "少持球：冲抢进攻篮板与二次进攻，防守投入拉满；更耗体力",
  },
];

export const ORDER_ATTACK = [
  { id: "auto", name: "自由区域", hint: "按手感与战术" },
  { id: "paint", name: "内线杀伤", hint: "杀筐 / 低位" },
  { id: "perimeter", name: "外线远投", hint: "提高三分比重" },
  { id: "mid", name: "中距离", hint: "中投与急停" },
  { id: "foul_hunt", name: "造犯规", hint: "冲击篮下赚罚球" },
  {
    id: "putback",
    name: "二次进攻",
    hint: "冲板后补篮/二次强攻；少外线开火",
  },
];

export const ORDER_ACTION = [
  { id: "auto", name: "自由战术", hint: "体系默认" },
  {
    id: "pnr",
    name: "挡拆",
    hint:
      "持球叫掩护：可杀筐、中投口袋、短滚/外弹分球；射手吃空位，顺下可空接。适合组织点+能掩护的内线。",
  },
  {
    id: "drive_kick",
    name: "突破分球",
    hint: "突入禁区吸引协防再分边：弱侧射手空位大增，适合持球突破手+定点射手。",
  },
  { id: "iso", name: "单打清侧", hint: "拉开一对一，球权集中给持球核造投。" },
  { id: "spot", name: "无球定点", hint: "接球就投 / 空切，少持球，配合持球发动。" },
  { id: "post", name: "低位要球", hint: "背身与内线策应，需要吨位与脚步。" },
  {
    id: "crash",
    name: "冲抢二次",
    hint: "蓝领：冲进攻篮板、补篮二次进攻；少接球单打。",
  },
];

export const ORDER_HUNT = [
  { id: "auto", name: "跟随球队", hint: "用球队进攻倾向" },
  { id: "patient", name: "耐心传导", hint: "少强投，多传球；略省体力" },
  { id: "hunt", name: "积极抓机会", hint: "见空档就攻；强打更耗体力" },
];

/**
 * 攻击欲望：决定会不会自主进攻。
 * 低欲望 / 专注防守 → 不主动要球强投，只有好机会才出手，否则先传导。
 */
export const ORDER_AGGRESSION = [
  { id: "auto", name: "欲望跟随", hint: "按角色与球队倾向" },
  { id: "high", name: "高攻击欲", hint: "主动要球终结，一般空档就出手" },
  { id: "normal", name: "正常欲望", hint: "攻传平衡，正常出手门槛" },
  { id: "low", name: "低攻击欲", hint: "不自主进攻；只有好机会才出手，否则先传导" },
  { id: "lock_d", name: "专注防守", hint: "进攻极度克制，防守投入更高；几乎只投大空位" },
];

/** 0..1 — higher = more willing to attack / shoot. */
export function aggressionLevel(p) {
  const a = p?.orders?.aggression || "auto";
  if (a === "high") return 1;
  if (a === "normal") return 0.55;
  if (a === "low") return 0.22;
  if (a === "lock_d") return 0.08;
  const usage = p?.orders?.usage || "auto";
  const hunt = p?.orders?.hunt || "auto";
  const action = p?.orders?.action || "auto";
  const attack = p?.orders?.attack || "auto";
  if (usage === "defend" || usage === "hustle") return 0.18;
  if (hunt === "patient") return 0.28;
  if (usage === "score" || hunt === "hunt") return 0.82;
  if (usage === "organize") return 0.38;
  if (action === "crash" || attack === "putback") return 0.28;
  return 0.55;
}

/** Minimum openness (0–1) to willingly pull the trigger. */
export function shotOpenThreshold(p) {
  const lvl = aggressionLevel(p);
  if (lvl >= 0.9) return 0.3;
  if (lvl >= 0.7) return 0.36;
  if (lvl >= 0.5) return 0.44;
  if (lvl >= 0.25) return 0.58;
  return 0.7;
}

export const ORDER_DEF = [
  { id: "auto", name: "常规防守", hint: "按对位与球队压迫" },
  { id: "onball", name: "领防持球", hint: "优先领防对方持球点，对位权重拉高；追防更耗体力" },
  { id: "deny", name: "盯防卡位", hint: "贴身限制持球/接球；追防更耗体力" },
  { id: "help", name: "协防扫荡", hint: "收缩协防、补强侧；主防略省力" },
  { id: "switch", name: "换防弹性", hint: "优先换防错位" },
  { id: "smart", name: "智慧犯规", hint: "关键球更敢掏球/犯规策略" },
  {
    id: "allout",
    name: "全力防守",
    hint: "蓝领锁防：压迫与追防拉满，防守效果提升，更耗体力",
  },
];

/** 蓝领指令：冲板二次 / 全力防守. */
export function isHustleOffense(p) {
  const o = p?.orders || {};
  return o.usage === "hustle" || o.action === "crash" || o.attack === "putback";
}

export function isAllOutDefense(p) {
  const o = p?.orders || {};
  return o.defFocus === "allout" || o.usage === "hustle" || o.aggression === "lock_d";
}

function normPos5(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (["PG", "SG", "SF", "PF", "C"].includes(p)) return p;
  if (p.startsWith("G")) return "SG";
  if (p.includes("C")) return "C";
  return "SF";
}

/**
 * 按身高/传控/投射/内线等属性给每个位置打分。
 * 本职有加成，但仍可因属性明显偏向而改打（如高助攻后卫→PG）。
 */
export function playPosFitScores(player) {
  if (!player) return { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  const nat = normPos5(player.pos);
  const h = Number(player.heightCm) || 0;
  const pass = player.pass || 50;
  const speed = player.speed || 50;
  const three = player.three || 50;
  const paint = player.paint || 50;
  const reb = player.rebound || 50;
  const block = player.block || 40;
  const str = player.strength || 50;
  const def = player.defense || 50;
  const scoring = player.scoring || 50;
  const apg = player.raw?.apg || 0;
  const threeTend = player.threeTend || 30;
  const style = player.offenseStyle || "";

  const scores = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  scores[nat] += 30;
  const adj = { PG: ["SG"], SG: ["PG", "SF"], SF: ["SG", "PF"], PF: ["SF", "C"], C: ["PF"] };
  for (const a of adj[nat] || []) scores[a] += 10;

  scores.PG +=
    (pass - 55) * 0.6 +
    (apg - 3) * 4.2 +
    (speed - 60) * 0.28 -
    Math.max(0, h - 196) * 0.45 +
    (style === "playmake" ? 12 : 0);
  scores.SG +=
    (three - 58) * 0.38 +
    (scoring - 68) * 0.28 +
    (speed - 64) * 0.22 +
    (threeTend - 38) * 0.18 +
    (style === "slash" || style === "midiso" ? 8 : 0);
  scores.SF +=
    (def - 62) * 0.28 +
    (three - 55) * 0.22 +
    (scoring - 68) * 0.18 +
    (h >= 198 && h <= 208 ? 12 : 0) +
    (style === "spot" || style === "stretch" ? 6 : 0);
  scores.PF +=
    (reb - 58) * 0.38 +
    (paint - 62) * 0.32 +
    (str - 58) * 0.22 +
    (h >= 203 ? 10 : 0) +
    (threeTend >= 45 && three >= 70 ? 6 : 0); // stretch four
  scores.C +=
    (reb - 62) * 0.42 +
    (block - 48) * 0.5 +
    (paint - 68) * 0.38 +
    (str - 62) * 0.28 +
    (h >= 208 ? 16 : 0) +
    (h >= 213 ? 10 : 0) -
    (threeTend >= 55 ? 10 : 0) +
    (style === "post" ? 10 : 0);

  // 身高锚定：巨人即使高助攻也不该被推荐成后卫
  if (h >= 208) {
    scores.PG -= 48;
    scores.SG -= 32;
    scores.SF -= 12;
    scores.C += 14;
  } else if (h >= 203) {
    scores.PG -= 28;
    scores.SG -= 14;
  } else if (h <= 190) {
    scores.C -= 36;
    scores.PF -= 20;
  }
  // 明显控卫画像：强行压过本职 SG（矮个才生效）
  if (h <= 196 && (apg >= 7.5 || (pass >= 82 && apg >= 5.5))) scores.PG += 18;
  // 护框巨人
  if ((block >= 78 || (player.raw?.bpg || 0) >= 2.2) && h >= 208) scores.C += 14;

  return scores;
}

/** Best-fit position for this player (what used to be inline in recommendPlayPos). */
export function recommendPlayPos(player) {
  if (!player) return "SF";
  const scores = playPosFitScores(player);
  let best = normPos5(player.pos);
  let bestS = -1e9;
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
    if (scores[pos] > bestS) {
      bestS = scores[pos];
      best = pos;
    }
  }
  return best;
}

/**
 * All 5 slots, ranked best-fit → worst-fit for this player. Used when the player's preferred
 * slot is already taken by a teammate and we need the next-best fallback — NOT just "whatever
 * slot happens to come first in PG→C order", which is how a 208cm rim protector used to end up
 * parked at SG once the C and PF slots were full.
 */
export function rankedPlayPosFits(player) {
  const scores = playPosFitScores(player);
  return ["PG", "SG", "SF", "PF", "C"].sort((a, b) => scores[b] - scores[a]);
}

/**
 * Given players already placed (`picked`, each with playPos/pos) and a player to seat, find a
 * free slot: try `preferredPos` first (e.g. a manually-chosen position), then fall back through
 * this player's own best-fit ranking — never a position he has zero business playing.
 */
export function nextEmptyPlayPos(picked, player, preferredPos = null) {
  const used = new Set((picked || []).map((p) => normPos5(p.playPos || p.pos)));
  const pref = preferredPos ? normPos5(preferredPos) : null;
  if (pref && !used.has(pref)) return pref;
  for (const pos of rankedPlayPosFits(player)) {
    if (!used.has(pos)) return pos;
  }
  return pref || normPos5(player?.pos);
}

/** Which of the five slots a player currently occupies (manual playPos, else natural pos). */
export function playerSlotPos(p) {
  return normPos5(p.playPos || p.pos);
}

/** Group players into five position buckets for draft/legend browsing. */
export function groupByPosition(players) {
  const buckets = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of players || []) {
    const slot = playerSlotPos(p);
    (buckets[slot] || buckets.SF).push(p);
  }
  return buckets;
}

/**
 * A starting five can end up with two players claiming the same slot (e.g. both marked SG)
 * and an empty slot sitting unused. Bump the loser of each collision into whichever empty
 * slot is open, rather than leaving a duplicate and a gap in the lineup.
 */
export function resolveStarterPositionCollisions(picked) {
  if (!picked?.length) return;
  const byPos = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of picked) {
    const pos = normPos5(p.playPos || p.pos);
    (byPos[pos] || byPos.SF).push(p);
  }
  const empty = POS_SLOTS.map((s) => s.id).filter((id) => !byPos[id].length);
  for (const s of POS_SLOTS) {
    const list = byPos[s.id];
    while (list.length > 1 && empty.length) {
      const mover = list.pop();
      const dest = empty.shift();
      mover.playPos = dest;
      byPos[dest].push(mover);
    }
  }
}

/**
 * 按属性推荐球员指令倾向（用法 / 打法 / 区域 / 欲望 / 防守）.
 * 不作手动调整时即用这套作为 default。
 */
export function recommendPlayerOrders(player = null) {
  const arch = player?.archetype || "";
  const pass = player?.pass || 50;
  const scoring = player?.scoring || 50;
  const defense = player?.defense || 50;
  const rebound = player?.rebound || 50;
  const three = player?.three || 50;
  const mid = player?.mid || 50;
  const paint = player?.paint || 50;
  const speed = player?.speed || 50;
  const steal = player?.steal || 40;
  const apg = player?.raw?.apg || 0;
  const ppg = Number(player?.raw?.ppg) || 0;
  const threeTend = player?.threeTend || 30;
  const paintTend = player?.paintTend || 40;
  const midTend = player?.midTend || 40;
  const shotTend = player?.shotTend || 50;
  const style = player?.offenseStyle || "";
  const playPos = player?.playPos || recommendPlayPos(player);
  const isBig = playPos === "C" || playPos === "PF";

  let usage = "balanced";
  let action = "pnr";
  let attack = "auto";
  let defFocus = "auto";
  let aggression = "normal";
  let hunt = "auto";

  const skills = player?.skills || [];
  const lobThreat =
    skills.includes("lob_finisher") ||
    skills.includes("spring_board") ||
    /lob_finisher|spring_board/.test(arch);

  const blueCollar =
    scoring < 74 &&
    defense >= 76 &&
    (rebound >= 68 || defense >= 82) &&
    apg < 5 &&
    !lobThreat &&
    !/iso_|mamba|creator|goat|engine|floor_general/.test(arch);

  // 空接/弹跳终结手：别默认成「专注防守」——会几乎不出空接招牌
  if (lobThreat && isBig) {
    usage = scoring >= 78 ? "score" : "balanced";
    action = "post"; // 顺下/低位接球，不当持球发动点
    attack = "paint";
    defFocus = skills.includes("rim_protector") ? "help" : "auto";
    aggression = "normal";
    hunt = "hunt";
  } else if (blueCollar) {
    usage = "hustle";
    action = "crash";
    attack = "putback";
    defFocus = "allout";
    aggression = "lock_d";
    hunt = "patient";
  } else if (ppg >= 27 && scoring >= 85) {
    // 历史级得分手（乔丹 / 科比 / 哈登 / 东契奇…）：就算会传球，默认也是第一得分点
    usage = "score";
    action = isBig && style === "post" ? "post" : "iso";
    aggression = "high";
    hunt = "hunt";
  } else if (apg >= 8 || (pass >= 78 && scoring < 88) || style === "playmake") {
    // 传球手 ≠ 不投篮：奥斯卡 30+11、魔术师 24+12、约基奇 25+10 都是得分型发起点。
    // 只有得分少的纯组织者才「低攻击欲 + 先传导」
    usage = ppg >= 20 ? "balanced" : "organize";
    action = pass >= 80 ? "drive_kick" : "pnr";
    aggression = ppg >= 12 || scoring >= 80 ? "normal" : "low";
    hunt = ppg >= 20 ? "auto" : "patient";
  } else if (scoring >= 88 && pass < 68 && apg < 6) {
    usage = "score";
    action = isBig && style === "post" ? "post" : style === "midiso" ? "iso" : "iso";
    aggression = "high";
    hunt = "hunt";
  } else if ((style === "spot" || style === "stretch" || threeTend >= 55) && apg < 7) {
    usage = scoring >= 82 ? "score" : "defend";
    action = "spot";
    aggression = scoring >= 84 ? "normal" : "low";
  } else if ((pass >= 70 || apg >= 6) && scoring >= 78) {
    usage = "balanced";
    action = isBig ? (style === "post" ? "post" : "pnr") : "pnr";
    aggression = "normal";
  } else if (defense >= 82 && scoring < 80 && (steal >= 70 || /3andD|stopper/.test(arch))) {
    usage = "defend";
    action = style === "spot" || threeTend >= 48 ? "spot" : "auto";
    defFocus = "onball";
    aggression = "lock_d";
    hunt = "patient";
  } else if (isBig && (style === "post" || (paintTend >= 62 && threeTend <= 28))) {
    usage = scoring >= 80 ? "score" : "balanced";
    action = "post";
    aggression = "normal";
  } else if (style === "slash" || (speed >= 78 && paintTend >= 55)) {
    usage = "score";
    action = "iso";
    aggression = "high";
    hunt = "hunt";
  }

  // 出手区域：跟三分/油漆区/中投倾向对齐
  if (attack === "auto" || attack === "putback") {
    if (attack === "putback") {
      /* keep */
    } else if (threeTend >= 58 && three >= 70) attack = "perimeter";
    else if (paintTend >= 62 && paint >= 72) attack = "paint";
    else if (midTend >= 58 && mid >= 78) attack = "mid";
    else if (isBig && paint >= 75) attack = "paint";
    else if (threeTend >= 45 && three >= 72) attack = "perimeter";
    else attack = "auto";
  }

  if (hunt === "auto") {
    if (usage === "score" || shotTend >= 78) hunt = "hunt";
    else if (usage === "organize" || usage === "defend" || usage === "hustle") hunt = "patient";
    else hunt = "auto";
  }

  if (defFocus === "auto") {
    if (defense >= 86 || steal >= 78) defFocus = "onball";
    else if (defense >= 78 && (playPos === "SF" || playPos === "PG")) defFocus = "deny";
    else if (isBig && (player?.block || 40) >= 72) defFocus = "help";
  }

  if (action === "auto") {
    if (apg >= 7 || pass >= 78) action = "drive_kick";
    else if (isBig) action = paintTend >= 55 ? "post" : "pnr";
    else if (threeTend >= 52) action = "spot";
    else if (scoring >= 84) action = "iso";
    else action = "pnr";
  }

  return {
    usage,
    attack,
    action,
    hunt,
    aggression,
    defFocus,
  };
}

/** @deprecated 使用 recommendPlayerOrders；保留别名兼容 */
export function defaultPlayerOrders(player = null) {
  return recommendPlayerOrders(player);
}

/**
 * 写入推荐位置与指令。未手动改过的字段跟推荐走。
 * @param {{ force?: boolean }} opts force=true 时覆盖手动设置
 */
export function applyRecommendedDefaults(player, { force = false } = {}) {
  if (!player) return player;
  const recPos = recommendPlayPos(player);
  player.playPosRecommended = recPos;
  if (force || !player.playPosManual) {
    player.playPos = recPos;
  } else if (!player.playPos) {
    player.playPos = recPos;
  }

  const recOrders = recommendPlayerOrders(player);
  player.ordersRecommended = { ...recOrders };
  if (force || !player.ordersManual) {
    player.orders = { ...recOrders };
  } else if (!player.orders) {
    player.orders = { ...recOrders };
  } else {
    // 手动过：只补缺省键，不覆盖已选项
    player.orders = { ...recOrders, ...player.orders };
  }
  return player;
}

export function markPlayPosManual(player, pos) {
  if (!player) return;
  player.playPos = normPos5(pos || player.playPos || player.pos);
  player.playPosManual = true;
}

export function markOrdersManual(player, patch = {}) {
  if (!player) return;
  if (!player.orders) player.orders = recommendPlayerOrders(player);
  Object.assign(player.orders, patch);
  player.ordersManual = true;
}

/** 推荐的持球发起打法（排除无球定点——那是配合角色）. */
export function suggestedBallHandlerAction(player) {
  const cur = player?.orders?.action;
  if (cur && cur !== "auto" && cur !== "spot") return cur;
  const d = defaultPlayerOrders(player);
  if (d.action && d.action !== "auto" && d.action !== "spot") return d.action;
  const pass = player?.pass || 50;
  const scoring = player?.scoring || 50;
  if (pass >= 78) return "drive_kick";
  if (pass >= 70) return "pnr";
  if (scoring >= 88) return "iso";
  if (["C", "PF"].includes(player?.pos || player?.playPos)) return "post";
  return "pnr";
}

/** 持球打法对应的 usage 暗示（组织 / 得分）. */
export function usageForBallAction(action) {
  if (action === "drive_kick" || action === "pnr") return "organize";
  if (action === "iso" || action === "post") return "score";
  if (action === "spot") return "defend";
  return null;
}

/** 可选手的持球打法（不含自由；无球定点留给配合球员）. */
export const BALL_HANDLER_ACTIONS = ORDER_ACTION.filter((a) => a.id !== "auto");

export function ensurePlayerOrders(players) {
  for (const p of players || []) {
    applyRecommendedDefaults(p, { force: false });
  }
  return players;
}

/** 批量套用推荐位置+指令（未手动调整的球员） */
export function ensurePlayerDefaults(players, opts = {}) {
  for (const p of players || []) applyRecommendedDefaults(p, opts);
  return players;
}

export function ordersLabel(orders) {
  if (!orders) return "";
  const bits = [];
  const u = ORDER_USAGE.find((x) => x.id === orders.usage);
  const a = ORDER_ATTACK.find((x) => x.id === orders.attack);
  const act = ORDER_ACTION.find((x) => x.id === orders.action);
  const h = ORDER_HUNT.find((x) => x.id === orders.hunt);
  const ag = ORDER_AGGRESSION.find((x) => x.id === orders.aggression);
  const d = ORDER_DEF.find((x) => x.id === orders.defFocus);
  if (u && u.id !== "auto") bits.push(u.name);
  if (ag && ag.id !== "auto") bits.push(ag.name);
  if (act && act.id !== "auto") bits.push(act.name);
  if (a && a.id !== "auto") bits.push(a.name);
  if (h && h.id !== "auto") bits.push(h.name);
  if (d && d.id !== "auto") bits.push(d.name);
  return bits.join(" · ");
}

/** Infer default role from production / value archetype. */
export function inferPlayerRole(p) {
  if (p.roleExpectation) return p.roleExpectation;
  const o = overall(p);
  const ppg = p.raw?.ppg ?? 0;
  if (p.valueArchetype === "bargain" && o < 86) return "sixth";
  if (ppg >= 25 || o >= 90) return "alpha";
  if (ppg >= 16 || o >= 82) return "starter";
  if (ppg >= 10 || o >= 74) return "sixth";
  if (o >= 65) return "role";
  return "bench";
}

export function ensureRoles(players) {
  for (const p of players || []) {
    if (!p.roleExpectation) p.roleExpectation = inferPlayerRole(p);
    if (p.targetMinutes == null) {
      p.targetMinutes = PLAYER_ROLES[p.roleExpectation]?.wantMin ?? 20;
    }
    // Clamp to stamina-aware ceiling
    const cap = staminaMinuteCap(p);
    if (p.targetMinutes > cap + 4) p.targetMinutes = cap;
  }
  return players;
}

/** Regulation player-minutes per side (5 × 48). */
export const TEAM_MINUTE_BUDGET = 240;
// Rotation tiers when a superteam over-books minutes: starters / rotation / garbage time
const ROTATION_TIER_CAPS = [34, 34, 34, 34, 34, 24, 22, 18, 14];
const DEEP_BENCH_CAP = 6;

/**
 * 巨星队分钟预算：13 个 alpha 各要 36 分钟 = 468 分钟，比赛只有 240。
 * 超额时按优先级（首发 → OVR）排出真实教练的 9 人轮换，否则换人逻辑
 * 会把下场的巨星永远排在“剩余分钟更多”的替补后面。
 * 只在明显超额时生效，普通球队不受影响。会改写 targetMinutes，应只传比赛副本。
 */
export function fitMinuteBudget(players, { starterIds = [], rank = (p) => p.ovr || 0, budget = TEAM_MINUTE_BUDGET } = {}) {
  const active = (players || []).filter((p) => !(p.injuredGames > 0));
  const booked = active.reduce((sum, p) => sum + (p.targetMinutes ?? 22), 0);
  if (booked <= budget * 1.1) return players;
  const starters = new Set(starterIds);
  const ordered = [...active].sort(
    (a, b) => Number(starters.has(b.id)) - Number(starters.has(a.id)) || rank(b) - rank(a)
  );
  const caps = ordered.map((p, i) => Math.min(p.targetMinutes ?? 22, ROTATION_TIER_CAPS[i] ?? DEEP_BENCH_CAP));
  const total = caps.reduce((sum, m) => sum + m, 0);
  if (total > budget) {
    // Trim the bench first, then (only if still over) everyone
    const starterMin = caps.slice(0, 5).reduce((sum, m) => sum + m, 0);
    const benchMin = total - starterMin;
    const benchScale = benchMin > 0 ? Math.max(0, (budget - starterMin) / benchMin) : 1;
    for (let i = 5; i < caps.length; i += 1) caps[i] *= Math.min(1, benchScale);
    const after = caps.reduce((sum, m) => sum + m, 0);
    if (after > budget) for (let i = 0; i < caps.length; i += 1) caps[i] *= budget / after;
  }
  ordered.forEach((p, i) => {
    p.targetMinutes = Math.round(caps[i]);
  });
  return players;
}

/** Soft minute ceiling from stamina — low gas can't safely play 35+. */
export function staminaMinuteCap(p) {
  const stam = Number(p?.stamina) || 50;
  let cap = 20;
  if (stam >= 94) cap = 48;
  else if (stam >= 88) cap = 42;
  else if (stam >= 80) cap = 36;
  else if (stam >= 70) cap = 32;
  else if (stam >= 60) cap = 28;
  else if (stam >= 50) cap = 24;
  const skills = p?.skills || [];
  if (skills.includes("iron_lungs")) cap = Math.min(48, cap + 8);
  else if (skills.includes("motor_engine")) cap = Math.min(48, cap + 4);
  return cap;
}

export function staminaMinuteHint(p) {
  const stam = Number(p?.stamina) || 50;
  const cap = staminaMinuteCap(p);
  const t = Number(p?.targetMinutes) || 0;
  if (t > cap) return `⚠ 体能${stam}，长期 ${t} 分钟易崩（建议 ≤${cap}）`;
  if (t >= cap - 2) return `体能${stam} · 已接近上限 ${cap}`;
  return `体能${stam} · 可稳打约 ${cap} 分钟`;
}

/** Suggest target minutes from role + stamina. */
export function suggestTargetMinutes(p) {
  const roleMin = PLAYER_ROLES[p.roleExpectation || inferPlayerRole(p)]?.wantMin ?? 22;
  const cap = staminaMinuteCap(p);
  return Math.max(8, Math.min(cap, roleMin));
}

/**
 * Snapshot default rotation for season reuse / experimentation.
 */
export function captureRotationPlan(team, starterIds = null) {
  if (!team) return null;
  const starters = starterIds || team.starterIds || [];
  return {
    starterIds: [...starters].slice(0, 5),
    offenseFocusId: team.gameplan?.offenseFocusId || null,
    tempo: normalizeTempo(team.gameplan?.tempo),
    specialTactics: [...(team.coach?.specialTactics || [])],
    phil: team.coach?.buffs
      ? {
          offense: team.coach.buffs.offense,
          defense: team.coach.buffs.defense,
          morale: team.coach.buffs.morale,
          stamina: team.coach.buffs.stamina,
          styleName: team.coach.style || "",
        }
      : null,
    players: (team.players || []).map((p) => ({
      id: p.id,
      playPos: p.playPos || p.pos,
      roleExpectation: p.roleExpectation || inferPlayerRole(p),
      targetMinutes: p.targetMinutes ?? suggestTargetMinutes(p),
      orders: p.orders ? structuredClone(p.orders) : defaultPlayerOrders(p),
    })),
    savedAt: Date.now(),
  };
}

/** Apply a saved rotation onto a live team roster (by player id). */
export function applyRotationPlan(team, plan) {
  if (!team || !plan) return team;
  const byId = Object.fromEntries((plan.players || []).map((x) => [x.id, x]));
  for (const p of team.players || []) {
    const s = byId[p.id];
    if (!s) continue;
    if (s.playPos) p.playPos = s.playPos;
    if (s.roleExpectation) p.roleExpectation = s.roleExpectation;
    if (s.targetMinutes != null) p.targetMinutes = Math.max(8, Math.min(48, Number(s.targetMinutes) || 20));
    if (s.orders) p.orders = { ...defaultPlayerOrders(p), ...s.orders };
  }
  ensureRoles(team.players);
  ensurePlayerOrders(team.players);
  team.starterIds = (plan.starterIds || []).filter((id) => team.players.some((p) => p.id === id)).slice(0, 5);
  team.gameplan = team.gameplan || {};
  if (plan.offenseFocusId) team.gameplan.offenseFocusId = plan.offenseFocusId;
  if (plan.tempo) team.gameplan.tempo = normalizeTempo(plan.tempo);
  if (plan.phil && team.coach) {
    team.coach.buffs = {
      ...(team.coach.buffs || {}),
      offense: plan.phil.offense,
      defense: plan.phil.defense,
      morale: plan.phil.morale,
      stamina: plan.phil.stamina,
    };
    if (plan.phil.styleName) team.coach.style = plan.phil.styleName;
  }
  if (plan.specialTactics?.length && team.coach) {
    team.coach.specialTactics = [...plan.specialTactics];
  }
  team.rotation = plan;
  return team;
}

/** Build a 5-man pack from roster by style. */
export function buildLineupPack(players, style = "scoring") {
  const healthy = (players || []).filter((p) => !(p.injuredGames > 0));
  const score = (p) => {
    if (style === "defense") return (p.defense || 50) * 1.2 + (p.steal || 40) * 0.3 + (p.block || 40) * 0.25;
    if (style === "spacing") return (p.three || 50) * 1.4 + (p.speed || 50) * 0.2 + (p.pass || 50) * 0.15;
    return (p.scoring || 50) * 1.2 + (p.clutch || 50) * 0.2 + (p.mid || 50) * 0.1;
  };
  // Prefer unique positions
  const order = ["PG", "SG", "SF", "PF", "C"];
  const picked = [];
  const used = new Set();
  for (const pos of order) {
    const cand = healthy
      .filter((p) => !used.has(p.id) && (p.playPos || p.pos) === pos)
      .sort((a, b) => score(b) - score(a))[0];
    if (cand) {
      picked.push(cand);
      used.add(cand.id);
    }
  }
  const rest = healthy.filter((p) => !used.has(p.id)).sort((a, b) => score(b) - score(a));
  while (picked.length < 5 && rest.length) {
    const p = rest.shift();
    picked.push(p);
    used.add(p.id);
  }
  return picked.slice(0, 5);
}

export function autoBuildAllPacks(players) {
  const packs = {};
  for (const def of LINEUP_PACK_DEFS) {
    packs[def.id] = buildLineupPack(players, def.id).map((p) => p.id);
  }
  return packs;
}

/**
 * Morale delta from minutes vs role expectation (call between quarters / at half).
 * Returns list of { player, delta, reason }.
 */
export function roleMinutesMoraleDelta(onCourt, bench, quarter) {
  const all = [...(onCourt || []), ...(bench || [])];
  const reports = [];
  // Rough expected share of game by now (quarters 1–4)
  const gameFrac = Math.min(1, Math.max(0.2, quarter / 4));
  for (const p of all) {
    const role = PLAYER_ROLES[inferPlayerRole(p)] || PLAYER_ROLES.role;
    const target = p.targetMinutes ?? role.wantMin;
    const played = p.stats?.min ?? 0;
    const expected = target * gameFrac;
    let delta = 0;
    let reason = "";
    if (played + 2 < expected * 0.72 && role.id !== "bench") {
      delta = role.id === "alpha" ? -6 : role.id === "starter" ? -4 : -2;
      reason = `${p.name}（${role.name}）出场偏少，心情下滑`;
    } else if (played > expected * 1.25 && (p.fatigue || 0) > 55) {
      delta = role.id === "bench" || role.id === "role" ? 2 : -1;
      reason =
        role.id === "bench" || role.id === "role"
          ? `${p.name} 获得额外机会，士气上升`
          : `${p.name} 负荷偏高，略显烦躁`;
    } else if (Math.abs(played - expected) <= 3) {
      delta = 1;
      reason = `${p.name} 轮换符合预期`;
    }
    if (delta) reports.push({ player: p, delta, reason });
  }
  return reports;
}
