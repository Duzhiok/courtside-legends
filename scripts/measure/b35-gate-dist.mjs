/**
 * B35 §16 Part A measurement (READ-ONLY): is the SF self-created 2P deficit
 * a gate-level mix effect?
 *
 * §15.1 found SF self-created 2P faces tighter defence than SG self-created
 * (mean makeP at shot 47.9% vs 51.9%) while received shots are equal. The
 * re-pass gate (sim.js: ~1130) only fires for shotGateLevel <= 0.4: gated
 * players re-pass unless open >= shotOpenThreshold (0.58/0.70), so their
 * self-created shots are selected for openness; high-gate players
 * (threshold 0.30/0.36) shoot through contact. If SF self-created attempts
 * skew toward high-gate shooters while SG's skew toward gated ones, the
 * makeP gap is a mix effect, not a defender-quality effect.
 *
 * Same 120 games as §15.1 (same seed tag `b35sfctx`, so the identical games):
 * gate/threshold are read off the sim's live roster objects (wrapTeam already
 * applied recommended orders + form auto-orders). Buckets are the
 * shotOpenThreshold values, which map 1:1 from shotGateLevel.
 *
 * Usage: node scripts/measure/b35-gate-dist.mjs [gamesPerPair=20]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { shotGateLevel, shotOpenThreshold } from "../../js/engine/gameplan.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 20);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
// Threshold buckets, low (shoot-through) first. Gated = thr 0.58/0.70 (gate <= 0.4).
const BUCKETS = [0.3, 0.36, 0.44, 0.58, 0.7];

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const blank = () => ({
  fga2: 0, fgm2: 0,
  byBucket: new Map(BUCKETS.map((b) => [b, { fga: 0, fgm: 0, mpSum: 0, mpN: 0 }])),
  selfByBucket: new Map(BUCKETS.map((b) => [b, { fga: 0, fgm: 0, mpSum: 0, mpN: 0 }])),
  recvByBucket: new Map(BUCKETS.map((b) => [b, { fga: 0, fgm: 0, mpSum: 0, mpN: 0 }])),
});
const rows = new Map(POSITIONS.map((p) => [p, blank()]));
// Distinct-player roster composition per position x threshold (dedup by id).
const rosterComp = new Map(POSITIONS.map((p) => [p, new Map(BUCKETS.map((b) => [b, new Set()]))]));

let gamesPlayed = 0, eventFga2 = 0, parsedMakeP = 0;

for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? realTeam(a, year) : realTeam(b, year);
    const away = i % 2 ? realTeam(b, year) : realTeam(a, year);
    const posOf = new Map();
    for (const p of [...home.players, ...away.players]) posOf.set(p.id, p.pos);
    let segPassReceiver = null;
    let lastPossession = null;
    const events = [];
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`b35sfctx|${year}|${a}${b}|${i}`)),
      onEvent: (e) => events.push(e),
      onTick: () => {}, onEnd: () => {},
    });
    // Gate/threshold off the live roster (recommended + form auto-orders applied).
    const gateOf = new Map();
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      gateOf.set(p.id, { gate: shotGateLevel(p), thr: shotOpenThreshold(p) });
    }
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      const g = gateOf.get(p.id);
      const pos = posOf.get(p.id);
      if (g && pos && rosterComp.has(pos)) rosterComp.get(pos).get(g.thr)?.add(p.id);
    }
    let steps = 0;
    sim.running = true;
    while (sim.running && steps < 4000) {
      sim.step();
      steps += 1;
      if (sim.paused) sim.setPaused(false);
    }
    gamesPlayed += 1;
    for (const e of events) {
      if (lastPossession !== null && e.possession !== lastPossession) segPassReceiver = null;
      lastPossession = e.possession;
      if (e.meta?.pass?.receiverId) {
        segPassReceiver = e.meta.pass.receiverId;
      } else if (e.type === "reb" && e.meta?.reb) {
        segPassReceiver = null;
      } else if (e.meta?.shot && e.meta.shot.pts === 2) {
        const pos = posOf.get(e.meta.shot.shooterId);
        const r = rows.get(pos);
        const g = gateOf.get(e.meta.shot.shooterId);
        if (!r || !g) { segPassReceiver = null; continue; }
        const made = !!e.meta.shot.made;
        const self = segPassReceiver !== e.meta.shot.shooterId;
        r.fga2 += 1; if (made) r.fgm2 += 1;
        const cell = r.byBucket.get(g.thr);
        cell.fga += 1; if (made) cell.fgm += 1;
        const cell2 = (self ? r.selfByBucket : r.recvByBucket).get(g.thr);
        cell2.fga += 1; if (made) cell2.fgm += 1;
        const m = String(e.text || "").match(/[（(](\d+)%/);
        if (m) {
          const mp = Number(m[1]) / 100;
          cell.mpSum += mp; cell.mpN += 1;
          cell2.mpSum += mp; cell2.mpN += 1;
          parsedMakeP += 1;
        }
        eventFga2 += 1;
        segPassReceiver = null;
      }
    }
  }
}

console.log(`games ${gamesPlayed}, event 2PA ${eventFga2}, makeP parsed ${parsedMakeP}/${eventFga2}`);
console.log("roster composition (distinct players per position x shotOpenThreshold):");
for (const pos of POSITIONS) {
  const comp = rosterComp.get(pos);
  const total = [...comp.values()].reduce((s, set) => s + set.size, 0);
  const line = BUCKETS.map((b) => `thr${b.toFixed(2)}:${comp.get(b).size}`).join("  ");
  console.log(`  ${pos} n=${total}  ${line}`);
}
const fg = (m, a) => (a ? pct(m / a) : "-");
const meanMP = (c) => (c.mpN ? pct(c.mpSum / c.mpN) : "-");
for (const pos of POSITIONS) {
  const r = rows.get(pos);
  if (!r.fga2) continue;
  const share = (x) => `${(100 * x / r.fga2).toFixed(1)}%`;
  console.log(`${pos} n2PA=${r.fga2}  2P% ${fg(r.fgm2, r.fga2)}`);
  for (const b of BUCKETS) {
    const c = r.byBucket.get(b);
    const s = r.selfByBucket.get(b);
    const v = r.recvByBucket.get(b);
    console.log(`  thr ${b.toFixed(2)}: all ${share(c.fga)} ${fg(c.fgm, c.fga)} mp${meanMP(c)} (n=${c.mpN}) | self ${share(s.fga)} ${fg(s.fgm, s.fga)} mp${meanMP(s)} | recv ${share(v.fga)} ${fg(v.fgm, v.fga)} mp${meanMP(v)}`);
  }
  const gatedSelf = (r.selfByBucket.get(0.58).fga + r.selfByBucket.get(0.7).fga);
  const selfTotal = [...r.selfByBucket.values()].reduce((s, c) => s + c.fga, 0);
  const gatedSelfMp = (r.selfByBucket.get(0.58).mpSum + r.selfByBucket.get(0.7).mpSum);
  const gatedSelfMpN = (r.selfByBucket.get(0.58).mpN + r.selfByBucket.get(0.7).mpN);
  const openSelfMp = (r.selfByBucket.get(0.3).mpSum + r.selfByBucket.get(0.36).mpSum + r.selfByBucket.get(0.44).mpSum);
  const openSelfMpN = (r.selfByBucket.get(0.3).mpN + r.selfByBucket.get(0.36).mpN + r.selfByBucket.get(0.44).mpN);
  console.log(`  self-created from gated shooters (thr 0.58/0.70): ${share(gatedSelf)} of self (n=${selfTotal}); mean makeP gated-self ${gatedSelfMpN ? pct(gatedSelfMp / gatedSelfMpN) : "-"} vs open-threshold self ${openSelfMpN ? pct(openSelfMp / openSelfMpN) : "-"}`);
}
