/**
 * B35 measurement (READ-ONLY): do simulated per-game numbers look like the real ones on the cards?
 *
 * Plays whole historical regular seasons with the real engine under a fixed seed, then compares every
 * player's simulated per-game line with the real line stored in roster.json for that same season.
 * Nothing in the repo is modified.
 *
 * Usage:  node scripts/sim/b35-season-stats.mjs [years=1995,1991] [seeds=1] [json=out.json]
 *
 * "Δ" is simulated minus real. A player counts as an outlier when the sim is more than 35% off the real
 * value (and at least 3 units off for pts/reb/ast so tiny numbers don't dominate).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seasonToCard, overall, PLAYERS } from "../../js/data/players.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simUserNextGame, computeAwards } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROWS = JSON.parse(readFileSync(join(HERE, "../../js/data/roster.json"), "utf8")).players;
// The app builds this index when it loads the roster (players.js); without it every unknown player is age 26
// and the whole run measures a league that does not exist. (First draft of this script forgot it.)
buildCareerSpanIndex(ROWS);
const YEARS = (process.argv[2] || "1995,1991").split(",").map(Number);
const SEEDS = (process.argv[3] || "1").split(",").map(Number);
const JSON_OUT = process.argv[4] || null;

const pg = (s, k) => (s.gp ? s[k] / s.gp : 0);
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; }
function pearson(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "-");

function realLines(year) {
  const byId = new Map();
  for (const row of ROWS) {
    if (row.season !== year) continue;
    const card = seasonToCard(row);
    byId.set(card.id, { name: row.name, gp: row.gp, mpg: row.mpg, ppg: row.ppg, rpg: row.rpg, apg: row.apg, age: row.age ?? null });
  }
  return byId;
}

// The app fills PLAYERS when it loads the roster; in Node it starts empty, and building a league from an empty pool
// never finishes. (Second thing the first draft got wrong -- it hung for 14 minutes before I looked.)
function installYear(year) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
}

function playSeason(year, seed) {
  installYear(year);
  const real = Math.random;
  Math.random = seededStream(seed * 1000 + year);
  try {
    const hist = historicalSeason(year);
    const teamMeta = hist.teams[0];
    const userTeam = buildCpuTeamForYear(year, teamMeta, new Set());
    const st = createSeason({ userTeamId: teamMeta.id, userTeamName: teamMeta.name, userTeam, mode: "historical", year, seed });
    let guard = 0;
    while (guard++ < 200 && simUserNextGame(st)) { /* the user's team is just another team here */ }
    return st;
  } finally {
    Math.random = real;
  }
}

