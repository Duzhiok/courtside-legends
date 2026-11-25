/**
 * Player Agency PA1 (Career 2.0): the takeover moment becomes a real decision between the coach's call, your own
 * read and patience. Pure functions over a live GameSim (read-only here); season.js executes the choice through
 * the existing sim levers and this module grades it.
 *
 * Rules that must hold (product decision 2026-11-25):
 *  - decision QUALITY comes from evidence taken BEFORE the action (ratings of the people actually on the floor,
 *    clock, score); EXECUTION comes from what GameSim then did. A make never makes a bad read good.
 *  - a coach instruction exists only when the team has a real coach on record for that season (coaches.js);
 *    otherwise it is null, never an invented default. Deviating without an instruction is not insubordination.
 *  - coaches can be wrong: following a poor call costs the player nothing.
 *  - no dice here except the observation noise, seeded by the decision id; GameSim resolves every outcome.
 * Starting numbers, not calibrated; tune after fixed-seed seasons.
 */
import { COACHES } from "../data/coaches.js";
import { clamp, hashSeed, seededStream } from "../core/seededRandom.js";

export const AUTONOMY_START = 10;
export const AUTONOMY_TIERS = [
  { at: 0, id: "executor", zh: "战术执行者", en: "Executor" },
  { at: 20, id: "rotation", zh: "轮换球员", en: "Rotation player" },
  { at: 40, id: "trusted", zh: "可信赖球员", en: "Trusted player" },
  { at: 60, id: "core", zh: "场上核心", en: "Floor general" },
  { at: 80, id: "commander", zh: "场上指挥官", en: "Commander" },
];
/** Design units (the table in the brief) -> the save's integer trust and autonomy. */
export const AGENCY_TRUST_SCALE = 2;
export const AGENCY_AUTONOMY_SCALE = 4;
export const CLUTCH_LEVERAGE = 2;
export const MAX_TRUST_PER_GAME = 4;
export const MAX_AUTONOMY_PER_GAME = 4;
/** EV gap (points per possession) that counts as a clearly better / worse choice. */
const QUALITY_SPAN = 0.25;

const r = (p, k) => Number(p?.[k]) || 50;
export const autonomyTier = (a) => [...AUTONOMY_TIERS].reverse().find((t) => (Number(a) || 0) >= t.at);
export const clampAutonomy = (a) => clamp(Math.round(Number(a) || 0), 0, 100);

/** The real coach of that team that season, or null. */
export function coachOf(teamCode, season) {
  return COACHES.find((c) => c.team === teamCode && Number(c.season) === Number(season)) || null;
}

/**
 * The four coach archetypes of the brief. A team with no coach on record gets one of these, fixed by team + season
 * (an unnamed "head coach" of that type, never a fake real person). `stubborn` keeps his call even when the score
 * says it no longer fits: the case where going against him can be right.
 */
export const COACH_ARCHETYPES = Object.freeze([
  { archetype: "disciplinarian", zh: "传统控制型", en: "Disciplinarian", playerAutonomy: 20, specialTactics: ["grind", "post_up"] },
  { archetype: "open", zh: "开放型", en: "Players' coach", playerAutonomy: 72, specialTactics: ["motion", "five_out"] },
  { archetype: "tactician", zh: "战术大师型", en: "Tactician", playerAutonomy: 35, specialTactics: ["triangle", "horns"] },
  { archetype: "stubborn", zh: "固执型", en: "Stubborn", playerAutonomy: 25, specialTactics: ["iso_heavy"] },
]);

/** The team's coach that season: the real one when coaches.js has him, else a seeded archetype. */
export function teamCoach(teamCode, season) {
  const real = coachOf(teamCode, season);
  if (real) return real;
  const a = COACH_ARCHETYPES[hashSeed(`coach|${teamCode}|${season}`) % COACH_ARCHETYPES.length];
  return { id: `archetype:${teamCode}:${season}`, name: `主教练（${a.zh}）`, nameEn: `Head coach (${a.en})`, ...a };
}

/** Late and not ahead with a timeout left: the coach stops play and draws one up. Ahead, he lets you play. */
export function coachCallsPlay(sim, coach) {
  if (!coach) return false;
  const mine = sim.score[sim.youSide];
  const theirs = sim.score[sim.youSide === "home" ? "away" : "home"];
  return (sim.timeouts?.[sim.youSide] ?? 0) > 0 && mine <= theirs;
}

/** How freely this coach lets players improvise, 0..1 (coaches.js playerAutonomy; unknown coach = middle). */
export const coachTolerance = (coach) => clamp((coach?.playerAutonomy ?? 50) / 100, 0, 1);

