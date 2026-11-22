/**
 * B35 §17 measurement (READ-ONLY on main): Oaxaca-decompose the 2P lift.
 *
 * §16 found the "selection lift" (realised 2P% minus probe-expected 2P%) is
 * +5.4pt at baseline and +6.2pt under uniform openness U1, and that the
 * probe stubs out the whole live makeP stack — so the lift is a mix of
 * (a) live zone mix (chooseShot under live sideCtx picks different
 * paint/mid shares than the neutral probe) and (b) the live makeP stack
 * (signature / scheme / bigMismatch / personality / chem / morale / form /
 * tactics / hot / mood / hunt / spark / bump / double — everything the
 * probe holds neutral). This script splits the lift into exactly those two
 * terms (+ interaction) per player, aggregated by card position.
 *
 *   realised2P = sum_z liveShare_z * liveMakeP_z
 *   expected2P = sum_z probeShare_z * probeMakeP_z   (z in {paint, mid})
 *   mix        = sum_z (liveShare_z - probeShare_z) * probeMakeP_z
 *   stack      = sum_z probeShare_z * (liveMakeP_z - probeMakeP_z)
 *   interact   = sum_z (liveShare_z - probeShare_z) * (liveMakeP_z - probeMakeP_z)
 *   mix + stack + interact == realised2P - expected2P  (exact identity;
 *   the stack term is weighted by probe shares, otherwise the interaction
 *   is counted twice)
 *
 * Live zone shares / zone makeP come from the event stream and need
 * meta.shot.zone, which main-tree sim.js does NOT emit. The zone field is
 * added only in a scratch worktree (one field on the two meta.shot emits
 * AND on the block meta in js/engine/sim.js, no RNG impact); run from that
 * worktree, this script reads it. Blocked attempts carry no meta.shot but
 * DO count in stats FGA, so they are recovered from the block "miss"
 * events (meta.block.zone, shooter matched by name on the shooting team)
 * and added to live attempts as misses — the decomposition is then
 * stats-basis-consistent (event shots + blocks == stats FGA per player,
 * verified in-script). If any shot/block event lacks a zone, or a block
 * cannot be matched to a shooter, the script aborts loudly instead of
 * silently decomposing garbage.
 *
 * Sample: same 120 fixed-seed games as §9/§10/§13 (b35split seeds, 6 pairs
 * x 20). Probe: same Part B as b35-make-by-zone.mjs (calcMakeProb fixed
 * open 0.55, 60 draws/zone; chooseShot shares, 300 draws, neutral context).
 * Position buckets pinned to card `pos` (fixed set, §11.3).
 *
 * Caveats (recorded, not hidden):
 * - Blocked attempts are recovered from block events (zone instrumented
 *   in the scratch worktree); the per-player check event-shots + blocks ==
 *   stats FGA is printed, so any unrecovered FGA path shows up instead of
 *   silently inflating live makeP.
 * - Probe shares are chooseShot in a NEUTRAL context; live shares are
 *   chooseShot under live sideCtx (score, clock, tactics, kickouts).
 * - Single seed sequence per pair; no full-season run.
 *
 * Usage (from a worktree with meta.shot.zone instrumented):
 *   node scripts/measure/b35-lift-decomp.mjs [--out=path.json]
 * Nothing in the repo is modified by this script itself.
 *
 * B35 §18: ablation flags via the B35_ABL env var (e.g. B35_ABL=u1+u3).
 * B35 §19 adds u5 (shot-path open leaks: skillKickOpenBonus +
 * tempoDef.openBonus, applied after the U1 pin).
 * They are published on globalThis.__B35_ABL for the scratch-worktree
 * sim.js to read (main-tree sim.js has no ablation hooks and ignores them).
 * Part A (live games) runs under the requested flags; Part B (probe) always
 * runs flag-free first, then — when the worktree sim.js supports it — a
 * second probe pass under {u4:true}, so the probe-side baseline of the U4
 * terms (personality / bigMismatch / defPress are NOT neutral in the probe)
 * is measured instead of guessed. From main-tree sim.js the second pass
 * reproduces the first (delta 0) and is harmless.
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim, chooseShot, calcMakeProb } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";
import { withRng } from "../../js/core/rng.js";
import { writeFileSync } from "node:fs";

const ABL = (process.env.B35_ABL || "").split("+").filter(Boolean);
globalThis.__B35_ABL = { u1: ABL.includes("u1"), u3: ABL.includes("u3"), u4: ABL.includes("u4"), u5: ABL.includes("u5") };
// §19: the worktree sim.js counts would-be U5 leak applications here (main-tree sim.js never increments it).
globalThis.__B35_U5COUNT = { kick: 0, kickPaint: 0, kickMid: 0, kickThree: 0, tempo: 0, tempoGrind: 0, tempoPush: 0, tempoPaint: 0, tempoMid: 0, tempoThree: 0 };
console.log(`B35_ABL flags: ${ABL.join("+") || "(none)"} — live games run under these; probe pass 1 is always flag-free`);

const args = process.argv.slice(2);
const N = 20;
const outArg = args.find((a) => a.startsWith("--out="));
const OUT = outArg ? outArg.slice("--out=".length) : null;
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];

const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "-");
const gap = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}pt` : "-");

// ---------- Part A: live games, per-player per-zone makes/attempts (events) ----------
const rows = new Map();
let gamesPlayed = 0, gamesFinished = 0, eventFga = 0, statsFga = 0, zoneless = 0, blocks = 0, unmatchedBlocks = 0;
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
    const byName = new Map();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) { byId.set(p.id, p); byName.set(`${p.name}`, p); }
    // Shooter lookup for block events: meta.block.side is the DEFENDING side,
    // so the shooter is on the opposite team; names are unique within a team.
    const shooterByBlock = (blk) => {
      const team = blk.side === "home" ? sim.away : sim.home;
      const pool = [...team.onCourt, ...team.bench];
      return pool.find((p) => p.name === blk.blockedName) || null;
    };
    const rowFor = (id) => {
      const k = `${year}|${id}`;
      let r = rows.get(k);
      if (!r) {
        r = { p: byId.get(id), year, min: 0, fga: 0, fgm: 0, fga2: 0, fgm2: 0, fga3: 0, fgm3: 0,
          live: { paint: { a: 0, m: 0 }, mid: { a: 0, m: 0 }, three: { a: 0, m: 0 } } };
        rows.set(k, r);
      }
      return r;
    };
    for (const e of events) {
      if (e.meta?.shot) {
        const zone = e.meta.shot.zone;
        if (!zone || !rowFor(e.meta.shot.shooterId).live[zone]) { zoneless += 1; continue; }
        const r = rowFor(e.meta.shot.shooterId);
        r.live[zone].a += 1;
        if (e.meta.shot.made) r.live[zone].m += 1;
        eventFga += 1;
      } else if (e.type === "miss" && e.meta?.block) {
        // Blocked attempt: counts in stats FGA, no meta.shot. Recover it as
        // a miss in the instrumented zone (scratch worktree only).
        const zone = e.meta.block.zone;
        const shooter = shooterByBlock(e.meta.block);
        if (!zone || !shooter) { unmatchedBlocks += 1; continue; }
        const r = rowFor(shooter.id);
        if (!r.live[zone]) { zoneless += 1; continue; }
        r.live[zone].a += 1;
        blocks += 1;
        eventFga += 1;
      }
    }
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
      statsFga += p.stats.fga || 0;
    }
  }
}
if (zoneless > 0 || unmatchedBlocks > 0) {
  console.error(`ABORT: ${zoneless} shot/block events without a zone, ${unmatchedBlocks} blocks unmatched to a shooter — run from a worktree with the zone instrumentation (see header).`);
  process.exit(1);
}
const used = [...rows.values()].filter((r) => r.min >= 12 * N && (r.p.raw?.mpg || 0) >= 12 && r.p.raw.fga > 0 && r.fga >= 20);
const tot = (k) => sum(used, (r) => r[k]);
const live2a = sum(used, (r) => r.live.paint.a + r.live.mid.a);
const live2m = sum(used, (r) => r.live.paint.m + r.live.mid.m);
// Self-check: event shots + recovered blocks must equal stats FGA per player.
let maxFgaDiff = 0, fgaMismatch = 0;
for (const r of used) {
  const ev = r.live.paint.a + r.live.mid.a + r.live.three.a;
  if (Math.abs(ev - r.fga) > maxFgaDiff) maxFgaDiff = Math.abs(ev - r.fga);
  if (ev !== r.fga) fgaMismatch += 1;
}
console.log(`Part A: ${gamesPlayed} games (${gamesFinished} finished), ${used.length} players, stats FGA ${statsFga} vs event FGA ${eventFga} (${blocks} recovered blocks)`);
console.log(`FGA reconciliation (used players): ${fgaMismatch} players with event-shots+blocks != stats FGA, max |diff| ${maxFgaDiff} (0 = instrumentation is stats-basis-exact)`);
console.log(`League realised 2P%: stats basis ${pct(tot("fgm2") / tot("fga2"))} (${tot("fga2")} 2PA) | event+blocks basis ${pct(live2m / live2a)} (${live2a} 2PA)`);
{
  const c = globalThis.__B35_U5COUNT;
  console.log(`U5 leak counters (Part A, ${gamesPlayed} games): kick bonus applied ${c.kick}x (paint ${c.kickPaint} / mid ${c.kickMid} / three ${c.kickThree}), tempo openBonus applied ${c.tempo}x (grind ${c.tempoGrind} / push ${c.tempoPush}; paint ${c.tempoPaint} / mid ${c.tempoMid} / three ${c.tempoThree})`);
}

// ---------- Part B: probe (same as b35-make-by-zone.mjs Part B) ----------
console.log("\nPart B: calcMakeProb zone probe (60 draws/player/zone, fixed open 0.55) + chooseShot shares (300 draws)");
const DRAW = 60;
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
      const pos = p.pos || "SF";
      let defender = oppCourt.find((q) => (q.playPos || q.pos) === pos);
      if (!defender) {
        const pi = POS_ORDER.indexOf(pos);
        defender = [...oppCourt].sort((x, y) => Math.abs(POS_ORDER.indexOf(x.playPos || x.pos) - pi) - Math.abs(POS_ORDER.indexOf(y.playPos || y.pos) - pi))[0];
      }
      const mp = {};
      const probeMp = (flags) => {
        const saved = globalThis.__B35_ABL;
        globalThis.__B35_ABL = flags;
        const out = {};
        try {
          for (const zone of ["paint", "mid", "three"]) {
            const shot = { zone, pts: zone === "three" ? 3 : 2, weakSide: false };
            let accFixed = 0;
            withRng(seededStream(hashSeed(`b35make|${year}|${p.id}|${zone}`)), () => {
              for (let k = 0; k < DRAW; k += 1) accFixed += calcMakeProb(p, shot, 0.55, off, def, defender, null, null, { quarter: 2, scoreDiff: 0, onCourt });
            });
            out[zone + "Fixed"] = accFixed / DRAW;
          }
        } finally {
          globalThis.__B35_ABL = saved;
        }
        return out;
      };
      Object.assign(mp, probeMp({}));
      // §18 pass 2: probe-side baseline of the U4 terms. From a worktree
      // sim.js with U4 hooks this differs from pass 1 (personality /
      // bigMismatch / defPress are live in the neutral probe); from
      // main-tree sim.js it is identical (delta 0).
      const mpU4 = probeMp({ u4: true });
      for (const zone of ["paint", "mid", "three"]) mp[zone + "FixedU4"] = mpU4[zone + "Fixed"];
      const tally = { paint: 0, mid: 0, three: 0 };
      withRng(seededStream(hashSeed(`b35make-share|${year}|${p.id}`)), () => {
        for (let k = 0; k < 300; k += 1) tally[chooseShot(p, off, null, null).zone] += 1;
      });
      const share = { paint: tally.paint / 300, mid: tally.mid / 300, three: tally.three / 300 };
      probeRows.push({ p, year, pos, mp, share });
    }
  }
}
const realMap = new Map(used.map((r) => [`${r.year}|${r.p.id}`, r]));
const joined = probeRows.map((pr) => ({ ...pr, live: realMap.get(`${pr.year}|${pr.p.id}`) })).filter((j) => j.live);
console.log(`  ${probeRows.length} probe rows, ${joined.length} joined to live rows`);
// §18: probe-side baseline of the U4 terms (pass 2 minus pass 1, 2PA-weighted).
// A nonzero delta here is the part of a live-U4 ablation delta that is NOT
// a live-side contribution — it is the probe's own baseline of those terms.
for (const zone of ["paint", "mid"]) {
  const wAvg = (f) => sum(joined, (j) => f(j) * j.live.live[zone].a) / Math.max(1, sum(joined, (j) => j.live.live[zone].a));
  const d = wAvg((j) => j.mp[zone + "FixedU4"] - j.mp[zone + "Fixed"]);
  console.log(`  probe-side U4 baseline, ${zone}: neutral ${pct(wAvg((j) => j.mp[zone + "Fixed"]))} -> U4-neutral ${pct(wAvg((j) => j.mp[zone + "FixedU4"]))} (delta ${gap(d)})`);
}

// ---------- Part C: Oaxaca decomposition (2P, event basis) ----------
function decomp(j) {
  const l2a = j.live.live.paint.a + j.live.live.mid.a;
  const liveShare = { paint: j.live.live.paint.a / l2a, mid: j.live.live.mid.a / l2a };
  const w2 = j.share.paint + j.share.mid;
  const probeShare = { paint: j.share.paint / w2, mid: j.share.mid / w2 };
  const liveMp = {
    paint: j.live.live.paint.a ? j.live.live.paint.m / j.live.live.paint.a : NaN,
    mid: j.live.live.mid.a ? j.live.live.mid.m / j.live.live.mid.a : NaN,
  };
  const probeMp = { paint: j.mp.paintFixed, mid: j.mp.midFixed };
  const realised = liveShare.paint * liveMp.paint + liveShare.mid * liveMp.mid;
  const expected = probeShare.paint * probeMp.paint + probeShare.mid * probeMp.mid;
  const mix = (liveShare.paint - probeShare.paint) * probeMp.paint + (liveShare.mid - probeShare.mid) * probeMp.mid;
  // Stack term weighted by PROBE shares, so mix + stack + interact is exact
  // (stack on live shares would double-count the interaction, §17 erratum).
  const stack = probeShare.paint * (liveMp.paint - probeMp.paint) + probeShare.mid * (liveMp.mid - probeMp.mid);
  const interact = (liveShare.paint - probeShare.paint) * (liveMp.paint - probeMp.paint) + (liveShare.mid - probeShare.mid) * (liveMp.mid - probeMp.mid);
  return { liveShare, probeShare, liveMp, probeMp, realised, expected, mix, stack, interact, l2a, check: mix + stack + interact - (realised - expected) };
}
const dec = joined
  // §18: a player with zero live attempts in either 2P zone has an undefined
  // zone makeP (NaN), which poisons every weighted aggregate. Drop them
  // from the decomposition (they are marginal rotation players; the U3/U4
  // runs each had one pure-paint centre with 0 mid attempts). Counted here.
  .filter((j) => j.live.live.paint.a > 0 && j.live.live.mid.a > 0)
  .map((j) => ({ ...j, d: decomp(j) }));
const droppedZeroZone = joined.length - dec.length;
if (droppedZeroZone > 0) console.log(`  (dropped ${droppedZeroZone} joined players with 0 live attempts in paint or mid — undefined zone makeP)`);
const badCheck = dec.filter((j) => Math.abs(j.d.check) > 1e-9);
console.log(`\nDecomposition identity check: ${badCheck.length} players fail mix+stack+interact == realised-expected (max |err| ${Math.max(0, ...dec.map((j) => Math.abs(j.d.check))).toExponential(1)})`);
console.log("\nPos | n | live2PA | realised2P (event) | probe-expected2P | lift | mix | stack | interact | live paintShare vs probe");
const aggPos = (list) => {
  const w = sum(list, (j) => j.d.l2a);
  const wAvg = (f) => sum(list, (j) => f(j) * j.d.l2a) / w;
  return {
    n: list.length, w,
    realised: wAvg((j) => j.d.realised), expected: wAvg((j) => j.d.expected),
    mix: wAvg((j) => j.d.mix), stack: wAvg((j) => j.d.stack), interact: wAvg((j) => j.d.interact),
    livePaint: wAvg((j) => j.d.liveShare.paint), probePaint: wAvg((j) => j.d.probeShare.paint),
  };
};
for (const pos of POS_ORDER) {
  const g = dec.filter((j) => j.pos === pos);
  if (!g.length) continue;
  const A = aggPos(g);
  console.log(`  ${pos.padEnd(3)} n=${String(A.n).padStart(3)}  ${String(A.w).padStart(5)}  ${pct(A.realised)}  ${pct(A.expected)}  ${gap(A.realised - A.expected)}  ${gap(A.mix)}  ${gap(A.stack)}  ${gap(A.interact)}  paint ${pct(A.livePaint)} vs ${pct(A.probePaint)}`);
}
{
  const A = aggPos(dec);
  console.log(`  ALL n=${String(A.n).padStart(3)}  ${String(A.w).padStart(5)}  ${pct(A.realised)}  ${pct(A.expected)}  ${gap(A.realised - A.expected)}  ${gap(A.mix)}  ${gap(A.stack)}  ${gap(A.interact)}  paint ${pct(A.livePaint)} vs ${pct(A.probePaint)}`);
}
// Secondary: 3P mix check (blocks recovered, so live 3P% is stats-consistent).
console.log("\nSecondary — 3P mix (event+blocks basis):");
for (const pos of [...POS_ORDER, "ALL"]) {
  const g = pos === "ALL" ? dec : dec.filter((j) => j.pos === pos);
  if (!g.length) continue;
  const w3 = sum(g, (j) => j.live.live.three.a + j.live.live.paint.a + j.live.live.mid.a);
  const live3share = sum(g, (j) => j.live.live.three.a) / w3;
  const probe3share = sum(g, (j) => j.share.three * (j.live.live.paint.a + j.live.live.mid.a + j.live.live.three.a)) / w3;
  const live3p = sum(g, (j) => j.live.live.three.m) / Math.max(1, sum(g, (j) => j.live.live.three.a));
  const probe3p = sum(g, (j) => j.mp.threeFixed * j.live.live.three.a) / Math.max(1, sum(g, (j) => j.live.live.three.a));
  console.log(`  ${pos.padEnd(3)} n=${String(g.length).padStart(3)}  live 3PA share ${pct(live3share)} vs probe ${pct(probe3share)}  live 3P% ${pct(live3p)} vs probe fixed-open ${pct(probe3p)}`);
}
// Per-zone live vs probe makeP (league, 2PA-weighted) — where does the stack term live?
console.log("\nPer-zone live makeP vs probe fixed-open makeP (2PA-weighted league means):");
for (const zone of ["paint", "mid"]) {
  const wAvg = (f) => sum(dec, (j) => f(j) * j.live.live[zone].a) / Math.max(1, sum(dec, (j) => j.live.live[zone].a));
  console.log(`  ${zone.padEnd(6)} live ${pct(wAvg((j) => j.d.liveMp[zone]))} vs probe ${pct(wAvg((j) => j.d.probeMp[zone]))}  (${sum(dec, (j) => j.live.live[zone].a)} attempts)`);
}
console.log("\nLargest positive stack terms (live makeP far above probe — who benefits most from the live stack?):");
for (const j of [...dec].sort((x, y) => y.d.stack - x.d.stack).slice(0, 8))
  console.log(`  ${String(j.p.name).padEnd(22)} ${j.year} ${j.pos} stack ${gap(j.d.stack)} (realised ${pct(j.d.realised)} vs expected ${pct(j.d.expected)}, ${j.d.l2a} 2PA)`);
console.log("\nLargest negative stack terms:");
for (const j of [...dec].sort((x, y) => x.d.stack - y.d.stack).slice(0, 8))
  console.log(`  ${String(j.p.name).padEnd(22)} ${j.year} ${j.pos} stack ${gap(j.d.stack)} (realised ${pct(j.d.realised)} vs expected ${pct(j.d.expected)}, ${j.d.l2a} 2PA)`);

if (OUT) {
  const dump = {
    players: dec.map((j) => ({
      key: `${j.year}|${j.p.id}`, name: j.p.name, year: j.year, pos: j.pos,
      live: j.live.live,
      probe: { share: j.share, mpFixed: { paint: j.mp.paintFixed, mid: j.mp.midFixed, three: j.mp.threeFixed }, mpFixedU4: { paint: j.mp.paintFixedU4, mid: j.mp.midFixedU4, three: j.mp.threeFixedU4 } },
      sim: { min: j.live.min, fga: j.live.fga, fgm: j.live.fgm, fga2: j.live.fga2, fgm2: j.live.fgm2, fga3: j.live.fga3, fgm3: j.live.fgm3 },
      decomp: { realised: j.d.realised, expected: j.d.expected, mix: j.d.mix, stack: j.d.stack, interact: j.d.interact, l2a: j.d.l2a },
    })),
  };
  writeFileSync(OUT, JSON.stringify(dump, null, 2));
  console.log(`\nwrote ${OUT} (${dump.players.length} players)`);
}
