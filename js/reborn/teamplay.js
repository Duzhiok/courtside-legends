/**
 * Player Agency PA3 (team basketball), slice 1: a teammate offers a screen, the player accepts or proposes the other
 * way to use it, GameSim runs it, and the real result settles into the relationship ledger exactly once.
 * Spec and audit: docs/implementation/PLAYER-AGENCY-PA3.md.
 *
 * Rules that hold here:
 *  - nothing is said or done that GameSim cannot back: the screener comes from the engine's own pick-and-roll planner
 *    (engine/pnrPlan.js), the only fact a teammate quotes is a real personal-foul count, and the play runs through the
 *    existing PnR levers for exactly one possession (no engine change);
 *  - no dice here except one acceptance roll on its OWN seeded stream (like PA2's gate), never GameSim's;
 *  - the RUN is the source of truth (`reborn.teamplay`, fractional strength); the account's relationship ledger gets an
 *    idempotent integer copy (`mirrorTeammatesToAccount`), the same convention as rivalries, jerseys and honours.
 * Starting numbers, not calibrated.
 */
import { clamp, hashSeed, seededStream } from "../core/seededRandom.js";
import { recommendPnrPlan } from "../engine/pnrPlan.js";
import { addRelationship, adjustRelationship, personById, recordPerson } from "../career/careerRelationships.js";
import { selfPersonId } from "./rivalry.js";

export const TEAMMATE_KIND = "teammate";
export const REL_START = 50;
/** PA3.4: nobody moves more than this with one teammate in one game. */
export const MAX_REL_PER_GAME = 3;
/** PA3.4 table (initial balancing values, not contracts). */
export const REL_DELTA = Object.freeze({ screenScored: 0.5, highLeverageScored: 1.0, turnover: -0.5 });
/**
 * The two PA3 options. They are GRADED like any other option but are never part of the baseline the old options are graded
 * against (the median, the blurred read, PA2's "is there a real opening" gap): adding teammates must not move PA1/PA2.
 */
export const TEAM_OPTIONS = Object.freeze(["screen", "screenAlt", "spot", "feed"]);
export const withoutTeamOptions = (values) => Object.fromEntries(Object.entries(values || {}).filter(([k]) => !TEAM_OPTIONS.includes(k)));

/** No time left to run a pick and roll (the same cut-off agency.js uses for "keep reading"). */
export const MIN_CLOCK_FOR_SCREEN = 8;
/** The two ways to use a screen the engine can execute: the man rolls to the rim, or pops for the jumper. */
export const SCREEN_AFTER = Object.freeze(["roll", "pop"]);

const round1 = (v) => Math.round(v * 10) / 10;
const otherWay = (after) => (after === "pop" ? "roll" : "pop");

// ----------------------------------------------------------------------------------------------- the offer (PA3.1)

/** A real fact a teammate may quote: the opposing big with the most personal fouls, once he has at least three. */
function foulFact(opponentsOnCourt) {
  const bigs = (opponentsOnCourt || []).filter((p) => ["C", "PF"].includes(p.pos));
  const top = [...bigs].sort((a, b) => (b.stats?.pf || 0) - (a.stats?.pf || 0))[0];
  return top && (top.stats?.pf || 0) >= 3 ? { name: top.name, nameEn: top.nameEn || top.name, pf: top.stats.pf } : null;
}

/**
 * The screen a teammate would set for `playerId` right now, or null. Pure, reads the live sim only. The screener and what
 * he does afterwards are the engine planner's own recommendation; `alt` is the other way to use him.
 */
export function screenOffer(sim, playerId) {
  if (!sim || !(sim.clock >= MIN_CLOCK_FOR_SCREEN)) return null;
  const you = sim.youSide === "home" ? sim.home : sim.away;
  const opp = sim.youSide === "home" ? sim.away : sim.home;
  const me = you?.onCourt?.find((p) => p.id === playerId);
  if (!me) return null;
  const plan = recommendPnrPlan(you.onCourt, me);
  const mate = you.onCourt.find((p) => p.id === plan.screenerId);
  if (!mate) return null;
  return {
    kind: "screen",
    teammateId: mate.id,
    personId: mate.bref || mate.id,
    name: mate.name,
    nameEn: mate.nameEn || mate.name,
    pos: mate.pos,
    iq: Number(mate.iq) || 50,
    afterScreen: SCREEN_AFTER.includes(plan.afterScreen) ? plan.afterScreen : "roll",
    alt: otherWay(plan.afterScreen),
    finish: plan.finish,
    fact: foulFact(opp?.onCourt),
  };
}

