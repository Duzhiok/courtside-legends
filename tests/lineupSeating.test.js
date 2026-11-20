import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { realCards } from "./helpers/realGame.js";
import { seasonToCard, overall } from "../js/data/players.js";
import { seatPlayers, reseatLineup, insideRating, outsideRating } from "../js/engine/lineupSlots.js";
import { nextEmptyPlayPos, resolveStarterPositionCollisions } from "../js/engine/gameplan.js";
import { teamStarters } from "../js/engine/careerEconomy.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const card = (bref, season) => ({ ...realCards(bref).find((c) => c.season === season) });
const seat = (five) => {
  const players = five.map((p) => ({ ...p }));
  seatPlayers(players).forEach((slot, i) => { players[i].playPos = slot; });
  return players;
};
const slotOf = (players, name) => players.find((p) => p.name === name).playPos;

// James Harden (194 cm, strength 36, rebounding 26) was shown at centre because the old seating let the last man pick take the hole.
const NO_BIG_FIVE = () => [card("cheekma01", 1985), card("stockjo01", 1995), card("hardeja01", 2010), card("jacksjo02", 2019), card("ingrabr01", 2018)];

test("a five with no real big man: the player with the best inside game plays centre, never James Harden", () => {
  const seated = seat(NO_BIG_FIVE());
  assert.notEqual(slotOf(seated, "James Harden"), "C");
  assert.notEqual(slotOf(seated, "James Harden"), "PF");
  assert.ok(["PG", "SG", "SF"].includes(slotOf(seated, "James Harden")), "a guard stays at 1-3");
  const atC = seated.find((p) => p.playPos === "C");
  const bestInside = [...seated].sort((a, b) => insideRating(b) - insideRating(a))[0];
  assert.equal(atC.name, bestInside.name, "the forced centre is the best inside player on the floor");
  assert.equal(new Set(seated.map((p) => p.playPos)).size, 5, "every position once");
});

test("the seating does not depend on the order the five are listed in", () => {
  const base = NO_BIG_FIVE();
  const expected = Object.fromEntries(seat(base).map((p) => [p.name, p.playPos]));
  const rng = seededStream(hashSeed("seat-order"));
  for (let n = 0; n < 12; n++) {
    const shuffled = [...base].sort(() => rng() - 0.5);
    const got = Object.fromEntries(seat(shuffled).map((p) => [p.name, p.playPos]));
    assert.deepEqual(got, expected);
  }
});

test("when two guards have to cover the big slots, the one with the inside game takes centre", () => {
  const stocky = { ...card("hardeja01", 2010), name: "Stocky", heightCm: 208, strength: 72, rebound: 78, block: 62, paint: 78 };
  const small = { ...card("hardeja01", 2010), name: "Small" };
  const five = [card("stockjo01", 1995), card("pippesc01", 1996), card("jordami01", 1996), small, stocky];
  assert.ok(insideRating(stocky) > insideRating(small));
  assert.ok(outsideRating(card("stockjo01", 1995)) > 0);
  const seated = seat(five);
  assert.equal(slotOf(seated, "Stocky"), "C");
  assert.notEqual(slotOf(seated, "Small"), "C");
});

test("a real centre is never pushed off centre to make room for a guard", () => {
  const seated = seat([card("stockjo01", 1995), card("jordami01", 1996), card("pippesc01", 1996), card("hardeja01", 2010), card("duncati01", 2003)]);
  assert.equal(slotOf(seated, "Tim Duncan"), "C");
  assert.notEqual(slotOf(seated, "James Harden"), "PF", "the fifth guard-like player is not parked in the big slots when a wing can take PF");
});

test("hand-placed players keep their slot; of two who ask for the same one the first keeps it", () => {
  const five = seat(NO_BIG_FIVE());
  const harden = five.find((p) => p.name === "James Harden");
  harden.playPos = "PG";
  harden.playPosManual = true;
  const again = five.map((p) => ({ ...p }));
  seatPlayers(again).forEach((slot, i) => { again[i].playPos = slot; });
  assert.equal(slotOf(again, "James Harden"), "PG");
  assert.equal(new Set(again.map((p) => p.playPos)).size, 5);
  const dupes = seat(NO_BIG_FIVE()).map((p) => ({ ...p, playPos: "SG", playPosManual: true }));
  const slots = seatPlayers(dupes);
  assert.equal(slots[0], "SG", "the first manual SG keeps it");
  assert.equal(new Set(slots).size, 5, "the rest are still seated one each");
});

