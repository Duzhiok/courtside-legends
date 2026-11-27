// Skills S0: what the 42 signature moves really do today, measured on the real engine (no game code touched).
// Per possession: capture the engine's own "unleashes X" emit (meta.skill) and the owner's fga/fgm/pts delta for that step.
// Baseline = the SAME owners' shots on possessions where no signature fired. Reports per move: uses per game per owner,
// make rate and points per shot when fired vs baseline, and the extra points one use is worth.
// Usage: node scripts/measure/signature-moves.mjs [gamesPerMatchup=6]
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { SKILL_PACKS } from "../../js/data/skills.js";

const GAMES = Number(process.argv[2]) || 6;
const MATCHUPS = [
  ["CHI", 1996, "SEA", 1996], ["HOU", 1994, "NYK", 1994], ["LAL", 2001, "PHI", 2001], ["SAS", 2003, "NJN", 2003],
  ["GSW", 2016, "CLE", 2016], ["DAL", 2011, "MIA", 2011], ["BOS", 1986, "HOU", 1986], ["LAL", 1987, "BOS", 1987],
];
const isOffenseSig = (id) => SKILL_PACKS[id]?.signature && SKILL_PACKS[id].kind === "offense";
const per = new Map(); // id -> { procs, shots, makes, pts }
const base = { shots: 0, makes: 0, pts: 0 };
const owners = new Map(); // playerId -> { games:Set, minutes }
let games = 0;
let possessions = 0;
let skipped = 0;

const team = (abbr, year) => {
  try {
    return realTeam(abbr, year);
  } catch {
    return null;
  }
};

for (const [h, hy, a, ay] of MATCHUPS) {
  for (let g = 0; g < GAMES; g++) {
    const home = team(h, hy);
    const away = team(a, ay);
    if (!home || !away) {
      skipped += 1;
      continue;
    }
    const sim = new GameSim({ home, away, youSide: "home", injuries: false, speed: 3, rng: seededStream(g * 97 + hy), onEvent() {}, onTick() {}, onEnd() {} });
    Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, running: true });
    let fired = [];
    const emit = sim.emit.bind(sim);
    sim.emit = (type, text, meta) => {
      if (meta?.skill?.isOffense && isOffenseSig(meta.skill.id)) fired.push(meta.skill);
      return emit(type, text, meta);
    };
    const all = [...sim.home.roster, ...sim.away.roster];
    for (const p of all) if ((p.skills || []).some(isOffenseSig)) owners.set(p.id, owners.get(p.id) || { games: new Set(), min: 0 });
    for (let guard = 0; sim.running && guard < 4000; guard++) {
      const snap = new Map(all.filter((p) => owners.has(p.id)).map((p) => [p.id, { fga: p.stats?.fga || 0, fgm: p.stats?.fgm || 0, pts: p.stats?.pts || 0 }]));
      fired = [];
      sim.step();
      possessions += 1;
      const sigBy = new Map(fired.map((s) => [s.playerId, s.id]));
      for (const p of all) {
        const s0 = snap.get(p.id);
        if (!s0) continue;
        const shot = (p.stats?.fga || 0) - s0.fga;
        const make = (p.stats?.fgm || 0) - s0.fgm;
        const pts = (p.stats?.pts || 0) - s0.pts;
        const id = sigBy.get(p.id);
        if (id) {
          const m = per.get(id) || { procs: 0, shots: 0, makes: 0, pts: 0 };
          m.procs += 1;
          m.shots += shot > 0 ? 1 : 0;
          m.makes += make > 0 ? 1 : 0;
          m.pts += pts;
          per.set(id, m);
        } else if (shot > 0) {
          base.shots += 1;
          base.makes += make > 0 ? 1 : 0;
          base.pts += pts;
        }
      }
    }
    for (const p of all) if (owners.has(p.id) && (p.stats?.min || 0) > 0) { owners.get(p.id).games.add(games); owners.get(p.id).min += p.stats.min; }
    games += 1;
  }
}

const ownerGames = [...owners.values()].reduce((t, o) => t + o.games.size, 0);
const baseMake = base.makes / base.shots;
const basePts = base.pts / base.shots;
const rows = [...per.entries()].map(([id, m]) => ({
  id,
  name: SKILL_PACKS[id]?.name,
  procs: m.procs,
  makeFired: m.shots ? m.makes / m.shots : 0,
  ptsPerUse: m.procs ? m.pts / m.procs : 0,
}));
rows.sort((x, y) => y.procs - x.procs);
const totalProcs = rows.reduce((t, r) => t + r.procs, 0);
const totalPts = [...per.values()].reduce((t, m) => t + m.pts, 0);
console.log(`games ${games} (skipped matchups ${skipped}), sim steps ${possessions}, owner-games ${ownerGames}`);
console.log(`baseline (same owners, no signature): ${base.shots} shots, make ${(baseMake * 100).toFixed(1)}%, ${basePts.toFixed(3)} pts/shot`);
console.log(`all signatures: ${totalProcs} uses = ${(totalProcs / ownerGames).toFixed(2)} per owner-game; ${(totalPts / totalProcs).toFixed(3)} pts/use; extra vs a normal shot ${(totalPts / totalProcs - basePts).toFixed(3)} pts/use`);
console.log("id | name | uses | uses/owner-game | make% fired | pts/use | extra pts/use");
for (const r of rows.filter((x) => x.procs >= 15)) {
  console.log([r.id, r.name, r.procs, (r.procs / ownerGames).toFixed(2), (r.makeFired * 100).toFixed(0) + "%", r.ptsPerUse.toFixed(2), (r.ptsPerUse - basePts).toFixed(2)].join(" | "));
}
console.log(`(${rows.filter((x) => x.procs < 15).length} moves with < 15 uses not listed: too few to read)`);