/**
 * S2: "find me" - stand on the wing and ask for the catch. The teammate asked is the man on the floor most likely to run the
 * offense (best passer); the engine decides who really has the ball. Null when there is no time or nobody to ask.
 */
export function spotOffer(sim, playerId) {
  if (!sim || !(sim.clock >= MIN_CLOCK_FOR_SCREEN)) return null;
  const you = sim.youSide === "home" ? sim.home : sim.away;
  if (!you?.onCourt?.some((p) => p.id === playerId)) return null;
  const mate = [...you.onCourt].filter((p) => p.id !== playerId).sort((a, b) => (Number(b.pass) || 0) - (Number(a.pass) || 0))[0];
  if (!mate) return null;
  return { kind: "spot", teammateId: mate.id, personId: mate.bref || mate.id, name: mate.name, nameEn: mate.nameEn || mate.name, pos: mate.pos, iq: Number(mate.iq) || 50 };
}

// ------------------------------------------------------------------------------------------ the response (PA3.3)

const ROLE_INFLUENCE = Object.freeze({ dnp: 0, garbage: 10, bench: 25, rotation: 40, starter: 60 });
export const roleInfluence = (role) => ROLE_INFLUENCE[role] ?? 25;

/**
 * Will he go along with a request? The owner's sketch: autonomy 30, chemistry 50, opportunity 70, role influence 40 -> 56.5%.
 * Inputs are 0..100 except `iq` (the teammate's, 50 = neutral, worth at most ±10 points). Low autonomy is never a flat
 * refusal and high autonomy is never a flat yes: the result stays inside 5..95%.
 */
export function acceptanceChance({ autonomy = 0, chemistry = REL_START, opportunity = 50, roleInfluence: role = 25, iq = 50 } = {}) {
  const p = 0.075 + 0.25 * (autonomy / 100) + 0.25 * (chemistry / 100) + 0.3 * (opportunity / 100) + 0.2 * (role / 100) + (iq - 50) / 500;
  return Math.round(clamp(p, 0.05, 0.95) * 1000) / 1000;
}

/** One roll per decision on its own stream; the same decision id always gets the same answer. */
export function respondToRequest({ decisionId, chance }) {
  return { accepted: seededStream(hashSeed(`teamplay|${decisionId}`))() < chance, chance };
}

/** 0..100: how good the asked-for action looks next to the other options on the table (the grader's own values). */
export function requestOpportunity(values, choiceId) {
  const v = Object.entries(values || {}).filter(([k]) => k !== "setup").map(([, x]) => x);
  if (v.length < 2 || values?.[choiceId] == null) return 50;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return hi === lo ? 50 : Math.round(clamp(((values[choiceId] - lo) / (hi - lo)) * 100, 0, 100));
}

// ---------------------------------------------------------------------------------------- the execution (PA3.2)

/** Points the possession scored for `you` and whether any of your players turned it over. */
const teamTotals = (team) => (team.roster || team.onCourt || []).reduce((t, p) => t + (p.stats?.tov || 0), 0);

/**
 * Run ONE possession as a pick and roll with the named screener, then put every lever back exactly as it was (same
 * pattern as season.js playChoicePossession). GameSim decides what happens; the points and a turnover are the evidence.
 *
 * Order matters (found with a real sim): `setOffenseFocus(id, { action })` is the engine's own way to give the handler
 * his action - it rebuilds his `orders` itself, so orders set by hand BEFORE it are thrown away and the engine never
 * sees "pnr". It also recomputes the lineup's chemistry around him, so the way back is the same public call.
 */
