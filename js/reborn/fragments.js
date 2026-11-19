/**
 * Career 2.0 decision 4 — Player Reborn career fragments (碎片).
 *
 * A Reborn-only resource, earned from real game evidence and spent on bounded growth:
 *
 *   reborn.player.fragments = { balance, intensiveWeek, specialWeek, specialSkill, history: [{ gameId, earned, reasons }] }
 *
 * Economy rules (the reason this is NOT `account.fragments`):
 * - account fragments come from recycling cards, and cards come from packs that account gold buys. Letting them
 *   reach a Reborn player would let gold buy competitive power. This ledger lives on the Reborn save, is only
 *   ever credited by `earnFromGame`, and nothing converts between the two.
 * - earning needs evidence from a real game (a standout line against the role's own expectation, a rivalry
 *   meeting won); each game pays at most MAX_PER_GAME and pays once (keyed by its gameId).
 * - spending, three things (no skill purchase, no OVR or shooting bonus, no new growth channel):
 *   - intensive training: this week's training XP x INTENSIVE_XP_MULTIPLIER through the existing awardGrowth
 *     (ceilings still apply), once per week, only on top of a focus already chosen;
 *   - specialisation: for one week, the training levels go into the attributes of a skill the player ALREADY
 *     has (its awakening family, SPECIALTY_ATTRIBUTES) instead of the focus's. It only steers where the growth
 *     lands: the season's level cap and every attribute ceiling are unchanged, so it can't add power;
 *   - the legacy jersey: the player's own season jersey for the collection (cosmetic, a story jersey that the
 *     gold shop never sells), one per season, once his identity is known (the name is printed on it).
 * - the per-week fields are cleared at season rollover (seasonResetFragments), the balance carries over.
 *
 * Numbers are provisional (balance them with fixed-seed seasons, as the epiphany ones). Pure functions: inputs
 * are never mutated.
 */
import { expectedGameScore } from "./trust.js";
import { identityCard } from "./identity.js";
import { EPIPHANY_RULES } from "../data/epiphany.js";
import { SKILL_PACKS } from "../data/skills.js";
import { legacyTemplate } from "../collectibles/jerseyCatalog.js";
import { jerseyState } from "../collectibles/jerseyExchange.js";

export const STANDOUT_MARGIN = 3; // Game Score above what the role is expected to produce
const MAX_PER_GAME = 2;
export const INTENSIVE_COST = 3;
export const INTENSIVE_XP_MULTIPLIER = 1.5;
export const SPECIALIZE_COST = 2;  // cheaper than intensive: it steers growth, it doesn't add any
export const LEGACY_COST = 10;
const HISTORY = 12; // recent paid games kept: idempotency window + what the card shows

/** The attributes a specialisation trains, per awakening family (js/data/epiphany.js EPIPHANY_RULES). */
export const SPECIALTY_ATTRIBUTES = Object.freeze({
  playmaker: Object.freeze(["pass", "iq"]),
  shooter: Object.freeze(["three"]),
  scorer: Object.freeze(["mid", "scoring"]),
  finisher: Object.freeze(["paint", "strength"]),
  rebounder: Object.freeze(["rebound", "strength"]),
  rim: Object.freeze(["block", "defense"]),
  thief: Object.freeze(["steal", "defense"]),
});

const WEEKLY = Object.freeze({ intensiveWeek: null, specialWeek: null, specialSkill: null });
const EMPTY = Object.freeze({ balance: 0, ...WEEKLY, history: [] });
const intOrNull = (v) => (Number.isInteger(v) ? v : null);

/** The ledger of a Reborn save (an old save without one, or without the newer fields, reads as empty). */
export function fragmentLedger(reborn) {
  const f = reborn?.player?.fragments;
  return {
    balance: Number.isInteger(f?.balance) && f.balance > 0 ? f.balance : 0,
    intensiveWeek: intOrNull(f?.intensiveWeek),
    specialWeek: intOrNull(f?.specialWeek),
    specialSkill: typeof f?.specialSkill === "string" ? f.specialSkill : null,
    history: Array.isArray(f?.history) ? f.history : [],
  };
}

/**
 * The ledger a new season starts with: balance and history carry over, the per-week purchases don't (week numbers
 * restart, so a week-5 purchase from last season would otherwise count as bought for this season's week 5).
 */
export function seasonResetFragments(reborn) {
  return { ...fragmentLedger(reborn), ...WEEKLY };
}

/** Why this game pays, from its evidence only. */
function fragmentReasons({ min = 0, gameScore = 0, role = "bench", rivalryWon = false } = {}) {
  const reasons = [];
  if (min > 0 && gameScore >= expectedGameScore(role) + STANDOUT_MARGIN) reasons.push("standout");
  if (rivalryWon) reasons.push("rivalry-win");
  return reasons.slice(0, MAX_PER_GAME);
}

/**
 * Credit one finished game. Idempotent: a gameId already in the history pays nothing.
 * @returns { ledger, earned, reasons }
 */
export function earnFromGame(ledger = EMPTY, { gameId, ...evidence } = {}) {
  if (!gameId || ledger.history.some((h) => h.gameId === gameId)) return { ledger, earned: 0, reasons: [] };
  const reasons = fragmentReasons(evidence);
  if (!reasons.length) return { ledger, earned: 0, reasons };
  const history = [...ledger.history, { gameId, earned: reasons.length, reasons }].slice(-HISTORY);
  return { ledger: { ...ledger, balance: ledger.balance + reasons.length, history }, earned: reasons.length, reasons };
}

