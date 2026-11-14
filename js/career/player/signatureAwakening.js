/**
 * Player Signature Awakening (Career 2.0, workstream D).
 *
 * The replacement for skill-book / epiphany acquisition in Player careers
 * (user principle 2026-11-10: skills come from talent, real game performance,
 * training and key events — never from drawing a book or buying a boost).
 *
 * A new skill is awarded only when the player shows the *action itself*,
 * repeatedly, in real games — plus one representative key performance:
 *
 *   - rim protection  <- blocks (a block IS the action)
 *   - rebounding      <- rebounds (a rebound IS the action)
 *   - playmaking      <- assists with a low-turnover quality gate
 *   - clutch          <- real takeover makes in the clutch window
 *
 * What is deliberately NOT evidence: points, field goals, or any unrelated
 * total. A 40-point game awakens nothing by itself — in particular it never
 * awakens stepback, because the engine records no stepback action at all
 * (see MISSING_EVIDENCE). No dice anywhere: the same evidence in always
 * produces the same awakening out. Each rule names exactly one skill, so
 * there is never a random pick from a family.
 *
 * Pure module: no DOM, no Math.random, no sim imports. The caller (the
 * Reborn view) feeds one playGame report per game and persists the returned
 * state on `reborn.player.awakening` (additive, optional).
 */
import {
  isLearnableSkill,
  canRetainSkill,
  skillSlotsFull,
} from "../../data/skills.js";

export const AWAKENING_VERSION = 1;
/** A game only counts as evidence if the player actually played. Bench is ~10 min; garbage time is not. */
export const MIN_EVIDENCE_MINUTES = 8;
/** The rolling window: the last N played games of the season. */
export const FORM_KEEP = 5;
/** Qualifying games needed inside the window. */
export const QUALIFYING_NEEDED = 3;
/** At most this many skills awaken per player per season — special, not a faucet. */
export const MAX_AWAKENED_PER_SEASON = 2;

const per36 = (stat, min) => (min > 0 ? (stat / min) * 36 : 0);

/**
 * One rule per shippable skill, in fixed firing order (also the tie-break
 * when several complete on the same game). `window` is "last5" (rolling) or
 * "season" (cumulative — clutch chances are too rare for a 5-game window).
 */
