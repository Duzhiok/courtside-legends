/**
 * Rivalry enforcer easter egg (user idea 2026-11-14): in a rivalry game,
 * having an enforcer on the floor is a double-edged sword — the enforcer
 * may rattle the rival, or whistle himself into foul trouble.
 *
 * Policy (same as rebornSeason.test.js): game RESULTS are never asserted.
 * These tests pin mechanics (pairing, rolls, effects, report shape) and
 * the Career 2.0 ruling guard (no OVR / shooting / dice change).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import {
  ENFORCER_EGG_GAME_CHANCE,
  createEggWatcher,
  eggCopy,
  findEggPair,
} from "../js/reborn/enforcerEgg.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";
import { GameSim } from "../js/engine/sim.js";
import { buildSeason, driveGame, playGame, rosterCards } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { rivalryReportHtml } from "../js/ui/reborn/rivalryView.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

// --- Data: the 1996-97 pool needs enforcers, or the egg can never fire ---

const ENFORCERS_1997 = [
  ["rodmade01", "Dennis Rodman", "CHI"],
  ["oaklech01", "Charles Oakley", "NYK"],
  ["masonan01", "Anthony Mason", "CHH"],
  ["mahorri01", "Rick Mahorn", "DET"],
];

for (const [bref, name, team] of ENFORCERS_1997) {
  test(`${name} (${team}, 1996-97) has the enforcer trait`, () => {
    const row = ROWS.find((r) => r.bref === bref && r.season === 1997);
    assert.ok(row, `${bref} has a 1996-97 row`);
    assert.equal(row.team, team);
    const card = seasonToCard(row);
    assert.ok((card.skills || []).includes("enforcer"), `${name} skills: ${card.skills}`);
  });
}

test("Rodman keeps his signature kit and gains enforcer", () => {
  const row = ROWS.find((r) => r.bref === "rodmade01" && r.season === 1997);
  const card = seasonToCard(row);
  for (const id of ["rebound_maniac", "stamina_monster", "lockdown", "enforcer"]) {
    assert.ok(card.skills.includes(id), `Rodman missing ${id}: ${card.skills}`);
  }
});

test("Oakley keeps his role-layer kit and gains enforcer", () => {
  const row = ROWS.find((r) => r.bref === "oaklech01" && r.season === 1997);
  const card = seasonToCard(row);
  for (const id of ["enforcer", "motor_engine", "crash_board"]) {
    assert.ok(card.skills.includes(id), `Oakley missing ${id}: ${card.skills}`);
  }
});

// --- Pairing: both must actually be on the floor ---

const rodman = () => ({ id: "e-rodman", bref: "rodmade01", name: "罗德曼", nameEn: "Dennis Rodman", skills: ["rebound_maniac", "enforcer"], stats: { pf: 1 } });
const jordan = () => ({ id: "r-jordan", bref: "jordami01", name: "乔丹", nameEn: "Michael Jordan", skills: ["god_mode"], hot: 1, mood: 60, stats: {} });
const pippen = () => ({ id: "p-pippen", bref: "pippesc01", name: "皮蓬", nameEn: "Scottie Pippen", skills: ["lockdown"], stats: {} });

test("findEggPair needs your enforcer AND the rival, both on court", () => {
  const pair = findEggPair([rodman(), pippen()], [jordan()], ["jordami01"]);
  assert.equal(pair.enforcer.bref, "rodmade01");
  assert.equal(pair.rival.bref, "jordami01");
  assert.equal(findEggPair([pippen()], [jordan()], ["jordami01"]), null, "no enforcer");
  assert.equal(findEggPair([rodman()], [pippen()], ["jordami01"]), null, "rival not on court");
  assert.equal(findEggPair([rodman()], [jordan()], []), null, "no rivals at all");
  assert.equal(findEggPair([rodman()], [jordan()], ["olajuha01"]), null, "wrong rival");
});

test("findEggPair is deterministic: first enforcer, first rival", () => {
  const oakley = { id: "e-oakley", bref: "oaklech01", name: "奥克利", skills: ["enforcer"], stats: {} };
  const ewing = { id: "r-ewing", bref: "ewingpa01", name: "尤因", skills: [], stats: {} };
  const pair = findEggPair([oakley, rodman()], [ewing, jordan()], ["jordami01", "ewingpa01"]);
  assert.equal(pair.enforcer.bref, "oaklech01");
  assert.equal(pair.rival.bref, "ewingpa01");
});

// --- Watcher on a fake sim (no GameSim needed for the mechanics) ---

function fakeSim({ onCourtYou = [rodman()], onCourtOpp = [jordan()] } = {}) {
  const emitted = [];
  return {
    sim: {
      running: true,
      youSide: "home",
      quarter: 2,
      clock: 500,
      home: { onCourt: onCourtYou, morale: 50, temp: {} },
      away: { onCourt: onCourtOpp, morale: 50, temp: {} },
      emit(type, text, meta) { emitted.push({ type, text, meta }); },
      S: (zh) => zh,
    },
    emitted,
  };
}

/** rng that yields the given values in order, then 1 (never fires) forever. */
function scriptedRng(values) {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 1);
}

