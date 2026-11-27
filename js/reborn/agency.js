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
import { screenOffer, spotOffer, withoutTeamOptions } from "./teamplay.js";

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
// Calibrated (scripts/measure/agency-calibration.mjs): a player who reads well gains ~1.2 per clutch, ~16 clutches a season,
// so the 'trusted' tier (40) is a season and a half away; a reckless player is back at 0 in under a season.
export const AGENCY_AUTONOMY_SCALE = 10;
/** Autonomy that unlocks calling your own play (the 'setup' option), and how much of it softens the coach's reaction. */
export const AUDIBLE_AT = 40;
export const AUTONOMY_TOLERANCE_PER_POINT = 1 / 250;
export const CLUTCH_LEVERAGE = 2;
export const MAX_TRUST_PER_GAME = 4;
export const MAX_AUTONOMY_PER_GAME = 6;
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
  const big = [...others].filter((p) => ["C", "PF"].includes(p.pos)).sort((a, b) => r(b, "paint") - r(a, "paint"))[0];
  const shooter = [...others].sort((a, b) => r(b, "three") - r(a, "three"))[0];
  const postMinded = (coach.specialTactics || []).some((t) => ["post_up", "triangle", "grind"].includes(t));
  if (twoDiscount(sim) < 1 && shooter && coach.archetype !== "stubborn") return { action: "find_shooter", targetId: shooter.id, focusId: "pace_three" };
  if (postMinded && big && r(big, "paint") >= 65) return { action: "post_entry", targetId: big.id, focusId: "post_up" };
  const star = [...you.onCourt].sort((a, b) => r(b, "scoring") - r(a, "scoring"))[0];
  if (star && star.id !== playerId) return { action: "star_iso", targetId: star.id, focusId: "iso_star" };
  // The star is you, or there is no post to feed: he draws up a look for the best shooter on the floor.
  return shooter ? { action: "find_shooter", targetId: shooter.id, focusId: "pace_three" } : null;
}

/** Once you have earned the freedom: the teammate with the best look right now, and the play that gets him the ball. */
function bestSetup(sim, playerId, two) {
  const { you, opp } = sides(sim);
  let top = null;
  for (const t of you.onCourt) {
    if (t.id === playerId) continue;
    const l = looks(t, opp);
    const three = l.three;
    const inside = Math.max(l.rim * two, l.post * two);
    const value = Math.max(three, inside);
    if (!top || value > top.value) top = { value, targetId: t.id, targetName: t.name, focusId: three >= inside ? "pace_three" : ["C", "PF"].includes(t.pos) ? "post_up" : "iso_star" };
  }
  return top;
}

/**
 * PA3.1 "mismatch inside": a BIG asks for the post touch when his matchup is better than the rest of the floor's and his look is
 * better than yours. Why only bigs: the engine's focus plays boost by category, not by man (`iso_star` the top scorer, `hunt_mismatch`
 * only 80+ scorers, `post_up` C/PF x1.45 and the paint), so for a wing "give me the ball" measured as nothing (shot rate .26 -> .28)
 * and is NOT offered. For a big in the post it is real: measured over 8380 possessions, in the 4.2% where it is asked he shoots on
 * 18% of possessions without it and 35% with it, and scores 0.25 -> 0.57 points a possession. The team's total is not promised.
 * A rating gap against his defender is positive for almost everybody (the median is +20), so "mismatch" is relative: his gap must beat
 * the average of the other four's (strictly, so a floor of equals asks for nothing). Null otherwise: a teammate who always asks says
 * nothing (first cut: every possession, and one star every time, until the numbers were read).
 */
