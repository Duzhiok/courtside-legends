/**
 * B35 §15 measurement (READ-ONLY): in what context do SF 2-point shots happen?
 *
 * §13.2 found the SF 2P% deficit is NOT at formula level (SF probe paint/mid
 * makeP both beat SG, yet realised SF trails SG by 4.5pt) — the whole gap sits
 * in live selection (SF +3.7pt vs SG +7.4pt). This script tests the candidate
 * mechanisms behind that selection gap, using only what the existing event
 * stream already carries (no production-code change):
 *   - received vs self-created: shooter caught the last pass in this
 *     possession segment (meta.pass.receiverId) vs nobody passed to him;
 *   - passes before the shot in this possession segment (0 / 1 / 2+);
 *   - second-chance (offensive rebound earlier in the segment);
 *   - late-quarter (game clock <= 24s) and Q4-late (Q4+, clock < 120s);
 *   - makeP at the shot, parsed from the feed text "(62% ...)" — the engine's
 *     own openness-adjusted make probability, i.e. the best available proxy
 *     for defensive pressure on that attempt. Coverage is reported: blocked
 *     shots and fouled misses carry no meta.shot and are excluded (~2-3%).
 *
 * Position buckets use card-face pos (the §11/§12 method lesson: playPos
 * lets swingmen flip buckets). Same 6 pairs x 20 games = 120 games as §9.
 *
 * Usage: node scripts/measure/b35-sf-context.mjs [gamesPerPair=20]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 20);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const blank = () => ({
  fga2: 0, fgm2: 0,
  fgaRecv: 0, fgmRecv: 0, fgaSelf: 0, fgmSelf: 0,
  pass0: 0, pass1: 0, pass2: 0, fgmPass0: 0, fgmPass1: 0, fgmPass2: 0,
  fgaSC: 0, fgmSC: 0, fgaHC: 0, fgmHC: 0,
  fgaLateQ: 0, fgmLateQ: 0, fgaQ4Late: 0, fgmQ4Late: 0,
  makePSum: 0, makePN: 0, makePMadeSum: 0, makePMadeN: 0, makePMissSum: 0, makePMissN: 0,
  makePSelfSum: 0, makePSelfN: 0, makePRecvSum: 0, makePRecvN: 0,
  makePScSum: 0, makePScN: 0, makePHcSum: 0, makePHcN: 0,
});
const rows = new Map(); // pos -> aggregates
for (const p of POSITIONS) rows.set(p, blank());

let gamesPlayed = 0, gamesFinished = 0, eventFga2 = 0, parsedMakeP = 0, noMakeP = 0;
let statsFga2 = 0;

for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? realTeam(a, year) : realTeam(b, year);
    const away = i % 2 ? realTeam(b, year) : realTeam(a, year);
    // Card-face pos per player id (built from the rosters before tip-off).
    const posOf = new Map();
    for (const p of [...home.players, ...away.players]) posOf.set(p.id, p.pos);
    let segPassReceiver = null;
    let segPasses = 0;
    let secondChanceId = null;
    let lastPossession = null;
    const events = [];
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`b35sfctx|${year}|${a}${b}|${i}`)),
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
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      statsFga2 += (p.stats.fga || 0) - (p.stats.tpa || 0);
    }
    for (const e of events) {
      if (lastPossession !== null && e.possession !== lastPossession) {
        segPassReceiver = null; segPasses = 0; secondChanceId = null;
      }
      lastPossession = e.possession;
      if (e.meta?.pass?.receiverId) {
        segPassReceiver = e.meta.pass.receiverId;
        segPasses += 1;
      } else if (e.type === "reb" && e.meta?.reb) {
        if (e.meta.reb.offensive) secondChanceId = e.meta.reb.rebounderId;
        else secondChanceId = null;
        segPassReceiver = null; segPasses = 0;
      } else if (e.meta?.shot && e.meta.shot.pts === 2) {
        const pos = posOf.get(e.meta.shot.shooterId);
        const r = rows.get(pos);
        if (!r) { segPassReceiver = null; segPasses = 0; secondChanceId = null; continue; }
        const made = !!e.meta.shot.made;
        r.fga2 += 1; if (made) r.fgm2 += 1;
        if (segPassReceiver === e.meta.shot.shooterId) { r.fgaRecv += 1; if (made) r.fgmRecv += 1; }
        else { r.fgaSelf += 1; if (made) r.fgmSelf += 1; }
        if (segPasses === 0) { r.pass0 += 1; if (made) r.fgmPass0 += 1; }
        else if (segPasses === 1) { r.pass1 += 1; if (made) r.fgmPass1 += 1; }
        else { r.pass2 += 1; if (made) r.fgmPass2 += 1; }
        if (secondChanceId !== null) { r.fgaSC += 1; if (made) r.fgmSC += 1; }
        else { r.fgaHC += 1; if (made) r.fgmHC += 1; }
        if (typeof e.clock === "number" && e.clock <= 24) { r.fgaLateQ += 1; if (made) r.fgmLateQ += 1; }
        if (e.quarter >= 4 && typeof e.clock === "number" && e.clock < 120) { r.fgaQ4Late += 1; if (made) r.fgmQ4Late += 1; }
        // makeP is printed in the feed text as "(62% ..." / "（62% ...".
        const m = String(e.text || "").match(/[（(](\d+)%/);
        if (m) {
          const mp = Number(m[1]) / 100;
          r.makePSum += mp; r.makePN += 1;
          if (made) { r.makePMadeSum += mp; r.makePMadeN += 1; }
          else { r.makePMissSum += mp; r.makePMissN += 1; }
          if (segPassReceiver === e.meta.shot.shooterId) { r.makePRecvSum += mp; r.makePRecvN += 1; }
          else { r.makePSelfSum += mp; r.makePSelfN += 1; }
          if (secondChanceId !== null) { r.makePScSum += mp; r.makePScN += 1; }
          else { r.makePHcSum += mp; r.makePHcN += 1; }
          parsedMakeP += 1;
        } else noMakeP += 1;
        eventFga2 += 1;
        segPassReceiver = null; segPasses = 0; secondChanceId = null;
      }
    }
  }
}

console.log(`games ${gamesPlayed} (finished ${gamesFinished}), event 2PA ${eventFga2} vs stats 2PA ${statsFga2} (coverage ${(100 * eventFga2 / statsFga2).toFixed(1)}%), makeP parsed ${parsedMakeP}/${eventFga2} (${(100 * parsedMakeP / eventFga2).toFixed(1)}%, ${noMakeP} without pct in text)`);
for (const pos of POSITIONS) {
  const r = rows.get(pos);
  if (!r.fga2) continue;
  const share = (x) => `${(100 * x / r.fga2).toFixed(1)}%`;
  const fg = (m, a) => (a ? pct(m / a) : "-");
  const meanMP = r.makePN ? pct(r.makePSum / r.makePN) : "-";
  const meanMPMade = r.makePMadeN ? pct(r.makePMadeSum / r.makePMadeN) : "-";
  const meanMPMiss = r.makePMissN ? pct(r.makePMissSum / r.makePMissN) : "-";
  console.log(`${pos} n2PA=${r.fga2}  2P% ${fg(r.fgm2, r.fga2)}`);
  console.log(`  received ${share(r.fgaRecv)} ${fg(r.fgmRecv, r.fgaRecv)}  |  self-created ${share(r.fgaSelf)} ${fg(r.fgmSelf, r.fgaSelf)}`);
  console.log(`  passes before shot: 0 ${share(r.pass0)} ${fg(r.fgmPass0, r.pass0)}  |  1 ${share(r.pass1)} ${fg(r.fgmPass1, r.pass1)}  |  2+ ${share(r.pass2)} ${fg(r.fgmPass2, r.pass2)}`);
  console.log(`  second-chance ${share(r.fgaSC)} ${fg(r.fgmSC, r.fgaSC)}  |  half-court ${share(r.fgaHC)} ${fg(r.fgmHC, r.fgaHC)}`);
  console.log(`  late-quarter (clock<=24) ${share(r.fgaLateQ)} ${fg(r.fgmLateQ, r.fgaLateQ)}  |  Q4 late (clock<120) ${share(r.fgaQ4Late)} ${fg(r.fgmQ4Late, r.fgaQ4Late)}`);
  console.log(`  mean makeP at shot ${meanMP} (made ${meanMPMade} / missed ${meanMPMiss}, n=${r.makePN})`);
  const meanMPSelf = r.makePSelfN ? pct(r.makePSelfSum / r.makePSelfN) : "-";
  const meanMPRecv = r.makePRecvN ? pct(r.makePRecvSum / r.makePRecvN) : "-";
  const meanMPSc = r.makePScN ? pct(r.makePScSum / r.makePScN) : "-";
  const meanMPHc = r.makePHcN ? pct(r.makePHcSum / r.makePHcN) : "-";
  console.log(`  mean makeP by bucket: self-created ${meanMPSelf} (n=${r.makePSelfN})  |  received ${meanMPRecv} (n=${r.makePRecvN})  |  second-chance ${meanMPSc} (n=${r.makePScN})  |  half-court ${meanMPHc} (n=${r.makePHcN})`);
}
