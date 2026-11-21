// Auto substitutions must not leave a point guard at centre (and a centre at the point).
import test from "node:test";
import assert from "node:assert/strict";
import { positionGap, reseatLineup, compatibleFirst, nearestToSlot } from "../js/engine/lineupSlots.js";
import { positionFitScore } from "../js/data/franchises.js";
import { realTeam } from "./helpers/realGame.js";
import { GameSim } from "../js/engine/sim.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const P = (id, pos, playPos = pos, extra = {}) => ({ id, name: id, pos, playPos, pass: 60, three: 60, strength: 60, iq: 60, ...extra });
const misfitTotal = (five) => five.reduce((n, p) => n + (100 - positionFitScore(p.pos, p.playPos, p)), 0);

test("positionGap: steps along PG-SG-SF-PF-C, tolerant of 'G' / 'F-C' style strings", () => {
  assert.equal(positionGap("PG", "PG"), 0);
  assert.equal(positionGap("PG", "C"), 4);
  assert.equal(positionGap("G", "PG"), 1);
  assert.equal(positionGap("F-C", "C"), 0, "the shared normalizePos reads F-C as C");
});

test("reseatLineup: a centre in the PG slot and a guard in the C slot are put back where they belong", () => {
  const five = [P("rubio", "PG", "C"), P("mutombo", "C", "PG"), P("sg", "SG"), P("sf", "SF"), P("pf", "PF")];
  const before = misfitTotal(five);
  const moved = reseatLineup(five);
  assert.equal(moved.length, 2);
  assert.equal(five[0].playPos, "PG");
  assert.equal(five[1].playPos, "C");
  assert.ok(misfitTotal(five) < before);
  assert.deepEqual(reseatLineup(five), [], "already best: nothing moves (idempotent)");
  assert.equal(new Set(five.map((p) => p.playPos)).size, 5, "one man per slot");
});

test("reseatLineup: a slot the coach set by hand is never taken away; short lineups are left alone", () => {
  const five = [P("a", "PG", "C", { playPosManual: true }), P("b", "C", "PG"), P("c", "SG"), P("d", "SF"), P("e", "PF")];
  reseatLineup(five);
  assert.equal(five[0].playPos, "C", "manual placement kept");
  const three = [P("x", "PG", "C"), P("y", "C", "PG"), P("z", "SG")];
  assert.deepEqual(reseatLineup(three), []);
  assert.equal(three[0].playPos, "C", "3v3 / short-handed sides are untouched");
});

test("comparators: closest position first; a within-one-step man beats a far one", () => {
  const leaver = P("pg", "PG");
  const c = P("c", "C");
  const sg = P("sg", "SG");
  assert.ok(nearestToSlot(leaver)(sg, c) < 0);
  assert.ok(compatibleFirst(leaver)(sg, c) < 0);
  assert.equal(compatibleFirst(leaver)(P("sg", "SG"), P("sg2", "SG")), 0, "equally compatible: no preference");
});

test("real auto-rotated games: few substitutions leave the newcomer 3+ positions from his slot (was ~20%)", () => {
  let subs = 0;
  let far = 0;
  for (const [a, b] of [[["GSW", 2016], ["CLE", 2016]], [["CHI", 1996], ["LAL", 2001]]]) {
    for (let i = 0; i < 6; i++) {
      const sim = new GameSim({ home: realTeam(...a), away: realTeam(...b), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`ls|${a[0]}|${i}`)) });
      sim.setAutoRotation(true);
      const orig = sim.substitute.bind(sim);
      sim.substitute = (outId, inId, side) => {
        const inn = sim.sideByKey(side).bench.find((p) => p.id === inId);
        const ok = orig(outId, inId, side);
        if (ok && inn) {
          subs += 1;
          if (positionGap(inn.pos, inn.playPos) >= 3) far += 1;
        }
        return ok;
      };
      sim.runFast();
    }
  }
  assert.ok(subs > 100, "the games really did substitute");
  assert.ok(far / subs < 0.1, `PG/C style mismatches should be rare: ${far}/${subs}`);
});