export const AWAKENING_RULES = [
  {
    id: "rim",
    skillId: "rim_protector",
    name: "护框神",
    nameEn: "Rim Protector",
    window: "last5",
    unlocks: "解锁高级护框策略：禁区盖帽与干扰更稳定",
    unlocksEn: "Unlocks advanced rim protection: steadier blocks and contests at the rim",
    evidenceLabel: "单场盖帽按 36 分钟 ≥ 2.0（出场 ≥ 8 分钟），最近 5 场中 3 场达标 + 一场 4+ 盖帽",
    evidenceLabelEn: "≥ 2.0 blocks per 36 min (≥ 8 min played), 3 of the last 5 games + one 4-block game",
    abilityMet: (card) => canRetainSkill(card, "rim_protector"),
    abilityLabel: (card) => `盖帽 ${card?.block ?? "?"} / 68`,
    abilityLabelEn: (card) => `Block ${card?.block ?? "?"} / 68`,
    qualifies: (ev) => per36(ev.blk, ev.min) >= 2.0,
    keyGame: (ev) => ev.blk >= 4,
  },
  {
    id: "glass",
    skillId: "glass_cleaner",
    name: "篮板怪兽",
    nameEn: "Glass Cleaner",
    window: "last5",
    unlocks: "解锁更积极的篮板争夺：篮板卡位与二次进攻更稳定",
    unlocksEn: "Unlocks aggressive rebounding: steadier box-outs and second efforts",
    evidenceLabel: "单场篮板按 36 分钟 ≥ 10（出场 ≥ 8 分钟），最近 5 场中 3 场达标 + 一场 14+ 篮板",
    evidenceLabelEn: "≥ 10 rebounds per 36 min (≥ 8 min played), 3 of the last 5 games + one 14-rebound game",
    abilityMet: (card) => (card?.rebound ?? 0) >= 60,
    abilityLabel: (card) => `篮板 ${card?.rebound ?? "?"} / 60`,
    abilityLabelEn: (card) => `Rebound ${card?.rebound ?? "?"} / 60`,
    qualifies: (ev) => per36(ev.reb, ev.min) >= 10,
    keyGame: (ev) => ev.reb >= 14,
  },
  {
    id: "dime",
    skillId: "dime_dropper",
    name: "组织大师",
    nameEn: "Dime Dropper",
    window: "last5",
    unlocks: "解锁高级组织选择：助攻串联与空位创造更稳定",
    unlocksEn: "Unlocks advanced playmaking: steadier dimes and open looks created",
    evidenceLabel: "单场助攻按 36 分钟 ≥ 6 且失误 ≤ 助攻一半（出场 ≥ 8 分钟），最近 5 场中 3 场达标 + 一场 10+ 助攻且失误 ≤ 2",
    evidenceLabelEn: "≥ 6 assists per 36 min with turnovers ≤ half the assists (≥ 8 min played), 3 of the last 5 games + one 10-assist, ≤ 2-turnover game",
    abilityMet: (card) => (card?.pass ?? 0) >= 60,
    abilityLabel: (card) => `传球 ${card?.pass ?? "?"} / 60`,
    abilityLabelEn: (card) => `Pass ${card?.pass ?? "?"} / 60`,
    qualifies: (ev) => per36(ev.ast, ev.min) >= 6 && ev.tov <= ev.ast / 2,
    keyGame: (ev) => ev.ast >= 10 && ev.tov <= 2,
  },
  {
    id: "clutch",
    skillId: "clutch_killer",
    name: "关键先生",
    nameEn: "Clutch Killer",
    window: "season",
    unlocks: "解锁更丰富的关键球决策：胶着与末节投篮更稳定",
    unlocksEn: "Unlocks richer clutch decisions: steadier shooting in close and late games",
    evidenceLabel: "赛季内 3 次关键回合接管命中 + 一次制胜球（命中、球队获胜、最终分差 ≤ 本次得分）",
    evidenceLabelEn: "3 clutch takeover makes in the season + one game-winner (made, team won, final margin ≤ the shot's points)",
    abilityMet: (card) => (card?.clutch ?? 0) >= 55,
    abilityLabel: (card) => `关键球 ${card?.clutch ?? "?"} / 55`,
    abilityLabelEn: (card) => `Clutch ${card?.clutch ?? "?"} / 55`,
    qualifies: (ev) => ev.clutchMade === true,
    keyGame: (ev) => ev.clutchGameWinner === true,
  },
];

/**
 * Skills the user asked for that have NO measurable game evidence. They are
 * listed, not faked: the UI shows them as unmeasurable, and a future engine
 * change can enable them. Stepback needs sim.js to record a shot-type
 * (stepback attempts/makes) and defensive pressure per shot — neither exists
 * today (raw emits are coach/dunk/miss/reb/score; per-player stats are
 * totals only).
 */
export const MISSING_EVIDENCE = [
  {
    skillId: "stepback",
    name: "后撤步大师",
    nameEn: "Stepback Specialist",
    needed: "引擎需记录每次出手的动作类型（后撤步）与防守压力；当前 sim.js 只有出手总数，没有动作类型。",
    neededEn: "The engine must record a shot type (stepback) and defensive pressure per shot; sim.js today records only shot totals, no shot types.",
  },
];

/**
 * Extract the awakening evidence from one playGame report. Only the fields
 * the rules read are kept — points / field goals are deliberately absent:
 * scoring totals are not evidence for any skill.
 */
export function evidenceFromReport(report) {
  const line = report?.line || {};
  const takeover = report?.takeover || null;
  const score = report?.score || {};
  const margin = Math.abs((score.home || 0) - (score.away || 0));
  const clutchMade = takeover?.attempted === true && takeover?.made === true;
  // Game-winner: the make landed, the team won, and the final margin is no
  // bigger than the shot itself — without this shot, the result flips.
  const clutchGameWinner =
    clutchMade &&
    report?.won === true &&
    Number.isFinite(takeover?.points) &&
    margin <= takeover.points;
  return {
    game: report?.game ?? null,
    season: report?.year ?? null,
    min: line.min || 0,
    blk: line.blk || 0,
    reb: line.reb || 0,
    ast: line.ast || 0,
    tov: line.tov || 0,
    clutchMade,
    clutchGameWinner,
  };
}