test("rattle edge: rival cools off (hot/mood/morale), nothing else moves", () => {
  const rival = jordan();
  const { sim, emitted } = fakeSim({ onCourtOpp: [rival] });
  const watcher = createEggWatcher({ sim, rivalBrefs: ["jordami01"], rng: scriptedRng([0.001, 0.1]) });
  const incident = watcher.maybeFire();
  assert.equal(incident.edge, "rattle");
  assert.equal(incident.enforcer.bref, "rodmade01");
  assert.equal(incident.rival.bref, "jordami01");
  assert.equal(rival.hot, -1, "hot 1 -> -1");
  assert.equal(rival.mood, 56, "mood 60 -> 56");
  assert.equal(sim.away.morale, 47, "opp morale 50 -> 47");
  // Ruling guard: no attribute, no rating, no shooting lever touched.
  assert.equal(sim.away.temp.offense, undefined, "temp.offense never set");
  assert.equal(sim.home.temp.offense, undefined);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].meta.enforcerEgg, "rattle");
});

test("foul edge: enforcer picks up a foul and a grade hit, with foul meta", () => {
  const enforcer = rodman();
  enforcer.gradeScore = 80;
  const { sim, emitted } = fakeSim({ onCourtYou: [enforcer] });
  const watcher = createEggWatcher({ sim, rivalBrefs: ["jordami01"], rng: scriptedRng([0.001, 0.9]) });
  const incident = watcher.maybeFire();
  assert.equal(incident.edge, "foul");
  assert.equal(enforcer.stats.pf, 2, "pf 1 -> 2");
  assert.ok(enforcer.gradeScore < 80, "grade drops");
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].meta.foul, { foulerId: "e-rodman", victimId: "r-jordan", kind: "defensive" });
});

test("watcher fires at most once per game", () => {
  const { sim } = fakeSim();
  const watcher = createEggWatcher({ sim, rivalBrefs: ["jordami01"], rng: () => 0 });
  const hits = [];
  for (let i = 0; i < 500; i++) {
    const out = watcher.maybeFire();
    if (out) hits.push(out);
  }
  assert.equal(hits.length, 1);
  assert.equal(watcher.firedCount, 1);
});

test("watcher never fires without the pair on court", () => {
  const { sim } = fakeSim({ onCourtYou: [pippen()] });
  const watcher = createEggWatcher({ sim, rivalBrefs: ["jordami01"], rng: () => 0 });
  for (let i = 0; i < 100; i++) assert.equal(watcher.maybeFire(), null);
  const { sim: sim2 } = fakeSim();
  const watcher2 = createEggWatcher({ sim: sim2, rivalBrefs: [], rng: () => 0 });
  assert.equal(watcher2.maybeFire(), null);
});

test("same egg seed, same outcome — fixed-seed reproducible", () => {
  const run = () => {
    const { sim } = fakeSim();
    const watcher = createEggWatcher({
      sim,
      rivalBrefs: ["jordami01"],
      rng: seededStream(hashSeed("egg-det-1|1997|3|enforcer-egg")),
    });
    let out = null;
    for (let i = 0; i < 200 && !out; i++) out = watcher.maybeFire();
    return out;
  };
  assert.deepEqual(run(), run());
});

