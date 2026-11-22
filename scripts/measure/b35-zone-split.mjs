/**
 * B35 §13 analysis: read the --fixed-set dump from b35-make-by-zone.mjs and
 * split the PG/SF realised 2P% deficit by zone at formula level (probe makeP)
 * and by live selection (share-weighted expected 2P% vs realised 2P%).
 *
 * Realised paint-vs-mid make% cannot be read from the event stream: meta.shot
 * carries only shooterId/made/pts, no zone (sim.js:1393/1442), and blocked
 * shots carry no meta.shot at all. Real zone splits do not exist either:
 * paintFg/midFg are synthetic splits of overall fg (players.js:123-125).
 * So the split is done at formula level (probe, same openness sampling for
 * every position, so cross-position gaps are meaningful) plus the
 * share-weighted expectation, which isolates live-selection effects.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const d = JSON.parse(readFileSync(file, "utf8"));
const players = d.players.filter((p) => p.sim.fga >= 20 && (p.sim.min || 0) > 0);

const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = players.filter((p) => p.pos === pos);
  if (!g.length) continue;
  const fga2 = sum(g, (p) => p.sim.fga2);
  const fgm2 = sum(g, (p) => p.sim.fgm2);
  const fga3 = sum(g, (p) => p.sim.fga3);
  const fgm3 = sum(g, (p) => p.sim.fgm3);
  const real2 = sum(g, (p) => (p.real.fg * p.real.fga - p.real.tp * p.real.tpa)) / sum(g, (p) => p.real.fga - p.real.tpa);
  const real3 = sum(g, (p) => p.real.tp * p.real.tpa) / sum(g, (p) => p.real.tpa);
  // Probe means (open-spread) and fixed-open sensitivity.
  const mp = (z) => sum(g, (p) => p.probe.mp[z]) / g.length;
  const share = (z) => sum(g, (p) => p.probe.share[z]) / g.length;
  // Share-weighted expected 2P% from probe makeP (paint+mid only, renormalised).
  const exp2 = (mp("paint") * share("paint") + mp("mid") * share("mid")) / (share("paint") + share("mid"));
  const exp2Fixed = (mp("paintFixed") * share("paint") + mp("midFixed") * share("mid")) / (share("paint") + share("mid"));
  const cs = sum(g, (p) => p.catchShoot) / g.length;
  const od = sum(g, (p) => p.offDribble) / g.length;
  console.log(`${pos} n=${g.length}`);
  console.log(`  realised 2P% ${pct(fgm2 / fga2)} (real ${pct(real2)}, gap ${((fgm2 / fga2 - real2) * 100).toFixed(1)}pt)  3P% ${pct(fgm3 / fga3)} (real ${pct(real3)}, gap ${((fgm3 / fga3 - real3) * 100).toFixed(1)}pt)`);
  console.log(`  probe makeP paint ${pct(mp("paint"))} / mid ${pct(mp("mid"))} / three ${pct(mp("three"))}  (fixed-open 0.55: paint ${pct(mp("paintFixed"))} / mid ${pct(mp("midFixed"))} / three ${pct(mp("threeFixed"))})`);
  console.log(`  chooseShot shares paint ${pct(share("paint"))} / mid ${pct(share("mid"))} / three ${pct(share("three"))}`);
  console.log(`  expected 2P% from probe+shares ${pct(exp2)} (fixed-open ${pct(exp2Fixed)}) vs realised ${pct(fgm2 / fga2)} — live-selection gap ${((fgm2 / fga2 - exp2) * 100).toFixed(1)}pt`);
  console.log(`  mean catchShoot ${cs.toFixed(0)} / offDribble ${od.toFixed(0)}`);
}