export const FEED_MARGIN = 0;
export const FEED_EDGE = 0.1;
function feedOffer(sim, playerId, two) {
  const { you, opp } = sides(sim);
  if (!you.onCourt.some((p) => p.id === playerId) || sim.clock < 8) return null;
  const rows = you.onCourt.map((t) => {
    const l = looks(t, opp);
    const inside = Math.max(l.rim * two, l.post * two);
    return { t, l, inside, post: l.three < inside, own: Math.max(l.three, l.rim * two), gap: r(t, "paint") - r(l.defender, "defense") };
  });
  const mine = rows.find((x) => x.t.id === playerId);
  let top = null;
  for (const x of rows) {
    if (x.t === mine.t || !x.post || !["C", "PF"].includes(x.t.pos)) continue;
    const others = rows.filter((y) => y !== x);
    const margin = x.gap - others.reduce((sum, y) => sum + y.gap, 0) / others.length;
    if (margin > FEED_MARGIN && x.inside >= mine.own + FEED_EDGE && (!top || margin > top.margin)) top = { ...x, margin };
  }
  if (!top) return null;
  const { t, l } = top;
  return {
    kind: "feed", teammateId: t.id, targetId: t.id, personId: t.bref || t.id, name: t.name, nameEn: t.nameEn || t.name, pos: t.pos, iq: Number(t.iq) || 50,
    value: top.inside, focusId: "post_up",
    against: l.defender ? { name: l.defender.name, nameEn: l.defender.nameEn || l.defender.name } : null,
  };
}

/** Expected points per option, from the floor as it stands before anyone moves. `offer` = a teammate's screen (PA3). */
export function optionValues(sim, playerId, instruction, offer = null, spot = null, feed = null) {
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
  // PA3: a screen helps the handler (his man is screened off) and puts the screener in a look of his own. `screen` is the way the
  // teammate offered, `screenAlt` the other way to use him; the screener's basketball IQ nudges how well he sets it.
  const mate = offer && you.onCourt.find((p) => p.id === offer.teammateId);
  if (mate) {
    const own = Math.max(mine.three, mine.rim * two);
    const ml = looks(mate, opp);
    const edge = 1 + (r(mate, "iq") - 50) * 0.002;
    const via = (after) => 0.55 * own * 1.12 + 0.45 * (after === "pop" ? ml.three : ml.rim * two) * edge;
    values.screen = via(offer.afterScreen);
    values.screenAlt = via(offer.alt);
  }
  // Patience ("pass": give up this shot, keep reading): the offense's normal flow is worth about a point; with under 8 seconds there is no time to read.
  values.pass = sim.clock < 8 ? 0.7 : 1.0 * (two < 1 ? 0.8 : 1);
  // S2: asking for the catch lifts his share of the touches (measured 14.7% -> 19.6%), so it is mostly the normal flow plus a slice of his own look.
  if (spot) values.spot = 0.8 * values.pass + 0.2 * mine.three;
  // PA3.1: the ball goes to the man who asked: his own look (what the engine's own matchup says it is worth).
  if (feed) values.feed = feed.value;
  return values;
}

