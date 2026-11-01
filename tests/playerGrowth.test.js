import assert from "node:assert/strict";
import test from "node:test";
import {
  GROWTH_CARRYOVER, GROWTH_CEILING_SLACK, GROWTH_XP_PER_LEVEL,
} from "../js/career/balance.js";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { validGrowth } from "../js/career/growthShape.js";
import { ageRow, attributeCeiling, awardGrowth, carriedDeltas, gameXp, trainedAttributes } from "../js/career/playerGrowth.js";
import { developLeagueRosters, historicalLadder } from "../js/engine/develop.js";
import { installRealCards, realGame, realTeam } from "./helpers/realGame.js";

const YEAR = 2030;
const card = (id, over = {}) => ({
  id, bref: id, name: id, season: YEAR, age: 22, three: 60, mid: 60, scoring: 60, pass: 60, iq: 60, speed: 60,
  defense: 60, steal: 60, block: 60, stamina: 60, strength: 60, ...over,
});
const line = (id, over = {}) => ({ id, name: id, min: 30, score: 10, pts: 12, reb: 4, ast: 3, ...over });
/** A growth entry already sitting `xp` short of nothing: handy for forcing a level-up on the next game. */
const entry = (over = {}) => ({ year: YEAR, xp: 0, levels: 0, deltas: {}, ...over });
const one = (args) => awardGrowth({ year: YEAR, ...args });

// ---------------------------------------------------------------- XP
test("XP is minutes x performance x youth, computed by hand", () => {
  // 30 min, Game Score 10 -> perf 0.6 + 10*0.05 = 1.1 ; age 22 -> x1.35 ; 30*1.1*1.35 = 44.55 -> 45
  assert.equal(gameXp({ min: 30, score: 10 }, 22), 45);
  // same night at 27 -> x1.0 ; 33 ; and at 31 -> x0.7 ; 23.1 -> 23
  assert.equal(gameXp({ min: 30, score: 10 }, 27), 33);
  assert.equal(gameXp({ min: 30, score: 10 }, 31), 23);
  assert.equal(gameXp({ min: 30, score: 10 }, 20), 53); // x1.6: 52.8
});

test("performance is clamped: a disaster still counts half, a monster night caps at double", () => {
  assert.equal(gameXp({ min: 20, score: -30 }, 27), 10); // perf floor 0.5
  assert.equal(gameXp({ min: 20, score: 90 }, 27), 40); // perf cap 2.0
});

test("no minutes, no XP; younger always earns faster than older on the same night", () => {
  assert.equal(gameXp({ min: 0, score: 25 }, 21), 0);
  const night = { min: 28, score: 12 };
  const byAge = [20, 23, 27, 31, 36].map((age) => gameXp(night, age));
  assert.deepEqual([...byAge].sort((a, b) => b - a), byAge, "strictly non-increasing with age");
  assert.ok(byAge[0] > byAge[2] && byAge[2] > byAge[4]);
});

test("the age table gives young players more levels a season, and veterans none", () => {
  assert.deepEqual([21, 24, 28, 32, 33, 45].map((a) => ageRow(a).levels), [4, 3, 2, 1, 0, 0]);
});

// ---------------------------------------------------------------- pacing (the design intent, pinned)
// Every other test reads the cost from balance.js, so they'd all agree with ANY number. These pin the
// numbers the roadmap promises: minutes are what make a player grow.
const gamesForLevel = (night, age) => Math.ceil(GROWTH_XP_PER_LEVEL / gameXp(night, age));

test("pacing: a young starter levels roughly every 20-35 games, a prime starter every 30-45", () => {
  const starter = { min: 30, score: 10 };
  assert.ok(gamesForLevel(starter, 22) >= 20 && gamesForLevel(starter, 22) <= 35, `22yo: ${gamesForLevel(starter, 22)} games`);
  assert.ok(gamesForLevel(starter, 27) >= 30 && gamesForLevel(starter, 27) <= 45, `27yo: ${gamesForLevel(starter, 27)} games`);
});

test("pacing: a bench rookie (10 min, quiet nights) can't level inside a whole 82-game season", () => {
  const bench = { min: 10, score: 3 };
  assert.ok(gamesForLevel(bench, 21) > 82, `${gamesForLevel(bench, 21)} games`);
});