/** Fresh awakening state (additive, stored on `reborn.player.awakening`). */
export function createAwakeningState(season = null) {
  return {
    version: AWAKENING_VERSION,
    season,
    form: [],
    clutchMakes: 0,
    clutchGameWinner: null,
    awakened: [],
    ready: [],
  };
}

/** Defensive copy with defaults; unknown / legacy shapes never throw. */
export function normalizeAwakeningState(state) {
  const s = state && typeof state === "object" ? state : {};
  return {
    version: AWAKENING_VERSION,
    season: s.season ?? null,
    form: Array.isArray(s.form) ? [...s.form] : [],
    clutchMakes: Number.isFinite(s.clutchMakes) ? s.clutchMakes : 0,
    clutchGameWinner: s.clutchGameWinner ?? null,
    awakened: Array.isArray(s.awakened) ? [...s.awakened] : [],
    ready: Array.isArray(s.ready)
      ? s.ready.map((r) => (typeof r === "string" ? { skillId: r, evidence: null } : { ...r }))
      : [],
  };
}

/** Skill ids this player has awakened (the extraSkills a card build merges). */
export function awakenedSkillIds(state) {
  return normalizeAwakeningState(state).awakened.map((a) => a.skillId);
}

/** How many skills awakened in the given season (the per-season cap counts these). */
export function awakenedThisSeason(state, season) {
  return normalizeAwakeningState(state).awakened.filter((a) => a.season === season).length;
}

/**
 * Split a card's skills by source. Awakened = in the awakening ledger;
 * purchased = bought before the skill-book cancellation (preserved);
 * everything else is innate (the card's own talent). Computed on the fly so
 * the record can never drift from the card.
 */
export function skillSourceOf(card, awakening) {
  const awakened = new Set(awakenedSkillIds(awakening));
  const purchased = new Set(card?.purchasedSkills || []);
  const innate = [];
  const awakenedList = [];
  const purchasedList = [];
  for (const id of card?.skills || []) {
    if (awakened.has(id)) awakenedList.push(id);
    else if (purchased.has(id)) purchasedList.push(id);
    else innate.push(id);
  }
  return { innate, awakened: awakenedList, purchased: purchasedList };
}

/** Per-rule progress for the UI: qualifying count, key game, ability gate, status. */
export function progressFor(state, card = null) {
  const s = normalizeAwakeningState(state);
  const awakenedIds = new Set(s.awakened.map((a) => a.skillId));
  const readyIds = new Set(s.ready.map((r) => r.skillId));
  return AWAKENING_RULES.map((rule) => {
    const inForm = rule.window === "season" ? null : s.form;
    const qualifying =
      rule.window === "season" ? s.clutchMakes : inForm.filter((ev) => rule.qualifies(ev)).length;
    const keyGame =
      rule.window === "season"
        ? s.clutchGameWinner
        : (inForm.find((ev) => rule.keyGame(ev)) || {}).game ?? null;
    const status = awakenedIds.has(rule.skillId)
      ? "awakened"
      : readyIds.has(rule.skillId)
        ? "ready"
        : "progress";
    return {
      ruleId: rule.id,
      skillId: rule.skillId,
      name: rule.name,
      nameEn: rule.nameEn,
      unlocks: rule.unlocks,
      unlocksEn: rule.unlocksEn,
      evidenceLabel: rule.evidenceLabel,
      evidenceLabelEn: rule.evidenceLabelEn,
      qualifying,
      needed: QUALIFYING_NEEDED,
      keyGame,
      keyMet: keyGame != null,
      abilityMet: rule.abilityMet(card),
      abilityLabel: rule.abilityLabel(card),
      abilityLabelEn: rule.abilityLabelEn(card),
      status,
    };
  });
}