const sides = (sim) => {
  const you = sim.youSide === "home" ? sim.home : sim.away;
  const opp = sim.youSide === "home" ? sim.away : sim.home;
  return { you, opp };
};
const defenderOf = (p, opp) =>
  opp.onCourt.find((d) => d.playPos && d.playPos === p.playPos) || [...opp.onCourt].sort((a, b) => r(b, "defense") - r(a, "defense"))[0];
const rimProtection = (opp) => Math.max(...opp.onCourt.map((d) => r(d, "block")));

/** Expected points of one man's looks against the people guarding him now. */
function looks(p, opp) {
  const d = defenderOf(p, opp);
  const three = 3 * clamp(0.2 + (r(p, "three") - 50) * 0.0055 - (r(d, "defense") - 50) * 0.0025, 0.12, 0.47);
  const rim = 2 * clamp(0.42 + (r(p, "paint") - 50) * 0.005 + (r(p, "speed") - 50) * 0.002 - (rimProtection(opp) - 50) * 0.003 - (r(d, "defense") - 50) * 0.002, 0.25, 0.68) + 0.12;
  const post = 2 * clamp(0.4 + (r(p, "paint") - 50) * 0.006 + (r(p, "strength") - 50) * 0.002 - (r(d, "defense") - 50) * 0.003, 0.25, 0.66) + 0.1;
  return { three, rim, post, defender: d };
}

/** Score/clock pressure: down 3 late, a two does not tie. */
function twoDiscount(sim) {
  const mine = sim.score[sim.youSide];
  const theirs = sim.score[sim.youSide === "home" ? "away" : "home"];
  return theirs - mine === 3 && sim.clock <= 24 ? 0.45 : 1;
}

/** The coach's call for this possession, or null (no coach on record). Deterministic. */
export function coachInstruction(sim, coach, playerId) {
  if (!coach) return null;
  const { you } = sides(sim);
  const others = you.onCourt.filter((p) => p.id !== playerId);
  const big = [...others].filter((p) => ["C", "PF"].includes(p.playPos || p.pos)).sort((a, b) => r(b, "paint") - r(a, "paint"))[0];
  const shooter = [...others].sort((a, b) => r(b, "three") - r(a, "three"))[0];
  const postMinded = (coach.specialTactics || []).some((t) => ["post_up", "triangle", "grind"].includes(t));
  if (twoDiscount(sim) < 1 && shooter && coach.archetype !== "stubborn") return { action: "find_shooter", targetId: shooter.id, focusId: "pace_three" };
  if (postMinded && big && r(big, "paint") >= 65) return { action: "post_entry", targetId: big.id, focusId: "post_up" };
  const star = [...you.onCourt].sort((a, b) => r(b, "scoring") - r(a, "scoring"))[0];
  if (star && star.id !== playerId) return { action: "star_iso", targetId: star.id, focusId: "iso_star" };
  // The star is you, or there is no post to feed: he draws up a look for the best shooter on the floor.
  return shooter ? { action: "find_shooter", targetId: shooter.id, focusId: "pace_three" } : null;
}

/** Expected points per option, from the floor as it stands before anyone moves. */
export function optionValues(sim, playerId, instruction) {
  const { you, opp } = sides(sim);
  const me = you.onCourt.find((p) => p.id === playerId);
  const two = twoDiscount(sim);
  const mine = looks(me, opp);
  const values = { pullup: mine.three, drive: mine.rim * two };
  if (instruction) {
    const t = you.onCourt.find((p) => p.id === instruction.targetId);
    const tl = t ? looks(t, opp) : null;
    values.follow = !tl ? 0.9 : instruction.action === "find_shooter" ? tl.three : instruction.action === "post_entry" ? tl.post * two : Math.max(tl.three, tl.rim * two);
  }
  // Patience ("pass": give up this shot, keep reading): the offense's normal flow is worth about a point; with under 8 seconds there is no time to read.
  values.pass = sim.clock < 8 ? 0.7 : 1.0 * (two < 1 ? 0.8 : 1);
  return values;
}

/** Quality of one option in [-1, 1]: its EV against the median of what was on the table. */
export function decisionQuality(values, choiceId) {
  const evs = Object.values(values).sort((a, b) => a - b);
  const median = evs[Math.floor((evs.length - 1) / 2)];
  return clamp((values[choiceId] - median) / QUALITY_SPAN, -1, 1);
}

/** What the player believes he sees: the true values blurred by his basketball IQ (seeded, never re-rolled). */
export function observe(values, { iq = 50, decisionId = "" } = {}) {
  const rnd = seededStream(hashSeed(`observe|${decisionId}`));
  const blur = (1 - clamp(iq, 0, 100) / 100) * 0.6;
  const perceived = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v + (rnd() * 2 - 1) * blur]));
  const pick = Object.entries(perceived).sort((a, b) => b[1] - a[1])[0][0];
  return { pick, clarity: iq >= 75 ? "sharp" : iq >= 55 ? "fair" : "cloudy" };
}

