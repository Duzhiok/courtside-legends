/**
 * GameSim Statistical Regression Report. Measurement only: nothing here changes the engine.
 *
 * Plays the same fixed-seed games between real team-seasons of several eras and reports, per era and overall, what the simulator produces next to what the
 * REAL league (roster.json, same season) produced: points, FG% / 3P% / FT%, rebounds, assists, steals, blocks, turnovers, estimated possessions and
 * rating per team-game; turnovers split by source; steals by defender position; blocks per 36 minutes by the defender's block rating band.
 * Run it before and after any GameSim change and diff the two JSON files: the point is to see ALL the numbers move (or not), not only the one being tuned.
 *
 * Usage: node scripts/measure/gamesim-calibration.mjs [gamesPerPair=40] [--out file.json] [--compare before.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { realTeam } from "../../tests/helpers/realGame.js";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const N = Number(args.find((a) => /^\d+$/.test(a)) || 40);
const OUT = flag("--out");
const BEFORE = flag("--compare") ? JSON.parse(readFileSync(flag("--compare"), "utf8")) : null;
const PAIRS = [[["BOS", "LAL", 1986]], [["CHI", "SEA", 1996]], [["LAL", "PHI", 2001]], [["BOS", "LAL", 2008]], [["SAS", "MIA", 2014]], [["GSW", "BOS", 2022]]].map(([p]) => p);
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : ["PF", "C"].includes(pos) ? "big" : "other");
const BANDS = [[0, 35], [35, 50], [50, 65], [65, 80], [80, 101]];
const bandOf = (v) => BANDS.findIndex(([lo, hi]) => v >= lo && v < hi);
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "-");
const STAT_KEYS = ["pts", "fga", "fgm", "tpa", "tpm", "fta", "ftm", "reb", "oreb", "ast", "stl", "blk", "tov"];

/** Real league per team-game for one season, from the box-score rows (every team, every player). */
function realSeason(year) {
  const rows = ROWS.filter((r) => r.season === year && r.gp > 0);
  const teams = new Map();
  for (const r of rows) {
    const t = teams.get(r.team) || { g: 0, tot: Object.fromEntries(["pts", "reb", "ast", "stl", "blk", "tov", "fga", "tpa"].map((k) => [k, 0])), fgm: 0, tpm: 0, ftm: 0, fta: 0 };
    t.g = Math.max(t.g, r.gp);
    t.tot.pts += r.ppg * r.gp; t.tot.reb += r.rpg * r.gp; t.tot.ast += r.apg * r.gp; t.tot.stl += r.spg * r.gp; t.tot.blk += r.bpg * r.gp; t.tot.tov += r.tpg * r.gp;
    t.tot.fga += r.fga * r.gp; t.tot.tpa += (r.tpa || 0) * r.gp; t.fgm += (r.fg || 0) * r.fga * r.gp; t.tpm += (r.tp || 0) * (r.tpa || 0) * r.gp;
    teams.set(r.team, t);
  }
  const list = [...teams.values()].filter((t) => t.g >= 40);
  const per = (k) => list.reduce((s, t) => s + t.tot[k] / t.g, 0) / list.length;
  const out = { teams: list.length };
  for (const k of ["pts", "reb", "ast", "stl", "blk", "tov", "fga"]) out[k] = per(k);
  out.fgp = list.reduce((s, t) => s + t.fgm, 0) / list.reduce((s, t) => s + t.tot.fga, 0);
  out.tpp = list.reduce((s, t) => s + t.tpm, 0) / Math.max(1, list.reduce((s, t) => s + t.tot.tpa, 0));
  const shares = { guard: 0, wing: 0, big: 0 };
  for (const r of rows) if (GROUP(r.pos) in shares) shares[GROUP(r.pos)] += r.spg * r.gp;
  const all = shares.guard + shares.wing + shares.big;
  out.stlShare = Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, v / all]));
  const bands = BANDS.map(() => ({ blk: 0, min: 0, n: 0 }));
  for (const r of rows.filter((x) => x.mpg >= 10 && x.gp >= 20)) {
    const b = bandOf(seasonToCard(r).block ?? 40);
    if (b < 0) continue;
    bands[b].blk += r.bpg * r.gp; bands[b].min += r.mpg * r.gp; bands[b].n += 1;
  }
  out.blkPer36 = bands.map((b) => (b.min ? (b.blk / b.min) * 36 : NaN));
  return out;
}

