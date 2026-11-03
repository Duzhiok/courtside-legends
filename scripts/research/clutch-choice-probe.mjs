// Research probe (2.0 milestone M2 baseline): in a real Q4 final-possession state,
// does a coach's "THIS player takes the three" choice actually get honored by GameSim?
//
//   node scripts/research/clutch-choice-probe.mjs [trials]
//
// Plays exactly one possession per trial (2016 GSW vs 2016 CLE, down 1, 10s left,
// home ball) and reports who took the first jump shot. "no-jumper" = the possession
// ended without a jumper event (turnover, foul trip, paint finish, block) -- paint
// shots carry no meta.shot today, so they show up there, not as a shooter.
//
// Baseline on 8bd0fee (1500 trials): picking Iguodala made him the shooter ~4% of the
// time vs ~5% with no pick at all; the late-game script hands the ball to Curry
// (~43%). Even in Q2 with no late scripts, the pick stayed at ~4%. M2 must move the
// "picked" share well above baseline WITHOUT guaranteeing a shot or a make.
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2]) || 1500;

const teamOf = (code, season) =>
  ROWS.filter((r) => r.team === code && r.season === season)
    .map(seasonToCard)
    .sort((a, b) => b.scoring + b.three - a.scoring - a.three)
    .slice(0, 10);

const home = teamOf("GSW", 2016);
const away = teamOf("CLE", 2016);
const pick = home.find((p) => /Iguodala/.test(p.name));

function onePossession(decide, quarter) {
  const shots = [];
  const sim = new GameSim({
    home: { players: home, name: "GSW" },
    away: { players: away, name: "CLE" },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent: (e) => { if (e.meta?.shot) shots.push(e.meta.shot); },
    onTick() {},
    onEnd() {},
  });
  // NOT _quiet: quiet mode swallows emit(), and with it every meta.shot.
  sim.running = true;
  sim.paused = false;
  sim.quarter = quarter;
  sim.clock = 10;
  sim.score = { home: 99, away: 100 };
  sim.possession = "home";
  if (decide && !sim.home.onCourt.some((p) => p.id === pick.id)) throw new Error("picked player is not on court");
  decide?.(sim);
  sim.step();
  return { first: shots[0] || null, pts: sim.score.home - 99, clockUsed: 10 - sim.clock };
}

const pickThree = (sim) => { sim.setOffenseFocus(pick.id); sim.setFocusPlay("pace_three"); };
const configs = [
  ["Q4, no pick (late scripts decide)", null, 4],
  ["Q4, pick Iguodala + pace_three", pickThree, 4],
  ["Q2, no pick (no late scripts)", null, 2],
  ["Q2, pick Iguodala + pace_three", pickThree, 2],
];

console.log(`picked: ${pick.name} (three ${pick.three}); ${N} trials per row\n`);
for (const [label, decide, quarter] of configs) {
  const by = {};
  let picked = 0, threes = 0, threeMakes = 0, noJumper = 0, pts = 0, overrun = 0;
  for (let i = 0; i < N; i++) {
    const r = onePossession(decide, quarter);
    pts += r.pts;
    if (r.clockUsed > 10) overrun++;
    if (!r.first) { noJumper++; continue; }
    const name = home.find((p) => p.id === r.first.shooterId)?.name || "?";
    by[name] = (by[name] || 0) + 1;
    if (r.first.shooterId === pick.id) picked++;
    if (r.first.pts === 3) { threes++; if (r.first.made) threeMakes++; }
  }
  const pct = (x) => `${((100 * x) / N).toFixed(0)}%`;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${pct(c)}`).join(", ");
  console.log(`${label}`);
  console.log(`  picked shoots ${pct(picked)} | P(3PA) ${pct(threes)} | P(make|3PA) ${threes ? pct((threeMakes * N) / threes) : "-"} | no-jumper ${pct(noJumper)} | pts/poss ${(pts / N).toFixed(2)} | clock overrun ${overrun}`);
  console.log(`  top shooters: ${top}\n`);
}