test("pacing: a young starter reaches his season's level cap late, not in a month", () => {
  const starter = { min: 30, score: 10 };
  const gamesToCap = gamesForLevel(starter, 22) * ageRow(22).levels; // 3 levels
  assert.ok(gamesToCap > 60 && gamesToCap <= 100, `${gamesToCap} games to his 3 levels`);
});

// ---------------------------------------------------------------- levelling
test("a level arrives exactly when the XP bar fills, on the attribute his plan trains", () => {
  const players = [card("p1", { age: 27 })];
  const plans = { p1: { focus: "playmaking" } }; // pass, iq, speed
  const nearly = { p1: entry({ xp: GROWTH_XP_PER_LEVEL - 34 }) };
  const short = one({ growth: nearly, plans, players, lines: [line("p1")] }); // +33 : one XP short
  assert.equal(short.entries[0].leveled.length, 0);
  assert.equal(short.growth.p1.xp, GROWTH_XP_PER_LEVEL - 1);
  const full = one({ growth: { p1: entry({ xp: GROWTH_XP_PER_LEVEL - 33 }) }, plans, players, lines: [line("p1")] });
  assert.deepEqual(full.entries[0].leveled, [{ attribute: "pass", from: 60, to: 61 }]);
  assert.deepEqual(full.changes, { p1: { pass: 61 } });
  assert.equal(full.growth.p1.xp, 0, "the bar empties by exactly one level");
  assert.deepEqual(full.growth.p1.deltas, { pass: 1 });
});

test("successive levels walk through the trained attributes instead of stacking one", () => {
  const players = [card("p1", { age: 20 })];
  const plans = { p1: { focus: "shooting" } }; // three, mid, scoring
  let growth = { p1: entry({ xp: GROWTH_XP_PER_LEVEL }) };
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    const r = one({ growth, plans, players, lines: [line("p1")] });
    seen.push(...r.entries[0].leveled.map((l) => l.attribute));
    growth = r.growth;
    players[0] = { ...players[0], ...Object.fromEntries(Object.entries(r.changes.p1 || {})) };
    growth.p1.xp = GROWTH_XP_PER_LEVEL; // keep the bar full so each game is a level
  }
  assert.deepEqual(seen, ["three", "mid", "scoring"]);
});

test("no plan trains the balanced trio", () => {
  assert.deepEqual(trainedAttributes(undefined), ["scoring", "pass", "defense"]);
  assert.deepEqual(trainedAttributes({ focus: "defense" }), ["defense", "steal", "block"]);
});

test("a season has a level cap by age; a full bar then just sits full", () => {
  const players = [card("vet", { age: 31 })]; // cap 1
  let growth = { vet: entry({ xp: GROWTH_XP_PER_LEVEL }) };
  const first = one({ growth, plans: {}, players, lines: [line("vet", { min: 40, score: 30 })] });
  assert.equal(first.entries[0].leveled.length, 1);
  assert.equal(first.growth.vet.levels, 1);
  growth = first.growth;
  for (let i = 0; i < 50; i += 1) {
    const r = one({ growth, plans: {}, players: [card("vet", { age: 31, scoring: 61 })], lines: [line("vet", { min: 40, score: 30 })] });
    assert.equal(r.entries[0].leveled.length, 0, "capped: never a second level");
    growth = r.growth;
  }
  assert.equal(growth.vet.levels, 1);
  assert.equal(growth.vet.xp, GROWTH_XP_PER_LEVEL, "XP saturates at a full bar, it doesn't grow forever");
  assert.equal(one({ growth, plans: {}, players, lines: [line("vet")] }).entries[0].capped, true);
});

test("past 32 nobody levels in-season, but the XP is still tracked and shown", () => {
  const r = one({ growth: {}, plans: {}, players: [card("old", { age: 36 })], lines: [line("old")] });
  assert.equal(r.entries[0].leveled.length, 0);
  assert.equal(r.entries[0].levelCap, 0);
  assert.ok(r.entries[0].xp > 0);
  assert.deepEqual(r.changes, {});
});

