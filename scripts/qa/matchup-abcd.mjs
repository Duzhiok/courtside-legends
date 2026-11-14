// Fixed-seed, Node-only A/B/C/D comparison for Team Intelligence v4.1
// (user ruling 2026-11-14, a721ed1): separate the payoff of a recommended
// lineup from the payoff of a recommended tactic.
//
//   A  原首发 + 默认战术      (top-OVR five, coach's first system)
//   B  推荐首发 + 默认战术    (recommendLineups under the default tactic)
//   C  原首发 + 推荐战术      (current five, recommended plan's tactic)
//   D  推荐首发 + 推荐战术    (recommended plan's five + tactic)
//
// Every cell replays the SAME paired seeds against the SAME opponent, so the
// only differences are the five and the tactic. GameSim is the only match
// engine; the recommendation modules only pick the inputs. No browser needed.
// Three scenarios so the comparison is not vacuous by construction:
//   S1 star collection vs GSW   (rec keeps the five; plan keeps the five)
//   S2 guard-heavy vs GSW      (rec keeps; recommended plan changes the five)
//   S3 bigs-heavy vs GSW       (rec swaps a center out; plan changes the five)
// Opponent is 2016 GSW (Curry 94 / Thompson 90 / Green 90): a spacing team at
// the same strength as the collections, so win rates stay measurable instead
// of saturating at 95-100% the way they did against 1996 UTA.
//
// Usage: node scripts/qa/matchup-abcd.mjs [gamesPerCell=100]
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { COACHES, coachTactics } from "../../js/data/coaches.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { recommendLineups } from "../../js/myteam/lineupRecommendations.js";
import { counterStrategies } from "../../js/myteam/counterStrategy.js";
import { scoutOpponent } from "../../js/myteam/opponentScouting.js";
import { ovr } from "../../js/myteam/playerRoleFit.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const card = (bref, season) => {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
};
const names = (ids, pool) => ids.map((id) => {
  const p = pool.find((x) => x.id === id);
  return p ? `${p.nameEn || p.name}(${ovr(p)})` : id;
}).join(", ");
const same = (x, y) => [...x].sort().join() === [...y].sort().join();

const COACH = COACHES.find((c) => c.id === "phil-1996-chi");
if (!COACH) throw new Error("phil-1996-chi coach card missing");
const DEFAULT_TACTIC = coachTactics(COACH)[0].id; // coach's first system = the default
const OPP_COACH = { id: "qa-opp", name: "OPP", specialTactics: ["balanced"], preferred: [], buffs: {} };

function opponent(teamAbbr, season) {
  const players = ROWS.filter((r) => r.season === season && r.team === teamAbbr).map((r) => seasonToCard(r));
  const t = { name: `${teamAbbr} ${season}`, players, coach: OPP_COACH };
  t.starterIds = [...players].sort((a, b) => ovr(b) - ovr(a)).slice(0, 5).map((p) => p.id);
  return t;
}

const SCENARIOS = [
  {
    id: "S1-star-vs-GSW",
    roster: [
      ["jordami01", 1996], ["pippesc01", 1996], ["drexlcl01", 1996], ["richmmi01", 1996],
      ["paytoga01", 1996], ["hardati01", 1996], ["kiddja01", 1996], ["barklch01", 1996],
      ["rodmade01", 1996], ["olajuha01", 1996], ["robinda01", 1996], ["mutomdi01", 1996],
    ],
    opp: ["GSW", 2016],
  },
  {
    id: "S2-guard-vs-GSW",
    roster: [
      ["kiddja01", 1996], ["paytoga01", 1996], ["drexlcl01", 1996], ["pippesc01", 1996],
      ["barklch01", 1996], ["hardati01", 1996], ["richmmi01", 1996], ["kukocto01", 1996],
      ["ewingpa01", 1996], ["mutomdi01", 1996], ["rodmade01", 1996], ["kerrst01", 1996],
    ],
    opp: ["GSW", 2016],
  },
  {
    id: "S3-bigs-vs-GSW",
    roster: [
      ["onealsh01", 1996], ["olajuha01", 1996], ["robinda01", 1996], ["ewingpa01", 1996],
      ["mutomdi01", 1996], ["kiddja01", 1996], ["paytoga01", 1996], ["hardati01", 1996],
      ["drexlcl01", 1996], ["pippesc01", 1996], ["barklch01", 1996], ["richmmi01", 1996],
    ],
    opp: ["GSW", 2016],
  },
];

const N = Number(process.argv[2] || 100);