const eras = {};
for (const [a, b, year] of PAIRS) {
  const A = realTeam(a, year), B = realTeam(b, year);
  if (A.players.length < 8 || B.players.length < 8) { console.log(`skip ${a}/${b} ${year}: no roster`); continue; }
  const s = { games: 0, tot: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), kinds: { steal: 0, forced: 0, unforced: 0 }, stlBy: { guard: 0, wing: 0, big: 0, other: 0 }, band: BANDS.map(() => ({ blk: 0, min: 0 })), min: 0, minPlayers: 0 };
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? A : B, away = i % 2 ? B : A;
    const sim = new GameSim({ home: structuredClone(home), away: structuredClone(away), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    const events = [];
    sim.emit = (type, text, meta) => { if (meta) events.push(meta); };   // runFast mutes onEvent; listening on emit leaves the simulation untouched
    sim.runFast();
    s.games += 1;
    const players = [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench];
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const p of players) {
      for (const k of STAT_KEYS) s.tot[k] += p.stats[k] || 0;
      const bi = bandOf(p.block ?? 40);
      if (bi >= 0 && p.stats.min > 0) { s.band[bi].blk += p.stats.blk; s.band[bi].min += p.stats.min; }
      s.min += p.stats.min; s.minPlayers += p.stats.min > 0 ? 1 : 0;
    }
    for (const m of events) {
      if (m.turnover?.kind in s.kinds) s.kinds[m.turnover.kind] += 1;
      if (m.turnover?.kind === "steal") { const d = byId.get(m.actorId); if (d) s.stlBy[GROUP(d.pos)] += 1; }
    }
  }
  eras[year] = { ...s, real: realSeason(year) };
}

const perTG = (e, k) => e.tot[k] / e.games / 2;
const metricsOf = (e) => {
  const poss = perTG(e, "fga") + 0.44 * perTG(e, "fta") - perTG(e, "oreb") + perTG(e, "tov");
  const stl = e.kinds.steal;
  const unf = e.kinds.unforced, forced = e.kinds.forced;
  return {
    pts: perTG(e, "pts"), poss, ortg: (perTG(e, "pts") / poss) * 100, fgp: e.tot.fgm / e.tot.fga, tpp: e.tot.tpm / e.tot.tpa, ftp: e.tot.ftm / e.tot.fta,
    reb: perTG(e, "reb"), ast: perTG(e, "ast"), stl: perTG(e, "stl"), blk: perTG(e, "blk"), tov: perTG(e, "tov"),
    tovSteal: stl / e.games / 2, tovForced: forced / e.games / 2, tovUnforced: unf / e.games / 2, tovOther: perTG(e, "tov") - (stl + forced + unf) / e.games / 2,
    stlShare: Object.fromEntries(["guard", "wing", "big"].map((g) => [g, e.stlBy[g] / Math.max(1, e.kinds.steal)])),
    blkPer36: e.band.map((b) => (b.min ? (b.blk / b.min) * 36 : NaN)),
  };
};
const REAL_KEYS = ["pts", "fgp", "tpp", "reb", "ast", "stl", "blk", "tov"];
const report = { games: N, eras: {} };
for (const [year, e] of Object.entries(eras)) report.eras[year] = { sim: metricsOf(e), real: e.real, games: e.games, minPerPlayerGame: e.min / e.games / Math.max(1, e.minPlayers / e.games) };

console.log(`\n=== GameSim Statistical Regression Report: ${N} games x ${PAIRS.length} real matchups (paired fixed seeds) ===`);
console.log("per team-game       " + Object.keys(report.eras).map((y) => `${y} sim/real`.padStart(16)).join(""));
const fmtRow = (label, key, d = 1, mult = 1) => console.log(label.padEnd(20) + Object.values(report.eras).map((e) => `${f(e.sim[key] * mult, d)}/${f((e.real[key] ?? NaN) * mult, d)}`.padStart(16)).join(""));
for (const k of REAL_KEYS) fmtRow(k.toUpperCase(), k, k.endsWith("p") ? 1 : 1, k.endsWith("p") ? 100 : 1);
fmtRow("poss (est)", "poss"); fmtRow("ortg (est)", "ortg");
console.log("\nturnovers by source (per team-game, sim): steal / forced / unforced / other(charge, loose-ball foul)");
for (const [y, e] of Object.entries(report.eras)) console.log(`  ${y}: ${f(e.sim.tovSteal)} / ${f(e.sim.tovForced)} / ${f(e.sim.tovUnforced)} / ${f(e.sim.tovOther)}  = ${f(e.sim.tov)}   (real total ${f(e.real.tov)})`);
console.log("\nsteal share by defender position (sim | real)");
for (const [y, e] of Object.entries(report.eras)) console.log(`  ${y}: ` + ["guard", "wing", "big"].map((g) => `${g} ${f(e.sim.stlShare[g] * 100, 0)}% | ${f(e.real.stlShare[g] * 100, 0)}%`).join("   "));
console.log("\nblocks per 36 min by the defender's block rating (sim | real): " + BANDS.map(([lo, hi]) => `${lo}-${hi - 1}`).join("   "));
for (const [y, e] of Object.entries(report.eras)) console.log(`  ${y}: ` + e.sim.blkPer36.map((v, i) => `${f(v)} | ${f(e.real.blkPer36[i])}`).join("   "));

