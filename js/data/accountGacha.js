/**
 * Account-side gacha flow: daily / gold pulls, duplicate handling by real
 * person, 成色 choice, souls, wishlist and crafting. Rules live in gacha.js;
 * this module only applies them to a stored account.
 *
 * Duplicate rules:
 *  - Same season card  → ★+1 (all attrs +1, max ★5) and a 成色 choice:
 *                        keep the old roll or take the new one (whole set).
 *  - Same person, other season → new version joins the binder + 1 球魂.
 *  - Same card at ★5   → 2 球魂.
 *  No random skill on duplicates anymore — skills come from 领悟 / awards.
 */
import { COACHES, coachDrawWeight, isLegendCoach } from "./coaches.js";
import { clonePlayer, overall, PLAYERS } from "./players.js";
import {
  applyCardMods,
  rarityLabel,
  saveAccount,
  todayKey,
  weightedPick,
} from "./account.js";
import { compareRolls, legacyRollSeed, newRollSeed } from "./cardRoll.js";
import { MAX_CARDS, cardRoom } from "./accountRecycle.js";
import {
  EXTRA_DRAW,
  MAX_STARS,
  SOULS_PER_STAR,
  craftCost,
  currentBanners,
  extraDrawsLeft,
  freshGachaState,
  goldForPull,
  pullCard,
  recordExtraDraw,
} from "./gacha.js";

const COACH_SHARE = 0.2;
const SOULS_AT_MAX_STAR = 2;
const HISTORY_KEEP = 50;

function gachaOf(account) {
  return { ...freshGachaState(), ...(account.gacha || {}) };
}

function modOf(account, playerId) {
  account.cardMods = account.cardMods || {};
  account.cardMods[playerId] = account.cardMods[playerId] || { merges: 0, skills: [] };
  return account.cardMods[playerId];
}

function addSouls(account, bref, amount) {
  const gacha = gachaOf(account);
  gacha.souls = { ...gacha.souls, [bref]: (gacha.souls[bref] || 0) + amount };
  account.gacha = gacha;
  return gacha.souls[bref];
}

function addCopy(account, player, rng) {
  account.playerIds = [...(account.playerIds || []), player.id];
  // 图鉴 remembers every card ever owned, even after it is recycled.
  account.codex = [...new Set([...(account.codex || []), player.id])];
  modOf(account, player.id).roll = newRollSeed(rng);
}

function pushHistory(account, entry) {
  account.drawHistory = [...(account.drawHistory || []).slice(-(HISTORY_KEEP - 1)), entry];
}

export function drawAvailability(account, today = todayKey()) {
  if (!account) return { free: false, tickets: 0, extraLeft: 0, cost: EXTRA_DRAW.cost, canPay: false, any: false };
  const free = account.lastDailyDraw !== today;
  const tickets = account.tickets || 0;
  const extraLeft = extraDrawsLeft(account.gacha, today);
  const canPay = extraLeft > 0 && (account.gold || 0) >= EXTRA_DRAW.cost;
  return { free, tickets, extraLeft, cost: EXTRA_DRAW.cost, canPay, any: free || tickets > 0 || canPay };
}

export function canDailyDraw(account) {
  return drawAvailability(account).any;
}

/** Spend today's free pull, then an 抽卡券, then gold. Throws when none is available. */
function payForPull(account, today) {
  const availability = drawAvailability(account, today);
  if (availability.free) {
    account.lastDailyDraw = today;
    return { paidGold: 0, usedTicket: false };
  }
  if (availability.tickets > 0) {
    account.tickets -= 1;
    return { paidGold: 0, usedTicket: true };
  }
  if (!availability.canPay) throw new Error("今日免费抽卡和抽卡券都用完了，金币也不够加抽");
  account.gold -= EXTRA_DRAW.cost;
  account.gacha = recordExtraDraw(gachaOf(account), today);
  return { paidGold: EXTRA_DRAW.cost, usedTicket: false };
}

function drawCoach(account, paid) {
  account.coachIds = account.coachIds || [];
  const coach = weightedPick(COACHES, (c) => coachDrawWeight(c));
  const duplicate = account.coachIds.includes(coach.id);
  const rarity = isLegendCoach(coach)
    ? coach.fame >= 94 ? "名帅" : "名教"
    : coach.fame >= 45 ? "主帅" : "菜鸟教头";
  let goldGain = 0;
  if (duplicate) {
    goldGain = Math.max(20, Math.round((coach.fame || 40) * 0.9));
    account.gold = (account.gold || 0) + goldGain;
  } else {
    account.coachIds = [...account.coachIds, coach.id];
  }
  pushHistory(account, { kind: "coach", id: coach.id, at: Date.now(), duplicate, rarity });
  saveAccount(account);
  return { kind: "coach", coach: structuredClone(coach), duplicate, goldGain, rarity, ...paid };
}

/**
 * Classify + apply a pulled player card. Returns the outcome payload the UI
 * renders (rollChoice is set when a same-card duplicate offers a 成色 swap).
 */
