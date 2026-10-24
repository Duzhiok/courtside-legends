/**
 * 淘汰赛生涯模式（金币晋级赛 / 自定义预算轮抽）的 CPU 模拟与市场经济：
 * - CPU vs CPU 的快速模拟（不进真人比赛界面，直接出结果）
 * - 根据预算生成「买得起」的货架
 * - 球探包的出现概率与价格
 *
 * 与 `careerBracket.js`（对阵结构：pod / 晋级 / 淘汰）是互补关系，不重叠：
 * 这里只管「一场 CPU 比赛怎么打」和「市场上该摆什么」。
 */
import { isHiddenGem, isPlayerAvailable, playerPrice } from "../data/intangibles.js";
import { overall, clonePlayer, PLAYERS } from "../data/players.js";
import { teamPowerLabel } from "./draft.js";
import { nextEmptyPlayPos } from "./gameplan.js";
import { GameSim } from "./sim.js";

/** 换货时出现球探包的基础概率（新一轮 / 手动刷新都会重 roll，不是每轮必出） */
export const SCOUT_PACK_CHANCE = 0.28;
/** 花钱刷新球员市场时略低，避免刷出来 */
export const SCOUT_PACK_REFRESH_CHANCE = 0.2;
export const SCOUT_PACK_COST_MIN = 70;
export const SCOUT_PACK_COST_MAX = 100;

/** Pick a team's best-available 5 by OVR, respecting any manual starterIds. */
export function teamStarters(team) {
  if (!team?.players?.length) return [];
  const healthy = team.players.filter(isPlayerAvailable);
  const pool = healthy.length ? healthy : team.players;
  let picked;
  if (team.starterIds?.length >= 5) {
    const pick = team.starterIds.map((id) => team.players.find((p) => p.id === id)).filter(Boolean);
    if (pick.length >= 5) picked = pick.slice(0, 5);
  }
  if (!picked) picked = [...pool].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
  return seatByPosition(picked);
}

/**
 * CPU/auto-picked fives never go through the human setup screen's position-collision handling,
 * so a lineup like Malone + Barkley + Duncan (three true bigs) would just carry over each
 * player's stale/leftover playPos -- which then poisons anything downstream that trusts playPos
 * over natural pos, like the all-tournament team (allTeam.js picks "this tournament's best PG"
 * by playPos, so a big who was never actually a guard could get recorded as one). Clone + seat
 * everyone by best-fit here, best OVR first, so every starting five this hands back is
 * positionally sane -- without mutating the real roster objects underneath it.
 */
function seatByPosition(picked) {
  const seated = [];
  for (const p of [...picked].sort((a, b) => overall(b) - overall(a))) {
    const clone = { ...p };
    const preferred = p.playPosManual ? p.playPos || p.pos : null;
    clone.playPos = nextEmptyPlayPos(seated, clone, preferred);
    seated.push(clone);
  }
  return seated;
}

/** Fast CPU-vs-CPU sim for bracket rounds the human isn't playing in. */
export function simulateCpuMatch(home, away) {
  const h = { ...home, starterIds: teamStarters(home).map((p) => p.id) };
  const a = { ...away, starterIds: teamStarters(away).map((p) => p.id) };
  let finalSnap = null;
  const sim = new GameSim({
    home: h,
    away: a,
    youSide: "home",
    injuries: true,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: (snap) => {
      finalSnap = snap;
    },
  });
  const snap = sim.runFast() || finalSnap || sim.snapshot();
  const hs = snap.score.home;
  const as = snap.score.away;
  // Tie-break: higher team power
  let winner = hs >= as ? home : away;
  if (hs === as) winner = teamPowerLabel(home) >= teamPowerLabel(away) ? home : away;
  return {
    score: { home: hs, away: as },
    winner,
    snap,
    startersA: snap.home?.onCourt?.length ? snap.home.onCourt.slice(0, 5) : teamStarters(home),
    startersB: snap.away?.onCourt?.length ? snap.away.onCourt.slice(0, 5) : teamStarters(away),
  };
}

export function budgetGold(c) {
  if (c.kind === "duel") return Math.max(c.goldA || 0, c.goldB || 0);
  return c.gold || 0;
}

/** Primary position token ("PG/SG" -> "PG"). */
export function primaryPos(p) {
  return String(p?.playPos || p?.pos || "").split("/")[0].trim();
}

const SHOP_POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const SHOP_POS_TARGET = 2;

/** Count a roster by primary position. */
export function positionCounts(players = []) {
  const counts = {};
  for (const p of players || []) {
    const pos = primaryPos(p);
    if (pos) counts[pos] = (counts[pos] || 0) + 1;
  }
  return counts;
}

/** Positions below the 2-per-slot target, scarcest first. */
export function deficitPositions(players = []) {
  const counts = positionCounts(players);
  return SHOP_POSITIONS.filter((pos) => (counts[pos] || 0) < SHOP_POS_TARGET)
    .sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
}

/**
 * Fit signal for a shop row: "need" when the player fills a below-target
 * position, "tactic" when his archetype matches a coach tactic need,
 * otherwise null. Pure (tacticNeeds passed in) so tests need no DOM/coach.
 */
export function shopFit(p, teamPlayers = [], tacticNeeds = []) {
  if (!p) return null;
  const pos = primaryPos(p);
  if (pos && deficitPositions(teamPlayers).includes(pos)) return "need";
  const needs = new Set(tacticNeeds || []);
  if (p.archetype && needs.has(p.archetype)) return "tactic";
  return null;
}