const avg = (key) => Object.values(report.eras).reduce((s, e) => s + e.sim[key], 0) / Object.keys(report.eras).length;
const avgReal = (key) => Object.values(report.eras).reduce((s, e) => s + e.real[key], 0) / Object.keys(report.eras).length;
report.overall = Object.fromEntries(["pts", "poss", "ortg", "fgp", "tpp", "ftp", "reb", "ast", "stl", "blk", "tov", "tovSteal", "tovForced", "tovUnforced", "tovOther"].map((k) => [k, avg(k)]));
report.overallReal = Object.fromEntries(REAL_KEYS.map((k) => [k, avgReal(k)]));
console.log("\nALL ERAS (sim | real):  " + REAL_KEYS.map((k) => `${k} ${f(report.overall[k] * (k.endsWith("p") ? 100 : 1), 1)}|${f(report.overallReal[k] * (k.endsWith("p") ? 100 : 1), 1)}`).join("  "));
// The fair reference: the real totals of the very teams that were simulated (not the league average, which includes weak teams the matchups never use).
const realTeamTotals = (code, year) => {
  const rs = ROWS.filter((r) => r.team === code && r.season === year && r.gp > 0);
  const g = Math.max(...rs.map((r) => r.gp));
  const t = (f) => rs.reduce((sum, r) => sum + f(r) * r.gp, 0) / g;
  const pts = t((r) => r.ppg), fgm = t((r) => r.fg * r.fga), tpm = t((r) => (r.tp || 0) * (r.tpa || 0));
  return { pts, fga: t((r) => r.fga), fgm, tpm, ftm: pts - 2 * fgm - tpm, reb: t((r) => r.rpg), ast: t((r) => r.apg), tov: t((r) => r.tpg), stl: t((r) => r.spg), blk: t((r) => r.bpg) };
};
const SAME = ["pts", "fga", "fgm", "tpm", "ftm", "reb", "ast", "tov", "stl", "blk"];
const simSame = Object.fromEntries(SAME.map((k) => [k, 0])), realSame = { ...simSame };
let sameN = 0;
for (const [a, b, year] of PAIRS) {
  const e = eras[year];
  if (!e) continue;
  const ra = realTeamTotals(a, year), rb = realTeamTotals(b, year);
  for (const k of SAME) { simSame[k] += e.tot[k] / e.games / 2; realSame[k] += (ra[k] + rb[k]) / 2; }
  sameN += 1;
}
report.sameTeams = { sim: Object.fromEntries(SAME.map((k) => [k, simSame[k] / sameN])), real: Object.fromEntries(SAME.map((k) => [k, realSame[k] / sameN])) };
console.log("\nvs the REAL totals of the very teams simulated (per team-game; free throws made = points - 2 x FGM - 3PM):");
console.log("  " + SAME.map((k) => `${k} ${f(report.sameTeams.sim[k], 1)}|${f(report.sameTeams.real[k], 1)}`).join("  "));
if (BEFORE) {
  console.log("\nCHANGE vs the saved run (overall, per team-game): ");
  for (const k of Object.keys(report.overall)) console.log(`  ${k.padEnd(10)} ${f(BEFORE.overall[k] * (k.endsWith("p") ? 100 : 1), 2)} -> ${f(report.overall[k] * (k.endsWith("p") ? 100 : 1), 2)}   (${report.overall[k] - BEFORE.overall[k] >= 0 ? "+" : ""}${f((report.overall[k] - BEFORE.overall[k]) * (k.endsWith("p") ? 100 : 1), 2)})`);
}
if (OUT) { writeFileSync(OUT, JSON.stringify(report)); console.log(`\nsaved ${OUT}`); }
