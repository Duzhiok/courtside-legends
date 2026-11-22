/**
 * B35 §8.2 measurement (READ-ONLY): after a player gets the ball, who shoots — and from where?
 *
 * B35 §8 found the imbalance is NOT pickBallHandler's pass weight (ablated to 0.4x, no change):
 * strong / high-rebound bigs score too much per minute (strength +0.44 vs real -0.03) while
 * three-point / fast wings score too little. The next candidates are (1) who shoots after receiving
 * the ball (kickToTeammate weights, shot-type allocation) and (2) putbacks / second-chance scoring.
 *
 * Method: drive real seeded games step-by-step (like tests/domainEvents.test.js) and classify every
 * field-goal attempt from the domain-event stream:
 *   - second-chance: the shot comes in the possession right after an offensive rebound
 *     (meta.reb.offensive); "by rebounder" when the shooter IS that rebounder;
 *   - putback: the narrow crash channel — the offensive board was grabbed by a hustle/crash/putback
 *     player (the "reb" text says he is crashing for a second chance) and the shooter IS that
 *     rebounder, so the engine forces him the ball with the wPaint x2.4 putback boost;
 *   - received: the shooter is the receiver of the last "pass" event (kick / repass / handoff) in
 *     the current possession segment; otherwise the shot is self-created by the ball handler;
 *   - three vs two from meta.shot.pts.
 * Plus a decision-level probe: call the exported chooseShot() on every real card under a neutral
 * context and under a putback context, and tally the paint/mid/three mix — this answers whether
 * shot-type allocation itself is pulled toward the paint by strength/paint.
 *
 * Nothing in the repo is modified. Blocked shots carry no meta.shot (they emit meta.block instead),
 * so event FGA is ~2-3% below stats FGA; the script reports that coverage gap.
 *
 * Usage: node scripts/measure/b35-shot-split.mjs [gamesPerPair=20] [worstN=12]
 *
 * NOTE (§23, 2026-11-22): passes with kind "assist" are ignored (7fd1d37
 * emits them before the score event, only on makes — they would select the
 * "received" bucket on makes). Only real in-possession passes count.
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim, chooseShot } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";
import { withRng } from "../../js/core/rng.js";

const N = Number(process.argv[2] || 20);
const WORST = Number(process.argv[3] || 12);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];

// ---------- helpers ----------
const ranks = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
function pearson(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");

// ---------- Part A: game-level shot split from the event stream ----------
const rows = new Map(); // `${year}|${playerId}` -> aggregates
let gamesPlayed = 0, gamesFinished = 0, eventFga = 0, statsFga = 0, putbackFlags = 0, crashRebs = 0, orebCount = 0, rebCount = 0, hustleCount = 0, rosterCount = 0;

for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? realTeam(a, year) : realTeam(b, year);
    const away = i % 2 ? realTeam(b, year) : realTeam(a, year);
    // Per-possession-segment state, reset on every shot / rebound / possession flip.
    let segPassReceiver = null; // receiverId of the last pass event in this segment
    let secondChanceId = null; // rebounderId of the last offensive rebound (any)
    let pendingPutback = null; // rebounderId of the last CRASH offensive rebound (narrow channel)
    let lastPossession = null;
    const events = [];
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`b35split|${year}|${a}${b}|${i}`)),
      onEvent: (e) => events.push(e),
      onTick: () => {}, onEnd: () => {},
    });
    let steps = 0;
    sim.running = true;
    while (sim.running && steps < 4000) {
      sim.step();
      steps += 1;
      if (sim.paused) sim.setPaused(false);
    }
    gamesPlayed += 1;
    if (!sim.running) gamesFinished += 1;
    const byId = new Map();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) byId.set(p.id, p);
    const rowFor = (year, id) => {
      const k = `${year}|${id}`;
      let r = rows.get(k);
      if (!r) { r = { p: byId.get(id), year, min: 0, fga: 0, pts: 0, fga3: 0, fgaPut: 0, ptsPut: 0, fgaSC: 0, ptsSC: 0, fgaSCReb: 0, ptsSCReb: 0, fgaRecv: 0, fgaSelf: 0 }; rows.set(k, r); }
      return r;
    };
    for (const e of events) {
      if (lastPossession !== null && e.possession !== lastPossession) {
        segPassReceiver = null; pendingPutback = null; secondChanceId = null;
      }
      lastPossession = e.possession;
      // Any ball-change carries meta.pass, whatever the event type: "pass" for kick/handoff,
      // "coach" for the low-appetite re-pass (sim.js:1135-1139, kind "repass"). B53.
      // §23: ignore kind "assist" passes (7fd1d37: emitted before the score
      // event, only on makes — they would select "received" on makes).
      if (e.meta?.pass?.receiverId && e.meta.pass.kind !== "assist") {
        segPassReceiver = e.meta.pass.receiverId;
      } else if (e.type === "reb" && e.meta?.reb) {
        rebCount += 1;
        // A crash board sets crashPutbackId for the NEXT possession; a plain board or a
        // defensive board ends the segment. The crash is only visible in the text.
        const crash = e.meta.reb.offensive && (String(e.text || "").includes("二次进攻") || String(e.text || "").includes("second chance coming"));
        if (e.meta.reb.offensive) {
          orebCount += 1;
          secondChanceId = e.meta.reb.rebounderId;
          if (crash) { pendingPutback = e.meta.reb.rebounderId; crashRebs += 1; }
        } else {
          pendingPutback = null; secondChanceId = null;
        }
        segPassReceiver = null;
      } else if (e.meta?.shot) {
        const shooterId = e.meta.shot.shooterId;
        const isPutback = pendingPutback !== null && pendingPutback === shooterId;
        const isSecondChance = secondChanceId !== null;
        const isSecondChanceReb = secondChanceId !== null && secondChanceId === shooterId;
        if (pendingPutback !== null) putbackFlags += 1;
        const r = rowFor(year, shooterId);
        r.fga += 1;
        r.pts += e.meta.shot.made ? e.meta.shot.pts : 0;
        if (e.meta.shot.pts === 3) r.fga3 += 1;
        if (isPutback) { r.fgaPut += 1; r.ptsPut += e.meta.shot.made ? e.meta.shot.pts : 0; }
        if (isSecondChance) { r.fgaSC += 1; r.ptsSC += e.meta.shot.made ? e.meta.shot.pts : 0; }
        if (isSecondChanceReb) { r.fgaSCReb += 1; r.ptsSCReb += e.meta.shot.made ? e.meta.shot.pts : 0; }
        if (segPassReceiver === shooterId) r.fgaRecv += 1; else r.fgaSelf += 1;
        eventFga += 1;
        segPassReceiver = null; pendingPutback = null; secondChanceId = null;
      }
    }
    // Per-game box-score totals (minutes + stats FGA for the coverage check).
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const k = `${year}|${p.id}`;
      const r = rows.get(k) || { p, year, min: 0, fga: 0, pts: 0, fga3: 0, fgaPut: 0, ptsPut: 0, fgaSC: 0, ptsSC: 0, fgaSCReb: 0, ptsSCReb: 0, fgaRecv: 0, fgaSelf: 0 };
      r.min += p.stats.min;
      rows.set(k, r);
      statsFga += p.stats.fga || 0;
    }
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      rosterCount += 1;
      const o = p.orders || {};
      if (o.usage === "hustle" || o.action === "crash" || o.attack === "putback") hustleCount += 1;
    }
  }
}
const used = [...rows.values()].filter((r) => r.min >= 12 * N && (r.p.raw?.mpg || 0) >= 12 && r.p.raw.fga > 0);
const per36 = (r, k) => ((r[k] / r.min) * 36);
const real36 = (r) => (r.p.raw.fga / r.p.raw.mpg) * 36;
const realPts36 = (r) => (r.p.raw.ppg / r.p.raw.mpg) * 36;

console.log(`Part A: ${gamesPlayed} games (${gamesFinished} finished), ${used.length} players, event FGA ${eventFga} vs stats FGA ${statsFga} (coverage ${(100 * eventFga / Math.max(1, statsFga)).toFixed(1)}%; gap = blocked shots, no meta.shot), offensive boards ${orebCount}/${rebCount} (${(100 * orebCount / Math.max(1, rebCount)).toFixed(1)}% ORB rate), crash boards ${crashRebs}, putback-flagged shots ${putbackFlags}, hustle/crash/putback orders ${hustleCount}/${rosterCount} roster slots`);
const tot = (k) => sum(used, (r) => r[k]);
console.log(`\nFGA split (of ${tot("fga")} classified attempts): second-chance ${tot("fgaSC")} (${(100 * tot("fgaSC") / tot("fga")).toFixed(1)}%, of which by the rebounder ${tot("fgaSCReb")}), crash-putback ${tot("fgaPut")} (${(100 * tot("fgaPut") / tot("fga")).toFixed(1)}%), received-after-pass ${tot("fgaRecv")} (${(100 * tot("fgaRecv") / tot("fga")).toFixed(1)}%), self-created ${tot("fgaSelf")} (${(100 * tot("fgaSelf") / tot("fga")).toFixed(1)}%), threes ${tot("fga3")} (${(100 * tot("fga3") / tot("fga")).toFixed(1)}%)`);
console.log(`PTS split (of ${tot("pts")} points): second-chance ${tot("ptsSC")} (${(100 * tot("ptsSC") / Math.max(1, tot("pts"))).toFixed(1)}%, of which by the rebounder ${tot("ptsSCReb")}), crash-putback ${tot("ptsPut")} (${(100 * tot("ptsPut") / Math.max(1, tot("pts"))).toFixed(1)}%)`);
const posOf = (r) => (r.p.playPos || r.p.pos || "?");
for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = used.filter((r) => posOf(r) === pos);
  if (!g.length) continue;
  console.log(`  ${pos.padEnd(3)} n=${String(g.length).padStart(3)}  FGA/36 ${(sum(g, (r) => per36(r, "fga")) / g.length).toFixed(1)}  2nd-chance share of FGA ${(100 * sum(g, (r) => r.fgaSC) / Math.max(1, sum(g, (r) => r.fga))).toFixed(1)}% (by rebounder ${(100 * sum(g, (r) => r.fgaSCReb) / Math.max(1, sum(g, (r) => r.fga))).toFixed(1)}%)  2nd-chance share of PTS ${(100 * sum(g, (r) => r.ptsSC) / Math.max(1, sum(g, (r) => r.pts))).toFixed(1)}%  received share ${(100 * sum(g, (r) => r.fgaRecv) / Math.max(1, sum(g, (r) => r.fga))).toFixed(1)}%  3P share ${(100 * sum(g, (r) => r.fga3) / Math.max(1, sum(g, (r) => r.fga))).toFixed(1)}%`);
}
// The key test: does the strength/rebound scoring correlation survive when second-chance points are removed?
console.log("\nSpearman vs per-minute scoring (sim / real) — total vs regular-only (2nd-chance excluded) vs 2nd-chance-only:");
for (const [label, key] of [["strength", "strength"], ["rebound", "rebound"], ["three", "three"], ["speed", "speed"], ["scoring", "scoring"], ["paint", "paint"]]) {
  const attr = used.map((r) => r.p[key] ?? 50);
  const tot36 = used.map((r) => per36(r, "pts"));
  const reg36 = used.map((r) => ((r.pts - r.ptsSC) / r.min) * 36);
  const sc36 = used.map((r) => (r.ptsSC / r.min) * 36);
  const real = used.map((r) => realPts36(r));
  console.log(`  ${label.padEnd(9)} total ${f2(spearman(attr, tot36))}  regular-only ${f2(spearman(attr, reg36))}  2nd-chance-only ${f2(spearman(attr, sc36))}  (real ${f2(spearman(attr, real))})`);
}
console.log("\nSpearman vs FGA/36 (sim / real):");
for (const [label, key] of [["strength", "strength"], ["rebound", "rebound"], ["three", "three"], ["speed", "speed"]]) {
  const attr = used.map((r) => r.p[key] ?? 50);
  const totF = used.map((r) => per36(r, "fga"));
  const regF = used.map((r) => ((r.fga - r.fgaSC) / r.min) * 36);
  const realF = used.map((r) => real36(r));
  console.log(`  ${label.padEnd(9)} total ${f2(spearman(attr, totF))}  regular-only ${f2(spearman(attr, regF))}  (real ${f2(spearman(attr, realF))})`);
}
console.log("\nmost 2nd-chance-DEPENDENT scorers (2nd-chance share of their PTS, min 8 pts/36):");
for (const r of [...used].filter((r) => per36(r, "pts") >= 8).sort((x, y) => (y.ptsSC / Math.max(1, y.pts)) - (x.ptsSC / Math.max(1, x.pts))).slice(0, WORST))
  console.log(`  ${String(r.p.name).padEnd(22)} ${r.year} ${posOf(r)} pts/36 ${per36(r, "pts").toFixed(1)} (real ${realPts36(r).toFixed(1)})  2nd-chance ${(100 * r.ptsSC / Math.max(1, r.pts)).toFixed(0)}% (by rebounder ${(100 * r.ptsSCReb / Math.max(1, r.pts)).toFixed(0)}%)  reb ${r.p.rebound} str ${r.p.strength}`);
console.log("\nmost 2nd-chance-STARVED bigs (C/PF, real pts/36 >= 10, 2nd-chance share of PTS < 5%):");
for (const r of [...used].filter((r) => ["C", "PF"].includes(posOf(r)) && realPts36(r) >= 10 && (r.ptsSC / Math.max(1, r.pts)) < 0.05).sort((x, y) => realPts36(y) - realPts36(x)).slice(0, WORST))
  console.log(`  ${String(r.p.name).padEnd(22)} ${r.year} ${posOf(r)} pts/36 ${per36(r, "pts").toFixed(1)} (real ${realPts36(r).toFixed(1)})  2nd-chance ${(100 * r.ptsSC / Math.max(1, r.pts)).toFixed(0)}%  reb ${r.p.rebound} str ${r.p.strength}`);

// ---------- Part B: decision-level chooseShot zone probe ----------
console.log("\nPart B: chooseShot zone mix (300 draws per player, neutral context; + putback context)");
const DRAW = 300;
const probeRows = [];
for (const [a, b, year] of PAIRS) {
  const team = realTeam(a, year);
  const onCourt = team.players.slice(0, 5);
  const off = { coach: { playerAutonomy: 40, buffs: { offense: 8 } }, temp: {}, tactic: { threeRate: 1, paintBias: 1, id: "balanced" }, onCourt };
  for (const p of team.players) {
    const tally = (ctx) => {
      const c = { three: 0, paint: 0, mid: 0 };
      withRng(seededStream(hashSeed(`b35probe|${year}|${p.id}|${ctx ? "put" : "neu"}`)), () => {
        for (let k = 0; k < DRAW; k += 1) c[chooseShot(p, off, null, ctx).zone] += 1;
      });
      return c;
    };
    const neu = tally(null);
    const put = tally({ putback: true });
    probeRows.push({ p, year, neu, put });
  }
}
const share = (c, z) => c[z] / DRAW;
console.log(`  ${probeRows.length} players. neutral paint share by position:`);
for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = probeRows.filter((r) => (r.p.playPos || r.p.pos) === pos);
  if (!g.length) continue;
  console.log(`  ${pos.padEnd(3)} n=${String(g.length).padStart(3)}  paint ${(100 * sum(g, (r) => share(r.neu, "paint")) / g.length).toFixed(0)}%  mid ${(100 * sum(g, (r) => share(r.neu, "mid")) / g.length).toFixed(0)}%  three ${(100 * sum(g, (r) => share(r.neu, "three")) / g.length).toFixed(0)}%  | putback ctx paint ${(100 * sum(g, (r) => share(r.put, "paint")) / g.length).toFixed(0)}%`);
}
console.log("\n  Spearman vs neutral paint share (chooseShot decision level):");
for (const [label, key] of [["strength", "strength"], ["rebound", "rebound"], ["paint", "paint"], ["three", "three"], ["speed", "speed"], ["scoring", "scoring"]]) {
  const attr = probeRows.map((r) => r.p[key] ?? 50);
  const paint = probeRows.map((r) => share(r.neu, "paint"));
  const three = probeRows.map((r) => share(r.neu, "three"));
  console.log(`  ${label.padEnd(9)} paint ${f2(spearman(attr, paint))}  three ${f2(spearman(attr, three))}`);
}
console.log("\n  biggest paint-leaners under neutral context (paint share >= 70%):");
for (const r of [...probeRows].filter((r) => share(r.neu, "paint") >= 0.7).sort((x, y) => share(y.neu, "paint") - share(x.neu, "paint")).slice(0, WORST))
  console.log(`  ${String(r.p.name).padEnd(22)} ${r.year} ${r.p.playPos || r.p.pos} paint ${(100 * share(r.neu, "paint")).toFixed(0)}% mid ${(100 * share(r.neu, "mid")).toFixed(0)}% three ${(100 * share(r.neu, "three")).toFixed(0)}%  paint ${r.p.paint} str ${r.p.strength} reb ${r.p.rebound} three ${r.p.three}`);