/** Why intensive training can't be bought this week (null when it can). */
export function intensiveBlocker(reborn, week) {
  const ledger = fragmentLedger(reborn);
  if (reborn?.player?.training?.week !== week) return "no-focus";
  if (ledger.intensiveWeek === week) return "already";
  if (ledger.balance < INTENSIVE_COST) return "short";
  return null;
}

/** Spend INTENSIVE_COST on this week's training. Returns a new reborn state; throws when blocked. */
export function buyIntensive(reborn, week) {
  const blocker = intensiveBlocker(reborn, week);
  if (blocker) throw new Error(`intensive training unavailable: ${blocker}`);
  const ledger = fragmentLedger(reborn);
  const next = structuredClone(reborn);
  next.player.fragments = { ...ledger, balance: ledger.balance - INTENSIVE_COST, intensiveWeek: week };
  return next;
}

/** The XP multiplier a game of `week` trains with (1 unless intensive training was bought for that week). */
export function intensiveMultiplier(reborn, week) {
  const ledger = fragmentLedger(reborn);
  return ledger.intensiveWeek === week && reborn?.player?.training?.week === week ? INTENSIVE_XP_MULTIPLIER : 1;
}

// ---- specialisation ----------------------------------------------------------------------------------------------
const familyOf = (skillId) => EPIPHANY_RULES.find((rule) => rule.skills.includes(skillId))?.id || null;

/** The skills this card can specialise: the ones it HAS that belong to an awakening family. [{ skillId, family, attributes }] */
export function specializableSkills(card) {
  return [...new Set(card?.skills || [])]
    .filter((skillId) => SKILL_PACKS[skillId] && familyOf(skillId))
    .map((skillId) => ({ skillId, family: familyOf(skillId), attributes: [...SPECIALTY_ATTRIBUTES[familyOf(skillId)]] }));
}

/** Why `skillId` can't be specialised this week (null when it can). `card` is the player's current card (his skills). */
export function specializeBlocker(reborn, week, card, skillId) {
  const ledger = fragmentLedger(reborn);
  if (reborn?.player?.training?.week !== week) return "no-focus";
  if (ledger.specialWeek === week) return "already";
  if (!specializableSkills(card).some((s) => s.skillId === skillId)) return "not-owned";
  if (ledger.balance < SPECIALIZE_COST) return "short";
  return null;
}

/** Spend SPECIALIZE_COST: this week's training levels go into `skillId`'s attributes. Returns a new reborn state; throws when blocked. */
export function buySpecialization(reborn, week, card, skillId) {
  const blocker = specializeBlocker(reborn, week, card, skillId);
  if (blocker) throw new Error(`specialisation unavailable: ${blocker}`);
  const ledger = fragmentLedger(reborn);
  const next = structuredClone(reborn);
  next.player.fragments = { ...ledger, balance: ledger.balance - SPECIALIZE_COST, specialWeek: week, specialSkill: skillId };
  return next;
}

/**
 * The skill a game played in `week` specialises, or null. Bought for that week AND that week's focus chosen: a focus
 * stays on until it is picked again, a specialisation is one week only (same rule as intensiveMultiplier).
 */
export function activeSpecialty(reborn, week) {
  const ledger = fragmentLedger(reborn);
  if (!Number.isInteger(week) || ledger.specialWeek !== week || reborn?.player?.training?.week !== week) return null;
  return familyOf(ledger.specialSkill) ? ledger.specialSkill : null;
}

/** The attributes a game of `week` levels when a specialisation is on, else null (training.js trainingPlan reads it). */
export function specialtyAttributes(reborn, week) {
  const skillId = activeSpecialty(reborn, week);
  return skillId ? [...SPECIALTY_ATTRIBUTES[familyOf(skillId)]] : null;
}

// ---- the legacy jersey ------------------------------------------------------------------------------------------
const legacyId = (reborn, year) => `legacy:${reborn?.identity?.bref}:${year}`;

/** Why the season's legacy jersey can't be redeemed (null when it can). `year` is the current season's year. */
export function legacyBlocker(reborn, year) {
  if (!Number.isInteger(year) || !reborn?.identity?.bref) return "no-season";
  if (!identityCard(reborn.identity)?.revealed) return "unrevealed";
  if (jerseyState(reborn).collection.some((j) => j.id === legacyId(reborn, year))) return "already";
  if (fragmentLedger(reborn).balance < LEGACY_COST) return "short";
  return null;
}

/**
 * Spend LEGACY_COST on this season's own jersey: a story jersey in the run's collection (the account gets its copy
 * through the usual mirrorJerseysToAccount). Returns { reborn, jersey }; throws when blocked.
 */
export function buyLegacyJersey(reborn, year, { week = null } = {}) {
  const blocker = legacyBlocker(reborn, year);
  if (blocker) throw new Error(`legacy jersey unavailable: ${blocker}`);
  const ledger = fragmentLedger(reborn);
  const shown = identityCard(reborn.identity);
  const team = reborn.player?.teamId || reborn.identity.team || null;
  const template = legacyTemplate({ bref: reborn.identity.bref, name: shown.name, nameEn: shown.nameEn, team, year });
  const jersey = {
    id: legacyId(reborn, year), templateId: template.id, template, source: "legacy",
    acquiredAt: { year, week }, signed: false, equipped: false, displayed: false,
    provenance: { year, team, playerName: shown.name, playerNameEn: shown.nameEn, cost: LEGACY_COST },
  };
  const next = structuredClone(reborn);
  const jerseys = jerseyState(next);
  next.jerseys = { ...jerseys, collection: [...jerseys.collection, jersey] };
  next.player.fragments = { ...ledger, balance: ledger.balance - LEGACY_COST };
  return { reborn: next, jersey };
}
