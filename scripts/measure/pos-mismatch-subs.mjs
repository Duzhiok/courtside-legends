// Measure: when GameSim substitutes (auto rotation / CPU / quick sim), how far is the inbound player's REAL position
// from the slot he ends up in? 0 = same, 4 = PG<->C. (Before js/engine/lineupSlots.js the newcomer always inherited
// the leaver's slot: 42% two-or-more steps off, 20% three-or-four.)
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { normalizePos } from "../../js/data/positions.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const ORDER = ["PG", "SG", "SF", "PF", "C"];
const idx = (p) => ORDER.indexOf(normalizePos(p));
const PAIRS = [[["GSW", 2016], ["CLE", 2016]], [["CHI", 1996], ["LAL", 2001]], [["SAS", 2014], ["MIA", 2013]], [["DAL", 2011], ["BOS", 2008]]];
const N = Number(process.argv[2] || 25);
const hist = [0, 0, 0, 0, 0]; const examples = new Map(); let subs = 0;
for (const [a, b] of PAIRS) for (let i = 0; i < N; i++) {
  const sim = new GameSim({ home: realTeam(...a), away: realTeam(...b), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`pm|${a[0]}|${i}`)) });
  sim.setAutoRotation(true);
  const orig = sim.substitute.bind(sim);
  sim.substitute = (outId, inId, side) => {
    const t = sim.sideByKey(side);
    const out = t.onCourt.find((p) => p.id === outId); const inn = t.bench.find((p) => p.id === inId);
    const ok = orig(outId, inId, side);
    if (ok && out && inn) {
      const slot = inn.playPos; const d = Math.abs(idx(inn.pos) - idx(slot)); // the slot he ACTUALLY ends up in (after any re-seat)
      if (d >= 0) { hist[d]++; subs++; if (d >= 3 && examples.size < 6) examples.set(`${inn.name} (${inn.pos}) -> slot ${slot}`, d); }
    }
    return ok;
  };
  sim.runFast();
}
console.log("subs:", subs, " distance histogram (0..4):", hist.join(" "));
console.log("share >=2 steps off:", (((hist[2] + hist[3] + hist[4]) / subs) * 100).toFixed(1) + "%", " >=3 (PG/SG<->PF/C):", (((hist[3] + hist[4]) / subs) * 100).toFixed(1) + "%");
console.log("examples:", [...examples.keys()].join(" | "));