// ---------------------------------------------------------------- ceiling
test("an attribute can't pass the best he ever was on his real later cards (+ the slack)", () => {
  const ladder = [card("p1", { season: YEAR, three: 70 }), card("p1", { season: YEAR + 1, three: 74 })];
  assert.equal(attributeCeiling(card("p1", { three: 70 }), "three", 70, ladder), 74 + GROWTH_CEILING_SLACK);
  // a card from BEFORE this season doesn't count towards the ceiling
  const past = [card("p1", { season: YEAR - 3, three: 95 })];
  assert.equal(attributeCeiling(card("p1"), "three", 60, [...past, card("p1", { season: YEAR, three: 62 })]), 62 + GROWTH_CEILING_SLACK);
  // base counts too: he may already be above every later card
  assert.equal(attributeCeiling(card("p1", { three: 80 }), "three", 80, [card("p1", { season: YEAR, three: 70 })]), 80 + GROWTH_CEILING_SLACK);
  // no real career at all: only the 99 wall
  assert.equal(attributeCeiling(card("rookie"), "three", 60, []), 99);
});

test("an attribute at its ceiling is skipped for the next one; all blocked means the level waits", () => {
  const ladder = [card("p1", { three: 60, mid: 60, scoring: 60 })]; // season-start 60 everywhere: ceiling 61
  // Three levels banked (cursor is back on `three`), and three is already at 61 = base 60 + 1: capped.
  const ledger = entry({ xp: GROWTH_XP_PER_LEVEL, levels: 3, deltas: { three: 1, pass: 2 } });
  const players = [card("p1", { age: 20, three: 61, pass: 62 })];
  const r = one({ growth: { p1: ledger }, plans: { p1: { focus: "shooting" } }, players, lines: [line("p1")], ladderOf: () => ladder });
  assert.equal(r.entries[0].leveled[0].attribute, "mid", "three is first in line but capped, so mid trains instead");
  // Without the ceiling the very same situation trains three: proves the skip above is the ceiling's doing.
  const uncapped = one({ growth: { p1: ledger }, plans: { p1: { focus: "shooting" } }, players, lines: [line("p1")], ladderOf: () => [] });
  assert.equal(uncapped.entries[0].leveled[0].attribute, "three");
  const allCapped = [card("p1", { age: 20, three: 61, mid: 61, scoring: 61 })];
  const everyone = entry({ xp: GROWTH_XP_PER_LEVEL, levels: 3, deltas: { three: 1, mid: 1, scoring: 1 } });
  const blocked = one({ growth: { p1: everyone }, plans: { p1: { focus: "shooting" } }, players: allCapped, lines: [line("p1")], ladderOf: () => ladder });
  assert.equal(blocked.entries[0].leveled.length, 0);
  assert.deepEqual(blocked.changes, {});
  assert.equal(blocked.entries[0].capped, true);
  assert.ok(blocked.growth.p1.xp <= GROWTH_XP_PER_LEVEL);
});

// ---------------------------------------------------------------- hygiene
test("awardGrowth never mutates its inputs", () => {
  const growth = { p1: entry({ xp: 1100, deltas: { three: 1 }, levels: 1 }) };
  const players = [card("p1", { age: 22 })];
  const lines = [line("p1")];
  const plans = { p1: { focus: "shooting" } };
  const frozen = JSON.stringify({ growth, players, lines, plans });
  one({ growth, plans, players, lines });
  assert.equal(JSON.stringify({ growth, players, lines, plans }), frozen);
});

test("entries from another season are dropped; players who can't be matched earn nothing", () => {
  const r = one({
    growth: { old: entry({ year: YEAR - 1, xp: 999, levels: 2, deltas: { three: 2 } }), keep: entry({ xp: 5 }) },
    plans: {},
    players: [card("p1"), { id: "nobref", name: "x", age: 22 }],
    lines: [line("p1"), line("ghost"), line("nobref")],
  });
  assert.deepEqual(Object.keys(r.growth).sort(), ["keep", "p1"]);
  assert.equal(r.entries.length, 1);
});

