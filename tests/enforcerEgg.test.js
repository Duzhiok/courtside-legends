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
  ENFORCER_EGG_STEP_CHANCE,
  createEggWatcher,
  eggCopy,
  findEggPair,
} from "../js/reborn/enforcerEgg.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

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

test("fire rate is conservative: ~15-25% per 100-step eligible game", () => {
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
    let out = null;
    for (let i = 0; i < 100 && !out; i++) out = watcher.maybeFire();
    if (out) {
      fires += 1;
      if (out.edge === "rattle") rattles += 1;
    }
  }
  const rate = fires / trials;
  const expected = 1 - Math.pow(1 - ENFORCER_EGG_STEP_CHANCE, 100);
  assert.ok(Math.abs(rate - expected) < 0.04, `fire rate ${rate}, expected ~${expected.toFixed(3)}`);
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