/** Evidence summary captured when a rule completes (stored on the ready / awakened record). */
function completionEvidence(rule, state) {
  if (rule.window === "season") {
    return { qualifying: state.clutchMakes, keyGame: state.clutchGameWinner };
  }
  const qualifying = state.form.filter((ev) => rule.qualifies(ev)).length;
  const keyGame = (state.form.find((ev) => rule.keyGame(ev)) || {}).game ?? null;
  return { qualifying, keyGame };
}

function ruleComplete(rule, state) {
  if (rule.window === "season") {
    return state.clutchMakes >= QUALIFYING_NEEDED && state.clutchGameWinner != null;
  }
  const qualifying = state.form.filter((ev) => rule.qualifies(ev)).length;
  return qualifying >= QUALIFYING_NEEDED && state.form.some((ev) => rule.keyGame(ev));
}

/**
 * Record one game. Pure: the input state is never mutated; the returned
 * state is the new one. `card` is the player's card after the game (for the
 * ability gate + grant checks); without it, rules can complete into `ready`
 * but never fire — fail closed.
 *
 * Returns `{ state, awakened: [newly fired awakening records], progress }`.
 * Each fired record is `{ skillId, source: "awakened", game, season, evidence }`
 * — the evidence is what the player actually did, so the UI can name it.
 */
export function recordGame(state, { evidence = {}, card = null } = {}) {
  const next = normalizeAwakeningState(state);
  const season = evidence.season ?? next.season;
  // A new season resets the form (like epiphany) but keeps what was learned.
  if (next.season != null && season != null && season !== next.season) {
    next.form = [];
    next.clutchMakes = 0;
    next.clutchGameWinner = null;
  }
  next.season = season;
  const owned = new Set(card?.skills || []);
  const awakenedIds = new Set(next.awakened.map((a) => a.skillId));
  const readyIds = new Set(next.ready.map((r) => r.skillId));

  // A game the player barely played in adds no evidence and fires nothing.
  if ((evidence.min || 0) >= MIN_EVIDENCE_MINUTES) {
    next.form = [...next.form, { ...evidence }].slice(-FORM_KEEP);
    if (evidence.clutchMade === true) next.clutchMakes += 1;
    if (evidence.clutchGameWinner === true) next.clutchGameWinner = evidence.game;

    // Completion: a rule that is not already awakened / ready / owned.
    for (const rule of AWAKENING_RULES) {
      if (awakenedIds.has(rule.skillId) || readyIds.has(rule.skillId) || owned.has(rule.skillId)) continue;
      if (!ruleComplete(rule, next)) continue;
      next.ready.push({ skillId: rule.skillId, evidence: completionEvidence(rule, next) });
      readyIds.add(rule.skillId);
    }

    // Firing, in fixed rule order, while the per-season cap allows it.
    // (Counted once up front: next.awakened grows inside the loop.)
    const fired = [];
    const alreadyThisSeason = awakenedThisSeason(next, season);
    const have = new Set([...owned, ...next.awakened.map((a) => a.skillId)]);
    for (const rule of AWAKENING_RULES) {
      if (alreadyThisSeason + fired.length >= MAX_AWAKENED_PER_SEASON) break;
      const entry = next.ready.find((r) => r.skillId === rule.skillId);
      if (!entry) continue;
      if (!card) continue;
      if (!isLearnableSkill(rule.skillId)) continue;
      if (!rule.abilityMet(card)) continue;
      if (!canRetainSkill(card, rule.skillId)) continue;
      if (skillSlotsFull({ skills: [...have, ...fired] })) continue;
      if (have.has(rule.skillId) || fired.some((f) => f.skillId === rule.skillId)) continue;
      next.ready = next.ready.filter((r) => r.skillId !== rule.skillId);
      const record = {
        skillId: rule.skillId,
        source: "awakened",
        game: evidence.game ?? null,
        season,
        evidence: entry.evidence || completionEvidence(rule, next),
      };
      next.awakened.push(record);
      fired.push(record);
    }
    return { state: next, awakened: fired, progress: progressFor(next, card) };
  }
  return { state: next, awakened: [], progress: progressFor(next, card) };
}
