/**
 * Player Agency PA3 slice 3a: the one defensive decision the engine can really back - gamble for the steal, or stay home.
 * Spec and the measurement behind it: docs/implementation/PLAYER-AGENCY-PA3.md ("Slice 3 audit").
 *
 * What the engine does with `defFocus: "allout"` (measured over 1800 defensive possessions): steals x3 (0.010 -> 0.031),
 * personal fouls +50% (0.032 -> 0.048), more stamina spent, and the opponent's points per possession unchanged. So it is a
 * STYLE trade, not an efficiency lever, and that is exactly what the value below says: for an average player at an even score
 * it is worth nothing; it pays for a strong thief who is trailing late, and it costs a man in foul trouble or a leader.
 * There is deliberately NO box-out / help / switch option: the engine has no measurable lever for them (rebounds do not move
 * at all), and grading them on opposing points would reward luck.
 *
 * Evidence without an event stream: the player's own `stl` / `pf` deltas for the possession and the team's forced turnovers.
 * Starting numbers, not calibrated - tests pin directions, never magnitudes.
 */
import { coachTolerance } from "./agency.js";

export const DEFENSE_OPTIONS = Object.freeze(["gamble", "stay"]);
/** The only engine focus used: the all-out defender (the "stay" choice changes nothing, the team's own defense runs). */
export const GAMBLE_FOCUS = "allout";
export const MIN_CLOCK_FOR_DEFENSE_CALL = 8;
/** A defensive question is only worth asking when the gamble really differs from staying home (points per possession). */
export const MIN_DEFENSE_STAKES = 0.05;
export const DEFENSE_COOLDOWN = 4;

const STEAL_SKILL_PER_POINT = 0.002; // rating 80 -> +0.06, rating 30 -> -0.04 (engine: steal rating feeds the steal chance directly)
const FOUL_TROUBLE_COST = 0.07; // each personal foul beyond the second
const TIRED_AT = 70; // the engine's own "sub him out" fatigue line
const TIRED_COST = 0.04;
const CHASING_BONUS = 0.08; // trailing by up to 10 late: variance is worth buying
const PROTECTING_COST = 0.06; // leading by 10+ late: do not give the game away

const round3 = (v) => Math.round(v * 1000) / 1000;
const sideOf = (sim) => (sim.youSide === "home" ? { you: sim.home, opp: sim.away, mine: sim.score.home, theirs: sim.score.away } : { you: sim.away, opp: sim.home, mine: sim.score.away, theirs: sim.score.home });

/** What the dialog may say and the value is built from: all of it is a real field. Null when he is off the floor or there is no time. */
export function defenseFacts(sim, playerId) {
  if (!sim || !(sim.clock >= MIN_CLOCK_FOR_DEFENSE_CALL)) return null;
  const { you, mine, theirs } = sideOf(sim);
  const me = you?.onCourt?.find((p) => p.id === playerId);
  if (!me) return null;
  const margin = mine - theirs;
  const late = sim.quarter >= 4 && sim.clock <= 300;
  return {
    fouls: me.stats?.pf || 0,
    fatigue: Math.round(me.fatigue || 0),
    stealRating: Number(me.steal) || 50,
    margin,
    late,
    state: late && margin < 0 && margin >= -10 ? "chasing" : late && margin >= 10 ? "protecting" : "even",
  };
}

/** Points-per-possession value of each option. `stay` is the baseline (0) by construction: doing the normal thing is never a bad decision. */
export function defenseValues(facts) {
  if (!facts) return null;
  const skill = (facts.stealRating - 50) * STEAL_SKILL_PER_POINT;
  const trouble = -FOUL_TROUBLE_COST * Math.max(0, facts.fouls - 2);
  const tired = facts.fatigue >= TIRED_AT ? -TIRED_COST : 0;
  const state = facts.state === "chasing" ? CHASING_BONUS : facts.state === "protecting" ? -PROTECTING_COST : 0;
  return { gamble: round3(skill + trouble + tired + state), stay: 0 };
}

/** The decision, in the shape agency.js grades and the dialog renders (side: "defense"). */
export function buildDefenseContext(sim, playerId, { coach = null, iq = 50, decisionId, trust = 0, autonomy = 0, importance = 0 } = {}) {
  const facts = defenseFacts(sim, playerId);
  const values = defenseValues(facts);
  if (!values) return null;
  return {
    side: "defense",
    decisionId,
    routine: true,
    importance,
    coach: coach ? { id: coach.id, name: coach.name, nameEn: coach.nameEn, archetype: coach.archetype || null, tolerance: coachTolerance(coach) } : null,
    coachInstruction: null, // a coach does not stop play to call a steal
    observation: null,
    audible: null,
    options: [...DEFENSE_OPTIONS],
    values,
    baseline: 0, // graded against "stay", not against the median of a two-option list
    facts,
    playerState: { trust, autonomy, iq },
  };
}

const teamTurnovers = (team) => (team.roster || []).reduce((t, p) => t + (p.stats?.tov || 0), 0);

/**
 * Run ONE opposing possession with the player gambling (`defFocus: "allout"`), then put his orders back exactly as they were.
 * Returns what the sim recorded.
 */
export function playGamblePossession(sim, { playerId }) {
  const { you, opp } = sideOf(sim);
  const me = you.roster.find((p) => p.id === playerId);
  const saved = me?.orders ? { ...me.orders } : null;
  const stat = (k) => me?.stats?.[k] || 0;
  const before = { stl: stat("stl"), pf: stat("pf"), forced: teamTurnovers(opp), points: sim.youSide === "home" ? sim.score.away : sim.score.home };
  sim.setPlayerOrders(playerId, { defFocus: GAMBLE_FOCUS });
  sim.step();
  sim.setPlayerOrders(playerId, saved || { defFocus: "auto" });
  return {
    steal: stat("stl") > before.stl,
    foul: stat("pf") > before.pf,
    fouls: stat("pf"),
    forcedTurnover: teamTurnovers(opp) > before.forced,
    oppPoints: (sim.youSide === "home" ? sim.score.away : sim.score.home) - before.points,
  };
}

/** Execution in [-1, 1] from the evidence: a steal is the point of the gamble, a foul is its price (a late foul more so). */
export function defenseExecution(run) {
  if (run.steal) return run.foul ? 0.4 : 1;
  if (run.foul) return run.fouls >= 5 ? -1 : -0.6;
  return run.forcedTurnover ? 0.4 : 0;
}