/** Quality of one option in [-1, 1]: its EV against the median of what was on the table. */
export function decisionQuality(values, choiceId, baseline = null) {
  const evs = Object.values(withoutTeamOptions(values)).sort((a, b) => a - b); // the baseline is the pre-PA3 options only
  // A defensive question has two options and a fixed baseline (staying home = 0); a median of two would call a bad gamble "neutral".
  const median = baseline ?? evs[Math.floor((evs.length - 1) / 2)];
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
/** A coach only stops play for a call when it matters; on an everyday possession he calls it only in a close game. */
const ROUTINE_CALL_IMPORTANCE = 0.4;

export function buildDecisionContext(sim, playerId, { coach = null, iq = 50, decisionId, trust = 0, autonomy = AUTONOMY_START, routine = false, importance = 1 } = {}) {
  const calls = coachCallsPlay(sim, coach) && (!routine || importance >= ROUTINE_CALL_IMPORTANCE);
  const instruction = calls ? coachInstruction(sim, coach, playerId) : null;
  const offer = screenOffer(sim, playerId); // PA3: a teammate who can set a real screen right now (null when none / no time)
  const spot = spotOffer(sim, playerId); // S2: a teammate he can ask to find him (null when no time)
  const feed = feedOffer(sim, playerId, twoDiscount(sim)); // PA3.1: a teammate who is clearly better placed asks for the ball (null when nobody is)
  const values = optionValues(sim, playerId, instruction, offer, spot, feed);
  const own = autonomy >= AUDIBLE_AT ? bestSetup(sim, playerId, twoDiscount(sim)) : null;
  const audible = own && feed && own.targetId === feed.targetId ? null : own; // the same man twice would be two buttons for one play: his voice wins
  if (audible) values.setup = audible.value;
  const { you } = sides(sim);
  const target = instruction ? you.onCourt.find((p) => p.id === instruction.targetId) : null;
  return {
    decisionId,
    routine,
    coach: coach ? { id: coach.id, name: coach.name, nameEn: coach.nameEn, archetype: coach.archetype || null, tolerance: coachTolerance(coach) } : null,
    coachInstruction: instruction ? { ...instruction, targetName: target?.name || "" } : null,
    observation: observe(withoutTeamOptions(values), { iq, decisionId }),
    audible: audible ? { targetId: audible.targetId, targetName: audible.targetName, focusId: audible.focusId } : null,
    offer: values.screen != null ? offer : null,
    spotOffer: values.spot != null ? spot : null,
    feedOffer: values.feed != null ? feed : null,
    options: [...(instruction ? ["follow"] : []), "drive", "pullup", ...(audible ? ["setup"] : []), ...(values.feed != null ? ["feed"] : []), ...(values.screen != null ? ["screen", "screenAlt"] : []), ...(values.spot != null ? ["spot"] : []), "pass"],
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
  if (ctx.side === "defense" && choiceId === "stay") return null; // doing the normal thing is not a decision to grade
  const followed = choiceId === "follow";
  const quality = decisionQuality(ctx.values, choiceId, ctx.baseline ?? null);
  const execution = takeover.execution ?? executionQuality({ clutch: clutchOutcome, points: takeover.points ?? 0 });
  const graded = evaluateDecision({ hadInstruction: !!ctx.coachInstruction, followed, quality, execution, tolerance: Math.min(1, (ctx.coach?.tolerance ?? 0.5) + (ctx.playerState?.autonomy ?? 0) * AUTONOMY_TOLERANCE_PER_POINT) });
  const round2 = (v) => Math.round(v * 100) / 100;
  return { decisionId: ctx.decisionId, side: ctx.side || "offense", choiceId, followed, instruction: ctx.coachInstruction, observation: ctx.observation, coach: ctx.coach, quality: round2(quality), execution: round2(execution), points: takeover.points ?? clutchOutcome?.points ?? 0, ...graded };
}

/**
 * A game can hold several decisions (participation modes). They settle together: the headline is the one that mattered most,
 * and the totals are capped so a busy mode cannot farm trust or autonomy faster than a quiet one by volume alone.
 */
export const MULTI_DECISION_CAP = 1.5;
export function combineGrades(grades) {
  const list = (grades || []).filter(Boolean);
  if (list.length <= 1) return list[0] || null;
  const headline = list.reduce((a, b) => (Math.abs(b.trustDelta) + Math.abs(b.autonomyDelta) > Math.abs(a.trustDelta) + Math.abs(a.autonomyDelta) ? b : a));
  const sum = (k) => list.reduce((t, g) => t + g[k], 0);
  return {
    ...headline,
    decisions: list.length,
    trustDelta: clamp(sum("trustDelta"), -MAX_TRUST_PER_GAME * MULTI_DECISION_CAP, MAX_TRUST_PER_GAME * MULTI_DECISION_CAP),
    autonomyDelta: clamp(sum("autonomyDelta"), -MAX_AUTONOMY_PER_GAME * MULTI_DECISION_CAP, MAX_AUTONOMY_PER_GAME * MULTI_DECISION_CAP),
  };
}