function applyPlayerPull(account, player, rng, pool) {
  const owned = account.playerIds || [];
  const sameCard = owned.includes(player.id);
  const brefById = new Map(pool.map((p) => [p.id, p.bref]));
  const ownedVersions = sameCard ? [] : owned.filter((id) => brefById.get(id) === player.bref);
  let outcome = "new";
  let souls = gachaOf(account).souls[player.bref] || 0;
  let rollChoice = null;

  if (sameCard) {
    const mod = modOf(account, player.id);
    if ((mod.merges || 0) < MAX_STARS) {
      outcome = "starUp";
      mod.merges = (mod.merges || 0) + 1;
      mod.roll = mod.roll || legacyRollSeed(account.id, player.id);
      account.pendingRoll = { playerId: player.id, seed: newRollSeed(rng) };
      rollChoice = pendingRollChoice(account, pool);
    } else {
      outcome = "soulConvert";
      souls = addSouls(account, player.bref, SOULS_AT_MAX_STAR);
    }
  } else if (ownedVersions.length) {
    outcome = "newVersion";
    addCopy(account, player, rng);
    souls = addSouls(account, player.bref, 1);
  } else {
    addCopy(account, player, rng);
  }
  return { outcome, souls, rollChoice };
}

/**
 * One pull (free daily first, then gold). Options:
 *  bannerId — one of currentBanners(date) ids (default 全历史常驻池)
 *  rng / pool / date — injectable for tests.
 */
export function performDailyDraw(account, { bannerId = "standard", rng = Math.random, pool = PLAYERS, date = new Date() } = {}) {
  if (!account) throw new Error("无账号");
  if (cardRoom(account) <= 0) throw new Error(`卡库已满（${MAX_CARDS} 张）——先去「我的球员卡」分解一些`);
  const paid = payForPull(account, todayKey(date));
  if (rng() < COACH_SHARE) return drawCoach(account, paid);

  const banner = currentBanners(date).find((b) => b.id === bannerId) || currentBanners(date)[0];
  const pull = pullCard({ pool, gacha: gachaOf(account), banner, rng, ovrOf: overall });
  account.gacha = pull.gacha;
  const ovr = overall(pull.player);
  const { outcome, souls, rollChoice } = applyPlayerPull(account, pull.player, rng, pool);
  const goldGain = goldForPull(ovr);
  account.gold = (account.gold || 0) + goldGain;

  pushHistory(account, { kind: "player", id: pull.player.id, at: Date.now(), outcome, banner: banner.id, pity: pull.pityHit, wish: pull.wishHit });
  saveAccount(account);
  const mod = account.cardMods?.[pull.player.id];
  return {
    kind: "player",
    player: applyCardMods(pull.player, mod, legacyRollSeed(account.id, pull.player.id)),
    outcome,
    stars: mod?.merges || 0,
    souls,
    goldGain,
    rarity: rarityLabel(ovr),
    ovr,
    banner,
    pityHit: pull.pityHit,
    wishHit: pull.wishHit,
    rollChoice,
    ...paid,
  };
}

/** Side-by-side preview of an unsettled 成色 choice (survives leaving the screen). */
export function pendingRollChoice(account, pool = PLAYERS) {
  const pending = account?.pendingRoll;
  if (!pending) return null;
  const base = pool.find((p) => p.id === pending.playerId);
  if (!base) return null;
  const mod = modOf(account, pending.playerId);
  const current = mod.roll || legacyRollSeed(account.id, pending.playerId);
  return compareRolls(applyCardMods(base, { ...mod, roll: null }), current, pending.seed);
}

/** Settle a pending 成色 choice from a same-card duplicate. */
export function resolvePendingRoll(account, keepNew) {
  const pending = account?.pendingRoll;
  if (!pending) return null;
  const mod = modOf(account, pending.playerId);
  if (keepNew) mod.roll = pending.seed;
  account.pendingRoll = null;
  saveAccount(account);
  return mod.roll;
}

/** Spend SOULS_PER_STAR 球魂 of that person for ★+1 on one of their owned cards. */
export function starUpWithSouls(account, playerId, { pool = PLAYERS } = {}) {
  if (!(account?.playerIds || []).includes(playerId)) throw new Error("未拥有该卡");
  const base = pool.find((p) => p.id === playerId);
  const gacha = gachaOf(account);
  const have = gacha.souls[base.bref] || 0;
  const mod = modOf(account, playerId);
  if ((mod.merges || 0) >= MAX_STARS) throw new Error(`已满 ★${MAX_STARS}`);
  if (have < SOULS_PER_STAR) throw new Error(`球魂不足（需要 ${SOULS_PER_STAR}）`);
  addSouls(account, base.bref, -SOULS_PER_STAR);
  mod.merges = (mod.merges || 0) + 1;
  saveAccount(account);
  return mod.merges;
}

export function setWishlist(account, bref) {
  account.gacha = { ...gachaOf(account), wishlist: bref || null };
  saveAccount(account);
}

/** Craft one specific season card of the wishlist person with gold. */
export function craftWishCard(account, playerId, { rng = Math.random, pool = PLAYERS } = {}) {
  const card = pool.find((p) => p.id === playerId);
  if (!card) throw new Error("卡牌不存在");
  if (card.bref !== gachaOf(account).wishlist) throw new Error("只能合成心愿单球员");
  if ((account.playerIds || []).includes(card.id)) throw new Error("已拥有这张卡——用球魂升星吧");
  if (cardRoom(account) <= 0) throw new Error(`卡库已满（${MAX_CARDS} 张）——先分解一些`);
  const cost = craftCost(overall(card));
  if ((account.gold || 0) < cost) throw new Error(`金币不足（需要 ¤${cost}）`);
  account.gold -= cost;
  addCopy(account, card, rng);
  saveAccount(account);
  return { player: clonePlayer(card), cost };
}
