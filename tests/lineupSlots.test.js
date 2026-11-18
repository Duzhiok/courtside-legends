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
