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

/** Build a shop skewed toward what you can afford now. */
export function buildAffordableShop(c, size = 12) {
  const exclude = c.used || new Set();
  const budget = Math.max(80, budgetGold(c));
  const pool = PLAYERS.filter((p) => !exclude.has(p.id) && !(c.shop || []).some((s) => s.id === p.id));
  const priced = pool.map((p) => ({ p, price: playerPrice(p) }));
  const cheap = priced.filter((x) => x.price <= budget * 0.55);
  const mid = priced.filter((x) => x.price > budget * 0.55 && x.price <= budget);
  const stretch = priced.filter((x) => x.price > budget && x.price <= budget * 1.35);
  const gems = priced.filter((x) => isHiddenGem(x.p) && x.price <= budget * 1.2);

  const pick = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) {
      const i = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(i, 1)[0].p);
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
  // de-dupe
  const seen = new Set();
  shop = shop.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return shop.slice(0, size).map(clonePlayer);
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