/**
 * Refresh cost for a career market: free while the roster cannot field a
 * rotation (< 8 players), so gold can never be burned without a team.
 * Duel keeps its own charging path and never uses this.
 */
export function careerRefreshCost(c, baseCost) {
  if (c?.kind === "career" && (c.team?.players?.length || 0) < 8) return 0;
  return baseCost;
}

/** Build a shop skewed toward what you can afford now. */
export function buildAffordableShop(c, size = 12) {
  const exclude = c.used || new Set();
  const budget = Math.max(80, budgetGold(c));
  // 一人一卡是按「人」算的（WORKNOTE 决策：同一真人只有时空对决允许重复）：
  // 已用卡的 bref 集合要挡住同人其他赛季的卡，否则市场能买到第二个乔丹。
  const byId = new Map(PLAYERS.map((p) => [p.id, p.bref]));
  const usedPeople = new Set([...exclude].map((id) => byId.get(id)).filter(Boolean));
  for (const s of c.shop || []) if (s?.bref) usedPeople.add(s.bref);
  const pool = PLAYERS.filter(
    (p) => !exclude.has(p.id) && !usedPeople.has(p.bref) && !(c.shop || []).some((s) => s.id === p.id)
  );
  const priced = pool.map((p) => ({ p, price: playerPrice(p) }));
  const cheap = priced.filter((x) => x.price <= budget * 0.55);
  const mid = priced.filter((x) => x.price > budget * 0.55 && x.price <= budget);
  const stretch = priced.filter((x) => x.price > budget && x.price <= budget * 1.35);
  const gems = priced.filter((x) => isHiddenGem(x.p) && x.price <= budget * 1.2);

  const deficit = new Set(deficitPositions(c.team?.players));
  const pick = (arr, n) => {
    // Deficit positions first within each price band, sampled randomly
    // inside each group so refreshes still vary.
    const groups = [
      arr.filter((x) => deficit.has(primaryPos(x.p))),
      arr.filter((x) => !deficit.has(primaryPos(x.p))),
    ];
    const out = [];
    for (const group of groups) {
      const copy = [...group];
      while (copy.length && out.length < n) {
        const i = Math.floor(Math.random() * copy.length);
        out.push(copy.splice(i, 1)[0].p);
      }
      if (out.length >= n) break;
    }
    return out;
  };

  // Mostly buyable: 7 cheap + 4 mid + 1 stretch tease; sometimes seed hidden gems
  let shop = [...pick(cheap, 7), ...pick(mid, 4), ...pick(stretch, 1)];
  if (gems.length && Math.random() < 0.62) {
    shop = [...pick(gems, Math.min(2, gems.length)), ...shop];
  }
  if (shop.length < size) {
    shop = shop.concat(pick(priced, size - shop.length));
  }
  // de-dupe（按卡 + 按人：同一货架不摆同人两个赛季）
  const seen = new Set();
  const seenPeople = new Set();
  shop = shop.filter((p) => {
    if (seen.has(p.id) || (p.bref && seenPeople.has(p.bref))) return false;
    seen.add(p.id);
    if (p.bref) seenPeople.add(p.bref);
    return true;
  });
  shop = shop.slice(0, size);
  // 宝石前置可能与价格带 picks 重复，去重后若不足格要补货（否则货架缩水）
  if (shop.length < size) {
    const pickedIds = new Set(shop.map((p) => p.id));
    const pickedPeople = new Set(shop.map((p) => p.bref).filter(Boolean));
    const rest = priced.filter((x) => !pickedIds.has(x.p.id) && !pickedPeople.has(x.p.bref));
    shop = shop.concat(pick(rest, size - shop.length));
  }
  // 保底：至少 2/3 货架为当前金币可负担，否则用最便宜的未上架球员替换最贵的超预算者
  const gold = budgetGold(c);
  const needAffordable = Math.ceil((shop.length * 2) / 3);
  const affordable = shop.filter((p) => playerPrice(p) <= gold).length;
  if (affordable < needAffordable) {
    const inShop = new Set(shop.map((p) => p.id));
    const inShopPeople = new Set(shop.map((p) => p.bref).filter(Boolean));
    const cheapBench = priced
      .filter((x) => !inShop.has(x.p.id) && !inShopPeople.has(x.p.bref) && !usedPeople.has(x.p.bref) && x.price <= gold)
      .sort((a, b) => a.price - b.price);
    shop.sort((a, b) => playerPrice(b) - playerPrice(a));
    for (const x of cheapBench) {
      if (shop.filter((p) => playerPrice(p) <= gold).length >= needAffordable) break;
      const idx = shop.findIndex((p) => playerPrice(p) > gold);
      if (idx < 0) break;
      shop[idx] = x.p;
    }
  }
  return shop.map(clonePlayer);
}

/**
 * 每换一批货重新 roll：有时出球探包，有时没有（不是每轮必买）。
 * @param {"round"|"refresh"} reason
 */
export function rollScoutPackOffer(c, reason = "round") {
  c.scoutActive = false;
  const chance = reason === "refresh" ? SCOUT_PACK_REFRESH_CHANCE : SCOUT_PACK_CHANCE;
  if (Math.random() >= chance) {
    c.scoutOffer = null;
    return;
  }
  const span = SCOUT_PACK_COST_MAX - SCOUT_PACK_COST_MIN;
  const cost = SCOUT_PACK_COST_MIN + Math.floor(Math.random() * (span + 1));
  c.scoutOffer = { cost, bought: false, reason };
}
