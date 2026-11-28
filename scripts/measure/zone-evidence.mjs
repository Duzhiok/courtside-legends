// Skills M1a: how often does a real player show "self-created makes" in a zone? Sets the awakening thresholds from data.
// Real engine, 8 era matchups, every player with >= 8 minutes (bench, rotation, starter, core; every position), the shot log's
// own counters (shotLog.sa / sm = the shot was not fed by a pass). Prints, per zone: attribute percentiles, and the share of
// player-games that qualify at candidate thresholds, for players who pass the ability gate vs those who do not, by minutes tier.
// Usage: node scripts/measure/zone-evidence.mjs [gamesPerMatchup=20]
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";

const GAMES = Number(process.argv[2]) || 20;
const MATCHUPS = [
  ["CHI", 1996, "SEA", 1996], ["HOU", 1994, "NYK", 1994], ["LAL", 2001, "PHI", 2001], ["SAS", 2003, "NJN", 2003],
  ["GSW", 2016, "CLE", 2016], ["DAL", 2011, "MIA", 2011], ["BOS", 1986, "HOU", 1986], ["LAL", 1987, "BOS", 1987],
];
const TIERS = [["bench", 8, 15], ["rotation", 15, 27], ["starter", 27, 34], ["core", 34, 99]];
const tierOf = (min) => TIERS.find(([, lo, hi]) => min >= lo && min < hi)?.[0] || null;
const rows = [];
for (const [h, hy, a, ay] of MATCHUPS) {
  for (let g = 0; g < GAMES; g++) {
    const sim = new GameSim({ home: realTeam(h, hy), away: realTeam(a, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(g * 53 + hy), onEvent() {}, onTick() {}, onEnd() {} });
    Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, running: true });
    for (let i = 0; sim.running && i < 6000; i++) sim.step();
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      const min = p.stats?.min || 0;
      if (min < 8) continue;
      const log = p.shotLog || {};
      const z = (k) => log[k] || { a: 0, m: 0, sa: 0, sm: 0 };
      rows.push({ min, tier: tierOf(min), pos: p.playPos || p.pos, big: ["C", "PF"].includes(p.playPos || p.pos), attr: { paint: p.paint, mid: p.mid, three: p.three, strength: p.strength, handle: p.handle ?? 0, offDribble: p.offDribble ?? 0 }, zones: { paint: z("paint"), mid: z("mid"), three: z("three") } });
    }
  }
}
const pct = (xs, q) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
console.log(`player-games with >= 8 min: ${rows.length}`);
for (const t of TIERS) console.log(`  ${t[0]}: ${rows.filter((r) => r.tier === t[0]).length}`);
const regular = rows.filter((r) => r.min >= 15);
for (const k of ["paint", "mid", "three", "strength", "handle", "offDribble"]) console.log(`attr ${k}: p50 ${pct(regular.map((r) => r.attr[k] || 0), 0.5)}  p65 ${pct(regular.map((r) => r.attr[k] || 0), 0.65)}  p80 ${pct(regular.map((r) => r.attr[k] || 0), 0.8)}  p90 ${pct(regular.map((r) => r.attr[k] || 0), 0.9)}`);

const per36 = (r, zone, key) => (r.zones[zone][key] / r.min) * 36;
const GATES = {
  paint: [["paint>=p65 (and a big or strength>=p50)", (r, c) => r.attr.paint >= c.paint65 && (r.big || r.attr.strength >= c.strength50)]],
  mid: [["mid>=p65", (r, c) => r.attr.mid >= c.mid65]],
  three: [["three>=p65 and ball skill>=p50", (r, c) => r.attr.three >= c.three65 && Math.max(r.attr.handle, r.attr.offDribble) >= c.skill50]],
};
const c = {
  paint65: pct(regular.map((r) => r.attr.paint), 0.65), mid65: pct(regular.map((r) => r.attr.mid), 0.65), three65: pct(regular.map((r) => r.attr.three), 0.65),
  strength50: pct(regular.map((r) => r.attr.strength), 0.5), skill50: pct(regular.map((r) => Math.max(r.attr.handle, r.attr.offDribble)), 0.5),
};
console.log("gate cutoffs", JSON.stringify(c));
for (const zone of ["paint", "mid", "three"]) {
  const [gname, gate] = GATES[zone][0];
  const gated = rows.filter((r) => gate(r, c));
  console.log(`\n== ${zone}: gate "${gname}" -> ${gated.length}/${rows.length} player-games pass; ${new Set(gated.map((r) => r.tier)).size} tiers`);
  for (const [metric, key] of [["self-created makes per 36", "sm"], ["self-created attempts per 36", "sa"]]) {
    console.log(`  ${metric}: share of player-games at >= N, [gated | not gated], by tier`);
    const ns = key === "sm" ? [1, 1.5, 2, 3, 4] : [2, 3, 4, 6, 8];
    for (const n of ns) {
      const cell = (tier) => {
        const g = gated.filter((r) => r.tier === tier);
        const o = rows.filter((r) => r.tier === tier && !gate(r, c));
        const f = (xs) => (xs.length ? (100 * xs.filter((r) => per36(r, zone, key) >= n).length / xs.length).toFixed(0) + "%" : "-");
        return `${tier} ${f(g)}|${f(o)}`;
      };
      console.log(`    >=${String(n).padEnd(3)} ${TIERS.map((t) => cell(t[0])).join("   ")}`);
    }
  }
}
