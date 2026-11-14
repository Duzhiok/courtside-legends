/**
 * R134: engine CONTRACT only -- whatever steal/free-throw/rebound events a short real game
 * happens to produce must carry an actor the feed can resolve. Nothing here asserts that a
 * particular event occurs (that would be asserting on randomness); the deterministic
 * fixture cases live in feedView.test.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";

// Fixed seeds (AI_EFFICIENCY_POLICY rule 7, same fix as B14): each game gets seededStream(SEED + i),
// so a failure here reproduces instead of flaking.
const SEED = 20261114;
import { feedActorId } from "../js/ui/feedView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

const COACH = { id: "t", name: "T", specialTactics: [], preferred: [], buffs: {} };

function playSample(onEvent) {
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
    rng: seededStream(SEED),
    home: { players: [...homeStarters, ...homeBench], starterIds: homeStarters.map((p) => p.id), coach: COACH },
    away: { players: [...awayStarters, ...awayBench], starterIds: awayStarters.map((p) => p.id), coach: COACH },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent,
    onTick: () => {},
    onEnd: () => {},
  });
  let guard = 0;
  // step() is built to drive a live UI; a few thousand calls is plenty for a contract check.
  while (sim.quarter <= 4 && guard++ < 3000) sim.step();
  return sim;
}

test("every steal / free-throw / rebound the engine emits resolves to the player its text leads with", () => {
  const events = [];
  const sim = playSample((e) => events.push(e));
  const roster = [...sim.home.roster, ...sim.away.roster];
  const named = events.filter((e) => /抢断|罚球|篮板/.test(e.text || ""));
  for (const ev of named) {
    const actor = roster.find((p) => p.id === feedActorId(ev));
    assert.ok(actor, `no actor resolved for "${ev.text}"`);
    assert.ok(ev.text.startsWith(actor.name), `actor "${actor.name}" is not who "${ev.text}" leads with`);
  }
});