test("a player who didn't play (no minutes) is untouched", () => {
  const r = one({ growth: {}, plans: {}, players: [card("p1")], lines: [line("p1", { min: 0, score: 0 })] });
  assert.deepEqual(r.growth, {});
  assert.deepEqual(r.entries, []);
});

test("entries put the level-ups first, then the biggest XP", () => {
  const players = [card("a", { age: 22 }), card("b", { age: 22 }), card("c", { age: 22 })];
  const r = one({
    growth: { c: entry({ xp: GROWTH_XP_PER_LEVEL }) },
    plans: {}, players,
    lines: [line("a", { min: 40, score: 20 }), line("b", { min: 10, score: 2 }), line("c", { min: 10, score: 2 })],
  });
  assert.deepEqual(r.entries.map((e) => e.id), ["c", "a", "b"]);
});

// ---------------------------------------------------------------- carry-over and save shape
test("half of a season's growth carries into next year (rounded half up); stale entries carry nothing", () => {
  assert.equal(GROWTH_CARRYOVER, 0.5);
  assert.deepEqual(carriedDeltas(entry({ deltas: { three: 1, mid: 2, scoring: 3, pass: 4 } }), YEAR), { three: 1, mid: 1, scoring: 2, pass: 2 });
  assert.deepEqual(carriedDeltas(entry({ year: YEAR - 1, deltas: { three: 4 } }), YEAR), {});
  assert.deepEqual(carriedDeltas(undefined, YEAR), {});
});

test("the rollover really adds the carried share to next year's player, for any team", () => {
  const build = () => ({
    year: YEAR, userTeamId: "B", playerSeason: {},
    teams: {
      B: { players: [card("mine", { age: 22 })] },
      A: { players: [card("theirs", { age: 22 })] },
    },
  });
  const plain = build();
  const grown = build();
  developLeagueRosters(plain, { rng: () => 0.5 });
  developLeagueRosters(grown, {
    rng: () => 0.5,
    growth: {
      mine: entry({ deltas: { three: 2 } }),
      theirs: entry({ deltas: { mid: 4 } }),
      stale: entry({ year: YEAR - 1, deltas: { three: 9 } }),
    },
  });
  const pick = (st, tid) => st.teams[tid].players[0];
  assert.equal(pick(grown, "B").three, pick(plain, "B").three + 1, "+2 carries as +1");
  assert.equal(pick(grown, "A").mid, pick(plain, "A").mid + 2, "a traded-away player keeps his share too: +4 -> +2");
  assert.equal(pick(grown, "B").mid, pick(plain, "B").mid, "only the attributes that grew change");
  const stale = build();
  developLeagueRosters(stale, { rng: () => 0.5, growth: { mine: entry({ year: YEAR - 1, deltas: { three: 9 } }) } });
  assert.equal(pick(stale, "B").three, pick(plain, "B").three, "last year's entry carries nothing");
});

test("carried growth stops at the 99 wall", () => {
  const st = { year: YEAR, userTeamId: "B", playerSeason: {}, teams: { B: { players: [card("mine", { age: 22, three: 99 })] } } };
  const base = structuredClone(st);
  developLeagueRosters(base, { rng: () => 0.5 });
  developLeagueRosters(st, { rng: () => 0.5, growth: { mine: entry({ deltas: { three: 4 } }) } });
  assert.ok(st.teams.B.players[0].three <= 99);
});

test("the offseason refuses a malformed growth option instead of quietly ignoring it", () => {
  const st = { year: YEAR, userTeamId: "B", playerSeason: {}, teams: { B: { players: [card("mine")] } } };
  assert.throws(() => developLeagueRosters(st, { growth: [] }), TypeError);
  assert.throws(() => developLeagueRosters(st, { growth: null }), TypeError);
});

