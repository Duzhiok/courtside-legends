/**
 * B35 §16 Part A follow-up (READ-ONLY): who are the thr != 0.44 shooters?
 * The gate-dist probe found the re-pass gate never fires in these games and
 * the SF-SG self-created makeP gap sits entirely in the thr-0.30 bucket, so
 * name the players in that bucket and report their shot counts / makeP.
 * Same 120 games as §15.1 (seed tag `b35sfctx`).
 *
 * Usage: node scripts/measure/b35-gate-stars.mjs [gamesPerPair=20]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { shotGateLevel, shotOpenThreshold } from "../../js/engine/gameplan.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 20);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const pct = (x) => `${(100 * x).toFixed(1)}%`;

const stars = new Map(); // id -> { name, pos, team, year, gate, thr, fga2, fgm2, selfFga, selfFgm, mpSum, mpN, selfMpSum, selfMpN }
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const home = i % 2 ? realTeam(a, year) : realTeam(b, year);
    const away = i % 2 ? realTeam(b, year) : realTeam(a, year);
    const posOf = new Map();
    for (const p of [...home.players, ...away.players]) posOf.set(p.id, p.pos);
    const teamOf = new Map();
    for (const p of home.players) teamOf.set(p.id, `${home.name}${year}`);
    for (const p of away.players) teamOf.set(p.id, `${away.name}${year}`);
    let segPassReceiver = null;
    let lastPossession = null;
    const events = [];
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`b35sfctx|${year}|${a}${b}|${i}`)),
      onEvent: (e) => events.push(e),
      onTick: () => {}, onEnd: () => {},
    });
    const gateOf = new Map();
    for (const p of [...sim.home.roster, ...sim.away.roster]) {
      gateOf.set(p.id, { gate: shotGateLevel(p), thr: shotOpenThreshold(p), name: p.name });
    }
    let steps = 0;
    sim.running = true;
    while (sim.running && steps < 4000) {
      sim.step();
      steps += 1;
      if (sim.paused) sim.setPaused(false);
    }
    for (const e of events) {
      if (lastPossession !== null && e.possession !== lastPossession) segPassReceiver = null;
      lastPossession = e.possession;
      if (e.meta?.pass?.receiverId) {
        segPassReceiver = e.meta.pass.receiverId;
      } else if (e.type === "reb" && e.meta?.reb) {
        segPassReceiver = null;
      } else if (e.meta?.shot && e.meta.shot.pts === 2) {
        const g = gateOf.get(e.meta.shot.shooterId);
        if (!g || g.thr === 0.44) { segPassReceiver = null; continue; }
        const id = e.meta.shot.shooterId;
        if (!stars.has(id)) {
          stars.set(id, {
            name: g.name, pos: posOf.get(id), team: teamOf.get(id),
            gate: g.gate, thr: g.thr, fga2: 0, fgm2: 0,
            selfFga: 0, selfFgm: 0, mpSum: 0, mpN: 0, selfMpSum: 0, selfMpN: 0,
          });
        }
        const s = stars.get(id);
        const made = !!e.meta.shot.made;
        const self = segPassReceiver !== id;
        s.fga2 += 1; if (made) s.fgm2 += 1;
        if (self) { s.selfFga += 1; if (made) s.selfFgm += 1; }
        const m = String(e.text || "").match(/[（(](\d+)%/);
        if (m) {
          const mp = Number(m[1]) / 100;
          s.mpSum += mp; s.mpN += 1;
          if (self) { s.selfMpSum += mp; s.selfMpN += 1; }
        }
        segPassReceiver = null;
      }
    }
  }
}

const rows = [...stars.values()].sort((x, y) => y.fga2 - x.fga2);
console.log(`${rows.length} distinct players with thr != 0.44 (aggression high / thr 0.30, or thr 0.36):`);
for (const s of rows) {
  const fg = (m, a) => (a ? pct(m / a) : "-");
  const mp = (sum, n) => (n ? pct(sum / n) : "-");
  console.log(`  ${s.name} ${s.pos} ${s.team} gate=${s.gate.toFixed(2)} thr=${s.thr.toFixed(2)}: 2PA ${s.fga2} 2P% ${fg(s.fgm2, s.fga2)} meanMakeP ${mp(s.mpSum, s.mpN)} | self ${s.selfFga} 2P% ${fg(s.selfFgm, s.selfFga)} meanMakeP ${mp(s.selfMpSum, s.selfMpN)}`);
}