test("seatPlayers is pure and also seats fewer than five", () => {
  const five = NO_BIG_FIVE();
  const before = JSON.stringify(five);
  seatPlayers(five);
  assert.equal(JSON.stringify(five), before, "nothing is written to the players");
  const three = seatPlayers(five.slice(0, 3));
  assert.equal(three.length, 3);
  assert.equal(new Set(three).size, 3);
  assert.deepEqual(seatPlayers([]), []);
});

test("stacked starters are re-seated together: untouched players stay, nobody ends up at centre by accident", () => {
  const stockton = { ...card("stockjo01", 1995), playPos: "PG" };
  const jordan = { ...card("jordami01", 1996), playPos: "SG" };
  const harden = { ...card("hardeja01", 2010), playPos: "SG" }; // stacked on Jordan's slot
  const pippen = { ...card("pippesc01", 1996), playPos: "SF" };
  const duncan = { ...card("duncati01", 2003), playPos: "C" };
  const picked = [stockton, jordan, harden, pippen, duncan];
  resolveStarterPositionCollisions(picked);
  assert.equal(new Set(picked.map((p) => p.playPos)).size, 5);
  assert.deepEqual([stockton.playPos, pippen.playPos, duncan.playPos], ["PG", "SF", "C"], "players who were alone in their slot are not touched");
  assert.ok(["SG", "PF"].includes(jordan.playPos) && ["SG", "PF"].includes(harden.playPos));
  assert.equal(harden.playPos === "PF" && jordan.playPos === "PF", false);
});

test("Gold's CPU/auto starting five is seated by the same rule", () => {
  const players = [...NO_BIG_FIVE(), card("duncati01", 2003)];
  // Drop Duncan from the top five on purpose: pick the five by hand so the lineup has no big.
  const team = { players, starterIds: NO_BIG_FIVE().map((p) => p.id) };
  const starters = teamStarters(team);
  assert.equal(starters.length, 5);
  assert.notEqual(starters.find((p) => p.name === "James Harden").playPos, "C");
  assert.equal(new Set(starters.map((p) => p.playPos)).size, 5);
});

test("over thousands of real fives the new seating almost never puts a short player at centre when a tall one is on the floor", () => {
  const rng = seededStream(hashSeed("seat-1"));
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  const pool = rows.filter((r) => r.mpg >= 22 && r.gp >= 40).map(seasonToCard).sort((a, b) => overall(b) - overall(a)).slice(0, 600);
  const greedy = (five) => {
    const seated = [];
    for (const p of [...five].sort((a, b) => overall(b) - overall(a))) {
      const c = { ...p };
      c.playPos = nextEmptyPlayPos(seated, c, null);
      seated.push(c);
    }
    return seated;
  };
  const tally = { old: { avoidable: 0, short: 0 }, now: { avoidable: 0, short: 0 } };
  for (let n = 0; n < 1500; n++) {
    const picked = new Set();
    while (picked.size < 5) picked.add(Math.floor(rng() * pool.length));
    const five = [...picked].map((i) => ({ ...pool[i] }));
    for (const [key, seated] of [["old", greedy(five)], ["now", seat(five)]]) {
      assert.equal(new Set(seated.map((p) => p.playPos)).size, 5, "every position once");
      const atC = seated.find((p) => p.playPos === "C");
      if (atC.heightCm < 200) tally[key].short++;
      if (atC.heightCm < 200 && seated.some((p) => p.heightCm >= 206)) tally[key].avoidable++;
    }
  }
  assert.ok(tally.old.avoidable >= 15, `the old greedy seating really did this (${tally.old.avoidable}x) - the baseline of this test`);
  assert.ok(tally.now.avoidable <= 2, `short player at centre with a 6'10" teammate on the floor: ${tally.now.avoidable}x`);
  assert.ok(tally.now.short < tally.old.short * 0.5, `short players at centre: ${tally.old.short} -> ${tally.now.short}`);
});

test("substitutions re-seat with the same cost: a rested guard coming in for the centre does not stay at centre", () => {
  const five = seat([card("stockjo01", 1995), card("jordami01", 1996), card("pippesc01", 1996), card("rodmade01", 1996), card("duncati01", 2003)]);
  const duncan = five.find((p) => p.name === "Tim Duncan");
  const harden = { ...card("hardeja01", 2010), playPos: duncan.playPos };
  five[five.indexOf(duncan)] = harden; // the guard checks in at the centre's slot
  reseatLineup(five);
  assert.notEqual(five.find((p) => p.name === "James Harden").playPos, "C");
  assert.equal(new Set(five.map((p) => p.playPos)).size, 5);
});