export function playScreenPossession(sim, { playerId, screenerId, afterScreen, finish = null }) {
  const key = sim.youSide;
  const team = key === "home" ? sim.home : sim.away;
  const me = team.onCourt.find((p) => p.id === playerId);
  const saved = {
    auto: sim.autoOffense,
    focusPlay: sim.focusPlay ? { ...sim.focusPlay } : null,
    offenseFocusId: sim.offenseFocusId,
    orders: me?.orders ? { ...me.orders } : null,
    gameplan: team.gameplan,
  };
  const pointsBefore = sim.score[key];
  const turnoversBefore = teamTotals(team);
  sim.autoOffense = false;
  // A COPY of the gameplan carries the plan, so the original (and its own offenseFocusId) comes back untouched.
  team.gameplan = { ...(team.gameplan || {}), pnr: { screenerId, afterScreen, ...(finish ? { finish } : {}), offBall: {} } };
  sim.setOffenseFocus(playerId, { action: "pnr" });
  sim.requestedBallHandlerId = playerId; // "the ball is mine": pickBallHandler is a weighted draw, a focus only tilts it
  sim.step();
  sim.requestedBallHandlerId = null; // step() consumes it, but a possession that returned early must not leave it armed
  sim.autoOffense = saved.auto;
  sim.focusPlay = saved.focusPlay;
  team.gameplan = saved.gameplan;
  if (me) me.orders = saved.orders || undefined;
  sim.setOffenseFocus(saved.offenseFocusId || null); // restores the focus AND the chemistry / fit computed around him
  return { points: sim.score[key] - pointsBefore, turnover: teamTotals(team) > turnoversBefore };
}

/**
 * S2: run ONE possession with the player asking for the catch (`orders.action = "spot"`: the engine lifts his weight as a
 * receiver and as a three-point shooter and lowers it as a handler), then restore his orders. It is a tilt, not a promise: the
 * evidence is what the sim recorded - his own shot / points, and which teammate's assist count rose (the passer).
 */
export function playSpotPossession(sim, { playerId }) {
  const key = sim.youSide;
  const team = key === "home" ? sim.home : sim.away;
  const me = team.roster.find((p) => p.id === playerId);
  const saved = me?.orders ? { ...me.orders } : null;
  const stat = (p, k) => p.stats?.[k] || 0;
  const before = { pts: sim.score[key], fga: stat(me, "fga"), fgm: stat(me, "fgm"), mine: stat(me, "pts"), tov: teamTotals(team), ast: Object.fromEntries(team.roster.map((p) => [p.id, stat(p, "ast")])) };
  sim.setPlayerOrders(playerId, { action: "spot" });
  sim.step();
  sim.setPlayerOrders(playerId, saved || { action: "auto" });
  const passer = team.roster.find((p) => p.id !== playerId && stat(p, "ast") > before.ast[p.id]);
  return {
    points: sim.score[key] - before.pts,
    shot: stat(me, "fga") > before.fga,
    made: stat(me, "fgm") > before.fgm,
    myPoints: stat(me, "pts") - before.mine,
    turnover: teamTotals(team) > before.tov,
    passer: passer ? { id: passer.id, personId: passer.bref || passer.id, name: passer.name, nameEn: passer.nameEn || passer.name, pos: passer.pos } : null,
  };
}

// ----------------------------------------------------------------------------------------- the evidence (PA3.4)

/**
 * What one executed screen is worth to the relationship, from what really happened. A miss after a good screen is 0
 * (a reasonable play whose shot did not fall); a turnover is not. `critical` = a clutch possession (high leverage).
 */
export function settleScreen({ decisionId, offer, points = 0, turnover = false, critical = false, proposed = false }) {
  const scored = points > 0;
  const delta = turnover ? REL_DELTA.turnover : scored ? (critical ? REL_DELTA.highLeverageScored : REL_DELTA.screenScored) : 0;
  return {
    id: `${decisionId}|screen|${offer.personId}`,
    kind: "screen",
    teammateId: offer.teammateId,
    personId: offer.personId,
    name: offer.name,
    nameEn: offer.nameEn,
    pos: offer.pos,
    afterScreen: proposed ? offer.alt : offer.afterScreen,
    proposed,
    points,
    turnover,
    delta,
    reason: turnover ? "turnover" : scored ? (critical ? "highLeverageScored" : "screenScored") : "missed",
  };
}

/**
 * What a "find me" request was worth, from what the sim recorded. Only a real assisted score moves chemistry (+0.5, +1.0 in a
 * clutch possession), and it moves it with the man who actually passed. Not getting the ball costs nothing: it is the common case.
 */
