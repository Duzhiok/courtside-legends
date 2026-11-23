import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, calcMakeProb } from "../js/engine/sim.js";
import { seededStream, hashSeed } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import { isMidHandler } from "../js/engine/shooterType.js";
import {
  COVERAGE_TUNING, coverageOf, coverageCtx, screenKeep, coverageOpen, coverageMake, bigMismatchMult, blockMult,
} from "../js/engine/defenseCoverage.js";

const PNR = { scheme: "pnr" };
const real = (extra = {}) => coverageCtx({ scheme: "pnr", ...extra });

test("only switch_all and zone_drop are coverages; everything else is the identity", () => {
  assert.equal(coverageOf("switch_all"), "switch");
  assert.equal(coverageOf({ id: "zone_drop" }), "drop");
  for (const id of ["balanced", "pack_paint", "grind", "smallball", undefined, null]) {
    assert.equal(coverageOf(id), null);
    assert.equal(screenKeep(null, real()), 1);
    assert.equal(coverageOpen(null, real(), { zone: "mid" }), 0);
    assert.equal(coverageMake(null, real(), { zone: "paint" }), 0);
    assert.equal(bigMismatchMult(null, real()), 1);
    assert.equal(blockMult(null, real(), "paint"), 1);
  }
});

test("coverageCtx: an automatic screen is real, a slip and a ghost are not", () => {
  assert.equal(coverageCtx(PNR).screenReal, true);
  assert.equal(coverageCtx({ ...PNR, pnr: { realScreen: true } }).screenReal, true);
  assert.equal(coverageCtx({ ...PNR, pnr: { realScreen: false, afterScreen: "slip" } }).screenReal, false);
  assert.equal(coverageCtx({ scheme: null, pnr: { realScreen: false, ghost: true } }).ghost, true);
  assert.deepEqual(coverageCtx(null), { scheme: null, kickedOut: false, screenReal: true, ghost: false });
});

test("a switch cancels what a screen creates, and only a real screen: a slip or a ghost keeps its bonuses", () => {
  assert.equal(screenKeep("switch", real()), COVERAGE_TUNING.switchScreenKeep);
  assert.equal(screenKeep("switch", real({ pnr: { realScreen: false } })), 1, "a slip never relied on the screen");
  assert.equal(screenKeep("switch", coverageCtx({ scheme: "iso" })), 1, "no screen, nothing to cancel");
  assert.equal(screenKeep("switch", coverageCtx({ scheme: "drive_kick" })), 1);
  assert.equal(screenKeep("drop", real()), 1, "a drop does not cancel the screen, it concedes a shot");
});

test("a ghost against a switch is the one place it earns something; against anything else it earns nothing from the coverage", () => {
  const ghost = coverageCtx({ scheme: null, pnr: { realScreen: false, ghost: true } });
  assert.equal(coverageOpen("switch", ghost, { zone: "mid" }), COVERAGE_TUNING.switchGhostOpen);
  assert.equal(coverageOpen("drop", ghost, { zone: "mid" }), 0);
  assert.equal(coverageOpen("switch", real(), { zone: "mid" }), 0, "a real screen against a switch gets less, not a gift");
});

test("a drop gives up the pull-up and the kick-out three, protects the rim, and is silent against an isolation", () => {
  assert.equal(coverageOpen("drop", real(), { zone: "mid" }), COVERAGE_TUNING.dropMidOpen);
  assert.equal(coverageOpen("drop", real({ kickedOut: true }), { zone: "mid" }), 0, "the pull-up, not the pass");
  assert.equal(coverageOpen("drop", real({ kickedOut: true }), { zone: "three" }), COVERAGE_TUNING.dropKickThreeOpen);
  assert.equal(coverageOpen("drop", real(), { zone: "three" }), 0, "a self-created three is not conceded");
  assert.equal(coverageMake("drop", real(), { zone: "paint" }), -COVERAGE_TUNING.dropPaintMake);
  assert.equal(blockMult("drop", real(), "paint"), COVERAGE_TUNING.dropBlockMult);
  assert.equal(blockMult("drop", real(), "three"), 1);
  const iso = coverageCtx({ scheme: "iso" });
  assert.equal(coverageOpen("drop", iso, { zone: "mid" }), 0);
  assert.equal(coverageMake("drop", iso, { zone: "paint" }), 0);
  assert.equal(blockMult("drop", iso, "paint"), 1);
});

