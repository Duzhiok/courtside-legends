import test from "node:test";
import assert from "node:assert/strict";
import { TEAM_MINUTE_BUDGET, fitMinuteBudget, recommendPlayerOrders } from "../js/engine/gameplan.js";
import { applyEraParity, buildEraParityModel, eraBucket, modernThreeTend, parityValue } from "../js/engine/eraParity.js";

const star = (id, ovr) => ({ id, ovr, targetMinutes: 36 });

test("superteam minute budget: 13 alphas squeeze into 240 minutes, starters get the big share", () => {
  const roster = Array.from({ length: 13 }, (_, i) => star(`p${i}`, 99 - i));
  fitMinuteBudget(roster, { starterIds: ["p0", "p1", "p2", "p3", "p4"] });
  const total = roster.reduce((sum, p) => sum + p.targetMinutes, 0);
  assert.ok(total <= TEAM_MINUTE_BUDGET + 3, `booked ${total}`);
  for (const p of roster.slice(0, 5)) assert.ok(p.targetMinutes >= 30, `${p.id} starter got ${p.targetMinutes}`);
  assert.ok(roster[12].targetMinutes <= 6);
});

test("minute budget leaves normal rotations alone", () => {
  const roster = [36, 34, 32, 30, 28, 22, 20, 18, 12].map((m, i) => ({ id: `n${i}`, ovr: 80, targetMinutes: m }));
  const before = roster.map((p) => p.targetMinutes);
  fitMinuteBudget(roster, { starterIds: ["n0", "n1", "n2", "n3", "n4"] });
  assert.deepEqual(roster.map((p) => p.targetMinutes), before);
});

test("minute budget ranks by starter first, then rating", () => {
  const roster = [star("bench-great", 99), ...["a", "b", "c", "d", "e"].map((id) => star(id, 80)), ...Array.from({ length: 6 }, (_, i) => star(`x${i}`, 70))];
  fitMinuteBudget(roster, { starterIds: ["a", "b", "c", "d", "e"] });
  const benchMinutes = roster.slice(6).map((p) => p.targetMinutes);
  assert.ok(roster[0].targetMinutes > Math.max(...benchMinutes), "best bench player becomes the 6th man");
  assert.ok(roster[0].targetMinutes < roster[1].targetMinutes, "starters still play more");
});

const playmaker = (ppg, extra = {}) => ({ pass: 92, scoring: 80, raw: { ppg, apg: 10 }, offenseStyle: "playmake", ...extra });

test("passers who score are not benched from shooting (Oscar / Magic / Jokic)", () => {
  const oscar = recommendPlayerOrders(playmaker(30));
  assert.notEqual(oscar.usage, "organize");
  assert.equal(oscar.aggression, "normal");
});

test("scoring playmakers default to balanced usage with normal aggression", () => {
  const magic = recommendPlayerOrders(playmaker(23.9, { scoring: 84 }));
  assert.equal(magic.usage, "balanced");
  assert.equal(magic.aggression, "normal");
});

test("pure low-scoring passers still organize patiently", () => {
  const pureDime = recommendPlayerOrders(playmaker(8, { scoring: 60 }));
  assert.equal(pureDime.usage, "organize");
  assert.equal(pureDime.aggression, "low");
});

test("historic volume scorers default to score / iso / high aggression even if they pass well", () => {
  const jordan = recommendPlayerOrders({ pass: 82, scoring: 100, raw: { ppg: 31.5, apg: 5.5 }, offenseStyle: "slash" });
  assert.deepEqual([jordan.usage, jordan.action, jordan.aggression], ["score", "iso", "high"]);
});

// ---- Era parity -------------------------------------------------------------

const card = (season, pos, attrs) => ({ season, pos, defense: 50, block: 30, steal: 40, three: 50, threeTend: 40, rebound: 50, iq: 50, speed: 50, pass: 50, mid: 50, heightCm: 200, intangibles: { winningImpact: 50 }, ...attrs });

function fixtureModel() {
  const cards = [];
  // Reference era (complete stats): spread of real values per position
  for (let v = 30; v <= 98; v += 2) {
    cards.push(card(1995, "C", { defense: v, block: v, steal: v - 10, three: v - 20 }));
    cards.push(card(1995, "SG", { defense: v, block: v - 30, steal: v, three: v }));
  }
  // Pre-1974: everyone has the same placeholder defense / block / steal; proxies differ
  for (let r = 40; r <= 100; r += 5) {
    cards.push(card(1960, "C", { defense: 42, block: 20, steal: 26, three: 18, rebound: r, heightCm: 200 + r / 5, mid: r - 10 }));
  }
  // Modern shot diet: good shooters fire a lot
  for (let i = 0; i < 10; i++) cards.push(card(2020, "SG", { three: 78, threeTend: 99 }));
  return buildEraParityModel(cards);
}

test("era buckets lump the 1950s and split by decade after", () => {
  assert.equal(eraBucket(1955), "1950s");
  assert.equal(eraBucket(1966), "1960s");
  assert.equal(eraBucket(2023), "2020s");
});

test("pre-1974 placeholder defense is rebuilt from same-era, same-position rank", () => {
  const model = fixtureModel();
  const russell = card(1960, "C", { defense: 42, block: 20, steal: 26, rebound: 100, heightCm: 220, iq: 80, intangibles: { winningImpact: 95 } });
  const scrub = card(1960, "C", { defense: 42, block: 20, steal: 26, rebound: 40, heightCm: 205 });
  assert.ok(parityValue(russell, "block", model) > 85);
  assert.ok(parityValue(russell, "block", model) > parityValue(scrub, "block", model));
});

test("parity only lifts, never lowers, and never mutates the source card", () => {
  const model = fixtureModel();
  const source = card(1960, "C", { defense: 99, block: 20, steal: 26, rebound: 40 });
  const snapshot = structuredClone(source);
  const next = applyEraParity(source, model);
  assert.equal(next.defense, 99);
  assert.deepEqual(source, snapshot);
  assert.ok(next.eraParity);
});

test("complete-stat eras are untouched by gap filling", () => {
  const model = fixtureModel();
  const modern = card(2015, "SG", { defense: 40, block: 10, steal: 30, three: 20 });
  assert.equal(parityValue(modern, "defense", model), null);
  const next = applyEraParity(modern, model, { modernTraining: false });
  assert.deepEqual(next.eraParity.lifted, {});
});

test("modern training pulls 3PT volume halfway toward modern shooters with the same skill", () => {
  const model = fixtureModel();
  const bird = card(1988, "SF", { three: 79, threeTend: 59 });
  assert.equal(modernThreeTend(bird, model), 79);
  const next = applyEraParity(bird, model);
  assert.equal(next.threeTend, 79);
  const kept = applyEraParity(bird, model, { modernTraining: false });
  assert.equal(kept.threeTend, 59);
});

test("2K anchors are dropped under parity so OVR comes from attributes", () => {
  const model = fixtureModel();
  const anchored = { ...card(2016, "PG", {}), ratingSource: "anchor", ovr2k: 99 };
  assert.equal(applyEraParity(anchored, model).ratingSource, "parity");
});
