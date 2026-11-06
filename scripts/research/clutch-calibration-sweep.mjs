// M2b-1 calibration sweep (R164): selected-shooter share across shooter types, paired fixed seeds.
//   node scripts/research/clutch-calibration-sweep.mjs [seeds=1500]
// Reports BOTH share-of-actual-shots and attempts-per-consumed-decision, plus every non-shot outcome.
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim, CLUTCH_DECISION_TUNING as T } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";
const N = Number(process.argv[2]) || 1500;
const R = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const team = (c, s) => R.filter((r) => r.team === c && r.season === s).map(seasonToCard).sort((a, b) => b.scoring + b.three - a.scoring - a.three).slice(0, 10);
const CASES = [
  { label: "Klay (GSW16 v CLE16, shooter)", H: team("GSW", 2016), A: team("CLE", 2016), who: /Klay/ },
  { label: "Kukoc (CHI96 v SEA96, role)", H: team("CHI", 1996), A: team("SEA", 1996), who: /Kuko/ },
  { label: "Kerr (CHI96 v SEA96, spot-up)", H: team("CHI", 1996), A: team("SEA", 1996), who: /Kerr/ },
];
const run = (c, hint, decide, seed) => {
  const s = new GameSim({ home: { players: c.H, name: "H" }, away: { players: c.A, name: "A" }, youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {} });
  Object.assign(s, { running: true, paused: false, quarter: 4, clock: 12, score: { home: 97, away: 100 }, possession: "home" });
  const x = s.home.onCourt.find((p) => c.who.test(p.name));
  if (decide) s.submitDecision({ attemptId: s.issueAttemptId(), kind: "clutch_shooter", shooterId: x.id, actionHint: hint });
  const fga = new Map(s.home.roster.map((p) => [p.id, p.stats.fga || 0]));
  for (let i = 0; i < 14 && (decide ? !s.clutchLog.length : i < 4); i++) s.step();
  const shooters = s.home.roster.filter((p) => (p.stats.fga || 0) > fga.get(p.id)).map((p) => p.id);
  return { shot: shooters.length > 0, mine: shooters.includes(x.id), o: s.clutchLog[0] };
};
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "—") + "%";
for (const cfg of [{ handoff: 0.78, keepBall: false }, { handoff: 0.5, keepBall: true }, { handoff: 0.3, keepBall: true }, { handoff: 0, keepBall: true }]) {
  Object.assign(T, cfg);
  console.log(`\n== handoff=${cfg.handoff} keepBall=${cfg.keepBall}`);
  for (const c of CASES) for (const hint of ["three", "attack"]) {
    let shots = 0, mine = 0, tov = 0, foul = 0, none = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = run(c, hint, true, seed);
      if (r.shot) { shots++; if (r.mine) mine++; } else if (r.o?.reason === "turnover") tov++; else if (r.o?.reason === "foul") foul++; else none++;
    }
    const base = (() => { let m = 0, sh = 0; for (let seed = 1; seed <= N; seed++) { const r = run(c, hint, false, seed); if (r.shot) { sh++; if (r.mine) m++; } } return pct(m, sh); })();
    console.log(`${c.label.padEnd(32)} ${hint.padEnd(6)} share-of-shots ${pct(mine, shots).padStart(6)} (no-decision ${base.padStart(6)}) | attempts/decision ${pct(mine, N).padStart(6)} | other-shooter ${pct(shots - mine, N).padStart(6)} tov ${pct(tov, N).padStart(6)} foul ${pct(foul, N).padStart(6)} no-shot-other ${pct(none, N).padStart(6)}`);
  }
}
