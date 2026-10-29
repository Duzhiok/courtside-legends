/**
 * Garbage time: 4th quarter + 20-point lead, both sides.
 * Starters sit for the least-played bench, the put-back /
 * rested-return / fresh-pick paths must not bring them back, and a
 * manual sub back in mid-episode survives until the next episode.
 * Live games only (isGarbageTime is false for quiet sims), so these
 * tests construct live GameSims and poke quarter/score directly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

const COACH = { id: "t", name: "T", specialTactics: [], preferred: [], buffs: {} };

function setMin(p, min) {
  p.stats = p.stats || {};
  p.stats.min = min;
}

function makeSim(homeScore = 110, awayScore = 85) {
  const homeStarters = [
    ["paulch01", 2015],
    ["bryanko01", 2009],
    ["jamesle01", 2013],
    ["duncati01", 2003],
    ["goberru01", 2019],
  ].map(([b, s]) => cardFor(b, s));
  const homeBench = [
    ["nashst01", 2007],
    ["allenra02", 2008],
    ["piercpa01", 2008],
    ["garneke01", 2004],
    ["wadedw01", 2009],
    ["nowitdi01", 2010],
  ].map(([b, s]) => cardFor(b, s));
  const awayStarters = [
    ["curryst01", 2016],
    ["thompkl01", 2016],
    ["duranke01", 2017],
    ["greendr01", 2017],
    ["jordade01", 2016],
  ].map(([b, s]) => cardFor(b, s));
  const awayBench = [
    ["iguodan01", 2015],
    ["livinsh01", 2016],
    ["westda01", 2016],
  ].map(([b, s]) => cardFor(b, s));
  const sim = new GameSim({
    home: { players: [...homeStarters, ...homeBench], starterIds: homeStarters.map((p) => p.id), coach: COACH },
    away: { players: [...awayStarters, ...awayBench], starterIds: awayStarters.map((p) => p.id), coach: COACH },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  // Pin the exact composition instead of trusting constructor arrangement.
  sim.home.onCourt = homeStarters;
  sim.home.bench = homeBench;
  sim.home.starterIds = homeStarters.map((p) => p.id);
  sim.away.onCourt = awayStarters;
  sim.away.bench = awayBench;
  sim.away.starterIds = awayStarters.map((p) => p.id);
  for (const p of [...homeStarters, ...homeBench, ...awayStarters, ...awayBench]) {
    p.stats = p.stats || {};
    if (p.stats.min == null) p.stats.min = 0;
    if (p.fatigue == null) p.fatigue = 0;
    if (p.targetMinutes == null) p.targetMinutes = 28;
  }
  sim.quarter = 4;
  sim.score = { home: homeScore, away: awayScore };
  return sim;
}

test("garbage time sits all starters for the least-played bench, once per episode", () => {
  const sim = makeSim();
  const home = sim.home;
  const starterIds = [...home.starterIds];
  const mins = [20, 5, 12, 8, 15, 3];
  home.bench.forEach((p, i) => setMin(p, mins[i]));
  const leastPlayed = home.bench[5].id;

  sim.garbageTimeSubs(home);
  assert.ok(home.onCourt.every((p) => !starterIds.includes(p.id)), "no starter should remain on court");
  assert.ok(starterIds.every((id) => home.bench.some((p) => p.id === id)), "all starters should be on the bench");
  assert.ok(home.onCourt.some((p) => p.id === leastPlayed), "least-played bench player should be on court");

  // Edge trigger: a second pulse changes nothing.
  const courtAfterFirst = home.onCourt.map((p) => p.id);
  sim.garbageTimeSubs(home);
  assert.deepEqual(home.onCourt.map((p) => p.id), courtAfterFirst);

  // Manual override: user puts a starter back, the next pulse leaves him.
  const starterBack = home.bench.find((p) => starterIds.includes(p.id));
  sim.substitute(home.onCourt[0].id, starterBack.id, "home");
  assert.ok(home.onCourt.some((p) => p.id === starterBack.id));
  sim.garbageTimeSubs(home);
  assert.ok(home.onCourt.some((p) => p.id === starterBack.id), "manual sub back must survive the next pulse");

  // Lead dips under 20: episode resets, no sub. Lead back up: fires again.
  sim.score = { home: 100, away: 85 };
  sim.garbageTimeSubs(home);
  assert.ok(home.onCourt.some((p) => p.id === starterBack.id));
  sim.score = { home: 110, away: 85 };
  sim.garbageTimeSubs(home);
  assert.ok(!home.onCourt.some((p) => p.id === starterBack.id), "new episode should sit the starter again");
});

test("a fully rested starter is NOT returned during garbage time, but is when the lead shrinks", () => {
  const sim = makeSim();
  const home = sim.home;
  const starter = home.onCourt[0];
  sim.substitute(starter.id, home.bench[0].id, "home");
  starter.fatigue = 0;
  for (const p of home.onCourt) p.fatigue = 20;
  const courtBefore = home.onCourt.map((p) => p.id);

  sim.autoSubsByFatigue();
  assert.ok(!home.onCourt.some((p) => p.id === starter.id), "rested starter must stay benched in garbage time");
  assert.deepEqual(home.onCourt.map((p) => p.id), courtBefore);

  sim.score = { home: 95, away: 85 };
  sim.autoSubsByFatigue();
  assert.ok(home.onCourt.some((p) => p.id === starter.id), "rested starter should return once the lead shrinks");
});

test("autoRotateByMinutes does not put alphas back during garbage time", () => {
  const sim = makeSim();
  const home = sim.home;
  const needy = home.bench[0];
  needy.targetMinutes = 30;
  setMin(needy, 10);
  const expendable = home.onCourt[0];
  expendable.targetMinutes = 12;
  setMin(expendable, 12);
  for (const p of home.onCourt) {
    if (p !== expendable) {
      setMin(p, 5);
      p.fatigue = 0;
    }
  }
  expendable.fatigue = 0;
  for (const p of home.bench) {
    if (p !== needy) {
      p.targetMinutes = 10;
      setMin(p, 9);
    }
  }

  sim.autoRotateByMinutes(home, false);
  assert.ok(home.onCourt.some((p) => p.id === expendable.id), "expendable must stay on court in garbage time");
  assert.ok(home.bench.some((p) => p.id === needy.id), "needy must stay on the bench in garbage time");

  sim.score = { home: 95, away: 85 };
  sim.autoRotateByMinutes(home, false);
  assert.ok(home.onCourt.some((p) => p.id === needy.id), "put-back should fire once the lead shrinks");
  assert.ok(home.bench.some((p) => p.id === expendable.id));
});

test("cpuAutoSub never brings a rested starter back during garbage time", () => {
  // Garbage sim: away leads 110-85 in Q4.
  const sim = makeSim(85, 110);
  const away = sim.away;
  const starter = away.onCourt[0];
  const backup = away.bench[0];
  sim.substitute(starter.id, backup.id, "away");
  starter.fatigue = 0;
  backup.fatigue = 95;
  backup.playPos = starter.pos;
  for (const p of away.bench) {
    if (p !== starter) p.fatigue = 40;
  }
  sim.cpuAutoSub(away);
  assert.ok(away.bench.some((p) => p.id === starter.id), "rested starter must stay benched in garbage time");

  // Control sim: same setup, lead only 10 — the starter should come in.
  const sim2 = makeSim(100, 110);
  const away2 = sim2.away;
  const starter2 = away2.onCourt[0];
  const backup2 = away2.bench[0];
  sim2.substitute(starter2.id, backup2.id, "away");
  starter2.fatigue = 0;
  backup2.fatigue = 95;
  backup2.playPos = starter2.pos;
  for (const p of away2.bench) {
    if (p !== starter2) p.fatigue = 40;
  }
  sim2.cpuAutoSub(away2);
  assert.ok(away2.onCourt.some((p) => p.id === starter2.id), "control: rested starter should return when not garbage time");
});
