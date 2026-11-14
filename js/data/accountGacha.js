/**
 * Account-side gacha flow: the daily draw, duplicate handling by real
 * person, 成色 choice, souls, wishlist and crafting. Rules live in gacha.js;
 * this module only applies them to a stored account. The daily draw is
 * claimed through dailyTasks.js (one regular card a day, earned by tasks
 * or a banked ticket); this module only performs the pull itself.
 *
 * Duplicate rules:
 *  - Same season card  → ★+1 (all attrs +1, max ★5) and a 成色 choice:
 *                        keep the old roll or take the new one (whole set).
 *  - Same person, other season → new version joins the binder + 1 球魂.
 *  - Same card at ★5   → 2 球魂.
 *  - Spending 球魂 to take a card to ★5 → one skill, once (see giftStarSkill).
 *    Reaching ★5 by drawing duplicates does NOT gift one.
 *
 * Skills reach a card ONLY through: 领悟 (epiphany) and that ★5 gift.
 * Season awards no longer hand out skills — they made the strong stronger.
 * (The 技能碎片 shop and the gold skill packs were cancelled with the
 * skill-book system — S0. The ★5 gift is the one remaining non-epiphany
 * route; whether it stays is an open product question for the user.)
 */
import { COACHES, coachDrawWeight, isLegendCoach } from "./coaches.js";
import { clonePlayer, overall, PLAYERS } from "./players.js";
import { playerLegacyBadge } from "./playerLegacy.js";
import {
  applyCardMods,
  resolvePlayers,
  saveAccount,
  weightedPick,
} from "./account.js";
import { compareRolls, legacyRollSeed, newRollSeed } from "./cardRoll.js";
import { MAX_CARDS, learnableSkills, cardRoom } from "./accountRecycle.js";
import {
  MAX_STARS,
  SOULS_PER_STAR,
  craftCost,
  currentBanners,
  freshGachaState,
  goldForPull,
  pullCard,
  registerNonPlayerPull,
} from "./gacha.js";

const COACH_SHARE = 0.2;
/** The ★5 gift never rolls the top tiers: 传说 / 神话 stay out of the gift pool. */
export const STAR_SKILL_RARITIES = new Set(["common", "rare", "epic"]);
export const SOULS_AT_MAX_STAR = 2;
const HISTORY_KEEP = 50;

function gachaOf(account) {
  return { ...freshGachaState(), ...(account.gacha || {}) };
}

function modOf(account, playerId) {
  account.cardMods = account.cardMods || {};
  account.cardMods[playerId] = account.cardMods[playerId] || { merges: 0, skills: [] };
  return account.cardMods[playerId];
}

/**
 * Taking a card to ★5 with 球魂 gifts one skill, once per card: a random
 * skill this card could learn (height / age / roster gates apply), below the top tiers.
 * It is stored in mod.skills + mod.starSkill.
 */