test("save shape: absent is fine (saves from before C2); anything malformed is rejected", () => {
  assert.equal(validGrowth(undefined), true);
  assert.equal(validGrowth({}), true);
  assert.equal(validGrowth({ jamesle01: entry({ xp: 40, levels: 1, deltas: { three: 1 } }) }), true);
  for (const bad of [null, [], "x", { a: null }, { a: entry({ year: 1.5 }) }, { a: entry({ xp: -1 }) }, { a: entry({ xp: NaN }) },
    { a: entry({ levels: -1 }) }, { a: entry({ levels: 1.2 }) }, { a: entry({ deltas: [] }) }, { a: entry({ deltas: { three: 0 } }) },
    { a: entry({ deltas: { three: 1.5 } }) }, { "": entry() }]) {
    assert.equal(validGrowth(bad), false, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------- batch
test("foldBatch sums a stretch's XP and merges level-ups of the same attribute", () => {
  const report = (xp, leveled) => ({
    youSide: "home", won: true, tied: false, score: { you: 100, opp: 90 }, margin: 10, lines: [],
    rewards: { playerXp: [{ id: "p1", name: "P One", xp, total: 100 + xp, progress: 0.5, capped: false, leveled }] },
  });
  const batch = foldBatch([
    report(40, [{ attribute: "three", from: 60, to: 61 }]),
    report(30, []),
    report(50, [{ attribute: "three", from: 61, to: 62 }, { attribute: "mid", from: 55, to: 56 }]),
  ]);
  assert.equal(batch.growth.length, 1);
  assert.equal(batch.growth[0].xp, 120);
  assert.deepEqual(batch.growth[0].leveled, [{ attribute: "three", from: 60, to: 62 }, { attribute: "mid", from: 55, to: 56 }]);
  assert.equal(batch.growth[0].total, 150, "the bar shows where it ended up, not a sum");
});

// ---------------------------------------------------------------- real engine, real career curves
test("REAL engine: a full season of real games levels players within every cap and real ceiling", () => {
  const rival = realTeam("BOS", 2023);
  const myTeam = realTeam("DEN", 2023);
  assert.ok(myTeam.players.length >= 8 && rival.players.length >= 8, "real rosters loaded");
  installRealCards(...myTeam.players.map((p) => p.bref)); // real career curves: the ceilings below are real ones
  assert.ok(historicalLadder(myTeam.players[0].bref).length > 1, "his real career is loaded");
  const roster = structuredClone(myTeam.players);
  const base = new Map(roster.map((p) => [p.id, structuredClone(p)]));
  let growth = {};
  const totals = new Map();
  for (let g = 0; g < 82; g += 1) {
    const snap = realGame({ name: myTeam.name, players: roster }, rival, "home");
    const report = settleGame(snap, "home");
    const result = awardGrowth({ growth, plans: {}, year: 2023, players: roster, lines: report.lines, ladderOf: historicalLadder });
    growth = result.growth;
    for (const [id, attrs] of Object.entries(result.changes)) Object.assign(roster.find((p) => p.id === id), attrs);
    for (const e of result.entries) totals.set(e.id, (totals.get(e.id) || 0) + e.xp);
  }
  assert.ok(totals.size >= 8, "a real rotation earned XP");
  assert.ok([...totals.values()].every((xp) => xp > 0));
  const grew = Object.values(growth).filter((e) => e.levels > 0);
  assert.ok(grew.length >= 1, "over 82 real games somebody actually levelled (otherwise this test proves nothing)");
  for (const player of roster) {
    const e = growth[player.bref];
    if (!e) continue;
    const orig = base.get(player.id);
    const age = Number(player.age) || 26;
    assert.ok(e.levels <= ageRow(age).levels, `${player.name} (age ${age}) banked ${e.levels} levels, cap ${ageRow(age).levels}`);
    const spent = Object.values(e.deltas).reduce((a, b) => a + b, 0);
    assert.equal(spent, e.levels, "every level is exactly one attribute point");
    for (const [attribute, delta] of Object.entries(e.deltas)) {
      assert.equal(player[attribute], orig[attribute] + delta, `${player.name}.${attribute} matches the ledger`);
      assert.ok(player[attribute] <= attributeCeiling(orig, attribute, orig[attribute], historicalLadder(player.bref)), `${player.name}.${attribute} is within his real ceiling`);
      assert.ok(player[attribute] <= 99);
    }
  }
  assert.ok(JSON.stringify(growth).length < 3000, "the whole ledger stays tiny");
  assert.equal(validGrowth(growth), true, "and what we'd save passes the save validator");
});
