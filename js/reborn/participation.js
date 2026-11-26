// Player Agency PA2: how often the game asks you something. Four modes, ONE GameSim and ONE grading engine (agency.js):
// the mode only changes the decision frequency. Nothing here touches the sim's dice (the gate has its own seeded stream).
import { clamp } from "../core/seededRandom.js";
import { withoutTeamOptions } from "./teamplay.js";

export const PARTICIPATION_MODES = Object.freeze({ AUTO: "auto", KEY: "key", HIGH: "high", FULL: "full" });
export const DEFAULT_PARTICIPATION = PARTICIPATION_MODES.KEY;
export const PARTICIPATION_STORAGE_KEY = "cls_reborn_participation_v1";

/** Per-mode pacing of the NON-clutch asks: minimum own possessions between two asks, and the most asks in one game. */
export const MODE_PACING = Object.freeze({
  auto: { gap: Infinity, max: 0, target: "0" },
  key: { gap: 6, max: 7, target: "3–8" },
  high: { gap: 3, max: 25, target: "12–25" },
  full: { gap: 0, max: 90, target: "∞" },
});

export const MODE_LABELS = Object.freeze({
  auto: { zh: "自动生涯", en: "Automatic", descZh: "球员根据能力、性格和打法自动决策。", descEn: "Your player decides on his own, from his ratings and temperament." },
  key: { zh: "关键回合", en: "Key possessions", descZh: "参与关键球、战术分歧和宿敌对决（默认）。", descEn: "You step in for clutch moments, coach disagreements and rival duels (default)." },
  high: { zh: "沉浸式比赛", en: "High involvement", descZh: "频繁参与进攻、防守和队友配合。", descEn: "Frequent say in offense, defense and teammate play." },
  full: { zh: "完全控制", en: "Full control", descZh: "每个有实际决策机会的个人回合都可以介入。", descEn: "Step in on every possession where you have a real choice." },
});

export function sanitizeMode(mode) {
  return Object.values(PARTICIPATION_MODES).includes(mode) ? mode : DEFAULT_PARTICIPATION;
}

/** Device preference (like the avatar renderer): one setting for the player's gameplay style, no save migration. */
export function readParticipation(storage = globalThis.localStorage) {
  try { return sanitizeMode(storage?.getItem(PARTICIPATION_STORAGE_KEY)); } catch { return DEFAULT_PARTICIPATION; }
}
export function writeParticipation(mode, storage = globalThis.localStorage) {
  try { storage?.setItem(PARTICIPATION_STORAGE_KEY, sanitizeMode(mode)); } catch { /* private mode: the choice lasts for this page */ }
  return sanitizeMode(mode);
}

/** 0..1: how much this possession matters. Close and late is 1; a blowout in the first half is ~0. */
export function importanceOf(sim) {
  const margin = Math.abs(sim.score.home - sim.score.away);
  const closeness = 1 - clamp(margin / 15, 0, 1);
  const q = sim.quarter;
  const time = q >= 5 ? 1 : q === 4 ? (sim.clock <= 300 ? 1 : 0.75) : q === 3 ? 0.5 : 0.3;
  return Math.round(closeness * time * 100) / 100;
}

/** 0..1: how much a read is worth right now = the gap between the best and the worst option (points per possession). */
export function opportunityOf(values) {
  const v = Object.entries(withoutTeamOptions(values)).filter(([k]) => k !== "setup").map(([, x]) => x);
  if (v.length < 2) return 0;
  return clamp((Math.max(...v) - Math.min(...v)) / 0.9, 0, 1);
}
/** An opening that is worth stopping for: key asks only for a clear one, high also for a moderate one. */
export const CLEAR_OPPORTUNITY = 0.42;
export const MODERATE_OPPORTUNITY = 0.3;

/**
 * PA3 interaction levels: HOW a question that is being asked is shown (the gate above decides WHETHER).
 * L3 = the full panel, only for a real moment (a clutch possession, or the coach disagrees with you).
 * L2 = a short action panel with keys that waits for you (an important possession, or a clear opening).
 * L1 = a small bubble that never covers the court and needs no answer (everything else: Full control's fill-in questions).
 * One pure rule, stamped on the context at every ask site, so a future moment (the buzzer-beater proposal) plugs into the SAME dispatch.
 */
export const ASK_TIERS = Object.freeze({ L1: "L1", L2: "L2", L3: "L3" });
export function askTier({ critical = false, conflict = false, importance = 0, opportunity = 0 } = {}) {
  if (critical || conflict) return ASK_TIERS.L3;
  if (importance >= 0.55 || opportunity >= MODERATE_OPPORTUNITY) return ASK_TIERS.L2;
  return ASK_TIERS.L1;
}
/** An L1 bubble waits this long for an answer; after two in a row that nobody touched it shortens (a player who is not engaging is not made to wait). */
export const BUBBLE_MS = 3200;
export const BUBBLE_MS_QUICK = 1200;
export const BUBBLE_QUICK_AFTER = 2;
/** A bubble pops up where the pointer may already be (right after "play next game"): clicks in its first moments are not answers. */
export const BUBBLE_CLICK_GUARD_MS = 250;
export const bubbleWindow = (ignoredInARow = 0) => (ignoredInARow >= BUBBLE_QUICK_AFTER ? BUBBLE_MS_QUICK : BUBBLE_MS);
export const nextIgnored = (ignoredInARow, answered) => (answered ? 0 : ignoredInARow + 1);

/** Whether the mode asks at all. Pure: every input is given. Fast simulation and the bench never ask. */
export function shouldOfferDecision({ mode, onCourt, fastSimulation = false, hasLegalActions = true, importance = 0, isCritical = false, hasMeaningfulConflict = false, opportunity = 0 }) {
  if (!onCourt || fastSimulation || !hasLegalActions) return false;
  switch (sanitizeMode(mode)) {
    case "auto": return false;
    case "key": return isCritical || hasMeaningfulConflict || opportunity >= CLEAR_OPPORTUNITY;
    case "high": return isCritical || hasMeaningfulConflict || importance >= 0.55 || opportunity >= MODERATE_OPPORTUNITY;
    case "full": return true;
    default: return false;
  }
}

/**
 * One game's pacing. `getMode()` is read at every possession, so the player can change it mid-match.
 * `ask(sim, { critical, conflict })` -> true when the driver should open a decision now.
 */
export function createDecisionGate({ getMode = () => DEFAULT_PARTICIPATION, fastSimulation = false } = {}) {
  let asked = 0;
  let sinceLast = Infinity;
  return {
    get asked() { return asked; },
    mode: () => sanitizeMode(getMode()),
    /** Count one of your possessions that passed without a question (the gap only grows while you are on the floor). */
    skipped() { sinceLast += 1; },
    ask({ onCourt = true, importance = 0, critical = false, conflict = false, opportunity = 0 } = {}) {
      const mode = sanitizeMode(getMode());
      const pace = MODE_PACING[mode];
      if (asked >= pace.max || sinceLast < pace.gap) { sinceLast += 1; return false; }
      const yes = shouldOfferDecision({ mode, onCourt, fastSimulation, importance, isCritical: critical, hasMeaningfulConflict: conflict, opportunity });
      if (yes) { asked += 1; sinceLast = 0; } else sinceLast += 1;
      return yes;
    },
  };
}
