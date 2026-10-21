/**
 * 卡库管理: 容量上限、分解(卖球员)、技能碎片、图鉴。
 *
 * Mature-market rules borrowed on purpose:
 *  - No player-to-player trading — the system is the only buyer (anti-RMT).
 *  - Disenchant-style recycling into a currency that buys *skills*, not cards,
 *    so dead copies feed progression instead of vanishing (Hearthstone dust).
 *  - A hard storage cap with a one-tap "clean the obvious junk" button
 *    (FIFA club storage / quick sell).
 *  - Recycled cards still count in the 图鉴 — you never lose collection progress.
 *  - High-成色 low-OVR cards are protected: the whole point is that a plain
 *    card can be a 妖人, so we warn before recycling a good roll.
 */
import { overall, PLAYERS } from "./players.js";
import { resolvePlayers, saveAccount, uniqueByPerson } from "./account.js";
import { bandOf } from "./gacha.js";
import {
  SKILL_PACKS,
  canRetainSkill,
  isLearnableSkill,
  skillPackShopPrice,
  skillRarity,
} from "./skills.js";

export const MAX_CARDS = 60;
/** The account stays "ready" only with a full 12-card bench (requireAccountReady). */
export const MIN_KEEP = 12;
export const MAX_BOUGHT_SKILLS = 2;

/** 全明星+ cards always warn; one-tap junk only takes redundant versions below this. */
const JUNK_REDUNDANT_BELOW = 85;
const JUNK_LOW_BELOW = 80;

/** [gold, 技能碎片] per band. */
const RECYCLE_BASE = {
  common: [15, 5],
  rotation: [30, 10],
  starter: [60, 20],
  allstar: [120, 50],
  superstar: [250, 110],
  legend: [500, 220],
  myth: [900, 400],
};
const GRADE_MULT = { S: 2, A: 1.4, B: 1, C: 1, D: 1 };
const STAR_BONUS = 0.25;

/** What a resolved card (applyCardMods output) is worth to the recycler. */
export function recycleValue(card, ovrOf = overall) {
  const [gold, frags] = RECYCLE_BASE[bandOf(ovrOf(card)).id];
  const mult = (GRADE_MULT[card.hiddenRoll?.grade] ?? 1) * (1 + STAR_BONUS * (card.mergeLevel || 0));
  return { gold: Math.round(gold * mult), fragments: Math.round(frags * mult) };
}

/** Ids of the cards that actually play (best copy per person, top 12). */
export function lineupIds(account, pool = PLAYERS) {
  return new Set(
    uniqueByPerson(resolvePlayers(account.playerIds, account, pool))
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, MIN_KEEP)
      .map((p) => p.id)
  );
}

/** Reasons to think twice. Hard blocks are enforced in recycleCards; these only warn. */
export function recycleWarnings(card, account, lineup = lineupIds(account)) {
  const warnings = [];
  if (overall(card) >= JUNK_REDUNDANT_BELOW) warnings.push("全明星以上");
  if (lineup.has(card.id)) warnings.push("主力阵容");
  if (card.hiddenRoll && ["S", "A"].includes(card.hiddenRoll.grade)) warnings.push(`成色 ${card.hiddenRoll.grade}`);
  if (card.mergeLevel > 0) warnings.push(`★${card.mergeLevel}`);
  return warnings;
}

/** Obvious junk: unstarred, B–D 成色, not lineup / 本命, and low OVR or a *low* redundant version. */
export function junkIds(account, { ovrOf = overall, pool = PLAYERS } = {}) {
  const cards = resolvePlayers(account.playerIds, account, pool);
  const lineup = lineupIds(account, pool);
  const bestOfPerson = new Map();
  for (const card of cards) {
    const best = bestOfPerson.get(card.bref);
    if (!best || ovrOf(card) > ovrOf(best)) bestOfPerson.set(card.bref, card);
  }
  return cards
    .filter((card) => {
      if (card.id === account.favoriteId || lineup.has(card.id) || card.mergeLevel > 0) return false;
      if (["S", "A"].includes(card.hiddenRoll?.grade)) return false;
      const redundant = bestOfPerson.get(card.bref)?.id !== card.id;
      return ovrOf(card) < JUNK_LOW_BELOW || (redundant && ovrOf(card) < JUNK_REDUNDANT_BELOW);
    })
    .map((card) => card.id);
}