function playGame(roster, homeIds, tacticId, oppTeam, seedStr) {
  const sim = new GameSim({
    home: { players: roster, starterIds: homeIds, coach: { ...COACH, specialTactics: [tacticId] } },
    away: { players: oppTeam.players, starterIds: oppTeam.starterIds, coach: OPP_COACH },
    youSide: "home",
    rng: seededStream(hashSeed(seedStr)),
    injuries: false,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  const snap = sim.runFast();
  return { home: snap.score.home, away: snap.score.away };
}

const t0 = Date.now();
console.log(`coach=${COACH.nameEn || COACH.name} default tactic=${DEFAULT_TACTIC} games/cell=${N}`);
for (const scen of SCENARIOS) {
  const roster = scen.roster.map(([b, s]) => card(b, s));
  const oppTeam = opponent(...scen.opp);
  const scout = scoutOpponent(oppTeam);
  // "Original starters": the top-5 by OVR — what a fresh collection's saved five is.
  const currentIds = [...roster].sort((a, b) => ovr(b) - ovr(a)).slice(0, 5).map((p) => p.id);
  const recLineup = recommendLineups({ coach: COACH, tacticalSystem: DEFAULT_TACTIC, roster, currentIds });
  const plans = counterStrategies({ coach: COACH, roster, opponent: scout, currentIds, currentTacticId: DEFAULT_TACTIC });
  if (!scout || !recLineup || !plans) throw new Error(`recommendation input missing (${scen.id})`);
  const recPlan = plans.plans.find((p) => p.id === plans.recommended);
  const cells = {
    A: { label: "A 原首发+默认战术", ids: currentIds, tactic: DEFAULT_TACTIC },
    B: { label: "B 推荐首发+默认战术", ids: recLineup.best.ids, tactic: DEFAULT_TACTIC },
    C: { label: "C 原首发+推荐战术", ids: currentIds, tactic: recPlan.tacticId },
    D: { label: "D 推荐首发+推荐战术", ids: recPlan.ids, tactic: recPlan.tacticId },
  };
  console.log(`\n=== ${scen.id} vs ${oppTeam.name} (starters ${names(oppTeam.starterIds, oppTeam.players)}) ===`);
  console.log(`scout threats: ${scout.threats.map((t) => `${t.name}(${t.kind}/${t.level})`).join(", ")}`);
  console.log(`lineup rec: verdict=${recLineup.verdict} U ${recLineup.current?.U} -> ${recLineup.best.U} swaps in=[${names(recLineup.swaps.in, roster) || "-"}] out=[${names(recLineup.swaps.out, roster) || "-"}]`);
  for (const p of plans.plans) {
    console.log(`plan ${p.id}: tactic=${p.tacticId} internal=${p.internal} effect=${p.counterEffect} exec=${p.execution} prof=${p.proficiency} changesFive=${p.changesFive} viable=${p.viable}`);
  }
  console.log(`recommended plan=${plans.recommended}`);
  for (const [k, c] of Object.entries(cells)) {
    console.log(`cell ${k}: tactic=${c.tactic} five=[${names(c.ids, roster)}]${same(c.ids, currentIds) && c.tactic === DEFAULT_TACTIC ? " (== A)" : ""}`);
  }
  const results = {};
  for (const [k, c] of Object.entries(cells)) {
    let wins = 0; let pf = 0; let pa = 0; const diffs = [];
    for (let i = 0; i < N; i++) {
      const g = playGame(roster, c.ids, c.tactic, oppTeam, `matchup-abcd|${scen.id}|${i}`);
      wins += g.home > g.away ? 1 : 0;
      pf += g.home; pa += g.away; diffs.push(g.home - g.away);
    }
    results[k] = { wins, pf: pf / N, pa: pa / N, diff: (pf - pa) / N, diffs };
    console.log(`${c.label}: W ${wins}/${N} (${(100 * wins / N).toFixed(1)}%) PF ${results[k].pf.toFixed(1)} PA ${results[k].pa.toFixed(1)} diff ${results[k].diff >= 0 ? "+" : ""}${results[k].diff.toFixed(2)}`);
  }
  const paired = (x, y) => {
    const d = results[x].diffs.map((v, i) => v - results[y].diffs[i]);
    return { mean: d.reduce((s, v) => s + v, 0) / d.length, pos: d.filter((v) => v > 0).length, neg: d.filter((v) => v < 0).length };
  };
  for (const [x, y, what] of [["B", "A", "lineup only (B-A)"], ["C", "A", "tactic only (C-A)"], ["D", "A", "both (D-A)"], ["D", "B", "tactic on top of lineup (D-B)"], ["D", "C", "lineup on top of tactic (D-C)"]]) {
    const p = paired(x, y);
    const vacuous = same(cells[x].ids, cells[y].ids) && cells[x].tactic === cells[y].tactic;
    console.log(`paired ${what}: mean diff ${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(2)} pts/game (${p.pos} seeds better, ${p.neg} worse, ${N - p.pos - p.neg} tied)${vacuous ? " [vacuous: identical inputs]" : ""}`);
  }
  // Reality check: does the internal ranking pick the best tactic? Play the
  // current five under EACH plan's tactic on the same paired seeds.
  console.log(`-- plan tactics, current five, same paired seeds (vs A=${DEFAULT_TACTIC}) --`);
  const ranked = [...plans.plans].sort((a, b) => b.internal - a.internal);
  for (const plan of ranked) {
    let wins = 0; let pf = 0; let pa = 0; const diffs = [];
    for (let i = 0; i < N; i++) {
      const g = playGame(roster, currentIds, plan.tacticId, oppTeam, `matchup-abcd|${scen.id}|${i}`);
      wins += g.home > g.away ? 1 : 0;
      pf += g.home; pa += g.away; diffs.push(g.home - g.away);
    }
    const d = diffs.map((v, i) => v - results.A.diffs[i]);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    console.log(`plan ${plan.id} (rank ${ranked.indexOf(plan) + 1}, internal=${plan.internal}): tactic=${plan.tacticId} W ${wins}/${N} diff ${((pf - pa) / N).toFixed(2)} vs A ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} (${d.filter((v) => v > 0).length}/${d.filter((v) => v < 0).length})`);
  }
}
console.log(`\ntotal ${Date.now() - t0}ms`);
console.log("limits: single coach (Phil 1996), single opponent team (2016 GSW), 12-card 1996 collections; no playoffs, no fatigue carryover, no user decisions mid-game; D's five and tactic come from one recommended plan.");