export function settleSpot({ decisionId, offer, run, critical = false }) {
  const fed = run.made && run.passer;
  const who = fed ? run.passer : offer;
  const reason = fed ? "fed" : run.shot ? "shot" : "ignored";
  return {
    id: `${decisionId}|spot|${who.personId}`,
    kind: "spot",
    teammateId: fed ? run.passer.id : offer.teammateId,
    personId: who.personId,
    name: who.name,
    nameEn: who.nameEn,
    pos: who.pos,
    points: run.myPoints,
    shot: run.shot,
    made: run.made,
    turnover: false,
    delta: fed ? (critical ? REL_DELTA.highLeverageScored : REL_DELTA.screenScored) : 0,
    reason,
  };
}

/**
 * PA3.1: a teammate asked for the ball and you gave it. He asked, so there is no acceptance roll. Only a real score by him moves
 * chemistry (+0.5, +1.0 in a clutch possession); a miss or no touch costs nothing - the read was still fair.
 */
export function settleFeed({ decisionId, offer, run, critical = false }) {
  const reason = run.made ? "scored" : run.shot ? "missed" : "none";
  return {
    id: `${decisionId}|feed|${offer.personId}`,
    kind: "feed",
    teammateId: offer.teammateId,
    personId: offer.personId,
    name: offer.name,
    nameEn: offer.nameEn,
    pos: offer.pos,
    points: run.points,
    shot: run.shot,
    made: run.made,
    turnover: false,
    delta: run.made ? (critical ? REL_DELTA.highLeverageScored : REL_DELTA.screenScored) : 0,
    reason,
  };
}

// ---------------------------------------------------------------------------------------------- the run's ledger

/** `reborn.teamplay = { mates: { [personId]: { name, nameEn, pos, strength, lastGame } } }`; a run without it reads as empty. */
export const teamplayOf = (reborn) => (reborn?.teamplay?.mates ? reborn.teamplay : { mates: {} });
export const teammateStrength = (reborn, personId) => teamplayOf(reborn).mates[personId]?.strength ?? REL_START;

/**
 * Settle a game's evidence into the run, at most once per (game, teammate) and at most ±MAX_REL_PER_GAME per teammate.
 * Pure: returns the new `teamplay` and, for the report, one line per teammate that actually moved.
 */
export function recordTeammateEvidence(reborn, gameId, items) {
  const base = teamplayOf(reborn);
  const mates = { ...base.mates };
  const moved = [];
  const byMate = new Map();
  for (const item of (items || []).filter((i) => i && i.delta)) {
    if (!byMate.has(item.personId)) byMate.set(item.personId, []);
    byMate.get(item.personId).push(item);
  }
  for (const [personId, list] of byMate) {
    const before = mates[personId] || { name: list[0].name, nameEn: list[0].nameEn, pos: list[0].pos, strength: REL_START, lastGame: null };
    if (before.lastGame === gameId) continue; // this game already settled for him
    const delta = round1(clamp(list.reduce((t, i) => t + i.delta, 0), -MAX_REL_PER_GAME, MAX_REL_PER_GAME));
    const strength = round1(clamp(before.strength + delta, 0, 100));
    mates[personId] = { ...before, strength, lastGame: gameId };
    moved.push({ personId, name: before.name, nameEn: before.nameEn, delta: round1(strength - before.strength), strength });
  }
  return { teamplay: { mates }, moved };
}

/**
 * The account's relationship ledger gets an idempotent copy of the run's teammates (integer strength, the ledger's own
 * scale). Calling it again with the same run changes nothing. Mutates `account`; the caller saves it.
 */
export function mirrorTeammatesToAccount(account, reborn) {
  const mates = Object.entries(teamplayOf(reborn).mates);
  if (!account || !mates.length) return account;
  const selfId = selfPersonId(reborn);
  if (!personById(account, selfId)) recordPerson(account, { id: selfId, kind: "player", name: "你", nameEn: "You" });
  for (const [personId, mate] of mates) {
    if (!personById(account, personId)) recordPerson(account, { id: personId, kind: "player", name: mate.name, nameEn: mate.nameEn });
    const rel = addRelationship(account, { aId: selfId, bId: personId, kind: TEAMMATE_KIND, strength: REL_START });
    const gap = Math.round(mate.strength) - rel.strength;
    if (gap) adjustRelationship(account, rel.id, gap, `PA3 ${mate.lastGame || ""}`.trim());
  }
  return account;
}
