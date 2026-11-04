/**
 * B23 measurement (READ-ONLY): how much does each duplicated tactic bonus in sim.js actually move games?
 *
 * Nothing in the repo is modified. For every duplicate source listed in docs/implementation/tactics-audit.md §4
 * we build a throw-away copy of sim.js with ONLY that source removed, replay the same seeded games through
 * both copies, and report the difference with its standard error. The temp files are deleted on exit.
 *
 * Usage:  node scripts/sim/b23-stacking-baseline.mjs [gamesPerCell=1500] [seedBase=1]
 *
 * Reading the output: "Δ" is variant minus baseline for the team that runs the tactic. A change is only called
 * a SIGNAL when |Δ| > 3 x its standard error (about 120 comparisons are made, so a 2 x SE line would flag ~6
 * pure-noise cells; 3 x SE flags ~0.3). Anything smaller is noise at this sample size and must not be quoted. Seeds are shared across copies, but once a removed bonus changes one roll the random
 * stream diverges, so games are NOT perfectly paired: the standard error assumes independent games (conservative).
 */
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { seasonToCard } from "../../js/data/players.js";
import { seededStream } from "../../js/core/seededRandom.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "../../js/engine");
const SIM_SRC = readFileSync(join(ENGINE, "sim.js"), "utf8");
const ROWS = JSON.parse(readFileSync(join(HERE, "../../js/data/roster.json"), "utf8")).players;

const GAMES = Number(process.argv[2]) || 1500;
const SEED = Number(process.argv[3]) || 1;

// ---- the four duplicate sources (audit §4), each patched out on its own -------------------------------------
const PATCHES = {
  // 1. offensive-rebound rate: data orbBoost AND a hard-coded +0.025 for the same two tactics
  ORB_ID: ['off.tactic?.id === "second_chance" ? 0.025 : 0;', 'off.tactic?.id === "second_chance" ? 0 : 0;'],
  // 2. paint weight: second_chance has paintBias 1.35 AND an id branch x1.12 (crash_boards only has the id branch)
  // anchored on the crash/second_chance `if` line: `wPaint *= 1.12` also appears once elsewhere (unrelated)
  PAINT_ID: ['=== "second_chance") {\n    wPaint *= 1.12;\n', '=== "second_chance") {\n'],
  // 3. threes pushed down twice: threeRate in the data AND a paintBias>1 branch that cuts w3 again
  PB_THREE: ["    w3 *= Math.max(0.55, 1.15 - paintBias * 0.25);\n", "\n"],
  // 4. twin_towers: threeRate 0.78 in the data AND an id branch w3 x0.82
  TT_THREE: ["    w3 *= 0.82;\n", "\n"],
};
const VARIANTS = { BASE: [], ...Object.fromEntries(Object.keys(PATCHES).map((k) => [k, [k]])), ALL: Object.keys(PATCHES) };

// which variants are meaningful for which tactic (a patch that can't touch the tactic would measure only noise)
const APPLIES = {
  crash_boards: ["ORB_ID", "PAINT_ID", "ALL"],
  second_chance: ["ORB_ID", "PAINT_ID", "PB_THREE", "ALL"],
  paint_attack: ["PB_THREE"], // only one source applies, so "ALL" would just repeat this row
  twin_towers: ["TT_THREE"],
};

