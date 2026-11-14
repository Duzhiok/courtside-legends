import test from "node:test";
import assert from "node:assert/strict";
import { realCards } from "./helpers/realGame.js";
import { COACHES } from "../js/data/coaches.js";
import { overall } from "../js/data/players.js";
import { scoutOpponent } from "../js/myteam/opponentScouting.js";
import { counterStrategies, PLAN_IDS } from "../js/myteam/counterStrategy.js";
import { applyCounterPlan } from "../js/myteam/applyPlan.js";

const card = (b, y) => { const c = realCards(b); if (!c.length) return null; return c.find((x) => x.season === y) || [...c].sort((p, q) => overall(q) - overall(p))[0]; };
const squad = (list) => list.map(([b, y]) => card(b, y)).filter(Boolean);
const MINE = squad([["doncilu01"], ["hardati02"], ["dragigo01"], ["millspa01"], ["mutomdi01"], ["curryst01"], ["goberru01"], ["thompkl01"], ["duncati01"], ["jordami01"]]);
const CUR = ["duncati01", "millspa01", "curryst01", "doncilu01", "jordami01"].map((b) => MINE.find((p) => p.bref === b).id);
const LAL = { name: "LAL", players: squad([["onealsh01", 2000], ["bryanko01", 2000], ["harpero01", 2000], ["foxra01", 2000], ["shawbr01", 2000], ["fishede01", 2000], ["horryro01", 2000], ["greenhor01", 2000]]) };
const GSW = { name: "GSW", players: squad([["curryst01", 2016], ["thompkl01", 2016], ["greendr01", 2016], ["barnema02", 2016], ["iguodan01", 2016], ["bogutan01", 2016], ["livinsh01", 2016], ["varejan01", 2016]]) };
const coach = (id) => COACHES.find((c) => c.id === id);
const plans = (c, opp, extra = {}) => counterStrategies({ coach: coach(c), roster: MINE, opponent: scoutOpponent(opp), currentIds: CUR, currentTacticId: "balanced", ...extra });

test("scouting: an elite interior scorer is named, tiered, and sourced from card attributes", () => {
  const s = scoutOpponent(LAL);
  assert.equal(s.threats[0].name, "Shaquille O'Neal");
  assert.equal(s.threats[0].kind, "interior");
  assert.ok(["extreme", "high"].includes(s.threats[0].level));
  assert.match(s.threats[0].from, /paint \d+/);
  assert.ok(s.profile.interiorThreat > s.profile.perimeterThreat - 15);
});

test("scouting: an elite perimeter scorer reads as a perimeter threat; a hurt star drops out of the report", () => {
  assert.equal(scoutOpponent(GSW).threats[0].kind, "perimeter");
  const hurt = { ...LAL, players: LAL.players.map((p) => (p.bref === "onealsh01" ? { ...p, injuredGames: 3 } : p)) };
  assert.notEqual(scoutOpponent(hurt).threats[0].name, "Shaquille O'Neal");
  assert.equal(scoutOpponent({ name: "x", players: LAL.players.slice(0, 4) }), null);
});

test("scouting: five-out and weak-perimeter-defence opponents are recognised from data", () => {
  const shooters = MINE.filter((p) => p.three >= 80).slice(0, 5);
  const five = scoutOpponent({ name: "shooters", players: [...shooters, ...MINE.slice(0, 3)] });
  assert.equal(five.identity.fiveOut, five.profile.shooters >= 4);
  const weak = scoutOpponent({ name: "weak", players: MINE.map((p) => ({ ...p, perimDef: 30, defense: 30 })) });
  assert.ok(weak.weakDefenders.length > 0);
  assert.ok(weak.profile.perimeterDefense < 40);
});

test("four plans, each with its own system, three separate readings and a rotation", () => {
  const r = plans("rookie-hc-2024", LAL);
  assert.deepEqual(r.plans.map((p) => p.id), PLAN_IDS);
  for (const p of r.plans) {
    assert.equal(p.ids.length, 5);
    for (const k of ["counterEffect", "execution", "proficiency"]) assert.ok(p[k] >= 0 && p[k] <= 100, k);
    assert.ok(p.rotation.defenders.length > 0 && p.rotation.engineSupport.conditionalSubs === false);
    assert.ok(!("winProbability" in p), "no fake win rate");
  }
  assert.ok(new Set(r.plans.map((p) => p.tacticId)).size >= 2, "plans pick different systems");
});

test("containment can fail: against an elite shooter the engine says so and recommends something else", () => {
  const r = plans("rookie-hc-2024", GSW);
  const contain = r.plans.find((p) => p.id === "contain");
  assert.equal(r.containViable, false);
  assert.equal(contain.viable, false);
  assert.notEqual(r.recommended, "contain");
});

test("the active coach changes the systems chosen and the comfort reading", () => {
  const a = plans("rookie-hc-2024", LAL);
  const b = plans("phil-1996-chi", LAL);
  const key = (r) => r.plans.map((p) => `${p.tacticId}:${p.proficiency}`).join();
  assert.notEqual(key(a), key(b));
});

test("previewing never writes; applying writes only starters, system and rotation, and refuses stale ids", () => {
  const roster = structuredClone(MINE);
  const team = { players: structuredClone(MINE), starterIds: [...CUR], coach: structuredClone(coach("rookie-hc-2024")) };
  const before = JSON.stringify(team);
  const r = counterStrategies({ coach: team.coach, roster: team.players, opponent: scoutOpponent(LAL), currentIds: team.starterIds, currentTacticId: team.coach.specialTactics[0] });
  assert.equal(JSON.stringify(team), before, "preview left the team untouched");
  assert.equal(JSON.stringify(MINE), JSON.stringify(roster));
  const plan = r.plans.find((p) => p.id === "exhaust");
  assert.ok(applyCounterPlan(team, plan));
  assert.deepEqual(team.starterIds, plan.ids);
  assert.equal(team.coach.specialTactics[0], plan.tacticId);
  assert.ok(team.rotation);
  assert.deepEqual(team.players, JSON.parse(before).players, "player cards untouched");
  const stale = structuredClone(team);
  assert.equal(applyCounterPlan(stale, { ...plan, ids: ["ghost", ...plan.ids.slice(1)] }), false);
  assert.deepEqual(stale.starterIds, team.starterIds);
});
