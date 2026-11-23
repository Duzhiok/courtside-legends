/**
 * B35 §16 comparison (READ-ONLY): position 2P% gaps + selection lift for
 * baseline (b35-fixedset-postb76.json) vs uniform-openness ablation U1
 * (b35-fixedset-abl16-U1.json), on the shared player intersection.
 * Real 2P% from real fg/tp/fga/tpa. Probe-expected 2P% from fixed-open
 * probe makeP + chooseShot shares (same probe in both runs — calcMakeProb
 * itself is not ablated, only the possession-flow call sites are).
 *
 * Usage: node scripts/measure/b35-compare-fixedset.mjs <base.json> <abl.json>
 */
import { readFileSync } from "node:fs";

const [basePath, ablPath] = process.argv.slice(2);
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const base = load(basePath);
const abl = load(ablPath);
const byKey = (d) => new Map(d.players.map((p) => [p.key, p]));
const bMap = byKey(base);
const aMap = byKey(abl);
const keys = [...bMap.keys()].filter((k) => aMap.has(k));
console.log(`intersection ${keys.length} players (base ${base.players.length}, abl ${abl.players.length})`);

const exp2pFixed = (p) => {
  const pr = p.probe;
  const w2 = pr.share.paint + pr.share.mid;
  return (pr.share.paint * pr.mp.paintFixed + pr.share.mid * pr.mp.midFixed) / w2;
};
const sim2p = (p) => p.sim.fgm2 / p.sim.fga2;

const POS = ["PG", "SG", "SF", "PF", "C"];
const agg = (list) => {
  let fga2 = 0, fgm2 = 0, rfga2 = 0, rfgm2 = 0, expW = 0, expSum = 0;
  for (const p of list) {
    fga2 += p.sim.fga2; fgm2 += p.sim.fgm2;
    const r = p.real;
    rfga2 += r.fga - r.tpa; rfgm2 += r.fg * r.fga - r.tp * r.tpa;
    expW += p.sim.fga2; expSum += exp2pFixed(p) * p.sim.fga2;
  }
  return { sim: fgm2 / fga2, real: rfgm2 / rfga2, exp: expSum / expW, n: list.length };
};
const pct1 = (x) => `${(100 * x).toFixed(1)}%`;
const gap = (x) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}pt`;
console.log("pos | base sim2P real2P gap | abl sim2P real2P gap | base lift (sim-exp) | abl lift | probe-exp");
for (const pos of POS) {
  const bl = keys.map((k) => bMap.get(k)).filter((p) => p.pos === pos);
  const al = keys.map((k) => aMap.get(k)).filter((p) => p.pos === pos);
  const B = agg(bl), A = agg(al);
  console.log(`${pos} n=${B.n} | ${pct1(B.sim)} ${pct1(B.real)} ${gap(B.sim - B.real)} | ${pct1(A.sim)} ${pct1(A.real)} ${gap(A.sim - A.real)} | ${gap(B.sim - B.exp)} | ${gap(A.sim - A.exp)} | ${pct1(B.exp)}`);
}
const allB = agg(keys.map((k) => bMap.get(k)));
const allA = agg(keys.map((k) => aMap.get(k)));
console.log(`ALL | ${pct1(allB.sim)} ${pct1(allB.real)} ${gap(allB.sim - allB.real)} | ${pct1(allA.sim)} ${pct1(allA.real)} ${gap(allA.sim - allA.real)} | ${gap(allB.sim - allB.exp)} | ${gap(allA.sim - allA.exp)} | ${pct1(allB.exp)}`);
// Probe identity check: probe values must be unchanged by the ablation.
let maxDiff = 0;
for (const k of keys) {
  const a = bMap.get(k).probe.mp, b = aMap.get(k).probe.mp;
  for (const z of ["paint", "mid", "three"]) maxDiff = Math.max(maxDiff, Math.abs(a[z] - b[z]), Math.abs(a[z + "Fixed"] - b[z + "Fixed"]));
}
console.log(`probe max |diff| base vs abl: ${maxDiff.toFixed(6)} (0 = probe untouched by ablation)`);
// Per-player realised-vs-expected lift for the alpha stars.
for (const name of ["Michael Jordan", "Kobe Bryant", "LeBron James", "Shaquille O'Neal", "Jonathan Kuminga"]) {
  const row = keys.map((k) => bMap.get(k)).filter((p) => p.name === name);
  for (const p of row) {
    const q = aMap.get(p.key);
    console.log(`${name} ${p.pos} ${p.year}: base sim2P ${pct1(sim2p(p))} exp ${pct1(exp2pFixed(p))} lift ${gap(sim2p(p) - exp2pFixed(p))} | abl sim2P ${pct1(sim2p(q))} lift ${gap(sim2p(q) - exp2pFixed(q))}`);
  }
}
