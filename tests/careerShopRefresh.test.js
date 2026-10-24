import test from "node:test";
import assert from "node:assert/strict";
import { seasonToCard, PLAYERS } from "../js/data/players.js";
import {
  buildAffordableShop,
  careerRefreshCost,
  deficitPositions,
  positionCounts,
  primaryPos,
  shopFit,
} from "../js/engine/careerEconomy.js";
import { listBuyableSkillPacks, rollSkillShopOffers } from "../js/data/skills.js";
import { playerPrice } from "../js/data/intangibles.js";

/**
 * T3 refresh-pool tuning (R54): gap-weighted shop, affordable floor,
 * free refresh while short-handed, fit badges, skill-pool binding.
 */
test("deficitPositions: below-target slots, scarcest first", () => {
  const team = [
    { pos: "PG" },
    { pos: "PG" },
    { pos: "SG" },
  ];
  assert.deepEqual(deficitPositions(team), ["SF", "PF", "C", "SG"]);
  assert.equal(positionCounts(team).PG, 2);
  assert.equal(primaryPos({ pos: "PG/SG" }), "PG");
  assert.equal(primaryPos({ playPos: "C", pos: "PF" }), "C");
});

test("shopFit: gap position beats tactic match, otherwise null", () => {
  const thinTeam = [{ pos: "PG" }, { pos: "PG" }, { pos: "SG" }];
  assert.equal(shopFit({ pos: "C", archetype: "connector" }, thinTeam, ["connector"]), "need");
  const fullTeam = [];
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) fullTeam.push({ pos }, { pos });
  assert.equal(shopFit({ pos: "C", archetype: "connector" }, fullTeam, ["connector"]), "tactic");
  assert.equal(shopFit({ pos: "C", archetype: "iso_scorer" }, fullTeam, ["connector"]), null);
  assert.equal(shopFit(null, fullTeam, ["connector"]), null);
});

function synthCard(i, pos, ppg) {
  return seasonToCard({
    bref: `shopref${pos}${i}`,
    id: `shopref${pos}${i}-2020-syn`,
    name: `Shop Ref ${pos} ${i}`,
    season: 2020,
    team: "SYN",
    pos,
    gp: 70,
    mpg: 28,
    ppg,
    rpg: 5,
    apg: 3,
    spg: 1,
    bpg: 0.5,
    tpg: 2,
    fg: 0.45,
    tp: 0.35,
    ft: 0.8,
    fga: 12,
    tpa: 4,
    src: "test",
  });
}

test("buildAffordableShop: at least two thirds affordable at low gold", () => {
  const originalLength = PLAYERS.length;
  const synthetic = Array.from({ length: 40 }, (_, i) => synthCard(i, "SF", 4 + i));
  PLAYERS.push(...synthetic);
  try {
    const shop = buildAffordableShop({ gold: 200, used: new Set(), shop: [] }, 12);
    assert.equal(shop.length, 12);
    const affordable = shop.filter((p) => playerPrice(p) <= 200).length;
    assert.ok(affordable >= 8, `affordable ${affordable}/12 at gold 200`);
    const people = shop.map((p) => p.bref).filter(Boolean);
    assert.equal(new Set(people).size, people.length, "no duplicate person on one shelf");
  } finally {
    PLAYERS.splice(originalLength);
  }
});

test("buildAffordableShop: gap team sees its missing position in one refresh", () => {
  const originalLength = PLAYERS.length;
  const guards = Array.from({ length: 11 }, (_, i) => synthCard(i, "PG", 10 + i));
  const bigs = Array.from({ length: 12 }, (_, i) => synthCard(100 + i, "C", 4 + i));
  PLAYERS.push(...guards, ...bigs);
  try {
    // Team of 11 PGs: C is a deficit position, so cheap-band picks take
    // cheap centers before cheap guards — one refresh must surface a big.
    const shop = buildAffordableShop(
      { gold: 600, used: new Set(), shop: [], team: { players: guards } },
      12,
    );
    assert.ok(shop.some((p) => primaryPos(p) === "C"), "gap-weighted shop has no center");
  } finally {
    PLAYERS.splice(originalLength);
  }
});

test("careerRefreshCost: free while short-handed, base otherwise", () => {
  const short = { kind: "career", team: { players: Array(7).fill({}) } };
  const full = { kind: "career", team: { players: Array(8).fill({}) } };
  const duel = { kind: "duel", team: { players: [] } };
  assert.equal(careerRefreshCost(short, 50), 0);
  assert.equal(careerRefreshCost(full, 50), 50);
  assert.equal(careerRefreshCost(duel, 50), 50);
  assert.equal(careerRefreshCost(null, 50), 50);
});

test("rollSkillShopOffers: avoided skills lose to fresh ones", () => {
  const all = listBuyableSkillPacks().map((s) => s.id);
  assert.ok(all.length > 10, `buyable skills ${all.length}`);
  // Keep the durability trio + 3 more un-avoided so the 50% durability
  // fast-path cannot smuggle an avoided skill onto the shelf.
  const trio = ["iron_lungs", "motor_engine", "iron_body"];
  for (const id of trio) assert.ok(all.includes(id), `durability skill buyable: ${id}`);
  const keep = new Set([...trio, ...all.filter((id) => !trio.includes(id)).slice(0, 3)]);
  assert.equal(keep.size, 6);
  const avoid = new Set(all.filter((id) => !keep.has(id)));
  for (let i = 0; i < 5; i++) {
    const offers = rollSkillShopOffers(6, [], avoid);
    assert.equal(offers.length, 6);
    for (const o of offers) assert.ok(keep.has(o.id), `avoided skill offered: ${o.id}`);
  }
});
