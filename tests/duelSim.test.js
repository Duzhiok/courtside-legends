/**
 * Legend Duel D1 (design: approved 2026-11-09): standalone DuelSim rules.
 * Pure + deterministic — every test pins a seed, no Math.random anywhere.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDuel,
  playPossession,
  playDuel,
  makeProb,
  counterDefenseFor,
  cpuOffenseChoice,
  cpuDefenseChoice,
  staminaDrain,
  staminaRecovery,
  OFFENSE,
  OFFENSE_CHOICES,
  DEFENSE_CHOICES,
  DIFFICULTY,
  DUEL_TARGET,
  DUEL_CAP,
} from "../js/duel/duelSim.js";
import { seededStream, hashSeed } from "../js/core/seededRandom.js";
import {
  legendById,
  cardToDuelist,
  recordDuelResult,
  readDuelRecord,
  DUEL_WIN_XP,
} from "../js/duel/duelStore.js";
import { loadSampleRoster } from "./helpers/sampleRoster.js";
import { GALLERY_LEGENDS } from "../js/ui/homeShowcase.js";
import { overall } from "../js/data/players.js";

function duelist(overrides = {}) {
  return {
    id: "test-1",
    name: "测试球员",
    bref: "testpl01",
    season: 2020,
    pos: "SG",
    ovr: 80,
    shooting: 80,
    finishing: 80,
    handles: 80,
    defense: 80,
    strength: 80,
    speed: 80,
    stamina: 50,
    skills: [],
    ...overrides,
  };
}

function evenDuel(seed = "duel-test", difficulty = "pro") {
  return createDuel({ challenger: duelist(), legend: duelist({ id: "test-2", name: "传奇" }), difficulty, seed });
}

/** First seed in 0..199 whose next challenger drive makes, else null. */
function findMakingSeed(base, difficulty = "pro") {
  for (let i = 0; i < 200; i++) {
    const state = evenDuel(`${base}-${i}`, difficulty);
    const before = state.a.score;
    const event = playPossession(state, { offense: "drive" });
    if (event.made && state.a.score === before + 1) return `${base}-${i}`;
  }
  return null;
}

test("scoring: inside choices are 1 point, outside is 2, and the score follows the log", () => {
  assert.equal(OFFENSE.drive.points, 1);
  assert.equal(OFFENSE.midrange.points, 1);
  assert.equal(OFFENSE.post.points, 1);
  assert.equal(OFFENSE.outside.points, 2);
  const state = evenDuel("scoring");
  let runningA = 0;
  let runningB = 0;
  while (!state.over) {
    const event = playPossession(state, { offense: "outside", defense: "balanced" });
    if (event.made) {
      assert.equal(event.points, OFFENSE[event.offense].points);
      if (event.shooter === "a") runningA += event.points;
      else runningB += event.points;
    }
    assert.equal(event.scoreA, runningA);
    assert.equal(event.scoreB, runningB);
  }
  assert.ok(state.log.some((e) => e.offense === "outside" && e.made && e.points === 2), "some outside shot made for 2");
});

test("win by 2: 11-10 does not end the duel, 11-9 does", () => {
  const seed = findMakingSeed("winby2");
  assert.ok(seed, "a making seed exists");
  const state = evenDuel(seed);
  state.a.score = 10;
  state.b.score = 10;
  playPossession(state, { offense: "drive" });
  assert.equal(state.a.score, 11);
  assert.equal(state.b.score, 10);
  assert.equal(state.over, false, "11-10 must not end the duel");
  assert.equal(state.winner, null);

  const state2 = evenDuel(seed);
  state2.a.score = 10;
  state2.b.score = 9;
  playPossession(state2, { offense: "drive" });
  assert.equal(state2.a.score, 11);
  assert.equal(state2.over, true);
  assert.equal(state2.winner, "a");
});

test("15-point cap: 15-14 ends it, 15-15 plays on", () => {
  const seed = findMakingSeed("cap");
  assert.ok(seed, "a making seed exists");
  const capped = evenDuel(seed);
  capped.a.score = 14;
  capped.b.score = 14;
  playPossession(capped, { offense: "drive" });
  assert.equal(capped.a.score, 15);
  assert.equal(capped.over, true);
  assert.equal(capped.winner, "a");

  const tied = evenDuel(seed);
  tied.a.score = 14;
  tied.b.score = 15;
  playPossession(tied, { offense: "drive" });
  assert.equal(tied.a.score, 15);
  assert.equal(tied.b.score, 15);
  assert.equal(tied.over, false, "15-15 must play on");
});

test("possession strictly alternates after every shot", () => {
  const state = evenDuel("alternating");
  const shooters = [];
  while (!state.over) {
    shooters.push(state.possession);
    playPossession(state, { offense: "drive", defense: "balanced" });
  }
  for (let i = 1; i < shooters.length; i++) {
    assert.notEqual(shooters[i], shooters[i - 1], `possession ${i} must switch`);
  }
  assert.equal(shooters[0], "a");
});

