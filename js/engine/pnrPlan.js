/**
 * Pick-and-roll roles chosen on the tactics board (docs/implementation/tactics-pnr-roles-design.md).
 *
 * `team.gameplan.pnr = { screenerId, afterScreen, offBall: { [id]: "spot" | "cut" }, finish }` is an ADDITIVE field: no field, or a
 * field the engine cannot use, means "automatic" and the possession plays exactly as it did before this file existed (no extra weights,
 * no random draw). Every function here is pure and draws no random number; sim.js only multiplies the weights it already had.
 *
 * What changes is WHO the existing weights go to. Before, "roll man" meant any C/PF with paint >= 72 and "spacer" meant any shooter.
 * With a plan, the roll weight goes to the man the coach named, and the generic bigs lose it.
 */
import { isFloorShooter, isMidHandler } from "./shooterType.js";
import { pickScreener } from "./grade.js";

export const PNR_AFTER = Object.freeze(["roll", "pop", "slip", "ghost"]);
export const PNR_FINISH = Object.freeze(["mid", "drive", "fake_kick"]);
export const PNR_OFF_BALL = Object.freeze(["spot", "cut"]);

/**
 * The tiers are the ones sim.js already uses (kick-out to a roll man 1.25, a shooter 1.55 / 1.65, a roll finish 1.35, the "pnr" pocket
 * 1.35 for a mid handler); the plan only moves them to a named man. Numbers are to be tuned, the structure is not.
 */
export const PNR_TUNING = Object.freeze({
  rollKick: 1.25, // the named roll man, as the generic "C/PF with paint" tier was
  slipKick: 1.55, // he left early, so he is the more open target
  popShooterKick: 1.3, // on top of the shooter tier he already has
  rollFinish: 1.35,
  slipFinish: 1.5,
  slipOpen: 0.06, // the defender went with the screen: the man who slipped it catches the ball more open (a 'roll window' is +0.04)
  cutFinish: 1.3,
  cutThree: 0.85,
  spotKick: 1.45, // the same tier as an `orders.action: "spot"` man
  spotThree: 1.35,
  finishMid: 1.2,
  finishDrive: 1.2,
  fakeKickChance: 0.12,
  // The weights a plain "pnr" handler already carries (sim.js chooseShot); a ghost screen does not get them.
  baseHandlerPaint: 1.22,
  baseHandlerMid: 1.4,
  genericRollKick: 1.25,
  genericRollFinish: 1.35,
});

const isBig = (p) => ["C", "PF"].includes(p?.playPos || p?.pos);
const oneOf = (list, v) => (list.includes(v) ? v : null);

/** Keep only what the engine understands, field by field. Returns null when nothing is left. */
export function cleanPnrPlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  const offBall = {};
  for (const [id, act] of Object.entries(raw.offBall && typeof raw.offBall === "object" ? raw.offBall : {})) {
    if (PNR_OFF_BALL.includes(act)) offBall[id] = act;
  }
  const plan = {
    screenerId: typeof raw.screenerId === "string" && raw.screenerId ? raw.screenerId : null,
    afterScreen: oneOf(PNR_AFTER, raw.afterScreen),
    offBall,
    finish: oneOf(PNR_FINISH, raw.finish),
  };
  const empty = !plan.screenerId && !plan.afterScreen && !plan.finish && !Object.keys(offBall).length;
  return empty ? null : plan;
}

/**
 * The play for ONE possession, or null when the team has no usable plan (then nothing is changed).
 * `screener` is the named man only when he is on the floor and is not the handler; otherwise sim.js keeps picking the screener itself.
 */
export function resolvePnrPlay(rawPlan, onCourt, handler) {
  const plan = cleanPnrPlan(rawPlan);
  if (!plan || !handler) return null;
  const floor = onCourt || [];
  const screener = plan.screenerId ? floor.find((p) => p.id === plan.screenerId && p.id !== handler.id) || null : null;
  const offBall = {};
  for (const [id, act] of Object.entries(plan.offBall)) if (id !== handler.id && floor.some((p) => p.id === id)) offBall[id] = act;
  const afterScreen = plan.afterScreen;
  return {
    handlerId: handler.id,
    screener,
    screenerId: screener?.id || null,
    afterScreen,
    offBall,
    finish: plan.finish,
    // slip (he leaves before the screen is set) and ghost (no screen at all) are not a screen: no screen credit, no screen bonus.
    realScreen: afterScreen !== "slip" && afterScreen !== "ghost",
    ghost: afterScreen === "ghost",
  };
}

/** The named screener is a screener unless he ghosts (then he is just another man off the ball). */
const isScreener = (p, play) => play.screenerId === p.id && !play.ghost;

/**
 * Multiplier on a teammate's weight in kickToTeammate, relative to what kickToTeammate already gave him for a pnr / drive_kick scheme.
 * `qualifiedRoll` is the generic tier the engine hands every C/PF with paint >= 72; with a named screener that tier is taken back.
 */
