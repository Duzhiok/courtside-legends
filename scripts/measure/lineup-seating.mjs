// Old vs new seating of a starting five, on real player cards drawn like a Gold draft (mixed eras).
// Old = the greedy loop (best OVR picks first, the last man takes the hole that is left); new = lineupSlots.seatPlayers.
// Usage: node scripts/measure/lineup-seating.mjs [lineups=4000] [seed=seat-1]
import { readFileSync } from "node:fs";
import { seasonToCard, overall } from "../../js/data/players.js";
import { nextEmptyPlayPos } from "../../js/engine/gameplan.js";
import { seatPlayers } from "../../js/engine/lineupSlots.js";
import { normalizePos } from "../../js/data/positions.js";
import { positionFitScore } from "../../js/data/franchises.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2]) || 4000;
const rng = seededStream(hashSeed(process.argv[3] || "seat-1"));
const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const pool = ROWS.filter((r) => r.mpg >= 22 && r.gp >= 40).map(seasonToCard).sort((a, b) => overall(b) - overall(a)).slice(0, 1500);
const pick5 = () => { const s = new Set(); while (s.size < 5) s.add(Math.floor(rng() * pool.length)); return [...s].map((i) => ({ ...pool[i] })); };

function oldSeating(five) {
  const seated = [];
  for (const p of [...five].sort((a, b) => overall(b) - overall(a))) {
    const c = { ...p };
    c.playPos = nextEmptyPlayPos(seated, c, null);
    seated.push(c);
  }
  return seated;
}
function newSeating(five) {
  const c = five.map((p) => ({ ...p }));
  seatPlayers(c).forEach((slot, i) => { c[i].playPos = slot; });
  return c;
}
const guard = (p) => ["PG", "SG"].includes(normalizePos(p.pos));
const bigSlot = (p) => ["PF", "C"].includes(p.playPos);
const fit = (p) => positionFitScore(normalizePos(p.pos), p.playPos, p);
function stats(seatings) {
  let guardAtC = 0, under200AtC = 0, shortAtCWithTall = 0, guardAtBig = 0, lineupsNoBig = 0, disasters = 0, offPosition = 0, worst = 0;
  for (const five of seatings) {
    const bigs = five.filter((p) => ["PF", "C"].includes(normalizePos(p.pos))).length;
    if (bigs === 0) lineupsNoBig++;
    guardAtC += five.filter((p) => guard(p) && p.playPos === "C").length;
    const atC = five.find((p) => p.playPos === "C");
    if (atC && atC.heightCm < 200) under200AtC++;
    if (atC && atC.heightCm < 200 && five.some((p) => p.heightCm >= 206)) shortAtCWithTall++; // avoidable: a real big was on the floor
    guardAtBig += five.filter((p) => guard(p) && bigSlot(p)).length;
    disasters += five.filter((p) => fit(p) < 45).length; // a fit this low is a player the engine itself calls a mismatch
    offPosition += five.filter((p) => normalizePos(p.pos) !== p.playPos).length;
    worst += Math.max(...five.map((p) => 100 - fit(p)));
  }
  return { guardAtC, under200AtC, shortAtCWithTall, guardAtBig, lineupsNoBig, disasters, playersOffNaturalPos: offPosition, avgWorstMisfit: +(worst / seatings.length).toFixed(1) };
}
const fives = Array.from({ length: N }, pick5);
const before = stats(fives.map(oldSeating));
const after = stats(fives.map(newSeating));
console.log(`${N} random fives of real cards`);
console.log("old greedy :", before);
console.log("new optimal:", after);