/** The whole decision as the dialog and the grader need it. */
export function buildDecisionContext(sim, playerId, { coach = null, iq = 50, decisionId, trust = 0, autonomy = AUTONOMY_START } = {}) {
  const instruction = coachCallsPlay(sim, coach) ? coachInstruction(sim, coach, playerId) : null;
  const values = optionValues(sim, playerId, instruction);
  const { you } = sides(sim);
  const target = instruction ? you.onCourt.find((p) => p.id === instruction.targetId) : null;
  return {
    decisionId,
    coach: coach ? { id: coach.id, name: coach.name, nameEn: coach.nameEn, archetype: coach.archetype || null, tolerance: coachTolerance(coach) } : null,
    coachInstruction: instruction ? { ...instruction, targetName: target?.name || "" } : null,
    observation: observe(values, { iq, decisionId }),
    options: [...(instruction ? ["follow"] : []), "drive", "pullup", "pass"],
    values,
    playerState: { trust, autonomy, iq },
  };
}

/** Execution in [-1, 1] from what the sim did: a shot the clutch log settled, or the points of the possession. */
export function executionQuality({ clutch = null, points = 0 } = {}) {
  if (clutch) {
    if (clutch.attempted) return clutch.made ? 1 : -0.4;
    return { turnover: -1, foul: 0.3, doubled: -0.2, kicked_out: -0.2 }[clutch.reason] ?? 0;
  }
  return points >= 2 ? 1 : points === 1 ? 0.3 : -0.4;
}

/**
 * Trust and autonomy from one graded decision (design units x scale, capped). `verdict` names the quadrant
 * for the coach's feedback line.
 */
export function evaluateDecision({ hadInstruction, followed, quality, execution, tolerance = 0.5, leverage = CLUTCH_LEVERAGE }) {
  const good = quality > 0.3;
  const poor = quality < -0.3;
  const scored = execution > 0;
  let trust = 0;
  let autonomy = 0;
  let verdict;
  if (followed) {
    trust = 0.3 + (scored ? 0.2 : 0);
    verdict = poor ? "followed_poor_call" : "followed";
  } else if (!hadInstruction) {
    trust = quality * 0.6 + execution * 0.3;
    if (good && scored) autonomy = 0.3;
    if (poor && !scored) autonomy = -0.2;
    verdict = good ? (scored ? "free_good_scored" : "free_good_missed") : poor ? (scored ? "free_poor_scored" : "free_poor_missed") : "free_neutral";
  } else if (good) {
    trust = scored ? 1 : -0.3 * (1 - tolerance);
    autonomy = scored ? 0.5 : 0;
    verdict = scored ? "deviate_good_scored" : "deviate_good_missed";
  } else if (poor) {
    trust = scored ? 0.2 - 0.4 * (1 - tolerance) : -1.5 * (1 - tolerance * 0.5);
    autonomy = scored ? 0 : -0.5;
    verdict = scored ? "deviate_poor_scored" : "deviate_poor_missed";
  } else {
    trust = execution * 0.3 - 0.2 * (1 - tolerance);
    verdict = "deviate_neutral";
  }
  return {
    verdict,
    trustDelta: clamp(trust * leverage * AGENCY_TRUST_SCALE, -MAX_TRUST_PER_GAME, MAX_TRUST_PER_GAME),
    autonomyDelta: clamp(autonomy * leverage * AGENCY_AUTONOMY_SCALE, -MAX_AUTONOMY_PER_GAME, MAX_AUTONOMY_PER_GAME),
  };
}

/** Grade the takeover the driver executed (null when there was no agency context or the pick never reached the floor). */
export function gradeTakeover(takeover, clutchOutcome = null) {
  const ctx = takeover?.context;
  if (!ctx || !takeover.choiceId || takeover.accepted === false) return null;
  const choiceId = takeover.choiceId;
  const followed = choiceId === "follow";
  const quality = decisionQuality(ctx.values, choiceId);
  const execution = executionQuality({ clutch: clutchOutcome, points: takeover.points ?? 0 });
  const graded = evaluateDecision({ hadInstruction: !!ctx.coachInstruction, followed, quality, execution, tolerance: ctx.coach?.tolerance ?? 0.5 });
  const round2 = (v) => Math.round(v * 100) / 100;
  return { decisionId: ctx.decisionId, choiceId, followed, instruction: ctx.coachInstruction, observation: ctx.observation, coach: ctx.coach, quality: round2(quality), execution: round2(execution), points: takeover.points ?? clutchOutcome?.points ?? 0, ...graded };
}
