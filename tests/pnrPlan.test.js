/**
 * Pick-and-roll roles named on the tactics board (docs/implementation/tactics-pnr-roles-design.md, engine side).
 * Design goals only: the plan moves the pick-and-roll weights the engine already had to the NAMED men; no plan (or a plan the engine cannot
 * use) is exactly today's game; a slipped or ghosted screen is not a screen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PNR_TUNING,
  cleanPnrPlan,
  resolvePnrPlay,
  pnrKickMult,
  pnrShotMult,
  pnrKickChanceBonus,
  pnrOpenBonus,
} from "../js/engine/pnrPlan.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream, hashSeed } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

const man = (id, over = {}) => ({ id, playPos: "SF", paint: 50, three: 40, threeTend: 30, ...over });
const handler = man("h", { playPos: "PG" });
const bigC = man("big", { playPos: "C", paint: 80 }); // the engine's generic "roll man": a C/PF with paint >= 72
const wing = man("wing", { playPos: "SF" });
const gun = man("gun", { playPos: "SG", three: 80, threeTend: 55 }); // a floor shooter
const floor = [handler, bigC, wing, gun, man("x", { playPos: "PF", paint: 60 })];
const play = (plan) => resolvePnrPlay(plan, floor, handler);

test("cleanPnrPlan keeps what the engine understands and drops the rest, field by field", () => {
  assert.equal(cleanPnrPlan(null), null);
  assert.equal(cleanPnrPlan({}), null);
  assert.equal(cleanPnrPlan({ afterScreen: "dance", finish: "moonwalk", offBall: { a: "sleep" } }), null, "nothing usable is left");
  assert.deepEqual(cleanPnrPlan({ screenerId: "big", afterScreen: "dance", finish: "mid", offBall: { a: "spot", b: "sleep" } }), {
    screenerId: "big", afterScreen: null, offBall: { a: "spot" }, finish: "mid",
  });
});

test("the named screener counts only when he is on the floor and is not the handler", () => {
  assert.equal(play({ screenerId: "big", afterScreen: "roll" }).screener.id, "big");
  assert.equal(play({ screenerId: "h", afterScreen: "roll" }).screener, null, "the handler cannot screen for himself");
  assert.equal(play({ screenerId: "bench-guy", afterScreen: "roll" }).screener, null, "off the floor: the engine picks the screener itself");
  assert.equal(play(null), null);
  assert.equal(resolvePnrPlay({ afterScreen: "roll" }, floor, null), null);
  assert.deepEqual(play({ offBall: { gun: "spot", h: "cut", gone: "cut" } }).offBall, { gun: "spot" }, "only men on the floor, never the handler");
});

test("slip and ghost are not a screen; roll, pop and 'unset' are", () => {
  assert.equal(play({ afterScreen: "roll" }).realScreen, true);
  assert.equal(play({ afterScreen: "pop" }).realScreen, true);
  assert.equal(play({ finish: "mid" }).realScreen, true);
  assert.equal(play({ afterScreen: "slip" }).realScreen, false);
  assert.equal(play({ afterScreen: "ghost" }).realScreen, false);
  assert.equal(play({ afterScreen: "ghost" }).ghost, true);
});

test("kick-out weight goes to the NAMED roll man, and the generic big loses the tier he had by attribute", () => {
  const p = play({ screenerId: "wing", afterScreen: "roll" });
  assert.equal(pnrKickMult(wing, p), PNR_TUNING.rollKick, "a wing the coach named becomes the roll man");
  assert.ok(Math.abs(pnrKickMult(bigC, p) - 1 / PNR_TUNING.genericRollKick) < 1e-9, "the C who used to get it by position no longer does");
  const own = play({ screenerId: "big", afterScreen: "roll" });
  assert.equal(pnrKickMult(bigC, own), 1, "naming the big who already qualified changes nothing for him");
  assert.equal(pnrKickMult(bigC, play({ afterScreen: "roll" })), 1, "no named screener: the engine's old by-attribute rule stays");
  assert.equal(pnrKickMult(bigC, null), 1);
});

test("pop gives the weight to a shooter-screener only; slip makes the slipper the more open target; a ghost screener is nobody", () => {
  const pop = play({ screenerId: "gun", afterScreen: "pop" });
  assert.equal(pnrKickMult(gun, pop), PNR_TUNING.popShooterKick);
  assert.ok(pnrKickMult(bigC, pop) < 1, "and the roll tier is taken off the generic big");
  const slip = play({ screenerId: "wing", afterScreen: "slip" });
  assert.equal(pnrKickMult(wing, slip), PNR_TUNING.slipKick);
  const slipBig = play({ screenerId: "big", afterScreen: "slip" });
  assert.ok(Math.abs(pnrKickMult(bigC, slipBig) - PNR_TUNING.slipKick / PNR_TUNING.genericRollKick) < 1e-9, "the generic tier is not stacked on top");
  const ghost = play({ screenerId: "big", afterScreen: "ghost" });
  assert.equal(pnrKickMult(bigC, ghost, { genericRollApplied: false }), 1, "B85: a ghost screen never gave the generic big the roll tier, so there is nothing to take back");
  assert.ok(Math.abs(pnrKickMult(bigC, ghost) - 1 / PNR_TUNING.genericRollKick) < 1e-9, "default (tier applied): the take-back still happens for a real screen");
});

test("off-ball roles replace a standing 'spot' order instead of stacking on it", () => {
  const spotter = man("s", { orders: { action: "spot" } });
  const mate = man("m");
  const f = [handler, spotter, mate];
  const cutPlay = resolvePnrPlay({ offBall: { s: "cut", m: "spot" } }, f, handler);
  assert.ok(Math.abs(pnrKickMult(spotter, cutPlay) - 1 / PNR_TUNING.spotKick) < 1e-9, "told to cut: the spot order's kick tier is taken back");
  assert.equal(pnrKickMult(mate, cutPlay), PNR_TUNING.spotKick, "told to spot with no standing order: he gets the tier");
  assert.equal(pnrKickMult(spotter, resolvePnrPlay({ offBall: { s: "spot" } }, f, handler)), 1, "told to spot while already ordered to: not twice");
});

test("shot weights: the handler's finish, a ghost screen, and who is the roll man after the kick-out", () => {
  assert.deepEqual(pnrShotMult(handler, null), { w3: 1, wMid: 1, wPaint: 1 });
  assert.equal(pnrShotMult(handler, play({ finish: "mid" })).wMid, PNR_TUNING.finishMid);
  assert.equal(pnrShotMult(handler, play({ finish: "drive" })).wPaint, PNR_TUNING.finishDrive);
  assert.deepEqual(pnrShotMult(handler, play({ finish: "fake_kick" })), { w3: 1, wMid: 1, wPaint: 1 }, "faking is a pass appetite, not a shot weight");
  assert.deepEqual(pnrShotMult(wing, play({ finish: "mid" })), { w3: 1, wMid: 1, wPaint: 1 }, "only the handler finishes");
  const g = pnrShotMult(handler, play({ afterScreen: "ghost" }));
  assert.ok(g.wPaint < 1 && g.wMid > 0 && Math.abs(g.wPaint * PNR_TUNING.baseHandlerPaint - 1) < 1e-9, "the 'pnr' paint weight is taken back: nobody set a screen");
  const kicked = { kickedOut: true };
  const p = play({ screenerId: "wing", afterScreen: "roll" });
  assert.equal(pnrShotMult(wing, p, kicked).wPaint, PNR_TUNING.rollFinish);
  assert.ok(pnrShotMult(bigC, p, kicked).wPaint < 1, "the big who is not the named roll man loses the roll-finish tier");
  const ghostBig = play({ screenerId: "big", afterScreen: "ghost" });
  assert.equal(pnrShotMult(bigC, ghostBig, { kickedOut: true, genericRollApplied: false }).wPaint, 1, "B85: a ghost screen never gave the kicked-out big the roll-finish tier, so there is nothing to take back");
  assert.ok(Math.abs(pnrShotMult(bigC, ghostBig, { kickedOut: true }).wPaint - 1 / PNR_TUNING.genericRollFinish) < 1e-9, "default (tier applied): the take-back still happens for a real screen");
  const cut = resolvePnrPlay({ offBall: { wing: "cut" } }, floor, handler);
  assert.equal(pnrShotMult(wing, cut, kicked).wPaint, PNR_TUNING.cutFinish);
  assert.equal(pnrShotMult(wing, cut, kicked).w3, PNR_TUNING.cutThree);
});

test("pass appetite and openness: a slipped or ghosted screen gets no screen bonus; fake_kick passes more; only the slipper is more open", () => {
  assert.deepEqual(pnrKickChanceBonus(null), { screen: true, extra: 0 });
  assert.equal(pnrKickChanceBonus(play({ afterScreen: "slip" })).screen, false);
  assert.equal(pnrKickChanceBonus(play({ afterScreen: "ghost" })).screen, false);
  assert.equal(pnrKickChanceBonus(play({ finish: "fake_kick" })).extra, PNR_TUNING.fakeKickChance);
  const slip = play({ screenerId: "wing", afterScreen: "slip" });
  assert.equal(pnrOpenBonus(wing, slip, { kickedOut: true }), PNR_TUNING.slipOpen);
  assert.equal(pnrOpenBonus(wing, slip, { kickedOut: false }), 0, "he has to have caught the kick-out");
  assert.equal(pnrOpenBonus(bigC, slip, { kickedOut: true }), 0, "nobody else");
  assert.equal(pnrOpenBonus(wing, play({ screenerId: "wing", afterScreen: "roll" }), { kickedOut: true }), 0);
});

// ---- the real engine ------------------------------------------------------------------------------------------------------------------

/** One real game, every Bull on the "pnr" action, only team.gameplan.pnr differs. Returns the final score, the box scores and the kick count. */
function game(i, pnr) {
  const home = realTeam("CHI", 1996);
  for (const p of home.players) p.orders = { ...(p.orders || {}), action: "pnr" };
  if (pnr) home.gameplan = { ...(home.gameplan || {}), pnr: { screenerId: "longllu01-1996-chi", ...pnr } };
  let kicks = 0;
  const sim = new GameSim({
    home, away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`pnrplan|${i}`)),
    onEvent: (e) => { if (e.meta?.pass && e.meta.pass.kind === "kick") kicks += 1; },
    onTick() {}, onEnd() {},
  });
  sim.running = true; // step the game: runFast is quiet and emits no events
  for (let steps = 0; sim.running && steps < 2000; steps += 1) {
    sim.step();
    if (sim.paused) sim.setPaused(false);
  }
  const box = [...sim.home.roster, ...sim.away.roster].map((p) => `${p.id}:${p.stats.pts}/${p.stats.fga}/${p.stats.ast}`).join(",");
  return { score: `${sim.score.home}-${sim.score.away}`, box, kicks };
}

test("a plan the engine cannot use is exactly today's game (same scores, same box scores, same random draws)", () => {
  for (let i = 0; i < 3; i += 1) {
    const base = game(i, null);
    assert.deepEqual(game(i, { afterScreen: "dance", finish: "moonwalk", offBall: { nobody: "spot" } }), base, `seed ${i}: junk values`);
    assert.deepEqual(game(i, { screenerId: "not-on-the-team" }), base, `seed ${i}: a screener who is not there`);
  }
});

test("a real plan changes the game, and the same plan gives the same game twice", () => {
  const a = game(0, { finish: "fake_kick" });
  assert.deepEqual(game(0, { finish: "fake_kick" }), a, "deterministic");
  assert.notEqual(a.box, game(0, null).box, "and it is not a no-op");
});

test("every after-screen choice is wired into the game (each one plays differently from no plan and from the others)", () => {
  const boxes = Object.fromEntries(["roll", "pop", "slip", "ghost"].map((afterScreen) => [afterScreen, game(1, { afterScreen }).box]));
  const none = game(1, null).box;
  assert.notEqual(boxes.slip, none, "slip");
  assert.notEqual(boxes.ghost, none, "ghost");
  assert.notEqual(boxes.slip, boxes.ghost, "slip is not ghost");
});