test("bestStarters: five centres are not started with the guards on the bench, but an all-big roster just gets its best five", async () => {
  const { bestStarters } = await import("../js/engine/lineupSlots.js");
  const big = (id, ovr, pos = "C") => P(id, pos, pos, { ovr, height: 214, strength: 85, rebound: 85, block: 70, pass: 35, three: 25, speed: 45 });
  const guard = (id, ovr, pos = "PG") => P(id, pos, pos, { ovr, height: 188, strength: 45, rebound: 35, block: 20, pass: 80, three: 78, speed: 82 });
  const rate = (p) => p.ovr;
  const roster = [big("c1", 87), big("c2", 77), big("c3", 76), big("c4", 74, "PF"), big("c5", 76, "PF"), guard("g1", 70), guard("g2", 68, "SG"), guard("g3", 66, "SG")];
  const five = bestStarters(roster, rate).map((p) => p.id);
  assert.ok(five.filter((id) => id.startsWith("g")).length >= 2, `a lineup with guards, got ${five}`);
  assert.ok(five.includes("c1"), "the best player still starts");
  const bigs = roster.filter((p) => p.id.startsWith("c")).concat([big("c6", 60), big("c7", 58)]);
  assert.deepEqual(bestStarters(bigs, rate).map((p) => p.id).sort(), ["c1", "c2", "c3", "c4", "c5"], "no guards to pick: the best five by rating");
});

test("bestStarters: with `keep`, the coach's own picks stay and only the empty place is filled", async () => {
  const { bestStarters } = await import("../js/engine/lineupSlots.js");
  const mk = (id, ovr, pos, h) => P(id, pos, pos, { ovr, height: h, strength: pos === "C" ? 85 : 45, rebound: pos === "C" ? 85 : 35, pass: pos === "C" ? 35 : 80, three: pos === "C" ? 25 : 78 });
  const four = [mk("a", 60, "PG", 188), mk("b", 62, "SG", 192), mk("c", 61, "SF", 200), mk("d", 63, "PF", 206)];
  const rest = [mk("star", 90, "C", 214), mk("bench1", 50, "PG", 185)];
  const five = bestStarters([...four, ...rest], (p) => p.ovr, { keep: four });
  assert.deepEqual(five.slice(0, 4).map((p) => p.id), ["a", "b", "c", "d"], "his four are untouched");
  assert.equal(five[4].id, "star");
});

test("setupStarters: the coach's last five come back as they were; a hurt one is replaced and the other four stay", async () => {
  const { setupStarters } = await import("../js/engine/lineupSlots.js");
  const mk = (id, ovr, pos, extra = {}) => P(id, pos, extra.playPos || pos, { ovr, height: pos === "C" ? 214 : 190, strength: pos === "C" ? 85 : 45, rebound: pos === "C" ? 85 : 35, pass: pos === "C" ? 35 : 80, three: pos === "C" ? 25 : 78, ...extra });
  // a lineup the coach built by hand that "best by rating" would never pick: a 50-rated guard starts over a 90 centre
  const mine = [mk("g1", 50, "PG", { playPos: "PG", playPosManual: true }), mk("g2", 55, "SG"), mk("w", 58, "SF"), mk("f", 60, "PF"), mk("c", 62, "C")];
  const bench = [mk("star1", 90, "C"), mk("star2", 88, "C"), mk("star3", 86, "PF")];
  const roster = [...mine, ...bench];
  const ids = mine.map((p) => p.id);
  const back = setupStarters(ids, roster, (p) => p.ovr);
  assert.deepEqual(back.five.map((p) => p.id).sort(), [...ids].sort(), "same five, not the best ratings");
  assert.equal(back.fresh, false, "his seating is kept, nothing is re-seated");
  const hurt = roster.filter((p) => p.id !== "c"); // his centre is out
  const filled = setupStarters(ids, hurt, (p) => p.ovr);
  assert.deepEqual(filled.five.slice(0, 4).map((p) => p.id), ["g1", "g2", "w", "f"], "the other four stay");
  assert.equal(filled.five.length, 5);
  assert.equal(filled.fresh, true);
  assert.equal(setupStarters(undefined, roster, (p) => p.ovr).fresh, true, "no history: a first pick");
});