const written = [];
function cleanup() {
  for (const f of written) if (existsSync(f)) rmSync(f);
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function loadSim(name) {
  if (name === "BASE") return (await import("../../js/engine/sim.js")).GameSim;
  let src = SIM_SRC;
  for (const key of VARIANTS[name]) {
    const [from, to] = PATCHES[key];
    const count = src.split(from).length - 1;
    if (count !== 1) throw new Error(`patch ${key}: expected exactly 1 match in sim.js, found ${count} — sim.js changed, update the patch`);
    src = src.replace(from, to);
  }
  const file = join(ENGINE, `_b23_variant_${name}.mjs`);
  writeFileSync(file, src);
  written.push(file);
  return (await import(pathToFileURL(file).href)).GameSim;
}

// ---- rosters (same real cards the packPaint test uses) ------------------------------------------------------
const card = (bref, season) => {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row ${bref}:${season}`);
  return seasonToCard(row);
};
const team = (list) => list.map(([b, s]) => card(b, s));
const ROSTERS = {
  CENTERS: team([["duncati01", 2003], ["robinda01", 1995], ["townska01", 2019], ["goberru01", 2019], ["parketo01", 2013]]),
  MIX: team([["paulch01", 2012], ["wadedw01", 2009], ["leonaka01", 2014], ["garneke01", 2005], ["olajuha01", 1990]]),
};
const OPPONENT = team([["duncati01", 2003], ["garneke01", 2004], ["leonaka01", 2016], ["wadedw01", 2009], ["paytoga01", 1996]]);
const coach = (t) => ({ id: `t-${t}`, name: "T", specialTactics: [t], preferred: [], buffs: {} });

function play(GameSim, tactic, roster, i) {
  const real = Math.random;
  Math.random = seededStream(SEED + i);
  try {
    const sim = new GameSim({
      home: { players: OPPONENT, starterIds: OPPONENT.map((p) => p.id), coach: coach("balanced") },
      away: { players: roster, starterIds: roster.map((p) => p.id), coach: coach(tactic) },
      youSide: "home", injuries: false, speed: 3, onEvent() {}, onTick() {}, onEnd() {},
    });
    const snap = sim.runFast();
    const sum = (side, k) => [...snap[side].onCourt, ...snap[side].bench].reduce((a, p) => a + (p.stats?.[k] || 0), 0);
    return { margin: snap.score.away - snap.score.home, pts: snap.score.away, oreb: sum("away", "oreb"), fga: sum("away", "fga"), tpa: sum("away", "tpa") };
  } finally {
    Math.random = real;
  }
}

const stat = (xs) => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return { m, se: Math.sqrt(v / n) };
};
function cell(GameSim, tactic, roster) {
  const games = Array.from({ length: GAMES }, (_, i) => play(GameSim, tactic, roster, i));
  const col = (k) => stat(games.map((g) => g[k]));
  return { margin: col("margin"), pts: col("pts"), oreb: col("oreb"), fga: col("fga"), tpaShare: stat(games.map((g) => g.tpa / g.fga)) };
}

const Z = 3; // see header: ~120 comparisons => 3 standard errors, not 2
const f = (x, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
const delta = (a, b) => {
  const d = b.m - a.m, se = Math.hypot(a.se, b.se);
  return { d, se, signal: Math.abs(d) > Z * se };
};

// determinism guard: the same seeds must replay identically, otherwise nothing below means anything
{
  const G = await loadSim("BASE");
  const a = play(G, "crash_boards", ROSTERS.CENTERS, 3), b = play(G, "crash_boards", ROSTERS.CENTERS, 3);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("NOT deterministic: same seed, different game");
}

const sims = {};
for (const name of Object.keys(VARIANTS)) sims[name] = await loadSim(name);

console.log(`# B23 stacking measurement — ${GAMES} games per cell, seed base ${SEED}\n`);
console.log("Team under test = away, runs the tactic; opponent = fixed balanced five. Δ = variant − baseline (tactic side).\n");
console.log("| tactic | roster | removed source | Δ margin (pts) | Δ team pts | Δ ORB | Δ FGA | Δ 3PA share (pts of 100) | verdict |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [tactic, variants] of Object.entries(APPLIES)) {
  for (const [rname, roster] of Object.entries(ROSTERS)) {
    const base = cell(sims.BASE, tactic, roster);
    for (const v of variants) {
      const c = cell(sims[v], tactic, roster);
      const dm = delta(base.margin, c.margin), dp = delta(base.pts, c.pts), dor = delta(base.oreb, c.oreb), dfa = delta(base.fga, c.fga);
      const d3 = delta(base.tpaShare, c.tpaShare);
      const mark = (x, d = 2, scale = 1) => `${f(x.d * scale, d)}${x.signal ? "*" : ""} (±${(x.se * Z * scale).toFixed(d)})`;
      const any = dm.signal || dp.signal || dor.signal || dfa.signal || d3.signal;
      console.log(`| ${tactic} | ${rname} | ${v} | ${mark(dm)} | ${mark(dp)} | ${mark(dor)} | ${mark(dfa)} | ${mark(d3, 1, 100)} | ${any ? "SIGNAL" : "noise"} |`);
    }
  }
}
console.log("\n`*` = |Δ| > 3×SE (real at this sample size). (±x) = 3×SE band. 'noise' rows must not be quoted as effects.");