export function pnrKickMult(p, play) {
  if (!play) return 1;
  let m = 1;
  const genericRoll = isBig(p) && (p.paint || 0) >= 72;
  const screener = isScreener(p, play);
  const named = !!play.screenerId;
  if (named && genericRoll && !screener) m /= PNR_TUNING.genericRollKick;
  if (screener) {
    if (play.afterScreen === "slip") m *= PNR_TUNING.slipKick / (genericRoll ? PNR_TUNING.genericRollKick : 1);
    else if (play.afterScreen === "pop") {
      if (genericRoll) m /= PNR_TUNING.genericRollKick;
      if (isFloorShooter(p)) m *= PNR_TUNING.popShooterKick;
    } else if (play.afterScreen === "roll" || !play.afterScreen) {
      if (!genericRoll) m *= PNR_TUNING.rollKick;
    }
  }
  const act = play.offBall[p.id];
  if (act) {
    const spotNow = p.orders?.action === "spot";
    if (act === "spot" && !spotNow) m *= PNR_TUNING.spotKick;
    if (act === "cut" && spotNow) m /= PNR_TUNING.spotKick;
  }
  return m;
}

/**
 * Multipliers on a man's own shot weights in chooseShot.
 * kickedOut: he caught the ball from the handler. Otherwise he is the handler finishing it himself.
 * Returns { w3, wMid, wPaint } that sim.js multiplies in AFTER its existing weights; 1 everywhere when the plan says nothing about him.
 */
export function pnrShotMult(p, play, { kickedOut = false } = {}) {
  const out = { w3: 1, wMid: 1, wPaint: 1 };
  if (!play) return out;
  if (!kickedOut) {
    if (p.id !== play.handlerId) return out;
    if (play.ghost) {
      // no screen: he plays it as a plain isolation, not as the "pnr" pocket
      out.wPaint /= PNR_TUNING.baseHandlerPaint;
      out.wMid /= PNR_TUNING.baseHandlerMid;
      out.wMid *= 1.2;
    }
    if (play.finish === "mid") out.wMid *= PNR_TUNING.finishMid;
    else if (play.finish === "drive") out.wPaint *= PNR_TUNING.finishDrive;
    return out;
  }
  const named = !!play.screenerId;
  const genericRoll = isBig(p);
  const screener = isScreener(p, play);
  if (named && genericRoll && !screener) out.wPaint /= PNR_TUNING.genericRollFinish; // he is not the roll man any more
  if (screener) {
    if (play.afterScreen === "slip") out.wPaint *= PNR_TUNING.slipFinish / (genericRoll ? PNR_TUNING.genericRollFinish : 1);
    else if (play.afterScreen === "pop") {
      if (genericRoll) out.wPaint /= PNR_TUNING.genericRollFinish;
    } else if (!genericRoll) out.wPaint *= PNR_TUNING.rollFinish; // roll (or unset)
  }
  const act = play.offBall[p.id];
  if (act === "cut") {
    out.wPaint *= PNR_TUNING.cutFinish;
    out.w3 *= PNR_TUNING.cutThree;
    if (p.orders?.action === "spot") out.w3 /= PNR_TUNING.spotThree;
  } else if (act === "spot" && p.orders?.action !== "spot") out.w3 *= PNR_TUNING.spotThree;
  return out;
}

/** Extra pass appetite for the handler's finish. Part of the existing kickChance, no new roll. */
export function pnrKickChanceBonus(play) {
  if (!play) return { screen: true, extra: 0 };
  return { screen: play.realScreen, extra: play.finish === "fake_kick" ? PNR_TUNING.fakeKickChance : 0 };
}

/** Extra openness for the man who slipped the screen when he catches the kick-out. 0 for everybody else and for every other plan. */
export function pnrOpenBonus(p, play, { kickedOut = false } = {}) {
  return play && kickedOut && play.afterScreen === "slip" && play.screenerId === p?.id ? PNR_TUNING.slipOpen : 0;
}

/**
 * What the board shows as "recommended" for the men on the floor. These are not extra rules: each one is what the engine already does
 * when the plan says nothing (the screener is the man pickScreener picks after the basket; a shooter spaces, anybody else goes in; the
 * default after-screen is the roll), so leaving a choice unset and choosing the recommended value play the same game.
 * `fake_kick` is never recommended: it takes a read of the help that numbers cannot make.
 */
export const recommendedOffBall = (p) => (isFloorShooter(p) ? "spot" : "cut");

export function recommendPnrPlan(floor, handler) {
  const men = (floor || []).filter((p) => p && p.id !== handler?.id);
  const screener = pickScreener(floor, handler, null);
  return {
    screenerId: screener?.id || null,
    afterScreen: screener && isFloorShooter(screener) ? "pop" : "roll",
    offBall: Object.fromEntries(men.filter((p) => p.id !== screener?.id).map((p) => [p.id, recommendedOffBall(p)])),
    finish: handler ? (isMidHandler(handler) ? "mid" : "drive") : null,
  };
}
