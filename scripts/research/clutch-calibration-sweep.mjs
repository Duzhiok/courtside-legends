// M2b-1 role-aware delivery measurement (R165). Paired fixed seeds, one possession measured per seed.
//   node scripts/research/clutch-calibration-sweep.mjs [seeds=1000]
// Reports per archetype: share of actual shots, attempts per consumed decision, involvement (touched the ball),
// turnover rate, FG% and three-share of the pick's own attempts, and every non-execution reason.
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2]) || 1000;
const R = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const team = (c, s) => R.filter((r) => r.team === c && r.season === s).map(seasonToCard).sort((a, b) => b.scoring + b.three - a.scoring - a.three).slice(0, 10);
const GSW = [team("GSW", 2016), team("CLE", 2016)];
const CHI = [team("CHI", 1996), team("SEA", 1996)];
const UTA = [team("UTA", 1996), team("SEA", 1996)];
const SAS = [team("SAS", 2003), team("LAL", 2003)];
export const CASES = [
  { label: "Curry  (creator)", t: GSW, who: /Stephen Curry/ },
  { label: "Klay   (catch & shoot)", t: GSW, who: /Klay/ },
  { label: "Kukoc  (low appetite)", t: CHI, who: /Kuko/ },
  { label: "Kerr   (spot-up)", t: CHI, who: /Steve Kerr/ },
  { label: "Harper (ordinary role)", t: CHI, who: /Ron Harper/ },
  { label: "Stockton (playmaker)", t: UTA, who: /John Stockton/ },
  { label: "Duncan (post)", t: SAS, who: /Tim Duncan/ },
];

export function runOne(c, hint, decide, seed) {
  const [H, A] = c.t;
  const s = new GameSim({ home: { players: H, name: "H" }, away: { players: A, name: "A" }, youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {} });
  Object.assign(s, { running: true, paused: false, quarter: 4, clock: 12, score: { home: 97, away: 100 }, possession: "home" });
  const x = s.home.onCourt.find((p) => c.who.test(p.name));
  if (!x) return null;
  if (decide) s.submitDecision({ attemptId: s.issueAttemptId(), kind: "clutch_shooter", shooterId: x.id, actionHint: hint });
  const before = new Map(s.home.roster.map((p) => [p.id, p.stats.fga || 0]));
  for (let i = 0; i < 14 && (decide ? !s.clutchLog.length : i < 1); i++) s.step(); // no-decision baseline = the same single possession
  const shooters = s.home.roster.filter((p) => (p.stats.fga || 0) > before.get(p.id)).map((p) => p.id);
  const st = s.home.roster.find((p) => p.id === x.id).stats;
  return { shot: shooters.length > 0, mine: shooters.includes(x.id), o: s.clutchLog[0], fga: st.fga || 0, fgm: st.fgm || 0 };
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "-") + "%";
if (process.argv[1]?.endsWith("clutch-calibration-sweep.mjs")) {
  for (const hint of ["three", "attack"]) {
    console.log(`\n== hint=${hint}  N=${N}`);
    for (const c of CASES) {
      let shots = 0, mine = 0, touched = 0, tov = 0, made = 0, threes = 0, n = 0, role = "?";
      const why = {};
      for (let seed = 1; seed <= N; seed++) {
        const r = runOne(c, hint, true, seed);
        if (!r?.o) continue;
        n++;
        role = r.o.role;
        if (r.shot) shots++;
        if (r.mine) mine++;
        if (r.o.handedOff) touched++;
        if (r.o.reason === "turnover") tov++;
        if (r.o.attempted) { if (r.o.made) made++; if (r.o.zone === "three") threes++; }
        if (r.o.reason) why[r.o.reason] = (why[r.o.reason] || 0) + 1;
      }
      let bm = 0, bs = 0, bFga = 0, bFgm = 0;
      for (let seed = 1; seed <= N; seed++) { const r = runOne(c, hint, false, seed); if (r?.shot) { bs++; if (r.mine) bm++; } if (r) { bFga += r.fga; bFgm += r.fgm; } }
      const reasons = Object.entries(why).map(([k, v]) => `${k} ${pct(v, n)}`).join(", ") || "-";
      console.log(`${c.label.padEnd(26)} [${String(role).padEnd(11)}] share ${pct(mine, shots).padStart(6)} (none ${pct(bm, bs).padStart(6)}) | att/dec ${pct(mine, n).padStart(6)} | touched ${pct(touched, n).padStart(6)} | tov ${pct(tov, n).padStart(6)} | FG ${pct(made, mine).padStart(6)} (none ${pct(bFgm, bFga).padStart(6)}, att/poss ${pct(bm, N).padStart(6)}) 3pt-mix ${pct(threes, mine).padStart(6)} | no-shot: ${reasons}`);
    }
  }
}