export function cardRoom(account) {
  return Math.max(0, MAX_CARDS - (account?.playerIds || []).length);
}

/**
 * Recycle cards for gold + 技能碎片. Hard rules: not 本命, not an unsettled
 * 成色 choice, and the bench must stay ≥ MIN_KEEP. Warnings need `confirmed`.
 */
export function recycleCards(account, ids, { confirmed = false, pool = PLAYERS } = {}) {
  const wanted = [...new Set(ids)].filter((id) => account.playerIds.includes(id));
  if (!wanted.length) throw new Error("没有可分解的卡");
  if (wanted.includes(account.favoriteId)) throw new Error("本命卡不能分解——先换本命");
  if (account.pendingRoll && wanted.includes(account.pendingRoll.playerId)) throw new Error("这张卡还有成色没选，先去抽卡页选完");
  if (account.playerIds.length - wanted.length < MIN_KEEP) throw new Error(`至少保留 ${MIN_KEEP} 张卡`);

  const cards = resolvePlayers(wanted, account, pool);
  const lineup = lineupIds(account, pool);
  const flagged = cards.filter((card) => recycleWarnings(card, account, lineup).length);
  if (flagged.length && !confirmed) {
    const error = new Error("含主力 / 高成色 / 已升星的卡，需要确认");
    error.needsConfirm = flagged.map((card) => ({ id: card.id, name: card.name, why: recycleWarnings(card, account, lineup) }));
    throw error;
  }

  let gold = 0;
  let fragments = 0;
  for (const card of cards) {
    const value = recycleValue(card);
    gold += value.gold;
    fragments += value.fragments;
  }
  const gone = new Set(wanted);
  account.playerIds = account.playerIds.filter((id) => !gone.has(id));
  for (const id of gone) delete account.cardMods?.[id];
  account.gold = (account.gold || 0) + gold;
  account.fragments = (account.fragments || 0) + fragments;
  saveAccount(account);
  return { count: wanted.length, gold, fragments };
}

/** Skills a card can still buy: learnable, passes its gates, not owned. */
export function buyableSkills(card) {
  const have = new Set(card.skills || []);
  return Object.keys(SKILL_PACKS)
    .filter((id) => isLearnableSkill(id) && !have.has(id) && canRetainSkill(card, id))
    .map((id) => ({ id, name: SKILL_PACKS[id].name, cost: skillPackShopPrice(id), rarity: skillRarity(id) }))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "zh"));
}

export function boughtSkillCount(account, playerId) {
  return (account.cardMods?.[playerId]?.bought || []).length;
}

export function buySkillWithFragments(account, playerId, skillId, pool = PLAYERS) {
  if (!account.playerIds.includes(playerId)) throw new Error("未拥有该卡");
  const base = pool.find((p) => p.id === playerId);
  const [card] = resolvePlayers([playerId], account, pool);
  const option = buyableSkills(card).find((s) => s.id === skillId);
  if (!base || !option) throw new Error("这张卡学不了这个技能");
  if (boughtSkillCount(account, playerId) >= MAX_BOUGHT_SKILLS) throw new Error(`每张卡最多买 ${MAX_BOUGHT_SKILLS} 个技能`);
  if ((account.fragments || 0) < option.cost) throw new Error(`技能碎片不足（需要 ${option.cost}）`);
  account.fragments -= option.cost;
  const mod = account.cardMods[playerId] || { merges: 0, skills: [] };
  account.cardMods[playerId] = {
    ...mod,
    skills: [...(mod.skills || []), skillId],
    bought: [...(mod.bought || []), skillId],
  };
  saveAccount(account);
  return option;
}

/** 图鉴: persons ever owned (recycling never removes them) vs the whole pool. */
export function codexProgress(account, pool = PLAYERS) {
  const brefById = new Map(pool.map((p) => [p.id, p.bref]));
  const ever = new Set([...(account.codex || []), ...(account.playerIds || [])]);
  const owned = new Set();
  for (const id of ever) if (brefById.has(id)) owned.add(brefById.get(id));
  const total = new Set(pool.map((p) => p.bref)).size;
  const stars = new Set(pool.filter((p) => owned.has(p.bref) && ever.has(p.id) && overall(p) >= 90).map((p) => p.bref));
  return { people: owned.size, total, cards: ever.size, superstars: stars.size };
}
