// Fixed-seed GameSim A/B: does applying a counter-plan (its five + its system) move the real result vs the saved five + balanced?
//   node scripts/research/matchup-plan-ab.mjs [games=80]
import { realCards } from "../../tests/helpers/realGame.js";
import { COACHES } from "../../js/data/coaches.js";
import { overall } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { scoutOpponent } from "../../js/myteam/opponentScouting.js";
import { counterStrategies } from "../../js/myteam/counterStrategy.js";
const N = Number(process.argv[2]) || 80;
const card = (b, y) => { const c = realCards(b); return c.find((x) => x.season === y) || [...c].sort((p, q) => overall(q) - overall(p))[0]; };
const sq = (l) => l.map(([b, y]) => (realCards(b).length ? card(b, y) : null)).filter(Boolean);
// An ordinary squad (role players of mixed seasons), so the opponent's stars actually matter -- a roster of all-stars drowns every plan.
const MINE = sq([["millspa01", 2013], ["dragigo01", 2013], ["hardati02", 2019], ["goberru01", 2019], ["thompkl01", 2016], ["mutomdi01", 1998], ["livinsh01", 2016], ["varejan01", 2016], ["iguodan01", 2016], ["bogutan01", 2016]]);
const CUR = [...MINE].sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => p.id);
const OPPS = {
  LAL2000: sq([["onealsh01", 2000], ["bryanko01", 2000], ["harpero01", 2000], ["shawbr01", 2000], ["fishede01", 2000], ["horryro01", 2000]]),
  GSW2016: sq([["curryst01", 2016], ["thompkl01", 2016], ["greendr01", 2016], ["barnema02", 2016], ["iguodan01", 2016], ["bogutan01", 2016], ["livinsh01", 2016], ["varejan01", 2016]]),
};
const base = COACHES.find((c) => c.id === "rookie-hc-2024");
const run = (opp, ids, tactic) => {
  let diff = 0, wins = 0;
  for (let seed = 1; seed <= N; seed++) {
    const coach = structuredClone(base); coach.specialTactics = [tactic, ...coach.specialTactics.filter((t) => t !== tactic)];
    const s = new GameSim({ home: { players: structuredClone(MINE), name: "ME", coach, starterIds: ids }, away: { players: structuredClone(opp), name: "OPP" }, youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {} });
    const snap = s.runFast(); const d = snap.score.home - snap.score.away; diff += d; if (d > 0) wins++;
  }
  return `margin ${(diff / N).toFixed(1)}  wins ${wins}/${N}`;
};
for (const [name, opp] of Object.entries(OPPS)) {
  const r = counterStrategies({ coach: base, roster: MINE, opponent: scoutOpponent({ name, players: opp }), currentIds: CUR, currentTacticId: "balanced" });
  console.log(`\n${name}  recommended=${r.recommended}  containViable=${r.containViable}`);
  console.log("  saved five + balanced :", run(opp, CUR, "balanced"));
  for (const p of r.plans) console.log(`  ${p.id.padEnd(8)} ${p.tacticId.padEnd(11)} :`, run(opp, p.ids, p.tacticId));
}
