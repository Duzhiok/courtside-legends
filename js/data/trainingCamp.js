/**
 * Training Camp — offline My Team progression (D1/D2/D3 rulings, 2026-11-24).
 *
 * A timestamp state machine, no background worker:
 *   ACTIVE --(now >= completesAt)--> READY --claim--> CLAIMED (session removed, log entry)
 *     \--cancel (refund by progress, D2)--> gone
 * READY is derived from the clock, never stored. Completed rewards never expire.
 *
 * Integrity: one session per card; gold is checked and spent in the same save
 * as the session; the reward is rolled from a seed fixed at start, so a
 * refresh cannot reroll it; claim/cancel delete the session, so neither can
 * run twice. Growth lands in account.cardMods[id].training, which
 * applyCardMods layers on top of the untouched catalog card.
 *
 * Local clock only: fine for My Team, never trusted for competitive play.
 * `now`, `pool` and `save` are injectable for tests.
 */
import { PLAYERS, overall } from "./players.js";
import { playerLegacyBadge } from "./playerLegacy.js";
import { resolvePlayers, saveAccount } from "./account.js";
import { SKILL_PACKS } from "./skills.js";
import { learnableInFamily } from "./epiphany.js";
import { hashSeed, seededStream } from "../core/seededRandom.js";
import {
  ATTR_CEILING, CAMPS, DURATIONS, INITIAL_SLOTS, SKILL_GATE_MIN, TIER_BUDGETS,
  refundShare, tierFromBadge, xpRequired,
} from "./trainingRules.js";

const LOG_KEEP = 12;

/** Bilingual error, same throw-on-refusal style as accountGacha. */
function refuse(zh, en) {
  const error = new Error(zh);
  error.en = en;
  return error;
}

/** Normalised training state (does not mutate). */
export function trainingState(account) {
  const t = account?.training || {};
  return { sessions: Array.isArray(t.sessions) ? t.sessions : [], log: Array.isArray(t.log) ? t.log : [], seq: t.seq || 0 };
}

export function slotCount() {
  return INITIAL_SLOTS;
}

export function sessionProgress(session, now = Date.now()) {
  const span = session.completesAt - session.startedAt;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (now - session.startedAt) / span));
}

export function sessionStatus(session, now = Date.now()) {
  return now >= session.completesAt ? "ready" : "active";
}

function catalogCard(playerId, pool) {
  return pool.find((p) => p.id === playerId) || null;
}

/** Tier from the untouched catalog card, so training never shifts a card into another tier. */
export function trainingTier(baseCard) {
  return tierFromBadge(playerLegacyBadge(baseCard, overall(baseCard)).cls);
}

function trainingOf(account, playerId) {
  const t = account?.cardMods?.[playerId]?.training || {};
  return { attrs: { ...(t.attrs || {}) }, xp: { ...(t.xp || {}) }, skills: [...(t.skills || [])] };
}

/** Everything the UI needs about one card's training room. */
export function trainingInfo(account, playerId, pool = PLAYERS) {
  const base = catalogCard(playerId, pool);
  if (!base) return null;
  const tier = trainingTier(base);
  const budget = TIER_BUDGETS[tier];
  const t = trainingOf(account, playerId);
  const used = Object.values(t.attrs).reduce((sum, n) => sum + (n || 0), 0);
  const attrs = {};
  for (const camp of Object.values(CAMPS)) {
    for (const key of camp.attrs) {
      const bonus = t.attrs[key] || 0;
      const value = Math.round(Number(base[key]) || 0) + bonus;
      const capped = bonus >= budget.perAttr || used >= budget.total || value >= ATTR_CEILING;
      attrs[key] = { base: Math.round(Number(base[key]) || 0), bonus, value, xp: t.xp[key] || 0, need: xpRequired(value), capped };
    }
  }
  return { tier, budget, used, attrs, skills: t.skills };
}

/** Default attribute for a camp: the card's strongest trainable one (training your weakest by default is a trap). */
export function bestAttr(account, playerId, campId, pool = PLAYERS) {
  const camp = CAMPS[campId];
  const info = trainingInfo(account, playerId, pool);
  if (!info) return camp.attrs[0];
  const open = camp.attrs.filter((key) => !info.attrs[key].capped);
  return (open.length ? open : camp.attrs).reduce((a, b) => (info.attrs[b].value > info.attrs[a].value ? b : a));
}

/** Points a session of `earned` XP would add right now (banked XP included). Pure preview for the UI. */
export function previewGain(account, playerId, attr, earned, pool = PLAYERS) {
  const info = trainingInfo(account, playerId, pool);
  if (!info) return 0;
  const a = info.attrs[attr];
  return applyXp({ base: a.base, bonus: a.bonus, xp: a.xp, earned, perAttr: info.budget.perAttr, totalLeft: Math.max(0, info.budget.total - info.used) }).gained;
}

/** Why a session can't start, or null. */
export function startBlocker(account, { playerId, campId, attr, durationId }, { pool = PLAYERS } = {}) {
  const camp = CAMPS[campId];
  const duration = DURATIONS[durationId];
  if (!camp || !duration || !camp.attrs.includes(attr)) return refuse("训练项目无效", "Invalid training choice");
  if (!(account?.playerIds || []).includes(playerId)) return refuse("只能训练你永久拥有的球员卡", "Only cards you own can train");
  const state = trainingState(account);
  if (state.sessions.some((s) => s.playerId === playerId)) return refuse("这名球员已经在训练中", "This player is already training");
  if (state.sessions.length >= slotCount()) return refuse("训练位已满", "All training slots are busy");
  const info = trainingInfo(account, playerId, pool);
  if (!info) return refuse("卡牌不存在", "Card not found");
  if (info.attrs[attr].capped) return refuse("这项属性已经练到上限", "This attribute has reached its training limit");
  if ((account.gold || 0) < duration.cost) return refuse(`金币不足（需要 ¤${duration.cost}）`, `Not enough gold (need ¤${duration.cost})`);
  return null;
}