const report = { years: {} };
for (const year of YEARS) {
  const realById = realLines(year);
  const agg = new Map(); // playerId -> accumulated sim lines across seeds
  const awardsSeen = [];
  let t0 = Date.now();
  for (const seed of SEEDS) {
    const st = playSeason(year, seed);
    for (const row of Object.values(st.playerSeason)) {
      const a = agg.get(row.playerId) || { name: row.name, team: row.teamId, ovr: row.ovr, age: row.age ?? null, seasons: [] };
      a.seasons.push({ gp: row.stats.gp, min: pg(row.stats, "min"), pts: pg(row.stats, "pts"), reb: pg(row.stats, "reb"), ast: pg(row.stats, "ast") });
      agg.set(row.playerId, a);
    }
    const aw = computeAwards(st);
    awardsSeen.push({ seed, roy: aw.roy?.name ?? null, scoring: aw.scoringChamp ? `${aw.scoringChamp.name} ${aw.scoringChamp.ppg}` : null, reb: aw.rebChamp ? `${aw.rebChamp.name} ${aw.rebChamp.rpg}` : null });
  }
  const rows = [];
  for (const [id, a] of agg) {
    const real = realById.get(id);
    if (!real || real.gp < 40) continue;
    const mean = (k) => a.seasons.reduce((s, x) => s + x[k], 0) / a.seasons.length;
    const gp = mean("gp");
    if (gp < 40) continue;
    const card = PLAYERS.find((c) => c.id === id);
    rows.push({ id, card, name: a.name, team: a.team, ovr: a.ovr, gp, sim: { min: mean("min"), pts: mean("pts"), reb: mean("reb"), ast: mean("ast") }, real });
  }
  const out = (k, realK) => rows.filter((r) => {
    const s = r.sim[k], t = r.real[realK];
    return Math.abs(s - t) >= (k === "min" ? 6 : 3) && Math.abs(s - t) / Math.max(t, 1) > 0.35;
  });
  const stats = {};
  for (const [k, rk] of [["pts", "ppg"], ["reb", "rpg"], ["ast", "apg"], ["min", "mpg"]]) {
    const deltas = rows.map((r) => r.sim[k] - r.real[rk]);
    const o = out(k, rk);
    stats[k] = { n: rows.length, medianDelta: median(deltas), meanDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length, outliers: o.length, pct: (100 * o.length) / rows.length };
  }
  const sp = {
    pts: spearman(rows.map((r) => r.sim.pts), rows.map((r) => r.real.ppg)),
    min: spearman(rows.map((r) => r.sim.min), rows.map((r) => r.real.mpg)),
    pts36: spearman(rows.map((r) => r.sim.pts / Math.max(r.sim.min, 1)), rows.map((r) => r.real.ppg / Math.max(r.real.mpg, 1))),
  };
  const dispersion = { sim: sd(rows.map((r) => r.sim.pts)), real: sd(rows.map((r) => r.real.ppg)) };
  const starved = rows.filter((r) => r.real.ppg >= 15 && r.sim.pts < 0.5 * r.real.ppg);
  const inflated = rows.filter((r) => r.sim.pts >= 15 && r.sim.pts > 1.5 * r.real.ppg);
  // where does a starved scorer go wrong: minutes, or shots per minute?
  const starvedMinOk = starved.filter((r) => r.sim.min >= 0.75 * r.real.mpg).length;
  const fmt = (r) => `${r.name} (${r.team}, OVR ${r.ovr}) sim ${f1(r.sim.pts)} pts in ${f1(r.sim.min)} min vs real ${f1(r.real.ppg)} in ${f1(r.real.mpg)}`;
  // what drives shot allocation? rank-correlate pts-per-minute with card fields, for the sim and for the real numbers
  const attrKeys = ["scoring", "three", "mid", "paint", "pass", "iq", "speed", "strength", "defense", "rebound"];
  const valid = rows.filter((r) => r.card);
  const drivers = {};
  const cardVal = (r, k) => (k === "overall" ? overall(r.card) : k.startsWith("int.") ? r.card.intangibles?.[k.slice(4)] : r.card[k]);
  const intKeys = Object.keys(valid[0]?.card?.intangibles || {}).map((k) => "int." + k);
  for (const k of ["overall", ...attrKeys, ...intKeys]) {
    const v = valid.map((r) => Number(cardVal(r, k)));
    if (v.some((x) => !Number.isFinite(x))) continue;
    drivers[k] = {
      sim: spearman(v, valid.map((r) => r.sim.pts / Math.max(r.sim.min, 1))),
      real: spearman(v, valid.map((r) => r.real.ppg / Math.max(r.real.mpg, 1))),
    };
  }
  // concentration: scoring share of a team's top scorer, sim vs real (ppg-weighted share of the sum of rotation ppg)
  const topShare = (get) => {
    const byTeam = new Map();
    for (const r of rows) byTeam.set(r.team, [...(byTeam.get(r.team) || []), get(r)]);
    const shares = [...byTeam.values()].filter((v) => v.length >= 5).map((v) => Math.max(...v) / v.reduce((a, b) => a + b, 0));
    return shares.reduce((a, b) => a + b, 0) / shares.length;
  };
  const top = (get, n = 8) => [...rows].sort((a, b) => get(b) - get(a)).slice(0, n).map((r) => `${r.name} ${f1(get(r))}`);
  const worst = (k, rk, n = 8) => out(k, rk).sort((a, b) => Math.abs(b.sim[k] - b.real[rk]) - Math.abs(a.sim[k] - a.real[rk])).slice(0, n)
    .map((r) => `${r.name} (${r.team}, OVR ${r.ovr}) sim ${f1(r.sim[k])} vs real ${f1(r.real[rk])}`);
  const ages = [...agg.values()].filter((a) => a.age != null).length;
  report.years[year] = {
    seconds: Math.round((Date.now() - t0) / 1000), seeds: SEEDS, players: rows.length, stats,
    topScorerShare: { sim: topShare((r) => r.sim.pts), real: topShare((r) => r.real.ppg) },
    topSimScorers: top((r) => r.sim.pts), topRealScorers: top((r) => r.real.ppg),
    topSimRebounders: top((r) => r.sim.reb), topRealRebounders: top((r) => r.real.rpg),
    worstPts: worst("pts", "ppg"), worstReb: worst("reb", "rpg"),
    drivers, spearman: sp, dispersion, starved: starved.length, inflated: inflated.length, starvedMinutesOk: starvedMinOk,
    starvedList: starved.sort((a, b) => b.real.ppg - a.real.ppg).slice(0, 10).map(fmt), inflatedList: inflated.sort((a, b) => b.sim.pts - a.sim.pts).slice(0, 10).map(fmt),
    playersWithAge: ages, playerSeasonRows: agg.size, awards: awardsSeen,
  };
  const r = report.years[year];
  console.log(`\n===== ${year} · seeds ${SEEDS.join(",")} · ${r.players} players with real+sim lines (${r.seconds}s)`);
  for (const k of ["pts", "reb", "ast", "min"]) {
    const s = stats[k];
    console.log(`${k.padEnd(4)} median Δ ${f1(s.medianDelta).padStart(5)} · mean Δ ${f1(s.meanDelta).padStart(5)} · outliers ${s.outliers}/${s.n} (${f1(s.pct)}%)`);
  }
  console.log(`top scorer's share of rotation points: sim ${(r.topScorerShare.sim * 100).toFixed(1)}%  real ${(r.topScorerShare.real * 100).toFixed(1)}%`);
  console.log("top sim scorers :", r.topSimScorers.join(" | "));
  console.log("top real scorers:", r.topRealScorers.join(" | "));
  console.log("top sim reb     :", r.topSimRebounders.join(" | "));
  console.log("top real reb    :", r.topRealRebounders.join(" | "));
  console.log("worst pts:", r.worstPts.join("\n          "));
  console.log("worst reb:", r.worstReb.join("\n          "));
  console.log(`rank correlation sim vs real: pts ${sp.pts.toFixed(2)} · minutes ${sp.min.toFixed(2)} · pts/min ${sp.pts36.toFixed(2)} · stdev of ppg: sim ${f1(dispersion.sim)} real ${f1(dispersion.real)}`);
  console.log("what drives points-per-minute (Spearman vs card field)   field        sim    real");
  for (const [k, v] of Object.entries(drivers).sort((a, b) => Math.abs(b[1].real - b[1].sim) - Math.abs(a[1].real - a[1].sim))) console.log(`   ${k.padEnd(14)} ${v.sim.toFixed(2).padStart(6)} ${v.real.toFixed(2).padStart(6)}`);
  console.log(`starved scorers (real>=15 ppg, sim<half): ${starved.length} — of those, ${starvedMinOk} still get >=75% of their real minutes (so it is shots-per-minute, not playing time)`);
  console.log("starved :", r.starvedList.join("\n          "));
  console.log(`inflated (sim>=15 ppg and >1.5x real): ${inflated.length}`);
  console.log("inflated:", r.inflatedList.join("\n          "));
  console.log(`players carrying an age in playerSeason: ${r.playersWithAge}/${r.playerSeasonRows}`);
  console.log("awards:", JSON.stringify(r.awards));
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