test("stamina: the shooter drains, the defender recovers, and low stamina lowers the make rate", () => {
  const state = evenDuel("stamina");
  assert.equal(state.a.stamina, 100);
  assert.equal(staminaDrain(duelist({ stamina: 50 })), 6);
  assert.equal(staminaRecovery(duelist({ stamina: 50 })), 3);
  playPossession(state, { offense: "drive" }); // challenger shoots: 100 -> 94
  assert.equal(state.a.stamina, 94);
  assert.equal(state.b.stamina, 100); // legend defended: 100 + 3, capped at 100
  playPossession(state, { defense: "balanced" }); // legend shoots, challenger defends: 94 -> 97
  assert.equal(state.a.stamina, 97);
  assert.ok(state.b.stamina < 100, "the legend drained on their shot");

  const fresh = makeProb(duelist(), duelist(), "drive", "balanced", { stamina: 100 });
  const tired = makeProb(duelist(), duelist(), "drive", "balanced", { stamina: 0 });
  assert.ok(tired < fresh, "tired shots make less often");
  assert.ok(Math.abs(fresh / tired - 1 / 0.82) < 0.01, "stamina scales the prob by 0.82 at zero");
});

test("difficulty: Legend is stronger and sharper than Rookie, and never touches the challenger's dice", () => {
  // Ratings: the legend copy is scaled, the challenger is not.
  const rookie = createDuel({ challenger: duelist(), legend: duelist({ shooting: 90 }), difficulty: "rookie", seed: "diff" });
  const legend = createDuel({ challenger: duelist(), legend: duelist({ shooting: 90 }), difficulty: "legend", seed: "diff" });
  assert.equal(rookie.b.duelist.shooting, Math.round(90 * DIFFICULTY.rookie.legendRating));
  assert.equal(legend.b.duelist.shooting, Math.round(90 * DIFFICULTY.legend.legendRating));
  assert.equal(rookie.a.duelist.shooting, 80);
  assert.equal(legend.a.duelist.shooting, 80);

  // Make rate over many duels: Legend's legend makes more than Rookie's.
  const rate = (difficulty) => {
    let makes = 0;
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      const state = createDuel({ challenger: duelist(), legend: duelist(), difficulty, seed: `rate-${difficulty}-${i}` });
      playDuel(state, { offense: "drive", defense: "balanced" });
      makes += state.b.makes;
      shots += state.b.shots;
    }
    return makes / shots;
  };
  assert.ok(rate("legend") > rate("rookie"), "Legend difficulty must make more often than Rookie");

  // Policy: Legend counters the player's last offense far more often.
  const counterRate = (difficulty) => {
    const rng = seededStream(hashSeed(`policy-${difficulty}`));
    let counters = 0;
    for (let i = 0; i < 200; i++) {
      if (cpuDefenseChoice("outside", difficulty, rng) === counterDefenseFor("outside")) counters += 1;
    }
    return counters / 200;
  };
  assert.ok(counterRate("legend") > counterRate("rookie"));
  assert.equal(counterDefenseFor("outside"), "perimeter");
  assert.equal(counterDefenseFor("drive"), "paint");
  assert.equal(counterDefenseFor("post"), "paint");
});

test("no guaranteed makes: a maxed shooter still misses, and a weak shooter still makes", () => {
  const maxed = duelist({ shooting: 99, finishing: 99, handles: 99, speed: 99, strength: 99, stamina: 99, skills: ["rainmaker", "ankle_breaker"] });
  const weak = duelist({ defense: 40, strength: 40, speed: 40 });
  const prob = makeProb(maxed, weak, "outside", "balanced", { stamina: 100 });
  assert.ok(prob < 1 && prob <= 0.92, `maxed prob ${prob} must stay below 1`);
  assert.ok(prob > 0.5, "a maxed shooter is still heavily favoured");

  let makes = 0;
  let attempts = 0;
  // Ten real alternating duels: the challenger shoots, defends (recovers),
  // shoots again — stamina behaves like a real game, not a shooting drill.
  for (let d = 0; d < 10; d++) {
    const state = createDuel({ challenger: maxed, legend: weak, difficulty: "pro", seed: `no-guarantee-${d}` });
    while (!state.over) {
      const before = state.possession;
      const event = playPossession(state, { offense: "outside", defense: "balanced" });
      if (before === "a") {
        attempts += 1;
        if (event.made) makes += 1;
      }
    }
  }
  assert.ok(attempts > 50, `enough challenger shots to judge (got ${attempts})`);
  assert.ok(makes > attempts * 0.3, `maxed shooter should make most shots (made ${makes}/${attempts})`);
  assert.ok(makes < attempts, `maxed shooter must still miss sometimes (made ${makes}/${attempts})`);

  // CPU offense picks a real choice every time.
  const rng = seededStream(hashSeed("cpu-picks"));
  for (let i = 0; i < 50; i++) {
    assert.ok(OFFENSE_CHOICES.includes(cpuOffenseChoice(maxed, weak, "legend", rng)));
    assert.ok(DEFENSE_CHOICES.includes(cpuDefenseChoice("drive", "legend", rng)));
  }
});

