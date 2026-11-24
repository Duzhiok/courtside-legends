/**
 * B35 §9.5(1) measurement (READ-ONLY): the make% channel — is "same FGA, more points" the
 * residual gap? §9 found strength/rebound correlate with FGA/36 at only 0.16-0.17 (real ~0)
 * but with PTS/36 at 0.22-0.24. Paint share is high (C 81%) and paint shots convert better,
 * so paint-heavy players may score more per identical FGA.
 *
 * Part A — realised: drive the same 120 fixed-seed games as §9 (same pairs/seeds) and tally
 * per-player FG%/2P%/3P% and points-per-FGA from the box-score stats (p.stats: fgm/fga/tpm/tpa
 * include blocked attempts as FGA, so this is the stats basis, directly comparable to real).
 * The event stream is kept only for the coverage check (blocked shots have no meta.shot).
 * Real: fg / tp / fga / tpa from roster.json; real 2P% = (fg*fga - tp*tpa)/(fga - tpa);
 * real FG-only PPS = (2*fg*fga + tp*tpa)/fga (excludes free throws, matching the sim's FG-only PPS;
 * ppg/fga would include FT points and is NOT comparable).
 *
 * Part B — formula level: call the exported calcMakeProb() per player x zone (60 draws each;
 * defender = position-matched opponent, openness ~ U[0.30, 0.90] seeded, plus a fixed-open
 * 0.55 sensitivity run) and combine with the chooseShot zone shares (same probe as §9 Part B)
 * into an expected points-per-FGA per player.
 *
 * Caveats (recorded, not hidden):
 * - paintFg/midFg are NOT measured real zone %: seasonToCard derives them from overall fg
 *   (players.js:123-125: paintFg = 0.48 + (fg-0.42)*0.7, no position bonus since B35 scheme A;
 *   midFg = fg*0.95).
 *   The probe therefore measures what the ENGINE does given those synthetic bases; a direct
 *   sim-vs-real paint%/mid% comparison is impossible from roster.json (only fg/tp/fga/tpa).
 * - Blocked shots carry no meta.shot (they emit meta.block instead), so event FGA is ~6%
 *   below stats FGA; blocks are mostly paint, so realised 2P% is slightly overstated.
 * - The probe's openness is sampled ~ U[0.30, 0.90], but REALISED shots are selected for
 *   openness (a three is only taken when open is decent), so probe makeP LEVELS sit well below
 *   realised make% (e.g. three 21.5% probe vs 36.8% realised). Only the zone gaps, the
 *   per-player PPS ranking, and the fixed-open sensitivity are interpretable — never compare
 *   probe levels against realised percentages directly.
 * - Single seed sequence per pair (same as §9); no full-season run.
 *
 * Nothing in the repo is modified.
 *
 * Usage: node scripts/measure/b35-make-by-zone.mjs [gamesPerPair=20] [--fixed-set[=out.json]]
 *   --fixed-set pins position aggregation to the card `pos` (never the last game's
 *   playPos — see §11.3: swing players flip buckets between runs and can swing a
 *   position's 3P% by ~6pt) and dumps the joined per-player realised + probe rows
 *   as JSON for fixed-set comparison across runs (ablations must be compared on
 *   the identical player set, not on re-bucketed live aggregates).
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim, chooseShot, calcMakeProb } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";
import { withRng } from "../../js/core/rng.js";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const N = Number(args.find((a) => !a.startsWith("--")) || 20);
const fixedSetArg = args.find((a) => a === "--fixed-set" || a.startsWith("--fixed-set="));
const FIXED_SET = fixedSetArg ? (fixedSetArg.includes("=") ? fixedSetArg.split("=")[1] : "b35-fixed-set.json") : null;
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];

const ranks = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
function pearson(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "-");

// ---------- Part A: realised make% from the box-score stats (blocks count as FGA) ----------
const rows = new Map();
let gamesPlayed = 0, gamesFinished = 0, eventFga = 0, statsFga = 0;

for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? realTeam(a, year) : realTeam(b, year);
    const away = i % 2 ? realTeam(b, year) : realTeam(a, year);
    const events = [];
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`b35split|${year}|${a}${b}|${i}`)),
      onEvent: (e) => events.push(e),
      onTick: () => {}, onEnd: () => {},
    });
    let steps = 0;
    sim.running = true;
    while (sim.running && steps < 4000) { sim.step(); steps += 1; if (sim.paused) sim.setPaused(false); }
    gamesPlayed += 1;
    if (!sim.running) gamesFinished += 1;
    const byId = new Map();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) byId.set(p.id, p);
    const rowFor = (id) => {
      const k = `${year}|${id}`;
      let r = rows.get(k);
      if (!r) { r = { p: byId.get(id), year, min: 0, fga: 0, fgm: 0, fga2: 0, fgm2: 0, fga3: 0, fgm3: 0, pts: 0, ftm: 0, evFga: 0, evFgm: 0 }; rows.set(k, r); }
      return r;
    };
    for (const e of events) {
      if (!e.meta?.shot) continue;
      const r = rowFor(e.meta.shot.shooterId);
      r.evFga += 1;
      if (e.meta.shot.made) r.evFgm += 1;
      eventFga += 1;
    }
    // Stats basis: p.stats counts blocked attempts as FGA (sim.js block branch) and tracks
    // tpm/tpa, so fgm/fga/tpm/tpa/pts here are directly comparable to real fg/fga/tp/tpa.
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const r = rowFor(p.id);
      r.min += p.stats.min;
      r.fga += p.stats.fga || 0;
      r.fgm += p.stats.fgm || 0;
      r.fga3 += p.stats.tpa || 0;
      r.fgm3 += p.stats.tpm || 0;
      r.fga2 += (p.stats.fga || 0) - (p.stats.tpa || 0);
      r.fgm2 += (p.stats.fgm || 0) - (p.stats.tpm || 0);
      r.pts += p.stats.pts || 0;
      r.ftm += p.stats.ftm || 0;
      statsFga += p.stats.fga || 0;
    }
  }
}
const used = [...rows.values()].filter((r) => r.min >= 12 * N && (r.p.raw?.mpg || 0) >= 12 && r.p.raw.fga > 0 && r.fga >= 20);
const per36 = (r, k) => ((r[k] / r.min) * 36);
const real2p = (r) => ((r.p.raw.fg * r.p.raw.fga - r.p.raw.tp * r.p.raw.tpa) / Math.max(0.1, r.p.raw.fga - r.p.raw.tpa));
const realPps = (r) => (2 * r.p.raw.fg * r.p.raw.fga + r.p.raw.tp * r.p.raw.tpa) / r.p.raw.fga; // real FG-only points per FGA (excludes FTs, like the sim's FG-only PPS)

console.log(`Part A: ${gamesPlayed} games (${gamesFinished} finished), ${used.length} players (min>=${12 * N}, real mpg>=12, stats FGA>=20), stats FGA ${statsFga} vs event FGA ${eventFga} (coverage ${(100 * eventFga / Math.max(1, statsFga)).toFixed(1)}%; gap = blocked shots, no meta.shot)`);
const tot = (k) => sum(used, (r) => r[k]);
console.log(`\nLeague realised, STATS basis (${tot("fga")} FGA): FG% ${pct(tot("fgm") / tot("fga"))}  2P% ${pct(tot("fgm2") / tot("fga2"))} (${tot("fga2")} 2PA)  3P% ${pct(tot("fgm3") / tot("fga3"))} (${tot("fga3")} 3PA)  FG-only PPS ${f3((tot("pts") - tot("ftm")) / tot("fga"))}  total PPS (incl FTs) ${f3(tot("pts") / tot("fga"))}`);
console.log(`League realised, EVENT basis (blocked shots excluded): FG% ${pct(tot("evFgm") / tot("evFga"))} — the event basis overstates FG% by ${(100 * (tot("evFgm") / tot("evFga") - tot("fgm") / tot("fga"))).toFixed(1)}pt because blocks are misses`);
const realFg = sum(used, (r) => r.p.raw.fg * r.p.raw.fga) / sum(used, (r) => r.p.raw.fga);
const realTp = sum(used, (r) => r.p.raw.tp * r.p.raw.tpa) / sum(used, (r) => r.p.raw.tpa);
const real2 = sum(used, (r) => r.p.raw.fg * r.p.raw.fga - r.p.raw.tp * r.p.raw.tpa) / sum(used, (r) => r.p.raw.fga - r.p.raw.tpa);
const realP = sum(used, (r) => 2 * r.p.raw.fg * r.p.raw.fga + r.p.raw.tp * r.p.raw.tpa) / sum(used, (r) => r.p.raw.fga);
console.log(`League real (same players, FGA-weighted): FG% ${pct(realFg)}  2P% ${pct(real2)}  3P% ${pct(realTp)}  FG-only PPS ${f3(realP)}  total PPS (incl FTs) ${f3(sum(used, (r) => r.p.raw.ppg) / sum(used, (r) => r.p.raw.fga))}`);
const posOf = (r) => (FIXED_SET ? (r.p.pos || "?") : (r.p.playPos || r.p.pos || "?"));
for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = used.filter((r) => posOf(r) === pos);
  if (!g.length) continue;
  const sFg = sum(g, (r) => r.fgm) / Math.max(1, sum(g, (r) => r.fga));
  const s2 = sum(g, (r) => r.fgm2) / Math.max(1, sum(g, (r) => r.fga2));
  const s3 = sum(g, (r) => r.fgm3) / Math.max(1, sum(g, (r) => r.fga3));
  const rFg = sum(g, (r) => r.p.raw.fg * r.p.raw.fga) / Math.max(1, sum(g, (r) => r.p.raw.fga));
  const r2 = sum(g, (r) => r.p.raw.fg * r.p.raw.fga - r.p.raw.tp * r.p.raw.tpa) / Math.max(1, sum(g, (r) => r.p.raw.fga - r.p.raw.tpa));
  const r3 = sum(g, (r) => r.p.raw.tp * r.p.raw.tpa) / Math.max(1, sum(g, (r) => r.p.raw.tpa));
  console.log(`  ${pos.padEnd(3)} n=${String(g.length).padStart(3)}  sim FG% ${pct(sFg)} (real ${pct(rFg)})  2P% ${pct(s2)} (real ${pct(r2)})  3P% ${pct(s3)} (real ${pct(r3)})  FG-only PPS sim ${f3((sum(g, (r) => r.pts) - sum(g, (r) => r.ftm)) / Math.max(1, sum(g, (r) => r.fga)))} (real ${f3(sum(g, (r) => realPps(r) * r.p.raw.fga) / Math.max(1, sum(g, (r) => r.p.raw.fga)))})`);
}
console.log("\nSpearman vs per-player make% (sim / real), and vs points-per-FGA:");
for (const [label, key] of [["strength", "strength"], ["rebound", "rebound"], ["three", "three"], ["speed", "speed"], ["scoring", "scoring"], ["paint", "paint"]]) {
  const attr = used.map((r) => r.p[key] ?? 50);
  const simFg = used.map((r) => r.fgm / r.fga);
  const sim3 = used.map((r) => (r.fga3 >= 10 ? r.fgm3 / r.fga3 : NaN)).filter(Number.isFinite);
  const realFgA = used.map((r) => r.p.raw.fg);
  const real3A = used.map((r) => r.p.raw.tp);
  const attr3 = used.filter((r) => r.fga3 >= 10).map((r) => r.p[key] ?? 50);
  const simPps = used.map((r) => (r.pts - r.ftm) / r.fga); // FG-only points per FGA
  const realPpsA = used.map((r) => realPps(r));
  const simPts36 = used.map((r) => per36(r, "pts"));
  const simFga36 = used.map((r) => per36(r, "fga"));
  const realPts36 = used.map((r) => (r.p.raw.ppg / r.p.raw.mpg) * 36);
  const realFga36 = used.map((r) => (r.p.raw.fga / r.p.raw.mpg) * 36);
  console.log(`  ${label.padEnd(9)} FG% sim ${f2(spearman(attr, simFg))} (real ${f2(spearman(attr, realFgA))})  3P% sim ${f2(spearman(attr3, sim3))} (real ${f2(spearman(attr3, real3A))})  PPS sim ${f2(spearman(attr, simPps))} (real ${f2(spearman(attr, realPpsA))})  PTS/36 sim ${f2(spearman(attr, simPts36))} (real ${f2(spearman(attr, realPts36))})  FGA/36 sim ${f2(spearman(attr, simFga36))} (real ${f2(spearman(attr, realFga36))})`);
}

console.log("\nPer-player efficiency preservation (sim vs real, same players):");
{
  const simFgA = used.map((r) => r.fgm / r.fga);
  const sim2A = used.map((r) => r.fgm2 / r.fga2);
  const sim3A = used.filter((r) => r.fga3 >= 10).map((r) => r.fgm3 / r.fga3);
  const realFgA2 = used.map((r) => r.p.raw.fg);
  const real2A = used.map((r) => real2p(r));
  const real3A2 = used.filter((r) => r.fga3 >= 10).map((r) => r.p.raw.tp);
  console.log(`  FG% ${f2(spearman(simFgA, realFgA2))}  2P% ${f2(spearman(sim2A, real2A))}  3P% ${f2(spearman(sim3A, real3A2))}`);
  console.log(`  (note: threeFg base IS the season tp (players.js:123), so sim 3P% is anchored on real tp; the three-rating rows above compare against the card rating, which is career-smoothed, not the season tp)`);
}

// ---------- Part B: formula-level makeP by zone (calcMakeProb probe) ----------
console.log("\nPart B: calcMakeProb zone probe (60 draws/player/zone; defender position-matched; open ~ U[0.30,0.90] seeded; fixed-open 0.55 sensitivity)");
const DRAW = 60;
const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];
const probeRows = [];
for (const [a, b, year] of PAIRS) {
  const teamA = realTeam(a, year);
  const teamB = realTeam(b, year);
  const onCourtA = [...teamA.players].sort((x, y) => (y.ovr || 0) - (x.ovr || 0)).slice(0, 5);
  const onCourtB = [...teamB.players].sort((x, y) => (y.ovr || 0) - (x.ovr || 0)).slice(0, 5);
  for (const [team, oppCourt, side] of [[teamA, onCourtB, "home"], [teamB, onCourtA, "away"]]) {
    const onCourt = [...team.players].sort((x, y) => (y.ovr || 0) - (x.ovr || 0)).slice(0, 5);
    const coach = { playerAutonomy: 40, sparkPotential: 40 };
    const off = { side, coach, tactic: { offense: 1, threeRate: 1, paintBias: 1, id: "balanced" }, temp: {}, onCourt, chem: 50, morale: 50, fit: 50, gameplan: { offenseFocusId: null } };
    const def = { side: side === "home" ? "away" : "home", coach, tactic: { defense: 1 }, temp: {}, onCourt: oppCourt };
    for (const p of team.players) {
      const pos = FIXED_SET ? (p.pos || "SF") : (p.playPos || p.pos || "SF");
      let defender = oppCourt.find((q) => (q.playPos || q.pos) === pos);
      if (!defender) {
        const pi = POS_ORDER.indexOf(pos);
        defender = [...oppCourt].sort((x, y) => Math.abs(POS_ORDER.indexOf(x.playPos || x.pos) - pi) - Math.abs(POS_ORDER.indexOf(y.playPos || y.pos) - pi))[0];
      }
      const mp = {};
      for (const zone of ["paint", "mid", "three"]) {
        const shot = { zone, pts: zone === "three" ? 3 : 2, weakSide: false };
        let acc = 0, accFixed = 0;
        withRng(seededStream(hashSeed(`b35make|${year}|${p.id}|${zone}`)), () => {
          for (let k = 0; k < DRAW; k += 1) {
            const open = 0.3 + 0.6 * (k / DRAW) + ((k * 37) % 11) * 0.004; // spread 0.30-0.90, deterministic
            acc += calcMakeProb(p, shot, Math.min(0.9, open), off, def, defender, null, null, { quarter: 2, scoreDiff: 0, onCourt });
            accFixed += calcMakeProb(p, shot, 0.55, off, def, defender, null, null, { quarter: 2, scoreDiff: 0, onCourt });
          }
        });
        mp[zone] = acc / DRAW;
        mp[zone + "Fixed"] = accFixed / DRAW;
      }
      // chooseShot zone shares (same neutral probe as §9 Part B, 300 draws)
      const tally = { paint: 0, mid: 0, three: 0 };
      withRng(seededStream(hashSeed(`b35make-share|${year}|${p.id}`)), () => {
        for (let k = 0; k < 300; k += 1) tally[chooseShot(p, off, null, null).zone] += 1;
      });
      const share = { paint: tally.paint / 300, mid: tally.mid / 300, three: tally.three / 300 };
      const expPps = share.paint * mp.paint * 2 + share.mid * mp.mid * 2 + share.three * mp.three * 3;
      const expPpsFixed = share.paint * mp.paintFixed * 2 + share.mid * mp.midFixed * 2 + share.three * mp.threeFixed * 3;
      probeRows.push({ p, year, pos, mp, share, expPps, expPpsFixed });
    }
  }
}
console.log(`  ${probeRows.length} players. mean makeP by zone (open-spread / fixed 0.55):`);
for (const zone of ["paint", "mid", "three"]) {
  console.log(`  ${zone.padEnd(6)} ${(100 * sum(probeRows, (r) => r.mp[zone]) / probeRows.length).toFixed(1)}% / ${(100 * sum(probeRows, (r) => r.mp[zone + "Fixed"]) / probeRows.length).toFixed(1)}%   (raw zone base: paintFg ${(100 * sum(probeRows, (r) => r.p.paintFg) / probeRows.length).toFixed(1)}% / midFg ${(100 * sum(probeRows, (r) => r.p.midFg) / probeRows.length).toFixed(1)}% / threeFg ${(100 * sum(probeRows, (r) => r.p.threeFg) / probeRows.length).toFixed(1)}%)`);
}
for (const pos of POS_ORDER) {
  const g = probeRows.filter((r) => r.pos === pos);
  if (!g.length) continue;
  console.log(`  ${pos.padEnd(3)} n=${String(g.length).padStart(3)}  paint ${pct(sum(g, (r) => r.mp.paint) / g.length)}  mid ${pct(sum(g, (r) => r.mp.mid) / g.length)}  three ${pct(sum(g, (r) => r.mp.three) / g.length)}  | shares paint ${pct(sum(g, (r) => r.share.paint) / g.length)} mid ${pct(sum(g, (r) => r.share.mid) / g.length)} three ${pct(sum(g, (r) => r.share.three) / g.length)}  | exp PPS ${f3(sum(g, (r) => r.expPps) / g.length)}`);
}
console.log("\nSpearman vs expected points-per-FGA (formula level) and realised PPS:");
for (const [label, key] of [["strength", "strength"], ["rebound", "rebound"], ["three", "three"], ["speed", "speed"], ["scoring", "scoring"], ["paint", "paint"]]) {
  const attr = probeRows.map((r) => r.p[key] ?? 50);
  const exp = probeRows.map((r) => r.expPps);
  const expF = probeRows.map((r) => r.expPpsFixed);
  const paintMp = probeRows.map((r) => r.mp.paint);
  const threeMp = probeRows.map((r) => r.mp.three);
  const paintShare = probeRows.map((r) => r.share.paint);
  console.log(`  ${label.padEnd(9)} expPPS ${f2(spearman(attr, exp))} (fixed-open ${f2(spearman(attr, expF))})  paintMakeP ${f2(spearman(attr, paintMp))}  threeMakeP ${f2(spearman(attr, threeMp))}  paintShare ${f2(spearman(attr, paintShare))}`);
}
// Join probe rows back to realised rows for the cross-check.
const realMap = new Map(used.map((r) => [`${r.year}|${r.p.id}`, r]));
const joined = probeRows.map((pr) => ({ ...pr, real: realMap.get(`${pr.year}|${pr.p.id}`) })).filter((j) => j.real);
console.log(`\nCross-check on ${joined.length} players present in both parts: realised FG-only PPS vs expected PPS Spearman ${f2(spearman(joined.map((j) => (j.real.pts - j.real.ftm) / j.real.fga), joined.map((j) => j.expPps)))}; realised FG% vs mean expected makeP (share-weighted) ${f2(spearman(joined.map((j) => j.real.fgm / j.real.fga), joined.map((j) => j.share.paint * j.mp.paint + j.share.mid * j.mp.mid + j.share.three * j.mp.three)))}`);
console.log("\nHighest expected PPS (formula level) vs realised FG-only PPS:");
for (const j of [...joined].sort((x, y) => y.expPps - x.expPps).slice(0, 10))
  console.log(`  ${String(j.p.name).padEnd(22)} ${j.year} ${j.pos} expPPS ${f3(j.expPps)} realised PPS ${f3((j.real.pts - j.real.ftm) / j.real.fga)} (real FG-only ${f3(realPps(j.real))}) paintShare ${pct(j.share.paint)} str ${j.p.strength} reb ${j.p.rebound}`);
console.log("\nLowest expected PPS:");
for (const j of [...joined].sort((x, y) => x.expPps - y.expPps).slice(0, 10))
  console.log(`  ${String(j.p.name).padEnd(22)} ${j.year} ${j.pos} expPPS ${f3(j.expPps)} realised PPS ${f3((j.real.pts - j.real.ftm) / j.real.fga)} (real FG-only ${f3(realPps(j.real))}) paintShare ${pct(j.share.paint)} str ${j.p.strength} reb ${j.p.rebound}`);

if (FIXED_SET) {
  // Fixed-set dump: the same joined rows, so ablations are compared on the identical
  // player set with positions pinned to card pos (no re-bucketing noise, §11.3).
  // catchShoot/offDribble are included for the §11.4(2) PG-three split in a later run.
  const dump = joined.map((j) => ({
    key: `${j.year}|${j.p.id}`, name: j.p.name, year: j.year, pos: j.pos,
    strength: j.p.strength, rebound: j.p.rebound, three: j.p.three, speed: j.p.speed,
    scoring: j.p.scoring, paint: j.p.paint,
    catchShoot: j.p.catchShoot ?? null, offDribble: j.p.offDribble ?? null,
    paintFg: j.p.paintFg, midFg: j.p.midFg, threeFg: j.p.threeFg,
    real: { fg: j.real.p.raw.fg, tp: j.real.p.raw.tp, fga: j.real.p.raw.fga, tpa: j.real.p.raw.tpa, ppg: j.real.p.raw.ppg, mpg: j.real.p.raw.mpg },
    sim: { min: j.real.min, fga: j.real.fga, fgm: j.real.fgm, fga2: j.real.fga2, fgm2: j.real.fgm2, fga3: j.real.fga3, fgm3: j.real.fgm3, pts: j.real.pts, ftm: j.real.ftm },
    probe: { mp: j.mp, share: j.share, expPps: j.expPps, expPpsFixed: j.expPpsFixed },
  }));
  writeFileSync(FIXED_SET, JSON.stringify({ mode: "fixed-set", count: dump.length, players: dump }, null, 1));
  console.log(`\n--fixed-set: position pinned to card pos; dumped ${dump.length} players to ${FIXED_SET}`);
}