function giftStarSkill(account, playerId, rng, pool) {
  const mod = modOf(account, playerId);
  if (mod.starSkill) return null;
  const [card] = resolvePlayers([playerId], account, pool);
  const options = learnableSkills(card).filter((skill) => STAR_SKILL_RARITIES.has(skill.rarity));
  if (!options.length) return null;
  const pick = options[Math.floor(rng() * options.length)];
  mod.skills = [...(mod.skills || []), pick.id];
  mod.starSkill = pick.id;
  return { id: pick.id, name: pick.name, rarity: pick.rarity };
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
  return { kind: "coach", coach: structuredClone(coach), duplicate, goldGain, rarity, paidGold: paid.paidGold || 0, usedTicket: !!paid.usedTicket, ...paid };
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
 * One card pull with no payment attached: the caller (the daily-draw claim
 * in dailyTasks.js) decides how the pull is earned — 2-of-3 daily tasks, or
 * one banked ticket. ~20% of draws are coach cards (no pity shield anymore
 * — pity is gone); that share stays, because this is the only source of
 * non-starter coach cards. `paid` ({ usedTicket, paidGold }) is only echoed
 * into the reveal payload so the UI can say what the pull cost.
 * Options: bannerId — one of currentBanners(date) ids (default 全历史常驻池);
 * rng / pool / date — injectable for tests.
 */
export function drawOneCard(account, { bannerId = "standard", rng = Math.random, pool = PLAYERS, date = new Date(), paid = {} } = {}) {
  if (!account) throw new Error("无账号");
  if (cardRoom(account) <= 0) throw new Error("卡库已满：请先去分解卡牌腾出空间。");
  const state = gachaOf(account);
  if (rng() < COACH_SHARE) {
    account.gacha = registerNonPlayerPull(state);
    return drawCoach(account, paid);
  }

  const banner = currentBanners(date).find((b) => b.id === bannerId) || currentBanners(date)[0];
  const pull = pullCard({ pool, gacha: gachaOf(account), banner, rng, ovrOf: overall });
  account.gacha = pull.gacha;
  const ovr = overall(pull.player);
  const { outcome, souls, rollChoice } = applyPlayerPull(account, pull.player, rng, pool);
  const goldGain = goldForPull(ovr);
  account.gold = (account.gold || 0) + goldGain;

  pushHistory(account, { kind: "player", id: pull.player.id, at: Date.now(), outcome, banner: banner.id, wish: pull.wishHit });
  saveAccount(account);
  const mod = account.cardMods?.[pull.player.id];
  const badge = playerLegacyBadge(pull.player, ovr);
  return {
    kind: "player",
    player: applyCardMods(pull.player, mod, legacyRollSeed(account.id, pull.player.id)),
    outcome,
    stars: mod?.merges || 0,
    souls,
    goldGain,
    rarity: badge.label,
    rarityCls: badge.cls,
    cardStyle: badge.cardStyle,
    ovr,
    banner,
    wishHit: pull.wishHit,
    poolBand: pull.relative ? pull.band.label : null,
    rollChoice,
    paidGold: paid.paidGold || 0,
    usedTicket: !!paid.usedTicket,
    ...paid,
  };
}

const STARTER_POSITIONS = ["PG", "SG", "SF", "PF", "C"];

/**
 * Free card-pack draws (Account Level rewards): `count` player cards from the
 * standard pool at the normal rate table — no payment, no coach share (a pack
 * holds player cards). Reuses pullCard / applyPlayerPull / goldForPull, so a
 * pack draw follows the same duplicate / soul / 成色 rules as a normal pull.
 * Throws when the binder is full; callers that mark rewards claimed must
 * call this first so a failed pack never consumes the claim.
 */
export function grantPackDraws(account, count, { rng = Math.random, pool = PLAYERS, date = new Date() } = {}) {
  if (!account) throw new Error("无账号");
  const cards = [];
  const banner = currentBanners(date)[0];
  for (let i = 0; i < count; i += 1) {
    if (cardRoom(account) <= 0) throw new Error(`卡库已满（${MAX_CARDS} 张）——先去「我的球员卡」分解一些`);
    const pull = pullCard({ pool, gacha: gachaOf(account), banner, rng, ovrOf: overall });
    account.gacha = pull.gacha;
    const ovr = overall(pull.player);
    const { outcome, souls } = applyPlayerPull(account, pull.player, rng, pool);
    const goldGain = goldForPull(ovr);
    account.gold = (account.gold || 0) + goldGain;
    pushHistory(account, { kind: "player", id: pull.player.id, at: Date.now(), outcome, banner: banner.id, wish: pull.wishHit, source: "pack" });
    const mod = account.cardMods?.[pull.player.id];
    cards.push({
      player: applyCardMods(pull.player, mod, legacyRollSeed(account.id, pull.player.id)),
      outcome,
      stars: mod?.merges || 0,
      souls,
      goldGain,
      ovr,
    });
  }
  saveAccount(account);
  return cards;
}

/**
 * Opening draws: 5 cards, one per position (PG → C), pure random at the
 * rate table — no pity anywhere (removed 2026-11-07). Carries the gacha
 * state through the 5 pulls and returns it for the caller to save; writes
 * nothing to any account here. No gold, no draw history: these are free
 * onboarding draws, not draw-screen pulls.
 */
export function drawStarterFive({ rng = Math.random, pool = PLAYERS } = {}) {
  let gacha = freshGachaState();
  const players = [];
  for (const pos of STARTER_POSITIONS) {
    const positionPool = pool.filter((p) => (p.playPos || p.pos) === pos);
    const pull = pullCard({ pool: positionPool, gacha, rng, ovrOf: overall });
    gacha = pull.gacha;
    players.push(clonePlayer(pull.player));
  }
  return { players, gacha };
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
export function starUpWithSouls(account, playerId, { pool = PLAYERS, rng = Math.random } = {}) {
  if (!(account?.playerIds || []).includes(playerId)) throw new Error("未拥有该卡");
  const base = pool.find((p) => p.id === playerId);
  const gacha = gachaOf(account);
  const have = gacha.souls[base.bref] || 0;
  const mod = modOf(account, playerId);
  if ((mod.merges || 0) >= MAX_STARS) throw new Error(`已满 ★${MAX_STARS}`);
  if (have < SOULS_PER_STAR) throw new Error(`球魂不足（需要 ${SOULS_PER_STAR}）`);
  addSouls(account, base.bref, -SOULS_PER_STAR);
  mod.merges = (mod.merges || 0) + 1;
  const skill = mod.merges >= MAX_STARS ? giftStarSkill(account, playerId, rng, pool) : null;
  saveAccount(account);
  return { stars: mod.merges, skill };
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