test("deterministic: same seed + same choices replay identically", () => {
  const policy = (state) => (state.possession === "a" ? { offense: "outside" } : { defense: "perimeter" });
  const run = () => {
    const state = evenDuel("replay", "legend");
    playDuel(state, policy);
    return state;
  };
  const first = run();
  const second = run();
  assert.deepEqual(second.log, first.log);
  assert.equal(second.a.score, first.a.score);
  assert.equal(second.b.score, first.b.score);
  assert.equal(second.winner, first.winner);
  assert.equal(second.turn, first.turn);
});

test("a full duel always ends, with a winner at 11+ by 2 or at the 15 cap", () => {
  for (let i = 0; i < 30; i++) {
    const state = createDuel({
      challenger: duelist(),
      legend: duelist(),
      difficulty: ["rookie", "pro", "legend"][i % 3],
      seed: `finish-${i}`,
    });
    playDuel(state, { offense: ["drive", "midrange", "outside", "post"][i % 4], defense: "balanced" });
    assert.equal(state.over, true, `duel ${i} must finish`);
    assert.ok(state.winner === "a" || state.winner === "b");
    const winnerScore = state[state.winner].score;
    const loserScore = state[state.winner === "a" ? "b" : "a"].score;
    assert.ok(winnerScore >= DUEL_TARGET, "winner reaches 11");
    assert.ok(winnerScore - loserScore >= 2 || winnerScore >= DUEL_CAP, "winner leads by 2 or hits the cap");
    assert.ok(state.turn < 200, "no runaway duel");
  }
});

test("store: legend lookup and card mapping use real data", async () => {
  const jordan = legendById("jordami01");
  assert.ok(jordan, "Jordan is in the gallery pool");
  assert.equal(jordan.season, 1991);
  assert.equal(legendById("jordami01:1991")?.bref, "jordami01");
  assert.equal(legendById("nobody00"), null);

  const card = {
    id: "test-99", name: "测试", bref: "testpl01", season: 2020, pos: "SG",
    three: 90, mid: 80, paint: 70, scoring: 85, pass: 70, iq: 75,
    defense: 78, steal: 70, block: 40, rebound: 50, speed: 88, strength: 65, stamina: 82, clutch: 80,
    skills: ["rainmaker"],
  };
  const d = cardToDuelist(card);
  assert.equal(d.shooting, 80, "shooting blends three/mid/paint like overall()");
  assert.equal(d.finishing, Math.round((70 + 88 + 65) / 3));
  assert.equal(d.handles, Math.round((70 + 75 + 88) / 3));
  assert.equal(d.ovr, overall(card), "ovr is overall() on the card");
  assert.deepEqual(d.skills, ["rainmaker"]);

  // A real legend card resolves from the sample roster when present.
  const players = await loadSampleRoster(40);
  const found = GALLERY_LEGENDS.find((l) => players.some((p) => p.bref === l.bref && p.season === l.season));
  assert.ok(found, "at least one gallery legend is in the sample roster");
});

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test("store: recording is idempotent and the win bonus pays once", () => {
  const storage = fakeStorage();
  const base = { duelId: "duel-1", legendBref: "jordami01", legendName: "乔丹", challengerId: "c1", challengerName: "我", difficulty: "pro", won: true, scoreA: 11, scoreB: 9 };
  const first = recordDuelResult(null, base, { save: () => {}, storage });
  assert.equal(first.record.wins, 1);
  assert.deepEqual(first.record.defeated, ["jordami01"]);
  assert.equal(first.xp.gained, DUEL_WIN_XP);
  assert.equal(first.duplicate, false);

  const second = recordDuelResult(null, base, { save: () => {}, storage });
  assert.equal(second.duplicate, true);
  assert.equal(second.record.wins, 1, "re-recording must not double-count");
  assert.equal(second.xp.gained, 0, "re-recording must not double-pay XP");

  const loss = recordDuelResult(null, { ...base, duelId: "duel-2", won: false, scoreA: 9, scoreB: 11 }, { save: () => {}, storage });
  assert.equal(loss.record.losses, 1);
  assert.equal(loss.xp.gained, 0, "losses pay no duel XP");
  assert.equal(readDuelRecord(null, storage).wins, 1);
  assert.equal(readDuelRecord(null, storage).games.length, 2);
});
