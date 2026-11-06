// M2b-1 measurement: does a player's clutch decision change what GameSim does, without cheating?
//
//   node scripts/research/clutch-m2b1-measure.mjs [seeds=1500]
//
// Paired fixed-seed experiment, identical initial conditions per seed, one possession measured then the game
// is finished with the same stream so win rate is comparable:
//   A  no decision, no script shortcut        -> how often the pick X shoots by default
//   B  no decision, existing late-game script -> how often the script's own shooter S shoots (reference)
//   C  player decision "X takes it"           -> the thing under test
// (A and B are the same engine path: B simply reports S instead of X.)
//
// Denominators (spelled out because they matter):
//   attempt share       = shooter's attempts / possessions in which the team actually took a shot
//   involvement rate    = possessions where the shooter ended with the ball (shot or turnover) / all measured
//   Possessions eaten before the ball is played (tactical fouls) are re-run, not counted.
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2]) || 1500;
const teamOf = (code, season) =>
  ROWS.filter((r) => r.team === code && r.season === season)
    .map(seasonToCard)
    .sort((a, b) => b.scoring + b.three - a.scoring - a.three)
    .slice(0, 10);
const HOME = teamOf("GSW", 2016);
const AWAY = teamOf("CLE", 2016);

const SCENARIOS = [
  { name: "down 3, 12s left (script wants a three)", clock: 12, score: { home: 97, away: 100 }, hint: "three", prefer: "three" },
  { name: "down 2, 30s left (script chases, no three needed)", clock: 30, score: { home: 98, away: 100 }, hint: "attack", prefer: "paint" },
];

function build(seed, sc) {
  const sim = new GameSim({
    home: { players: HOME, name: "GSW" }, away: { players: AWAY, name: "CLE" },
    youSide: "home", injuries: false, speed: 3, rng: seededStream(seed),
    onEvent() {}, onTick() {}, onEnd() {},
  });
  sim.running = true;
  sim.paused = false;
  sim.quarter = 4;
  sim.clock = sc.clock;
  sim.score = { ...sc.score };
  sim.possession = "home";
  return sim;
}

const sum = (team, key) => team.roster.reduce((n, p) => n + (p.stats[key] || 0), 0);

/** One measured possession (+ rest of game). `decideFor` = player id to submit, or null. */
function trial(seed, sc, decideFor, watchId) {
  const sim = build(seed, sc);
  let outcome = null;
  if (decideFor) {
    const id = sim.issueAttemptId();
    const r = sim.submitDecision({ attemptId: id, kind: "clutch_shooter", shooterId: decideFor, actionHint: sc.hint });
    if (!r.accepted) return { rejected: r.reason };
  }
  const snap = () => Object.fromEntries(sim.home.roster.map((p) => [p.id, { fga: p.stats.fga, fgm: p.stats.fgm, tov: p.stats.tov, tpa: p.stats.tpa }]));
  const team = () => ({ tF: sum(sim.home, "fga"), tT: sum(sim.home, "tov"), t3: sum(sim.home, "tpa"), tM: sum(sim.home, "fgm") });
  const pre = snap(), preT = team();
  let guard = 0;
  while (guard++ < 6) {
    sim.step();
    if (sum(sim.home, "fga") > preT.tF || sum(sim.home, "tov") > preT.tT) break;
  }
  // watchId "script" = whoever the late-game script handed the ball to on this seed
  const id = watchId === "script" ? sim.home.temp?.lateChase?.shooterId : watchId;
  const post = snap();
  const before = { ...pre[id], ...preT }, after = { ...post[id], ...team() };
  if (decideFor) outcome = sim.clutchLog[0] || null;
  const score = sim.runFast().score;
  return { before, after, outcome, win: score.home > score.away };
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "n/a").toString().padStart(5) + "%";

function group(sc, label, decideFor, watchId) {
  let possessions = 0, teamShots = 0, shooterShots = 0, shooterMakes = 0, involved = 0, threes = 0, tovs = 0, teamMakes = 0, wins = 0, measured = 0;
  const reasons = {};
  for (let seed = 1; seed <= N; seed++) {
    const t = trial(seed, sc, decideFor, watchId);
    if (t.rejected) { reasons[t.rejected] = (reasons[t.rejected] || 0) + 1; continue; }
    measured++;
    const dF = t.after.tF - t.before.tF, dT = t.after.tT - t.before.tT;
    if (dF > 0 || dT > 0) possessions++;
    if (dF > 0) { teamShots++; if (t.after.fga > t.before.fga) shooterShots++; threes += t.after.t3 > t.before.t3 ? 1 : 0; teamMakes += t.after.tM > t.before.tM ? 1 : 0; }
    if (dT > 0) tovs++;
    if (t.after.fga > t.before.fga || t.after.tov > t.before.tov) involved++;
    shooterMakes += t.after.fgm - t.before.fgm;
    if (t.win) wins++;
    if (t.outcome?.reason) reasons[t.outcome.reason] = (reasons[t.outcome.reason] || 0) + 1;
  }
  const rs = Object.entries(reasons).map(([k, v]) => `${k}:${v}`).join(" ") || "-";
  console.log(
    `${label.padEnd(30)} share ${pct(shooterShots, teamShots)}  involved ${pct(involved, measured)}  three-att ${pct(threes, teamShots)}  ` +
    `shooter FG ${pct(shooterMakes, shooterShots)}  team FG ${pct(teamMakes, teamShots)}  tov ${pct(tovs, possessions)}  win ${pct(wins, measured)}  [${rs}]`,
  );
  return { share: shooterShots / Math.max(1, teamShots) };
}

for (const sc of SCENARIOS) {
  // who is who: probe once -- S = the script's shooter, X = best other on-court by the scenario's preference
  const probe = build(1, sc);
  probe.step();
  const S = probe.home.temp?.lateChase?.shooterId;
  const onCourt = probe.home.onCourt.filter((p) => p.id !== S);
  const X = onCourt.sort((a, b) => (b[sc.prefer] || 0) - (a[sc.prefer] || 0))[0];
  const Sp = probe.home.roster.find((p) => p.id === S);
  console.log(`\n== ${sc.name}  (${N} seeds)\n   S (script shooter on seed 1) = ${Sp?.name} (varies by seed);  X (player's pick) = ${X.name}`);
  group(sc, "A  default, watching X", null, X.id);
  group(sc, "B  script, watching its pick", null, "script");
  group(sc, `C  decision -> X (${sc.hint})`, X.id, X.id);
}