test("one roll per game: a miss at first overlap never fires later", () => {
  const { sim } = fakeSim();
  // 0.99 misses the fire roll; the 0.001/0.1 that follow must never be read.
  const watcher = createEggWatcher({
    sim,
    rivalBrefs: ["jordami01"],
    rng: scriptedRng([0.99, 0.001, 0.1]),
  });
  let hits = 0;
  for (let i = 0; i < 500; i++) if (watcher.maybeFire()) hits += 1;
  assert.equal(hits, 0, "the single roll missed; later steps do not re-roll");
  assert.equal(watcher.firedCount, 0);
});

test("fire rate is conservative: ~20% of eligible rivalry games", () => {
  const trials = 2000;
  let fires = 0;
  let rattles = 0;
  for (let t = 0; t < trials; t++) {
    const { sim } = fakeSim();
    const watcher = createEggWatcher({
      sim,
      rivalBrefs: ["jordami01"],
      rng: seededStream(hashSeed(`egg-rate|${t}`)),
    });
    // One call = one game: the pair shares the floor from the tip-off,
    // so the first call is the game's single roll.
    const out = watcher.maybeFire();
    if (out) {
      fires += 1;
      if (out.edge === "rattle") rattles += 1;
    }
  }
  const rate = fires / trials;
  assert.ok(Math.abs(rate - ENFORCER_EGG_GAME_CHANCE) < 0.04, `fire rate ${rate}, expected ~${ENFORCER_EGG_GAME_CHANCE}`);
  const rattleShare = rattles / fires;
  assert.ok(rattleShare > 0.4 && rattleShare < 0.6, `rattle share ${rattleShare}`);
});

test("eggCopy is bilingual on both edges", () => {
  const incident = {
    edge: "rattle",
    enforcer: { name: "罗德曼", nameEn: "Dennis Rodman" },
    rival: { name: "乔丹", nameEn: "Michael Jordan" },
  };
  assert.ok(eggCopy(incident, "zh").includes("罗德曼") && eggCopy(incident, "zh").includes("乔丹"));
  assert.ok(eggCopy(incident, "en").includes("Rodman") && eggCopy(incident, "en").includes("Jordan"));
  const foul = { ...incident, edge: "foul" };
  assert.ok(eggCopy(foul, "zh").includes("犯规"));
  assert.ok(eggCopy(foul, "en").includes("foul"));
});

// --- Integration: real GameSim + real Reborn driver ---