export function startTraining(account, choice, { now = Date.now(), pool = PLAYERS, save = saveAccount } = {}) {
  const blocker = startBlocker(account, choice, { pool });
  if (blocker) throw blocker;
  const { playerId, campId, attr, durationId } = choice;
  const duration = DURATIONS[durationId];
  const state = trainingState(account);
  const seq = state.seq + 1;
  const session = {
    id: `tr-${seq}-${playerId}`,
    playerId, campId, attr, durationId,
    startedAt: now,
    completesAt: now + duration.ms,
    cost: duration.cost,
    xp: duration.xp,
    skillChance: duration.skillChance,
    seed: hashSeed(`${account.id}:${playerId}:${campId}:${attr}:${durationId}:${now}:${seq}`),
  };
  account.gold -= duration.cost;
  account.training = { ...state, seq, sessions: [...state.sessions, session] };
  save(account);
  return session;
}

function takeSession(account, sessionId) {
  const state = trainingState(account);
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) throw refuse("训练记录不存在（可能已领取或已取消）", "Training not found (already claimed or cancelled)");
  return { state, session };
}

/** D2: refund by progress; no XP, no skill, no peek at the reward. */
export function cancelTraining(account, sessionId, { now = Date.now(), save = saveAccount } = {}) {
  const { state, session } = takeSession(account, sessionId);
  if (sessionStatus(session, now) === "ready") throw refuse("训练已完成，只能领取", "Training is complete — claim it instead");
  const refund = Math.floor(session.cost * refundShare(sessionProgress(session, now)));
  account.gold = (account.gold || 0) + refund;
  account.training = { ...state, sessions: state.sessions.filter((s) => s.id !== sessionId) };
  save(account);
  return { refund };
}

/** Pure: apply earned XP under the per-attribute, total and ceiling caps. */
export function applyXp({ base, bonus, xp, earned, perAttr, totalLeft }) {
  let b = bonus;
  let x = xp + earned;
  let gained = 0;
  while (b < perAttr && gained < totalLeft && base + b < ATTR_CEILING && x >= xpRequired(base + b)) {
    x -= xpRequired(base + b);
    b += 1;
    gained += 1;
  }
  return { bonus: b, xp: x, gained };
}

function rollBreakthrough(session, card, t, budget) {
  const rng = seededStream(session.seed);
  if (!(rng() < session.skillChance) || t.skills.length >= budget.skills) return null;
  const camp = CAMPS[session.campId];
  if ((Number(card?.[camp.gateAttr]) || 0) < SKILL_GATE_MIN) return null;
  const owned = new Set(card?.skills || []);
  const options = camp.families.flatMap((family) => learnableInFamily(family, card, owned));
  if (!options.length) return null;
  return options[Math.floor(rng() * options.length)];
}

/**
 * Put `earned` XP into one attribute of one card, under that card's tier budget (per-attribute, total, ceiling).
 * The single door for every XP source (training claims, hosted league): nothing adds attributes any other way.
 * Mutates account.cardMods[id].training's working copy `t` in place; the caller stores/saves.
 */
export function bankXp(account, playerId, attr, earned, pool = PLAYERS) {
  const base = catalogCard(playerId, pool);
  const budget = TIER_BUDGETS[base ? trainingTier(base) : "common"];
  const t = trainingOf(account, playerId);
  const used = Object.values(t.attrs).reduce((sum, n) => sum + (n || 0), 0);
  const step = applyXp({
    base: Math.round(Number(base?.[attr]) || 0),
    bonus: t.attrs[attr] || 0,
    xp: t.xp[attr] || 0,
    earned,
    perAttr: budget.perAttr,
    totalLeft: Math.max(0, budget.total - used),
  });
  t.attrs[attr] = step.bonus;
  t.xp[attr] = step.xp;
  return { step, budget, t };
}

export function claimTraining(account, sessionId, { now = Date.now(), pool = PLAYERS, save = saveAccount } = {}) {
  const { state, session } = takeSession(account, sessionId);
  if (sessionStatus(session, now) !== "ready") throw refuse("训练还没完成", "Training is not finished yet");
  const { step, budget, t } = bankXp(account, session.playerId, session.attr, session.xp, pool);

  const [card] = (account.playerIds || []).includes(session.playerId) ? resolvePlayers([session.playerId], account, pool) : [];
  const skillId = card ? rollBreakthrough(session, card, t, budget) : null;
  const mods = account.cardMods || (account.cardMods = {});
  const mod = { merges: 0, skills: [], ...mods[session.playerId] };
  if (skillId) {
    t.skills.push(skillId);
    mod.skills = [...(mod.skills || []), skillId];
  }
  mods[session.playerId] = { ...mod, training: t };

  const result = {
    sessionId, playerId: session.playerId, campId: session.campId, attr: session.attr,
    xp: session.xp, gained: step.gained, bonus: step.bonus,
    skillId, skillName: skillId ? SKILL_PACKS[skillId]?.name || skillId : null,
    claimedAt: now,
  };
  account.training = {
    ...state,
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    log: [result, ...state.log].slice(0, LOG_KEEP),
  };
  save(account);
  return result;
}

/** A card in training can't be recycled (its session would be orphaned). */
export function isInTraining(account, playerId) {
  return trainingState(account).sessions.some((s) => s.playerId === playerId);
}