test("a switch mismatches the bodies: bigs on jump shooters, guards on the roll man", () => {
  assert.equal(bigMismatchMult("switch", real()), COVERAGE_TUNING.switchBigOnGuard);
  assert.equal(bigMismatchMult("switch", coverageCtx({ scheme: "iso" })), 1);
  const roll = { ...real({ kickedOut: true }) };
  const big = { pos: "C" }, guard = { pos: "PG" };
  assert.equal(coverageMake("switch", roll, { zone: "paint", baller: big, defender: guard }), COVERAGE_TUNING.switchGuardOnBigPaint);
  assert.equal(coverageMake("switch", roll, { zone: "paint", baller: big, defender: big }), 0);
  assert.equal(coverageMake("switch", roll, { zone: "paint", baller: guard, defender: guard }), 0);
});

// ---- the engine side: the same possession, only the defending tactic (and what the coverage is told) changes ----

function fixture() {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed("cov")) });
  const off = sim.home, def = sim.away;
  // not Jordan: a 100 mid pins every make probability at the 0.52 ceiling and nothing can show
  const baller = [...off.onCourt, ...off.bench].find((p) => isMidHandler(p) && p.mid < 90);
  assert.ok(baller, "the fixture needs a pull-up handler");
  const defender = def.onCourt[0];
  const makeP = (tactic, cov, shot, gameCtx = {}) => {
    def.tactic = { ...def.tactic, ...tactic };
    return calcMakeProb(baller, shot, 0.5, off, def, defender, null, null, { scheme: cov?.scheme ?? null, kickedOut: !!cov?.kickedOut, cov, ...gameCtx });
  };
  return { makeP, baller };
}
const TAC = { balanced: { id: "balanced" }, switch: { id: "switch_all" }, drop: { id: "zone_drop" }, pack: { id: "pack_paint", packPaint: true } };
const MID = { zone: "mid", pts: 2 };

test("engine: every defense but the two coverages scores a pick and roll possession exactly as before (the coverage context is ignored)", () => {
  const { makeP } = fixture();
  for (const key of ["balanced", "pack"]) {
    assert.equal(makeP(TAC[key], real(), MID), makeP(TAC[key], undefined, { ...MID }, { scheme: "pnr" }), key);
  }
});

test("engine: against a switch the pull-up after a REAL screen is worth less than after a slip, which never needed the screen", () => {
  const { makeP } = fixture();
  const realScreen = makeP(TAC.switch, real(), MID);
  const slipped = makeP(TAC.switch, real({ pnr: { realScreen: false, afterScreen: "slip" } }), MID);
  assert.ok(realScreen < slipped - 0.02, `real ${realScreen} vs slip ${slipped}`);
});

test("engine: a drop protects the rim on a pick and roll but leaves an isolation alone", () => {
  const { makeP, baller } = fixture();
  const paint = { zone: "paint", pts: 2 };
  const pnrKick = real({ kickedOut: true });
  const iso = coverageCtx({ scheme: "iso" });
  const dropPnr = makeP(TAC.drop, pnrKick, paint), noCov = makeP(TAC.drop, undefined, paint, { scheme: "pnr", kickedOut: true });
  assert.ok(dropPnr < noCov, `drop ${dropPnr} vs same defense told nothing ${noCov}`);
  assert.equal(makeP(TAC.drop, iso, paint), makeP(TAC.drop, undefined, paint, { scheme: "iso" }), `${baller.name}: no change against an isolation`);
});