/** A real GameSim with the enforcer and the rival forced into the starting five. */
function eggSim({ homeTeam = "CHI", awayTeam = "NYK", enforcer = "rodmade01", rival = "ewingpa01", seed = "egg-ab-1" } = {}) {
  const homeCards = rosterCards(ROWS, homeTeam, 1997);
  const awayCards = rosterCards(ROWS, awayTeam, 1997);
  const starters = (cards, first) => {
    const head = cards.find((c) => c.bref === first);
    return [head, ...cards.filter((c) => c.bref !== first)].slice(0, 5).map((p) => p.id);
  };
  const sim = new GameSim({
    home: { name: homeTeam, players: homeCards, starterIds: starters(homeCards, enforcer) },
    away: { name: awayTeam, players: awayCards, starterIds: starters(awayCards, rival) },
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(hashSeed(seed)),
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.autoOffense = true;
  sim.autoDefense = true;
  sim.autoRotation = true;
  return sim;
}

test("driveGame: under six fouls the foul edge is one foul on the egg's own dice and the score matches", async () => {
  // Seeds are pinned to a scan of egg-ab-1..30 (B76 moved every game's dice, which swapped these two): egg-ab-2 reaches six fouls and the games
  // diverge, so the strict comparison would never run; egg-ab-1 stays under six: the extra foul is visible and the box score still matches.
  const seed = "egg-ab-1";
  const eggCtx = { rivalBrefs: ["ewingpa01"], rng: scriptedRng([0.001, 0.9]) }; // fires, foul
  const simA = eggSim({ seed });
  const a = await driveGame(simA, "nobody", { egg: eggCtx });
  const simB = eggSim({ seed });
  const b = await driveGame(simB, "nobody");
  assert.equal(a.egg.edge, "foul");
  assert.equal(a.egg.enforcer.bref, "rodmade01");
  assert.equal(a.egg.rival.bref, "ewingpa01");
  assert.equal(b.egg, null);
  const reachedSix = [simA, simB].some((sim) =>
    sim.home.roster.concat(sim.away.roster).some((p) => (p.stats.pf || 0) >= 6)
  );
  assert.equal(reachedSix, false, "egg-ab-1 stays under six, so this comparison is the one that runs");
  const rodA = simA.home.roster.find((p) => p.bref === "rodmade01");
  const rodB = simB.home.roster.find((p) => p.bref === "rodmade01");
  assert.deepEqual(simA.score, simB.score, "the extra foul never touches the dice");
  assert.equal(rodA.stats.pf, rodB.stats.pf + 1, "exactly one extra foul");
  assert.ok(rodA.gradeScore <= rodB.gradeScore, "grade never rises");
});

test("driveGame: at six fouls he sits when a teammate can still play", async () => {
  const eggCtx = { rivalBrefs: ["ewingpa01"], rng: scriptedRng([0.001, 0.9]) };
  const simA = eggSim({ seed: "egg-ab-2" }); // pinned by a seed scan, see above
  const a = await driveGame(simA, "nobody", { egg: eggCtx });
  const simB = eggSim({ seed: "egg-ab-2" });
  await driveGame(simB, "nobody");
  assert.equal(a.egg.edge, "foul");
  const reachedSix = [simA, simB].some((sim) =>
    sim.home.roster.concat(sim.away.roster).some((p) => (p.stats.pf || 0) >= 6)
  );
  assert.equal(reachedSix, true, "egg-ab-2 reaches six fouls, so the sit-out is what this test watches");
  for (const sim of [simA, simB]) {
    for (const side of [sim.home, sim.away]) {
      for (const p of side.onCourt) {
        const stuck = (p.stats.pf || 0) >= 6 && side.bench.some((body) => (body.stats.pf || 0) < 6 && !(body.injuredGames > 0));
        assert.equal(stuck, false, `${p.name} is on the floor at 6 fouls with a body on the bench`);
      }
    }
  }
});

test("rattle edge on a real GameSim: rival cools, ratings and shooting levers untouched", () => {
  const sim = eggSim({ homeTeam: "NYK", awayTeam: "LAL", enforcer: "oaklech01", rival: "onealsh01" });
  sim.running = true;
  const shaq = sim.away.onCourt.find((p) => p.bref === "onealsh01");
  assert.ok(shaq, "Shaq starts");
  const before = {
    hot: shaq.hot,
    mood: shaq.mood,
    ovr: shaq.ovr,
    morale: sim.away.morale,
    tempOffense: sim.away.temp?.offense,
    skills: [...(shaq.skills || [])],
  };
  const watcher = createEggWatcher({ sim, rivalBrefs: ["onealsh01"], rng: scriptedRng([0.001, 0.1]) });
  const incident = watcher.maybeFire();
  assert.equal(incident.edge, "rattle");
  assert.equal(shaq.hot, Math.max(-2, (before.hot || 0) - 2), "hot dips (floored at -2)");
  assert.equal(shaq.mood, Math.min(95, Math.max(15, (before.mood ?? 50) - 4)), "mood dips");
  assert.equal(sim.away.morale, Math.min(100, Math.max(0, (before.morale ?? 50) - 3)), "opp morale dips");
  // Ruling guard: no attribute, no rating, no shooting lever.
  assert.equal(sim.away.temp?.offense, before.tempOffense, "temp.offense untouched");
  assert.equal(shaq.ovr, before.ovr, "OVR untouched");
  assert.deepEqual(shaq.skills, before.skills, "skills untouched");
});

/** One rivalry game: the opponent's top scorer is the rival. */
async function rivalryGame(seed, opp = "LAL") {
  const reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = 80;
  const star = ROWS.filter((r) => r.team === opp && r.season === 1997).sort((a, b) => b.ppg - a.ppg)[0];
  const withRival = {
    ...reborn,
    rivalries: { version: 1, watch: {}, rivals: [{ bref: star.bref, name: star.name, nameEn: star.name, games: [] }] },
  };
  const season = buildSeason(withRival, ROWS, {
    games: [{ homeId: withRival.player.teamId, awayId: opp, day: 1, played: false }],
  });
  return playGame(withRival, season, ROWS);
}

test("playGame: egg-e2e-125 fires the rattle edge (Oakley vs Shaq)", async () => {
  const out = await rivalryGame("egg-e2e-125");
  assert.equal(out.report.enforcerEgg.edge, "rattle");
  assert.equal(out.report.enforcerEgg.enforcer.bref, "oaklech01");
  assert.equal(out.report.enforcerEgg.rival.bref, "onealsh01");
  assert.ok(out.report.rivalry.met.some((m) => m.bref === "onealsh01"), "rivalry meeting still recorded");
});

test("playGame: egg-e2e-47 fires the foul edge (Mason vs Shaq)", async () => {
  const out = await rivalryGame("egg-e2e-47");
  assert.equal(out.report.enforcerEgg.edge, "foul");
  assert.equal(out.report.enforcerEgg.enforcer.bref, "masonan01");
  assert.equal(out.report.enforcerEgg.rival.bref, "onealsh01");
});

test("playGame: no rival, no egg — even on a seed that would fire", async () => {
  const reborn = createRebornState("egg-e2e-125", ROWS);
  reborn.player.coachTrust = 80;
  const season = buildSeason(reborn, ROWS, {
    games: [{ homeId: reborn.player.teamId, awayId: "LAL", day: 1, played: false }],
  });
  const out = await playGame(reborn, season, ROWS);
  assert.equal(out.report.enforcerEgg, null);
});

test("playGame: rival but no enforcer on the team, no egg", async () => {
  const van = rosterCards(ROWS, "VAN", 1997);
  assert.ok(!van.some((c) => (c.skills || []).includes("enforcer")), "VAN has no enforcer in 1996-97");
  const out = await rivalryGame("egg-e2e-1"); // VAN
  assert.equal(out.report.enforcerEgg, null);
});

// --- View: the egg line in the post-game rivalry report ---

test("rivalryReportHtml renders the egg line (zh + en, both edges)", () => {
  const base = { gameId: "g1", rivalry: { formed: [], met: [], missed: [] } };
  const rattle = {
    ...base,
    enforcerEgg: {
      fired: true,
      edge: "rattle",
      enforcer: { name: "罗德曼", nameEn: "Dennis Rodman" },
      rival: { name: "乔丹", nameEn: "Michael Jordan" },
    },
  };
  const zh = rivalryReportHtml({ report: rattle, reborn: null, lang: "zh" });
  assert.ok(zh.includes("reborn-enforcer-egg"), "egg line has its class");
  assert.ok(zh.includes("罗德曼") && zh.includes("乔丹"));
  const en = rivalryReportHtml({ report: rattle, reborn: null, lang: "en" });
  assert.ok(en.includes("Rodman") && en.includes("Jordan"));
  const foul = { ...base, enforcerEgg: { ...rattle.enforcerEgg, edge: "foul" } };
  assert.ok(rivalryReportHtml({ report: foul, reborn: null, lang: "zh" }).includes("犯规"));
  assert.ok(rivalryReportHtml({ report: foul, reborn: null, lang: "en" }).includes("foul"));
});

test("rivalryReportHtml shows no egg line when the egg did not fire", () => {
  const met = {
    bref: "jordami01",
    name: "乔丹",
    nameEn: "Michael Jordan",
    you: { pts: 20 },
    rival: { pts: 22 },
    won: false,
    wins: 0,
    losses: 1,
  };
  const report = { gameId: "g1", rivalry: { formed: [], met: [met], missed: [] }, enforcerEgg: null };
  const html = rivalryReportHtml({ report, reborn: null });
  assert.ok(html.includes("reborn-rivalry"), "section still renders");
  assert.ok(!html.includes("reborn-enforcer-egg"), "no egg line");
  const noField = { gameId: "g1", rivalry: { formed: [], met: [met], missed: [] } };
  assert.ok(!rivalryReportHtml({ report: noField, reborn: null }).includes("reborn-enforcer-egg"));
});
